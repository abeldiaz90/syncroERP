import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  DataSource,
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
} from 'typeorm';
import { Cliente } from '../../clientes/entities/cliente.entity';
import { CarteraPublicadorService } from './cartera-publicador.service';

/**
 * Publica el alta de cualquier cliente nuevo en el outbox de cartera.
 *
 * La integración no debe depender de recordar una llamada desde cada flujo que
 * pueda crear clientes. Igual que el espejo contable escucha la creación de
 * pólizas, este suscriptor escucha la creación de `Cliente` y publica el hecho
 * dentro de la misma transacción.
 *
 * `CarteraPublicadorService` ya aplica el interruptor de seguridad: si la
 * empresa tiene la cartera en APAGADO no escribe ningún evento. En SOMBRA o
 * AUTORIDAD, el evento queda listo para que el despachador cree/vincule el
 * cliente en el registro externo.
 */
@Injectable()
@EventSubscriber()
export class ClienteCarteraSubscriber
  implements EntitySubscriberInterface<Cliente>
{
  constructor(
    @InjectDataSource() dataSource: DataSource,
    private readonly publicador: CarteraPublicadorService,
  ) {
    dataSource.subscribers.push(this);
  }

  listenTo() {
    return Cliente;
  }

  async afterInsert(evento: InsertEvent<Cliente>): Promise<void> {
    const cliente = evento.entity;
    if (!cliente?.id || !cliente?.empresaId) return;

    await this.publicador.clienteAlta(
      cliente.empresaId,
      cliente.id,
      evento.manager,
    );
  }
}
