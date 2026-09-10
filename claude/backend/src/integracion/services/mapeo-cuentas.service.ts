import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  CuentaContable,
  TipoCuenta,
} from '../../finanzas/entities/cuenta-contable.entity';
import { PUERTO_CONTABILIDAD_EXTERNA } from '../integracion.constants';
import {
  ClaseCuenta,
  PuertoContabilidadExterna,
} from '../ports/contabilidad-externa.port';
import { MapeoCuentaExterna } from '../entities/mapeo-cuenta-externa.entity';
import { ErrorIntegracionExterna } from '../ports/cartera-externa.port';

/**
 * Resuelve el catálogo del ERP contra el del mayor externo.
 *
 * La regla es no adivinar. Una cuenta sin mapeo detiene el espejo de esa
 * póliza con un error explícito; no se sustituye por una cuenta parecida ni se
 * manda a una cuenta puente genérica, porque eso produce un mayor que cuadra y
 * miente.
 */
@Injectable()
export class MapeoCuentasService {
  private readonly logger = new Logger(MapeoCuentasService.name);

  constructor(
    @InjectRepository(MapeoCuentaExterna)
    private readonly repo: Repository<MapeoCuentaExterna>,
    @InjectRepository(CuentaContable)
    private readonly cuentas: Repository<CuentaContable>,
    @Inject(PUERTO_CONTABILIDAD_EXTERNA)
    private readonly externa: PuertoContabilidadExterna,
  ) {}

  /**
   * Traduce el tipo de cuenta del ERP a la clase del mayor externo.
   *
   * COSTO y GASTO colapsan en GASTO porque el mayor externo no distingue: la
   * distinción es del estado de resultados mexicano y vive en el ERP, que es
   * donde se emite. Perderla aquí no afecta al libro fiscal.
   */
  private claseDe(cuenta: CuentaContable): ClaseCuenta {
    switch (cuenta.tipo) {
      case TipoCuenta.ACTIVO:
        return ClaseCuenta.ACTIVO;
      case TipoCuenta.PASIVO:
        return ClaseCuenta.PASIVO;
      case TipoCuenta.CAPITAL:
        return ClaseCuenta.CAPITAL;
      case TipoCuenta.INGRESO:
        return ClaseCuenta.INGRESO;
      case TipoCuenta.COSTO:
      case TipoCuenta.GASTO:
        return ClaseCuenta.GASTO;
      default:
        // ORDEN y cualquier cosa nueva: no se adivina.
        throw new Error(
          `La cuenta ${cuenta.numeroCuenta} es de tipo ${cuenta.tipo} y no tiene equivalente en el mayor externo. Mapéala a mano.`,
        );
    }
  }

  /**
   * Crea en el mayor externo las cuentas que faltan y guarda el mapeo.
   *
   * Usa el MISMO código de cuenta en los dos lados, para que la correspondencia
   * sea evidente para cualquiera que abra los dos catálogos. Es idempotente: si
   * la cuenta ya existe allá, la reutiliza en vez de duplicarla.
   *
   * Lo dispara una persona. Crear cuentas en un mayor contable no es algo que
   * deba pasar solo.
   */
  async aprovisionar(
    empresaId: string,
    opciones: { soloUsadas?: boolean; simular?: boolean } = {},
  ) {
    if (!this.externa.configurado() || !this.externa.disponible()) {
      throw new NotFoundException(
        'El mayor contable externo no está disponible.',
      );
    }

    const faltantes = await this.pendientes(empresaId, opciones.soloUsadas !== false);
    const creadas: Record<string, string>[] = [];
    const reutilizadas: Record<string, string>[] = [];
    const problemas: Record<string, string>[] = [];

    for (const cuenta of faltantes) {
      try {
        const clase = this.claseDe(cuenta);
        if (opciones.simular) {
          creadas.push({
            codigo: cuenta.numeroCuenta,
            nombre: cuenta.nombre,
            clase,
            accion: 'SE_CREARIA',
          });
          continue;
        }

        const antes = await this.externa.cuentasDisponibles();
        const yaEstaba = antes.some((c) => c.codigo === cuenta.numeroCuenta);

        const externa = await this.externa.crearCuenta({
          codigo: cuenta.numeroCuenta,
          nombre: cuenta.nombre,
          clase,
          descripcion: `Espejo de la cuenta ${cuenta.numeroCuenta} de SyncroERP.`,
        });

        await this.guardar(empresaId, {
          cuentaContableId: cuenta.id,
          idExterno: externa.id,
          codigoExterno: externa.codigo,
          proveedor: this.externa.proveedor,
        });

        (yaEstaba ? reutilizadas : creadas).push({
          codigo: cuenta.numeroCuenta,
          nombre: cuenta.nombre,
          idExterno: externa.id,
        });
      } catch (error) {
        problemas.push({
          codigo: cuenta.numeroCuenta,
          nombre: cuenta.nombre,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      simulacion: opciones.simular === true,
      creadas,
      reutilizadas,
      problemas,
      pendientesDespues: (await this.pendientes(empresaId, true)).length,
    };
  }

  /** Mapa cuentaContableId → idExterno, para las cuentas pedidas. */
  async resolver(
    empresaId: string,
    cuentaIds: string[],
  ): Promise<Map<string, MapeoCuentaExterna>> {
    if (cuentaIds.length === 0) return new Map();

    const filas = await this.repo.find({
      where: {
        empresaId,
        cuentaContableId: In([...new Set(cuentaIds)]),
        activo: true,
      },
    });
    return new Map(filas.map((f) => [f.cuentaContableId, f]));
  }

  /**
   * Igual que `resolver`, pero falla si falta alguna. Es lo que usa el
   * despachador: una póliza a medio espejar sería peor que ninguna.
   */
  async resolverEstricto(
    empresaId: string,
    cuentaIds: string[],
  ): Promise<Map<string, MapeoCuentaExterna>> {
    const mapa = await this.resolver(empresaId, cuentaIds);
    const faltantes = [...new Set(cuentaIds)].filter((id) => !mapa.has(id));

    if (faltantes.length > 0) {
      const cuentas = await this.cuentas.find({
        where: { id: In(faltantes) },
      });
      const codigos = cuentas.map((c) => c.numeroCuenta ?? c.id).join(', ');
      throw new ErrorIntegracionExterna(
        `Falta mapear al mayor externo la(s) cuenta(s): ${codigos || faltantes.join(', ')}.`,
        // No es reintentable: reintentar no crea el mapeo. Alguien tiene que
        // capturarlo.
        false,
      );
    }
    return mapa;
  }

  async listar(empresaId: string): Promise<MapeoCuentaExterna[]> {
    return this.repo.find({
      where: { empresaId },
      order: { codigoCuenta: 'ASC' },
    });
  }

  /**
   * Cuentas que hacen falta mapear DE VERDAD: las que las pólizas del ERP ya
   * tocan y todavía no tienen correspondencia.
   *
   * La primera versión listaba el catálogo completo sin mapear —1083 cuentas en
   * la empresa de prueba—, lo que es cierto pero inútil: nadie mapea a mano un
   * catálogo entero, y la mayoría de esas cuentas no aparece en ningún asiento.
   * Lo que importa es la superficie real: lo que ya se usa. Ordenadas por
   * frecuencia, para que quien mapee empiece por lo que más pesa.
   */
  async pendientes(
    empresaId: string,
    soloUsadas = true,
  ): Promise<(CuentaContable & { usos?: number })[]> {
    const mapeadas = await this.repo.find({
      where: { empresaId, activo: true },
      select: { cuentaContableId: true },
    });
    const conocidas = new Set(mapeadas.map((m) => m.cuentaContableId));

    if (!soloUsadas) {
      const todas = await this.cuentas.find({ where: { empresaId } });
      return todas.filter((c) => !conocidas.has(c.id));
    }

    const usadas = await this.repo.manager.query<
      { cuentacontableid: string; usos: string }[]
    >(
      `SELECT pp.cuentacontableid, COUNT(*) AS usos
         FROM partidas_poliza pp
         INNER JOIN polizas p ON p.id = pp.polizaid
        WHERE p.empresaid = $1
        GROUP BY pp.cuentacontableid
        ORDER BY COUNT(*) DESC`,
      [empresaId],
    );

    const faltantes = usadas.filter((u) => !conocidas.has(u.cuentacontableid));
    if (faltantes.length === 0) return [];

    const detalle = await this.cuentas.find({
      where: { id: In(faltantes.map((f) => f.cuentacontableid)) },
    });
    const porId = new Map(detalle.map((c) => [c.id, c]));

    return faltantes
      .map((f) => {
        const cuenta = porId.get(f.cuentacontableid);
        return cuenta
          ? Object.assign(cuenta, { usos: Number(f.usos) })
          : null;
      })
      .filter((c): c is CuentaContable & { usos: number } => c !== null);
  }

  async guardar(
    empresaId: string,
    datos: {
      cuentaContableId: string;
      idExterno: string;
      codigoExterno?: string | null;
      proveedor?: string | null;
    },
  ): Promise<MapeoCuentaExterna> {
    const cuenta = await this.cuentas.findOne({
      where: { id: datos.cuentaContableId, empresaId },
    });
    if (!cuenta) {
      throw new NotFoundException(
        'La cuenta contable no existe o pertenece a otra empresa.',
      );
    }

    const existente = await this.repo.findOne({
      where: { empresaId, cuentaContableId: datos.cuentaContableId },
    });

    const fila =
      existente ??
      this.repo.create({
        empresaId,
        cuentaContableId: datos.cuentaContableId,
      });

    fila.codigoCuenta = String(cuenta.numeroCuenta ?? '').slice(0, 40);
    fila.idExterno = datos.idExterno;
    fila.codigoExterno = datos.codigoExterno ?? null;
    fila.proveedor = datos.proveedor ?? null;
    fila.activo = true;

    return this.repo.save(fila);
  }
}
