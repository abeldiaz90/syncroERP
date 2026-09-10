import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  DataSource,
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
} from 'typeorm';
import { Poliza } from '../../finanzas/entities/poliza.entity';
import { ContabilidadPublicadorService } from './contabilidad-publicador.service';

/**
 * Encola el espejo de cada póliza que nace en el ERP.
 *
 * Se hace con un suscriptor y no con una llamada en cada servicio porque el ERP
 * crea pólizas desde cinco lugares distintos —el motor contable, la captura
 * manual, la captura manual en transacción, las reversas y el cierre—, y una
 * lista de puntos de enganche es una lista que alguien olvidará ampliar. Aquí
 * la condición es «existe una póliza», que es exactamente la que interesa.
 *
 * `afterInsert` corre dentro de la transacción que creó la póliza y recibe su
 * `EntityManager`, así que el evento del outbox nace y muere con ella.
 */
@Injectable()
@EventSubscriber()
export class PolizaEspejoSubscriber
  implements EntitySubscriberInterface<Poliza>
{
  private readonly logger = new Logger(PolizaEspejoSubscriber.name);

  constructor(
    @InjectDataSource() dataSource: DataSource,
    private readonly publicador: ContabilidadPublicadorService,
  ) {
    dataSource.subscribers.push(this);
  }

  listenTo() {
    return Poliza;
  }

  async afterInsert(evento: InsertEvent<Poliza>): Promise<void> {
    const poliza = evento.entity;
    if (!poliza?.id || !poliza?.empresaId) return;

    // El publicador ya es tolerante: si la empresa no espeja contabilidad, esto
    // no hace nada; si algo falla, lo registra y no propaga. Una póliza jamás
    // debe fallar por culpa de su espejo.
    await this.publicador.polizaRegistrada(
      poliza.empresaId,
      poliza.id,
      evento.manager,
    );
  }
}
