import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Poliza } from '../../finanzas/entities/poliza.entity';
import {
  ModoContabilidad,
  TipoEventoIntegracion,
} from '../integracion.constants';
import { IntegracionModoService } from './integracion-modo.service';
import { IntegracionOutboxService } from './integracion-outbox.service';

/**
 * Lo único que el motor contable del ERP conoce de la integración.
 *
 * `polizas.service.ts` llama aquí después de guardar una póliza. La llamada
 * escribe una fila en `integracion_eventos` dentro de la misma transacción: si
 * la póliza se revierte, el espejo se revierte con ella.
 *
 * Es tolerante por diseño. Una falla al encolar el espejo no puede impedir que
 * se registre una póliza: la contabilidad fiscal del ERP no depende de que el
 * externo esté disponible ni configurado.
 */
@Injectable()
export class ContabilidadPublicadorService {
  private readonly logger = new Logger(ContabilidadPublicadorService.name);

  constructor(
    private readonly outbox: IntegracionOutboxService,
    private readonly modos: IntegracionModoService,
    @InjectRepository(Poliza)
    private readonly polizaRepo: Repository<Poliza>,
  ) {}

  async activoPara(empresaId: string): Promise<boolean> {
    return (
      (await this.modos.modoContabilidadDe(empresaId)) ===
      ModoContabilidad.ESPEJO
    );
  }

  /** Póliza registrada en el ERP, lista para espejarse en el mayor externo. */
  async polizaRegistrada(
    empresaId: string,
    polizaId: string,
    em?: EntityManager,
  ): Promise<void> {
    try {
      if (!(await this.activoPara(empresaId))) return;
      await this.outbox.publicar(
        {
          empresaId,
          tipo: TipoEventoIntegracion.POLIZA_REGISTRADA,
          entidadId: polizaId,
          claveIdempotencia: `poliza:${polizaId}`,
          carga: { polizaId },
        },
        em,
      );
    } catch (error) {
      this.logger.error(
        `No se pudo encolar el espejo de la póliza ${polizaId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * ==========================================================================
   * La otra mitad del espejo: la póliza que NADIE intentó mandar
   * --------------------------------------------------------------------------
   * El control `ESPEJO_CONTABLE` del cierre cuenta lo que hay en la bandeja de
   * salida en FALLIDO, REINTENTABLE o PENDIENTE. Eso cubre todo lo que se
   * intentó y no salió. No cubre lo que nunca se encoló.
   *
   * Medido el 30-sep-2026 contra la instalación: **ocho pólizas VIGENTES de
   * los días 13, 14 y 15 de septiembre sin un solo evento de espejo** —dos
   * devoluciones, dos cobranzas, tres ingresos de ticket y un costo de ventas—.
   * Nacieron antes de que existiera el suscriptor, o con el espejo apagado. No
   * fallaron: nadie las intentó. Y por eso no salían en ninguna bandeja, y el
   * cierre de septiembre habría certificado el mes en verde con los dos libros
   * distintos: exactamente el defecto que el control vino a impedir, entrando
   * por la otra puerta.
   *
   * Un asiento que falló da la cara. Uno que nunca se encoló, no. Ésta es la
   * consulta que lo obliga a darla.
   * ==========================================================================
   */
  async polizasSinEspejo(
    empresaId: string,
    fechaHasta?: string,
  ): Promise<Poliza[]> {
    if (!(await this.activoPara(empresaId))) return [];
    const consulta = this.polizaRepo
      .createQueryBuilder('p')
      .where('p.empresaId = :empresaId', { empresaId })
      .andWhere("p.estatus = 'VIGENTE'")
      .andWhere(
        /*
         * `ev.empresaId = p.empresaId` es redundante hoy —el identificador de
         * la póliza es único— y se escribe igual: una subconsulta que no
         * nombra la empresa es una fuga esperando a que alguien cambie la
         * clave, y la prueba de coherencia multiempresa lo exige con razón.
         */
        `NOT EXISTS (
           SELECT 1 FROM integracion_eventos ev
            WHERE ev.entidadId = p.id
              AND ev.empresaId = p.empresaId
              AND ev.tipo = :tipo)`,
        { tipo: TipoEventoIntegracion.POLIZA_REGISTRADA },
      )
      .orderBy('p.fecha', 'DESC');
    if (fechaHasta) {
      consulta.andWhere('p.fecha <= :fechaHasta', { fechaHasta });
    }
    return consulta.getMany();
  }

  /**
   * Encola las que faltaban. Es idempotente por la clave del outbox
   * (`poliza:<id>`), así que repetirlo no duplica nada: quien lo pulse dos
   * veces por nervios no hace daño.
   *
   * Sólo encola. Despachar sigue siendo un acto aparte y con su propio
   * permiso, porque mandar asientos al mayor externo no es lo mismo que
   * reconocer que faltaban.
   */
  async encolarFaltantes(
    empresaId: string,
    fechaHasta?: string,
  ): Promise<{ encoladas: number; folios: string[] }> {
    const faltantes = await this.polizasSinEspejo(empresaId, fechaHasta);
    for (const poliza of faltantes) {
      await this.polizaRegistrada(empresaId, poliza.id);
    }
    return {
      encoladas: faltantes.length,
      folios: faltantes.map((p) => p.folio),
    };
  }
}
