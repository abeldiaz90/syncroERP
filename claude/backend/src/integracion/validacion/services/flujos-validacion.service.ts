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
} from '../validacion.constants';

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
          topeAutomatico: String(datos.topeAutomatico ?? 0),
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

  /** Activa un flujo y desactiva el que estuviera vigente. */
  async activar(id: string, empresaId: string) {
    const flujo = await this.obtener(id, empresaId);
    if (flujo.pasos.length === 0) {
      throw new BadRequestException('Un flujo sin pasos no puede activarse.');
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
