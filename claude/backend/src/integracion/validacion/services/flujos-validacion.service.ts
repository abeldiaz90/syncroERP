import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { FlujoValidacion } from '../entities/flujo-validacion.entity';
import { PasoFlujoValidacion } from '../entities/paso-flujo-validacion.entity';
import {
  PoliticaPaso,
  PropositoFlujo,
  TipoPasoValidacion,
  capacidadPermitida,
} from '../validacion.constants';
import { ConfiguracionIntegracionEmpresa } from '../../entities/configuracion-integracion-empresa.entity';

export interface PasoEntrada {
  tipo: TipoPasoValidacion;
  etiqueta: string;
  politica?: PoliticaPaso;
  peso?: number;
  umbralMinimo?: number | null;
  parametros?: Record<string, unknown>;
}

/**
 * Administración de los flujos que diseña cada empresa.
 *
 * Un flujo publicado no se edita: se publica una versión nueva. Editar el que
 * ya se usó para decidir dejaría expedientes apuntando a una política que ya no
 * dice lo mismo, y eso es exactamente lo que una auditoría de crédito busca.
 */
@Injectable()
export class FlujosValidacionService {
  constructor(
    @InjectRepository(FlujoValidacion)
    private readonly flujos: Repository<FlujoValidacion>,
    @InjectRepository(PasoFlujoValidacion)
    private readonly pasos: Repository<PasoFlujoValidacion>,
    private readonly dataSource: DataSource,
    @InjectRepository(ConfiguracionIntegracionEmpresa)
    private readonly configuraciones: Repository<ConfiguracionIntegracionEmpresa>,
  ) {}

  async listar(empresaId: string) {
    const flujos = await this.flujos.find({
      where: { empresaId },
      order: { version: 'DESC' },
    });
    const conPasos = [];
    for (const f of flujos) {
      conPasos.push({
        ...f,
        pasos: await this.pasos.find({
          where: { flujoId: f.id },
          order: { orden: 'ASC' },
        }),
      });
    }
    return conPasos;
  }

  async obtener(id: string, empresaId: string) {
    const flujo = await this.flujos.findOne({ where: { id, empresaId } });
    if (!flujo) throw new NotFoundException('Flujo no encontrado.');
    flujo.pasos = await this.pasos.find({
      where: { flujoId: flujo.id },
      order: { orden: 'ASC' },
    });
    return flujo;
  }

  async crear(
    empresaId: string,
    datos: {
      nombre: string;
      descripcion?: string | null;
      topeAutomatico?: number;
      puntajeMinimo?: number;
      pasos: PasoEntrada[];
      usuarioId?: string | null;
      /*
       * El techo llegaba sólo en la edición. El comentario de `editar` decía
       * «por la misma razón que al crearlo» y era falso: crear no lo aplicaba,
       * así que el límite de la instalación se saltaba creando un flujo nuevo
       * en lugar de corregir el existente. Un límite con esa puerta no es un
       * límite.
       */
      topeInstalacion?: number;
    },
  ) {
    this.validarPasos(datos.pasos);

    const ultima = await this.flujos
      .createQueryBuilder('f')
      .select('MAX(f.version)', 'max')
      .where('f.empresaId = :empresaId AND f.proposito = :proposito', {
        empresaId,
        proposito: PropositoFlujo.ORIGINACION_CREDITO,
      })
      .getRawOne<{ max: number | null }>();

    return this.dataSource.transaction(async (em) => {
      const flujo = await em.save(
        em.create(FlujoValidacion, {
          empresaId,
          nombre: datos.nombre,
          descripcion: datos.descripcion ?? null,
          proposito: PropositoFlujo.ORIGINACION_CREDITO,
          activo: false,
          version: Number(ultima?.max ?? 0) + 1,
          topeAutomatico: this.topeValidado(
            Number(datos.topeAutomatico ?? 0),
            Number(datos.topeInstalacion ?? 0),
          ),
          puntajeMinimo: datos.puntajeMinimo ?? 60,
          creadoPorId: datos.usuarioId ?? null,
        }),
      );

      await em.save(
        datos.pasos.map((p, i) =>
          em.create(PasoFlujoValidacion, {
            flujoId: flujo.id,
            orden: i + 1,
            tipo: p.tipo,
            etiqueta: p.etiqueta,
            politica: p.politica ?? PoliticaPaso.BLOQUEANTE,
            peso: p.peso ?? 0,
            umbralMinimo: p.umbralMinimo ?? null,
            parametros: p.parametros ?? {},
            activo: true,
          }),
        ),
      );

      return this.obtenerEn(em, flujo.id);
    });
  }

  /**
   * ==========================================================================
   * El techo de la instalación se dice, no se aplica a escondidas
   * --------------------------------------------------------------------------
   * `CREDITO_TOPE_AUTOMATICO` limita cuánto puede autorizarse sin intervención
   * humana. Antes esto se resolvía con `Math.min(solicitado, techo)` y producía
   * el peor resultado posible con el valor por omisión (`0`): quien capturaba
   * un tope de $10,000 lo veía guardarse como $0, sin mensaje. El flujo quedaba
   * exigiendo autorización manual para todo y nadie sabía por qué.
   *
   * Recortar en silencio es aceptable cuando el usuario no puede saber el
   * límite. Aquí sí puede, y el sistema lo conoce: entonces se dice. Un error
   * explícito cuesta un intento; un tope en cero cuesta descubrirlo semanas
   * después revisando por qué nada se autoriza solo.
   * ==========================================================================
   */
  private topeValidado(solicitado: number, techo: number): number {
    const valor = Number(solicitado);
    if (!Number.isFinite(valor) || valor < 0) {
      throw new BadRequestException('El tope de autorización automática debe ser un número no negativo.');
    }
    if (valor === 0) return 0;
    if (techo <= 0) {
      throw new BadRequestException(
        'Esta instalación no permite autorización automática: CREDITO_TOPE_AUTOMATICO está en 0. ' +
          'Deja el tope en 0 o pide que se configure el techo antes de asignar uno.',
      );
    }
    if (valor > techo) {
      throw new BadRequestException(
        `El tope solicitado (${valor}) supera el techo de la instalación (${techo}). ` +
          'Captura un valor igual o menor, o pide que se eleve CREDITO_TOPE_AUTOMATICO.',
      );
    }
    return valor;
  }

  /** Activa un flujo y desactiva el que estuviera vigente. */
  /**
   * Corrige la identificación y los umbrales de un flujo, sin tocar sus pasos.
   *
   * `topeAutomatico` se recorta contra el techo de la instalación por la misma
   * razón que al crearlo: el valor de `.env` es un límite, no un valor por
   * omisión que la empresa pueda superar editando.
   */
  async editar(
    id: string,
    empresaId: string,
    datos: {
      nombre?: string;
      descripcion?: string;
      topeAutomatico?: number;
      puntajeMinimo?: number;
      topeInstalacion?: number;
    },
  ) {
    const flujo = await this.obtener(id, empresaId);

    if (datos.nombre !== undefined) {
      const nombre = datos.nombre.trim();
      if (!nombre) throw new BadRequestException('El nombre del flujo no puede quedar vacío.');
      flujo.nombre = nombre;
    }
    if (datos.descripcion !== undefined) {
      flujo.descripcion = datos.descripcion.trim() || null;
    }
    if (datos.topeAutomatico !== undefined) {
      flujo.topeAutomatico = this.topeValidado(
        Number(datos.topeAutomatico),
        Number(datos.topeInstalacion ?? 0),
      );
    }
    if (datos.puntajeMinimo !== undefined) {
      flujo.puntajeMinimo = Number(datos.puntajeMinimo);
    }

    const guardado = await this.flujos.save(flujo);
    return { ...guardado, pasos: flujo.pasos };
  }

  async activar(id: string, empresaId: string) {
    const flujo = await this.obtener(id, empresaId);
    if (flujo.pasos.length === 0) {
      throw new BadRequestException('Un flujo sin pasos no puede activarse.');
    }

    /*
     * Un flujo no puede activarse con pasos que la empresa no tiene
     * contratados. Se comprueba al activar y no al diseñar: diseñar un flujo
     * con un paso que aún no se contrata es legítimo —sirve para ver qué
     * faltaría—, lo que no puede es entrar en vigor y prometer un control que
     * nadie va a ejecutar.
     */
    const contratadas = await this.capacidadesContratadas(empresaId);
    const sinContratar = flujo.pasos
      .filter(paso => !capacidadPermitida(paso.tipo, contratadas))
      .map(paso => paso.tipo);
    if (sinContratar.length) {
      throw new BadRequestException(
        `El flujo usa capacidades que esta empresa no tiene contratadas: ${[
          ...new Set(sinContratar),
        ].join(', ')}. Quítalas del flujo o contrátalas.`,
      );
    }

    return this.dataSource.transaction(async (em) => {
      await em.update(
        FlujoValidacion,
        { empresaId, proposito: flujo.proposito, activo: true },
        { activo: false },
      );
      await em.update(FlujoValidacion, { id }, { activo: true });
      return this.obtenerEn(em, id);
    });
  }

  /**
   * Capacidades de validación que la empresa tiene contratadas.
   *
   * Las escribe la consola de SUMA, que es quien gobierna la contratación.
   * `null` significa que todavía no ha declarado nada y entonces no se
   * restringe; ver `capacidadPermitida`.
   */
  async capacidadesContratadas(empresaId: string): Promise<string[] | null> {
    const cfg = await this.configuraciones.findOne({ where: { empresaId } });
    const valor = (cfg?.parametrosProveedor as Record<string, unknown> | null)
      ?.capacidadesValidacion;
    return Array.isArray(valor) ? valor.map(String) : null;
  }

  async desactivar(id: string, empresaId: string) {
    const flujo = await this.obtener(id, empresaId);
    await this.flujos.update({ id: flujo.id }, { activo: false });
    return { activo: false };
  }

  /**
   * Comprobaciones que evitan flujos que parecen controles pero no lo son.
   * Se aplican al crear porque después ya hay expedientes colgando.
   */
  private validarPasos(pasos: PasoEntrada[]): void {
    if (!pasos?.length) {
      throw new BadRequestException('El flujo necesita al menos un paso.');
    }

    const tipos = pasos.map((p) => p.tipo);
    const duplicados = tipos.filter((t, i) => tipos.indexOf(t) !== i);
    if (duplicados.length) {
      throw new ConflictException(
        `El flujo repite pasos del mismo tipo: ${[...new Set(duplicados)].join(', ')}.`,
      );
    }

    // Sin identidad no hay originación posible. Es la línea que separa un
    // control de crédito de un formulario.
    if (!tipos.includes(TipoPasoValidacion.IDENTIDAD_INE)) {
      throw new BadRequestException(
        'Todo flujo de originación debe incluir un paso de validación de identidad.',
      );
    }

    const identidad = pasos.find(
      (p) => p.tipo === TipoPasoValidacion.IDENTIDAD_INE,
    )!;
    if (identidad.politica === PoliticaPaso.INFORMATIVO) {
      throw new BadRequestException(
        'La validación de identidad no puede ser informativa: debe bloquear o derivar a revisión.',
      );
    }

    const revision = pasos.find(
      (p) => p.tipo === TipoPasoValidacion.REVISION_MANUAL,
    );
    if (revision && revision.politica === PoliticaPaso.INFORMATIVO) {
      throw new BadRequestException(
        'Un paso de revisión manual informativo no revisa nada. Debe bloquear o derivar.',
      );
    }
  }

  private async obtenerEn(em: EntityManager, id: string): Promise<FlujoValidacion> {
    const flujo = await em.findOne(FlujoValidacion, { where: { id } });
    if (!flujo) throw new NotFoundException('Flujo no encontrado.');
    flujo.pasos = await em.find(PasoFlujoValidacion, {
      where: { flujoId: id },
      order: { orden: 'ASC' },
    });
    return flujo;
  }

  /**
   * Flujo de arranque sugerido. No se instala solo: se propone para que el
   * administrador lo revise, lo ajuste y lo active a conciencia.
   */
  plantillaSugerida(): PasoEntrada[] {
    return [
      {
        tipo: TipoPasoValidacion.IDENTIDAD_INE,
        etiqueta: 'Validación de identidad (INE)',
        politica: PoliticaPaso.BLOQUEANTE,
        peso: 25,
      },
      {
        tipo: TipoPasoValidacion.LISTA_BLOQUEO,
        etiqueta: 'Listas de bloqueo',
        politica: PoliticaPaso.DERIVA_A_REVISION,
        peso: 10,
      },
      {
        tipo: TipoPasoValidacion.HISTORIAL_INTERNO,
        etiqueta: 'Historial en cartera propia',
        politica: PoliticaPaso.BLOQUEANTE,
        peso: 25,
        umbralMinimo: 30,
      },
      {
        tipo: TipoPasoValidacion.BURO_CREDITO,
        etiqueta: 'Buró de Crédito',
        politica: PoliticaPaso.DERIVA_A_REVISION,
        peso: 25,
        umbralMinimo: 600,
      },
      {
        tipo: TipoPasoValidacion.POLITICA_INTERNA,
        etiqueta: 'Monto dentro de política',
        politica: PoliticaPaso.BLOQUEANTE,
        peso: 15,
        parametros: { montoMaximo: 200000 },
      },
    ];
  }
}
