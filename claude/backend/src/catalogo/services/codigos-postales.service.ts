import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Not, Repository } from 'typeorm';
import {
  CodigoPostal,
  FuenteCodigoPostal,
} from '../entities/codigo-postal.entity';
import { CodigosPostalesCarga } from '../entities/codigos-postales-carga.entity';

export interface FilaCodigoPostal {
  cp: string;
  estadoClave: string;
  estadoNombre: string;
  municipioClave?: string | null;
  municipioNombre: string;
  ciudad?: string | null;
  colonia: string;
  tipoAsentamiento?: string | null;
}

export interface MetaCarga {
  fuente: FuenteCodigoPostal;
  archivo: string;
  sha256: string;
  version: string;
  cargadoPor?: string | null;
  notas?: string | null;
}

export interface ResultadoCarga {
  aplicada: boolean;
  motivo: string;
  filas: number;
  version: string;
  fuente: FuenteCodigoPostal;
}

/** Quita acentos, colapsa espacios y sube a mayúsculas. */
export function normalizarTexto(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

@Injectable()
export class CodigosPostalesService {
  private readonly logger = new Logger(CodigosPostalesService.name);

  constructor(
    @InjectRepository(CodigoPostal)
    private readonly repo: Repository<CodigoPostal>,
    @InjectRepository(CodigosPostalesCarga)
    private readonly cargas: Repository<CodigosPostalesCarga>,
    private readonly dataSource: DataSource,
  ) {}

  // ── Consulta ────────────────────────────────────────────────────────────

  /**
   * Lo que el modal de clientes pide al teclear un código postal: el estado y
   * el municipio ya resueltos, y la lista de colonias para elegir.
   *
   * Un código postal puede tocar dos municipios (ocurre en zonas conurbadas).
   * Por eso el municipio viaja también dentro de cada colonia: si el usuario
   * elige una colonia de otro municipio, el formulario puede corregirse solo.
   */
  async buscar(cpCrudo: string) {
    const cp = (cpCrudo ?? '').trim();
    if (!/^\d{5}$/.test(cp)) {
      throw new BadRequestException(
        'El código postal debe tener exactamente cinco dígitos.',
      );
    }

    const filas = await this.repo.find({
      where: { cp, activo: true },
      order: { colonia: 'ASC' },
    });

    if (filas.length === 0) {
      throw new NotFoundException(
        'Ese código postal no está en el catálogo cargado.',
      );
    }

    const principal = filas[0];
    const municipios = [...new Set(filas.map((f) => f.municipioNombre))];

    return {
      cp,
      estadoClave: principal.estadoClave,
      estado: principal.estadoNombre,
      municipio: principal.municipioNombre,
      municipios,
      ciudad: principal.ciudad ?? null,
      fuente: principal.fuente,
      version: principal.version,
      colonias: filas
        .filter((f) => f.colonia.trim().length > 0)
        .map((f) => ({
          colonia: f.colonia,
          tipo: f.tipoAsentamiento ?? null,
          municipio: f.municipioNombre,
          ciudad: f.ciudad ?? null,
        })),
    };
  }

  /** Estados presentes en el catálogo, para el primer eslabón del encadenado. */
  async estados() {
    const filas = await this.repo
      .createQueryBuilder('cp')
      .select('cp.estadoclave', 'clave')
      .addSelect('MIN(cp.estadonombre)', 'nombre')
      .where('cp.activo = true')
      .groupBy('cp.estadoclave')
      .orderBy('MIN(cp.estadonombre)', 'ASC')
      .getRawMany<{ clave: string; nombre: string }>();
    return filas;
  }

  /** Municipios de un estado. Segundo eslabón. */
  async municipios(estadoClave: string) {
    const filas = await this.repo
      .createQueryBuilder('cp')
      .select('cp.municipionombre', 'nombre')
      .addSelect('MIN(cp.municipioclave)', 'clave')
      .where('cp.activo = true AND cp.estadoclave = :estadoClave', {
        estadoClave,
      })
      .groupBy('cp.municipionombre')
      .orderBy('cp.municipionombre', 'ASC')
      .getRawMany<{ nombre: string; clave: string | null }>();
    return filas;
  }

  /** Colonias de un municipio, con su código postal. Tercer eslabón. */
  async colonias(estadoClave: string, municipioNombre: string) {
    return this.repo.find({
      where: { estadoClave, municipioNombre, activo: true, colonia: Not('') },
      select: ['cp', 'colonia', 'tipoAsentamiento', 'ciudad'],
      order: { colonia: 'ASC' },
    });
  }

  // ── Estado del catálogo ─────────────────────────────────────────────────

  /**
   * Lo que responde «¿ya está cargado?» sin que nadie tenga que entrar a la
   * base. La pantalla de configuración lo usa para decidir si ofrece «cargar
   * por primera vez» o «actualizar».
   */
  async estatus() {
    const total = await this.repo.count();
    const cargas = await this.cargas.find({
      order: { cargadoEn: 'DESC' },
      take: 10,
    });
    const codigos = await this.repo
      .createQueryBuilder('cp')
      .select('COUNT(DISTINCT cp.cp)', 'total')
      .getRawOne<{ total: string }>();

    return {
      cargado: total > 0,
      asentamientos: total,
      codigosPostales: Number(codigos?.total ?? 0),
      ultimaCarga: cargas[0] ?? null,
      historial: cargas,
    };
  }

  // ── Carga ───────────────────────────────────────────────────────────────

  /**
   * Importa (o reimporta) el catálogo de una fuente.
   *
   * La huella del archivo manda: si ya se cargó ese mismo archivo, no se toca
   * nada y se dice por qué. Es lo que hace que «se cargue una sola vez y se
   * quede» no dependa de que nadie vuelva a correr el comando por descuido.
   *
   * Cuando sí hay algo nuevo, el reemplazo de esa fuente y la bitácora ocurren
   * dentro de una transacción: o el catálogo queda completo y registrado, o
   * queda como estaba. Un catálogo a medias sería peor que no tenerlo, porque
   * un código postal faltante se ve igual que un código postal inválido.
   */
  async importar(
    filas: FilaCodigoPostal[],
    meta: MetaCarga,
    opciones: { forzar?: boolean; exclusiva?: boolean } = {},
  ): Promise<ResultadoCarga> {
    if (filas.length === 0) {
      throw new BadRequestException('El archivo no trae ninguna fila usable.');
    }

    /*
     * El catálogo geográfico admite una sola fuente a la vez. No es una
     * preferencia: el índice único es (código postal, colonia) sin distinguir
     * de dónde vino el renglón, así que cargar el SAT encima de SEPOMEX
     * chocaría a media transacción con un error de llave duplicada que no le
     * dice nada a nadie. Mejor decirlo antes y por su nombre.
     */
    const otras = await this.repo
      .createQueryBuilder('cp')
      .select('DISTINCT cp.fuente', 'fuente')
      .where('cp.fuente != :fuente', { fuente: meta.fuente })
      .getRawMany<{ fuente: string }>();
    if (otras.length > 0 && !opciones.exclusiva) {
      throw new BadRequestException(
        `El catálogo ya está cargado desde ${otras.map((o) => o.fuente).join(' y ')}. ` +
          `Para sustituirlo por ${meta.fuente} hay que pedirlo de forma explícita (--sustituir); ` +
          'mezclar dos fuentes geográficas deja colonias duplicadas y sin manera de saber cuál manda.',
      );
    }

    const yaCargado = await this.cargas.findOne({
      where: { sha256: meta.sha256 },
    });
    if (yaCargado && !opciones.forzar) {
      return {
        aplicada: false,
        motivo: `Ese archivo ya se cargó el ${yaCargado.cargadoEn.toISOString().slice(0, 10)} (versión ${yaCargado.version}). No hay nada que actualizar.`,
        filas: yaCargado.filas,
        version: yaCargado.version,
        fuente: meta.fuente,
      };
    }

    // Dedup en memoria: las fuentes oficiales repiten renglones.
    const porClave = new Map<string, CodigoPostal>();
    for (const fila of filas) {
      const cp = fila.cp.trim().padStart(5, '0');
      if (!/^\d{5}$/.test(cp)) continue;
      /*
       * Una colonia en blanco no es un renglón roto: es un código postal que
       * la fuente reconoce como válido pero del que no publica asentamientos.
       * Se guarda igual para que el formulario siga deduciendo estado y
       * municipio; la consulta lo excluye de la lista de colonias.
       */
      const colonia = fila.colonia?.trim() ?? '';
      const coloniaNormalizada = normalizarTexto(colonia);
      const clave = `${cp}|${coloniaNormalizada}`;
      if (porClave.has(clave)) continue;
      porClave.set(
        clave,
        this.repo.create({
          cp,
          estadoClave: (fila.estadoClave ?? '').trim().padStart(2, '0'),
          estadoNombre: fila.estadoNombre?.trim() ?? '',
          municipioClave: fila.municipioClave?.trim() || null,
          municipioNombre: fila.municipioNombre?.trim() ?? '',
          ciudad: fila.ciudad?.trim() || null,
          colonia,
          coloniaNormalizada,
          tipoAsentamiento: fila.tipoAsentamiento?.trim() || null,
          fuente: meta.fuente,
          version: meta.version,
          activo: true,
        }),
      );
    }

    const aInsertar = [...porClave.values()];

    await this.dataSource.transaction(async (em) => {
      if (opciones.exclusiva) {
        await em.createQueryBuilder().delete().from(CodigoPostal).execute();
      } else {
        await em.delete(CodigoPostal, { fuente: meta.fuente });
      }
      for (let i = 0; i < aInsertar.length; i += 500) {
        await em.save(CodigoPostal, aInsertar.slice(i, i + 500));
      }
      if (yaCargado) await em.delete(CodigosPostalesCarga, { id: yaCargado.id });
      await em.save(
        em.create(CodigosPostalesCarga, {
          fuente: meta.fuente,
          archivo: meta.archivo.slice(0, 260),
          sha256: meta.sha256,
          version: meta.version,
          filas: aInsertar.length,
          cargadoPor: meta.cargadoPor ?? null,
          notas: meta.notas ?? null,
        }),
      );
    });

    this.logger.log(
      `Catálogo de códigos postales actualizado: ${aInsertar.length} asentamientos desde ${meta.fuente} (${meta.version}).`,
    );

    return {
      aplicada: true,
      motivo: yaCargado
        ? 'Se reimportó el mismo archivo a petición expresa.'
        : 'Catálogo actualizado.',
      filas: aInsertar.length,
      version: meta.version,
      fuente: meta.fuente,
    };
  }
}
