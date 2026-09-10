import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { omitirTareaProgramada } from '../../common/utils/tareas-programadas.util';
import { Cliente } from '../../clientes/entities/cliente.entity';
import { CreditoCliente } from '../../credito/entities/credito-cliente.entity';
import { ProductoCredito } from '../../credito/entities/producto-credito.entity';
import { diaCalendario } from '../../common/utils/fecha-calendario.util';
import { PartidaPoliza } from '../../finanzas/entities/partida-poliza.entity';
import { Poliza } from '../../finanzas/entities/poliza.entity';
import {
  ModoCartera,
  ModoContabilidad,
  PUERTO_CARTERA_EXTERNA,
  PUERTO_CONTABILIDAD_EXTERNA,
  TipoEventoIntegracion,
  TipoVinculo,
} from '../integracion.constants';
import { ConfiguracionIntegracionEmpresa } from '../entities/configuracion-integracion-empresa.entity';
import { PuertoContabilidadExterna } from '../ports/contabilidad-externa.port';
import { MapeoCuentasService } from './mapeo-cuentas.service';
import { EventoIntegracion } from '../entities/evento-integracion.entity';
import {
  ErrorIntegracionExterna,
  PuertoCarteraExterna,
} from '../ports/cartera-externa.port';
import { IntegracionModoService } from './integracion-modo.service';
import { IntegracionOutboxService } from './integracion-outbox.service';
import { IntegracionVinculosService } from './integracion-vinculos.service';

/*
 * Día de calendario, no instante. `toISOString()` sobre una fecha leída de una
 * columna `date` la corre un día en cuanto la zona no es UTC, y el registro
 * externo recibiría un vencimiento distinto del que firmó el cliente.
 */
const iso = (valor: unknown): string =>
  diaCalendario(valor as Date | string | null);

const num = (valor: unknown): number => Number(valor ?? 0) || 0;

/**
 * Lee el outbox y lo aplica en el registro externo.
 *
 * Corre desacoplado de la transacción de negocio a propósito: la venta ya se
 * consumó cuando este servicio actúa, de modo que un fallo aquí nunca puede
 * revertirla ni dejar al cajero esperando. Lo que sí puede es dejar el evento
 * en FALLIDO, que es exactamente la señal que la pantalla de administración
 * muestra para que alguien lo revise.
 *
 * Este servicio es lo que se saca a un proceso aparte el día que convenga: sólo
 * necesita la tabla `integracion_eventos` y el puerto. El resto del ERP no cambia.
 */
@Injectable()
export class IntegracionDespachadorService {
  private readonly logger = new Logger(IntegracionDespachadorService.name);
  private despachando = false;

  constructor(
    private readonly outbox: IntegracionOutboxService,
    private readonly modos: IntegracionModoService,
    private readonly vinculos: IntegracionVinculosService,
    @Inject(PUERTO_CARTERA_EXTERNA)
    private readonly externa: PuertoCarteraExterna,
    @InjectRepository(Cliente)
    private readonly clientesRepo: Repository<Cliente>,
    @InjectRepository(CreditoCliente)
    private readonly creditosRepo: Repository<CreditoCliente>,
    @InjectRepository(ProductoCredito)
    private readonly productosRepo: Repository<ProductoCredito>,
    @Inject(PUERTO_CONTABILIDAD_EXTERNA)
    private readonly contabilidad: PuertoContabilidadExterna,
    private readonly mapeo: MapeoCuentasService,
    @InjectRepository(Poliza)
    private readonly polizasRepo: Repository<Poliza>,
    @InjectRepository(PartidaPoliza)
    private readonly partidasRepo: Repository<PartidaPoliza>,
    @InjectRepository(ConfiguracionIntegracionEmpresa)
    private readonly configEmpresa: Repository<ConfiguracionIntegracionEmpresa>,
  ) {}

  @Cron('*/1 * * * *', { name: 'integracion-despachar-outbox' })
  async ejecutar(): Promise<void> {
    if (omitirTareaProgramada('integracion-despachar-outbox')) return;
    await this.despacharLote();
  }

  /**
   * Procesa un lote. Se expone como método para que la administración pueda
   * forzar el despacho tras corregir una configuración.
   */
  async despacharLote(
    limite = 50,
  ): Promise<{ procesados: number; fallidos: number }> {
    const hayEnlace =
      (this.externa.configurado() && this.externa.disponible()) ||
      (this.contabilidad.configurado() && this.contabilidad.disponible());
    if (!hayEnlace) return { procesados: 0, fallidos: 0 };
    // Un solo despachador a la vez por proceso: dos concurrentes sobre el mismo
    // evento producirían créditos duplicados si la idempotencia fallara.
    if (this.despachando) return { procesados: 0, fallidos: 0 };
    this.despachando = true;

    let procesados = 0;
    let fallidos = 0;

    try {
      for (const evento of await this.outbox.pendientes(limite)) {
        try {
          if (!(await this.empresaAceptaEvento(evento))) {
            await this.outbox.marcarFallo(
              evento,
              'La empresa tiene apagado el eje que corresponde a este evento.',
              false,
              this.maxIntentos,
            );
            continue;
          }
          const respuesta = await this.aplicar(evento);
          await this.outbox.marcarEnviado(evento, respuesta);
          procesados += 1;
        } catch (error) {
          fallidos += 1;
          const reintentable =
            !(error instanceof ErrorIntegracionExterna) || error.reintentable;
          await this.outbox.marcarFallo(
            evento,
            error instanceof Error ? error.message : String(error),
            reintentable,
            this.maxIntentos,
          );
        }
      }
    } finally {
      this.despachando = false;
    }

    if (procesados || fallidos) {
      this.logger.log(
        `Outbox de cartera: ${procesados} aplicado(s), ${fallidos} con error.`,
      );
    }
    return { procesados, fallidos };
  }

  private get maxIntentos(): number {
    return 8;
  }

  /**
   * Cada evento pertenece a un eje. Una empresa que espeja contabilidad pero no
   * lleva la cartera en el externo no debe ver fallar sus pólizas por el eje
   * equivocado, ni al revés.
   */
  private async empresaAceptaEvento(evento: EventoIntegracion): Promise<boolean> {
    const perfil = await this.modos.perfilDe(evento.empresaId);
    return evento.tipo === TipoEventoIntegracion.POLIZA_REGISTRADA
      ? perfil.contabilidad === ModoContabilidad.ESPEJO
      : perfil.cartera !== ModoCartera.APAGADO;
  }

  /**
   * Espeja una póliza del ERP en el mayor externo.
   *
   * IDEMPOTENCIA. Un asiento manual no admite clave de idempotencia del lado
   * del proveedor: si el POST se aplica y la respuesta se pierde, un reintento
   * ciego duplicaría el asiento y descuadraría el mayor sin dejar rastro. Por
   * eso el vínculo se marca EN_VUELO **antes** de llamar, y un reintento que
   * lo encuentra así se detiene y pide verificación humana. Es preferible un
   * evento en rojo que un mayor con un asiento doble.
   *
   * Con una excepción que importa: si el fallo PRUEBA que la petición nunca
   * salió —conexión rechazada, circuito abierto—, no hay nada que verificar y
   * la marca se levanta para que el reintento siga solo. Sin esa distinción,
   * una caída del proveedor convertía cada póliza en trabajo manual, que es
   * justo lo que el outbox existe para evitar.
   */
  private async espejarPoliza(evento: EventoIntegracion): Promise<string> {
    const polizaId = String(evento.carga.polizaId ?? evento.entidadId ?? '');

    const vinculo = await this.vinculos.buscar(
      evento.empresaId,
      TipoVinculo.POLIZA,
      polizaId,
    );
    if (vinculo?.idExterno) return vinculo.idExterno;

    const poliza = await this.polizasRepo.findOne({
      where: { id: polizaId, empresaId: evento.empresaId },
    });
    if (!poliza) {
      throw new ErrorIntegracionExterna(
        `La póliza ${polizaId} ya no existe en el ERP.`,
        false,
      );
    }
    // Una póliza cancelada no se espeja: su reversa es otra póliza, y esa sí
    // viaja con su propio evento.
    if (poliza.estatus === 'CANCELADA') {
      throw new ErrorIntegracionExterna(
        `La póliza ${poliza.folio} está cancelada; su reversa viaja como póliza propia.`,
        false,
      );
    }

    const partidas = await this.partidasRepo.find({
      where: { polizaId },
    });
    if (partidas.length === 0) {
      throw new ErrorIntegracionExterna(
        `La póliza ${poliza.folio} no tiene partidas.`,
        false,
      );
    }

    // El ERP ya valida el cuadre al crear la póliza. Se vuelve a comprobar
    // aquí porque mandar un asiento descuadrado al mayor externo lo rechazaría
    // de todos modos, y el mensaje del proveedor sería mucho menos claro.
    const cargos = partidas.reduce((t, p) => t + Number(p.cargo ?? 0), 0);
    const abonos = partidas.reduce((t, p) => t + Number(p.abono ?? 0), 0);
    if (Math.abs(cargos - abonos) > 0.009) {
      throw new ErrorIntegracionExterna(
        `La póliza ${poliza.folio} no cuadra: cargos ${cargos.toFixed(2)} vs abonos ${abonos.toFixed(2)}.`,
        false,
      );
    }

    const mapa = await this.mapeo.resolverEstricto(
      evento.empresaId,
      partidas.map((p) => p.cuentaContableId),
    );

    const cfg = await this.configEmpresa.findOne({
      where: { empresaId: evento.empresaId },
    });
    const oficina = cfg?.oficinaContableExterna;
    if (!oficina) {
      throw new ErrorIntegracionExterna(
        'La empresa no tiene configurada la oficina contable del mayor externo.',
        false,
      );
    }

    /*
     * Un envío anterior se perdió en vuelo y nadie sabe si el asiento se
     * aplicó. La respuesta la tiene el mayor externo: se le pregunta por la
     * referencia que el ERP le puso.
     *
     * Antes esto se detenía y pedía verificación humana. Con una caída del
     * proveedor eso convertía cada póliza del periodo en trabajo manual —y la
     * verificación consistía en abrir el otro sistema y buscar exactamente
     * esta referencia, que es justo lo que estas líneas hacen solas.
     */
    if (vinculo?.estadoRemoto === 'EN_VUELO') {
      const yaEstaba = await this.contabilidad.buscarAsientoPorReferencia({
        referencia: `SYNCRO-${poliza.folio}`,
        oficinaIdExterna: oficina,
        fecha: iso(poliza.fecha),
      });

      if (yaEstaba) {
        this.logger.warn(
          `El asiento de la póliza ${poliza.folio} sí se había registrado (${yaEstaba}); se recupera el vínculo en vez de duplicarlo.`,
        );
        await this.vinculos.vincular({
          empresaId: evento.empresaId,
          tipo: TipoVinculo.POLIZA,
          entidadId: polizaId,
          idExterno: yaEstaba,
          proveedor: this.contabilidad.proveedor,
          estadoRemoto: 'REGISTRADO',
        });
        return yaEstaba;
      }
      // No está allá: el envío nunca llegó y se puede mandar sin duplicar.
    }

    await this.vinculos.vincular({
      empresaId: evento.empresaId,
      tipo: TipoVinculo.POLIZA,
      entidadId: polizaId,
      idExterno: null,
      proveedor: this.contabilidad.proveedor,
      estadoRemoto: 'EN_VUELO',
    });

    let idExterno: string;
    try {
      idExterno = await this.contabilidad.registrarAsiento({
        empresaId: evento.empresaId,
        polizaId,
        folio: poliza.folio,
        fecha: iso(poliza.fecha),
        concepto: poliza.concepto,
        moneda: 'MXN',
        oficinaIdExterna: oficina,
        movimientos: partidas.map((p) => {
          const cuenta = mapa.get(p.cuentaContableId)!;
          return {
            cuentaIdExterna: cuenta.idExterno,
            codigoCuentaErp: cuenta.codigoCuenta,
            cargo: Number(p.cargo ?? 0),
            abono: Number(p.abono ?? 0),
          };
        }),
      });
    } catch (error) {
      if (
        error instanceof ErrorIntegracionExterna &&
        error.pudoAplicarse === false
      ) {
        // Se levanta la marca: no hubo conexión, así que allá no ocurrió nada
        // y el siguiente intento parte de cero en vez de pedir que un humano
        // vaya a mirar un asiento que no existe.
        await this.vinculos.vincular({
          empresaId: evento.empresaId,
          tipo: TipoVinculo.POLIZA,
          entidadId: polizaId,
          idExterno: null,
          proveedor: this.contabilidad.proveedor,
          estadoRemoto: 'NO_ENVIADO',
        });
      }
      throw error;
    }

    await this.vinculos.vincular({
      empresaId: evento.empresaId,
      tipo: TipoVinculo.POLIZA,
      entidadId: polizaId,
      idExterno,
      proveedor: this.contabilidad.proveedor,
      estadoRemoto: 'REGISTRADO',
    });

    return idExterno;
  }

  /**
   * El crédito se canceló porque su venta se anuló.
   *
   * Si el crédito nunca llegó a replicarse, no hay nada que cancelar allá y el
   * hecho se da por resuelto: fallar aquí dejaría un evento en rojo para
   * siempre por algo que no existe.
   */
  private async cancelarCredito(evento: EventoIntegracion): Promise<boolean> {
    const creditoId = String(evento.carga.creditoId ?? evento.entidadId ?? '');
    const idExterno = await this.vinculos.idExterno(
      evento.empresaId,
      TipoVinculo.CREDITO,
      creditoId,
    );
    if (!idExterno) {
      this.logger.warn(
        `El crédito ${creditoId} se canceló sin haberse replicado nunca; no hay nada que cancelar afuera.`,
      );
      return false;
    }

    const hecho = await this.externa.cancelarCredito({
      empresaId: evento.empresaId,
      creditoId,
      creditoIdExterno: idExterno,
      fecha: iso(evento.carga.fecha),
      motivo: (evento.carga.motivo as string) ?? null,
    });

    if (hecho) {
      await this.vinculos.vincular({
        empresaId: evento.empresaId,
        tipo: TipoVinculo.CREDITO,
        entidadId: creditoId,
        idExterno,
        proveedor: this.externa.proveedor,
        estadoRemoto: 'CANCELADO',
      });
    }
    return hecho;
  }

  /** Devolución de mercancía que reduce el saldo del crédito. */
  private async ajustarPorDevolucion(
    evento: EventoIntegracion,
  ): Promise<string | null> {
    const creditoId = String(evento.carga.creditoId ?? evento.entidadId ?? '');
    const idExterno = await this.vinculos.idExterno(
      evento.empresaId,
      TipoVinculo.CREDITO,
      creditoId,
    );
    if (!idExterno) {
      throw new ErrorIntegracionExterna(
        `El crédito ${creditoId} no está replicado, así que la devolución no tiene contra qué aplicarse. Espera a que el crédito se replique.`,
        true,
      );
    }

    return this.externa.registrarDevolucion({
      empresaId: evento.empresaId,
      creditoId,
      creditoIdExterno: idExterno,
      devolucionId: String(evento.carga.devolucionId ?? evento.entidadId ?? ''),
      monto: num(evento.carga.monto),
      fecha: iso(evento.carga.fecha),
      folio: (evento.carga.folio as string) ?? null,
    });
  }

  /** Un pago de cobranza se deshizo en el ERP. */
  private async revertirPago(evento: EventoIntegracion): Promise<boolean> {
    const pagoId = String(evento.carga.pagoId ?? evento.entidadId ?? '');
    const creditoId = String(evento.carga.creditoId ?? '');

    const creditoIdExterno = await this.vinculos.idExterno(
      evento.empresaId,
      TipoVinculo.CREDITO,
      creditoId,
    );
    if (!creditoIdExterno) {
      this.logger.warn(
        `Se revirtió el pago ${pagoId} de un crédito que nunca se replicó; no hay nada que deshacer afuera.`,
      );
      return false;
    }

    const pagoIdExterno = await this.vinculos.idExterno(
      evento.empresaId,
      TipoVinculo.PAGO_COBRANZA,
      pagoId,
    );

    return this.externa.revertirPago({
      empresaId: evento.empresaId,
      creditoIdExterno,
      pagoId,
      pagoIdExterno,
      fecha: iso(evento.carga.fecha),
      motivo: (evento.carga.motivo as string) ?? null,
    });
  }

  private async aplicar(
    evento: EventoIntegracion,
  ): Promise<Record<string, unknown> | null> {
    switch (evento.tipo) {
      case TipoEventoIntegracion.CLIENTE_ALTA:
      case TipoEventoIntegracion.CLIENTE_ACTUALIZACION:
      case TipoEventoIntegracion.LINEA_AUTORIZADA:
        return { clienteIdExterno: await this.asegurarCliente(evento) };

      case TipoEventoIntegracion.CREDITO_ORIGINADO:
      case TipoEventoIntegracion.CREDITO_DESEMBOLSADO:
        return { creditoIdExterno: await this.originarCredito(evento) };

      case TipoEventoIntegracion.PAGO_REGISTRADO:
        return { pagoIdExterno: await this.registrarPago(evento) };

      case TipoEventoIntegracion.POLIZA_REGISTRADA:
        return { asientoIdExterno: await this.espejarPoliza(evento) };

      case TipoEventoIntegracion.CREDITO_CANCELADO:
        return { cancelado: await this.cancelarCredito(evento) };

      case TipoEventoIntegracion.AJUSTE_DEVOLUCION:
        return { ajusteIdExterno: await this.ajustarPorDevolucion(evento) };

      case TipoEventoIntegracion.PAGO_REVERTIDO:
        return { revertido: await this.revertirPago(evento) };

      case TipoEventoIntegracion.LINEA_REVOCADA:
        // La línea de crédito es una decisión del ERP y no tiene equivalente en
        // el registro externo: allá no hay un objeto «línea» que revocar. Se
        // deja explícito en vez de aproximarlo.
        throw new ErrorIntegracionExterna(
          `El evento ${evento.tipo} no tiene equivalente en el registro externo. Descártalo.`,
          false,
        );

      default:
        throw new ErrorIntegracionExterna(
          `Evento desconocido: ${evento.tipo}`,
          false,
        );
    }
  }

  private async asegurarCliente(evento: EventoIntegracion): Promise<string> {
    const clienteId = String(evento.carga.clienteId ?? evento.entidadId ?? '');
    const idExterno = await this.replicarCliente(evento.empresaId, clienteId);
    return idExterno;
  }

  private async replicarCliente(
    empresaId: string,
    clienteId: string,
  ): Promise<string> {
    const yaVinculado = await this.vinculos.idExterno(
      empresaId,
      TipoVinculo.CLIENTE,
      clienteId,
    );
    if (yaVinculado) return yaVinculado;

    const cliente = await this.clientesRepo.findOne({
      where: { id: clienteId, empresaId },
    });
    if (!cliente) {
      throw new ErrorIntegracionExterna(
        `El cliente ${clienteId} ya no existe en el ERP.`,
        false,
      );
    }

    const idExterno = await this.externa.asegurarCliente({
      empresaId,
      clienteId: cliente.id,
      nombre: cliente.razonSocial || cliente.nombre,
      esPersonaMoral: cliente.tipoPersona === 'MORAL',
      rfc: cliente.rfc ?? null,
      email: cliente.email ?? null,
      telefono: cliente.telefono ?? null,
    });

    await this.vinculos.vincular({
      empresaId,
      tipo: TipoVinculo.CLIENTE,
      entidadId: cliente.id,
      idExterno,
      proveedor: this.externa.proveedor,
      estadoRemoto: 'ACTIVO',
    });
    return idExterno;
  }

  private async originarCredito(evento: EventoIntegracion): Promise<string> {
    const creditoId = String(evento.carga.creditoId ?? evento.entidadId ?? '');

    const yaVinculado = await this.vinculos.idExterno(
      evento.empresaId,
      TipoVinculo.CREDITO,
      creditoId,
    );
    if (yaVinculado) return yaVinculado;

    const credito = await this.creditosRepo.findOne({
      where: { id: creditoId, empresaId: evento.empresaId },
    });
    if (!credito) {
      throw new ErrorIntegracionExterna(
        `El crédito ${creditoId} ya no existe en el ERP.`,
        false,
      );
    }

    const producto = credito.productoCreditoId
      ? await this.productosRepo.findOne({
          where: {
            id: credito.productoCreditoId,
            empresaId: evento.empresaId,
          },
        })
      : null;

    // El cliente debe existir antes que su crédito. Si su evento de alta aún no
    // se despachó, se replica aquí en lugar de esperar otro ciclo.
    const clienteIdExterno = await this.replicarCliente(
      evento.empresaId,
      credito.clienteId,
    );

    const idExterno = await this.externa.originarCredito({
      empresaId: evento.empresaId,
      creditoId: credito.id,
      clienteId: credito.clienteId,
      clienteIdExterno,
      capital: num(credito.capitalFinanciado),
      numeroCuotas: Number(credito.numeroCuotas) || 1,
      tasaInteresMensual: num(credito.tasaInteresMensual),
      sinInteres: credito.sinInteres,
      fechaInicio: iso(credito.fechaInicio),
      productoCreditoId: credito.productoCreditoId ?? null,
      // El plazo se resuelve aquí y viaja resuelto: el adaptador no consulta el
      // catálogo del ERP, sólo traduce lo que recibe.
      unidadPlazo: producto?.unidadPlazo ?? null,
      cadaCuantos: producto?.cadaCuantos ?? null,
      tipoCredito: String(credito.tipoCredito),
      folio: credito.folio,
    });

    await this.vinculos.vincular({
      empresaId: evento.empresaId,
      tipo: TipoVinculo.CREDITO,
      entidadId: credito.id,
      idExterno,
      proveedor: this.externa.proveedor,
      estadoRemoto: 'ACTIVO',
    });
    return idExterno;
  }

  private async registrarPago(evento: EventoIntegracion): Promise<string | null> {
    const carga = evento.carga as {
      creditoId?: string;
      pagoId?: string;
      monto?: number;
      fechaPago?: string;
      referencia?: string | null;
    };

    if (!carga.creditoId || !carga.pagoId) {
      throw new ErrorIntegracionExterna(
        'El evento de pago no trae creditoId o pagoId.',
        false,
      );
    }

    const creditoIdExterno = await this.vinculos.idExterno(
      evento.empresaId,
      TipoVinculo.CREDITO,
      carga.creditoId,
    );
    if (!creditoIdExterno) {
      // El crédito aún no se replicó: se reintenta cuando su evento pase.
      throw new ErrorIntegracionExterna(
        `El crédito ${carga.creditoId} todavía no está replicado.`,
        true,
      );
    }

    const idExterno = await this.externa.registrarPago({
      empresaId: evento.empresaId,
      creditoId: carga.creditoId,
      creditoIdExterno,
      pagoId: carga.pagoId,
      monto: num(carga.monto),
      fechaPago: iso(carga.fechaPago),
      referencia: carga.referencia ?? null,
    });

    if (idExterno) {
      await this.vinculos.vincular({
        empresaId: evento.empresaId,
        tipo: TipoVinculo.PAGO_COBRANZA,
        entidadId: carga.pagoId,
        idExterno,
        proveedor: this.externa.proveedor,
      });
    }
    return idExterno;
  }
}
