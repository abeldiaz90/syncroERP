import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
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
}
