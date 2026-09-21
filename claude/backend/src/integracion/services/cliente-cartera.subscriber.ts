import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  DataSource,
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
  UpdateEvent,
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
  private readonly logger = new Logger(ClienteCarteraSubscriber.name);

  constructor(
    @InjectDataSource() dataSource: DataSource,
    private readonly publicador: CarteraPublicadorService,
  ) {
    dataSource.subscribers.push(this);
  }

  listenTo() {
    return Cliente;
  }

  /**
   * Los campos cuya corrección tiene que llegar al registro externo.
   *
   * Sólo identidad y contacto. El límite de crédito, la etapa comercial o el
   * nivel de riesgo son decisiones del ERP y viajan por sus propios eventos;
   * publicarlas aquí dispararía una réplica por cada cambio comercial.
   */
  private static readonly CAMPOS_REPLICABLES: (keyof Cliente)[] = [
    'nombre',
    'razonSocial',
    'email',
    'telefono',
    /*
     * Identidad oficial y domicilio se agregaron cuando el adaptador ganó dónde
     * ponerlos: viajan como identificadores tipados y como domicilio del core.
     * Antes no estaban aquí y hacían bien en no estar — publicar un cambio que
     * el otro lado descarta genera eventos que no hacen nada.
     */
    'rfc',
    'curp',
    'fechaNacimiento',
    'genero',
    'direccion',
    'colonia',
    'ciudad',
    'estado',
    'codigoPostal',
    'pais',
  ];

  async afterInsert(evento: InsertEvent<Cliente>): Promise<void> {
    const cliente = evento.entity;
    if (!cliente?.id || !cliente?.empresaId) return;

    await this.publicador.clienteAlta(
      cliente.empresaId,
      cliente.id,
      evento.manager,
    );
  }

  /**
   * Una corrección de identidad se publica; el resto de los cambios, no.
   *
   * Antes el ERP sólo replicaba el alta, así que corregir el nombre de un
   * cliente lo dejaba distinto en cada sistema, para siempre y sin aviso. Se
   * compara contra los valores anteriores en vez de publicar en cada guardado,
   * porque un cliente se actualiza por muchas razones —etapa comercial, límite,
   * saldo— y ninguna de ésas necesita viajar.
   */
  async afterUpdate(evento: UpdateEvent<Cliente>): Promise<void> {
    const cliente = evento.entity as Cliente | undefined;
    if (!cliente?.id || !cliente?.empresaId) return;

    const anterior = evento.databaseEntity as Cliente | undefined;
    const cambiadas = evento.updatedColumns.map((columna) => columna.propertyName);
    const tocaIdentidad = ClienteCarteraSubscriber.CAMPOS_REPLICABLES.some(
      (campo) => {
        if (!cambiadas.includes(campo as string)) return false;
        // Sin el valor anterior no se puede comparar: se publica, que es el
        // lado seguro —una réplica de más se resuelve sola, una de menos no—.
        if (!anterior) return true;
        return anterior[campo] !== cliente[campo];
      },
    );
    if (!tocaIdentidad) return;

    /*
     * Se registra a propósito, y no en `debug`.
     *
     * Cuando una corrección no llega al core, la primera pregunta es si el ERP
     * llegó siquiera a publicarla. Sin este renglón hay que abrir la base para
     * responderla, y mientras tanto no se distingue «el ERP no publicó» de «el
     * core no aplicó», que se arreglan en lugares distintos.
     */
    this.logger.log(
      `Cliente ${cliente.id}: cambió ${cambiadas.join(', ')}; se publica la corrección al registro externo.`,
    );

    await this.publicador.clienteActualizado(
      cliente.empresaId,
      cliente.id,
      String(Date.now()),
      evento.manager,
    );
  }
}
