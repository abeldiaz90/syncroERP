import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { omitirTareaProgramada } from '../../common/utils/tareas-programadas.util';
import { ConfiguracionIntegracionEmpresa } from '../../integracion/entities/configuracion-integracion-empresa.entity';
import {
  ModoCartera,
  PREFIJO_REFERENCIA_ERP,
  PUERTO_CARTERA_EXTERNA,
  TIPOS_COBRANZA_DEL_CLIENTE,
  TIPOS_REDUCCION_SIN_COBRO,
  TIPOS_TRANSACCION_PROPIOS_DEL_CORE,
  TIPOS_TRANSACCION_REFLEJABLES,
  TipoVinculo,
  tipoTransaccionNormalizado,
} from '../../integracion/integracion.constants';
import { PuertoCarteraExterna } from '../../integracion/ports/cartera-externa.port';
import { IntegracionModoService } from '../../integracion/services/integracion-modo.service';
import { IntegracionVinculosService } from '../../integracion/services/integracion-vinculos.service';
import { AvisosIntegracionService } from '../../integracion/services/avisos-integracion.service';
import { MetodoPagoCobranza } from '../dto/registrar-pago-cobranza.dto';
import { CreditoCliente, EstadoCredito } from '../entities/credito-cliente.entity';
import { CobranzaService } from './cobranza.service';

export interface ResultadoReflejo {
  revisados: number;
  aplicados: number;
  omitidos: { creditoId: string; idTransaccionExterna: string; motivo: string }[];
  /*
   * Todo lo que se decidió no aplicar, y por qué.
   *
   * `omitidos` recoge los intentos fallidos; esto recoge las DECISIONES de no
   * intentar, que antes eran `continue` mudos. La diferencia importa: con
   * treinta créditos y una cartera que no cuadra, «revisados 1, aplicados 0,
   * omitidos 0» no dice si no había nada que reflejar o si algo se descartó en
   * el camino. Un reflejo que calla cuando no hace nada es indistinguible de
   * un reflejo que no corre.
   */
  descartados: {
    creditoId: string;
    folio?: string;
    idTransaccionExterna: string;
    tipo?: string;
    motivo: string;
  }[];
  /*
   * Qué se alcanzó a mirar.
   *
   * «Revisados 1» no distingue entre «no hubo movimientos» y «no se miró
   * ningún crédito», y son problemas opuestos: uno es la operación normal y el
   * otro es que el enlace está roto y nadie se enteró. El alcance lo dice.
   */
  alcance: {
    creditosEnEstadoReflejable: number;
    conEnlaceExterno: number;
    sinEnlaceExterno: number;
    enlaces: { folio: string; estado: string; idExterno: string; transacciones: number }[];
  };
}

/**
 * Refleja en el ERP las transacciones que nacieron en el registro externo.
 *
 * Es la mitad que faltaba de la sincronización: hasta ahora la conciliación
 * sabía DECIR que alguien había cobrado en el core, y nadie lo aplicaba.
 *
 * Vive en el módulo de crédito y no en el de integración a propósito: necesita
 * al servicio de cobranza, y ponerlo del otro lado formaría un ciclo entre los
 * dos módulos. El de integración ya reexporta el puerto y los vínculos justo
 * para permitir esto.
 *
 * REGLA QUE NO SE NEGOCIA: aplica llamando al servicio de cobranza del ERP,
 * con sus validaciones y sus reglas. Nunca escribe saldos ni filas a mano. El
 * atajo de tocar las tablas haría que el registro externo pudiera dejar al ERP
 * en estados que el propio ERP considera imposibles, y sin rastro de quién lo
 * hizo.
 */
@Injectable()
export class CarteraReflejoService {
  private readonly logger = new Logger(CarteraReflejoService.name);
  private ejecutando = false;

  constructor(
    @Inject(PUERTO_CARTERA_EXTERNA)
    private readonly externa: PuertoCarteraExterna,
    private readonly modos: IntegracionModoService,
    private readonly vinculos: IntegracionVinculosService,
    private readonly avisos: AvisosIntegracionService,
    private readonly cobranza: CobranzaService,
    @InjectRepository(CreditoCliente)
    private readonly creditos: Repository<CreditoCliente>,
    @InjectRepository(ConfiguracionIntegracionEmpresa)
    private readonly configuraciones: Repository<ConfiguracionIntegracionEmpresa>,
  ) {}

  @Cron('0 */5 * * * *', { name: 'cartera-reflejar-externas' })
  async ejecutar(): Promise<void> {
    if (omitirTareaProgramada('cartera-reflejar-externas')) return;
    if (this.ejecutando || !this.externa.configurado()) return;
    this.ejecutando = true;
    try {
      for (const empresa of await this.modos.empresasActivas()) {
        try {
          const r = await this.reflejarEmpresa(empresa.empresaId);
          if (r.aplicados || r.omitidos.length || r.descartados.length) {
            this.logger.log(
              `Reflejo externo ${empresa.empresaId}: ${r.aplicados} aplicado(s), ` +
                `${r.omitidos.length} omitido(s), ${r.descartados.length} sin clasificar o fuera de estado.`,
            );
          }
        } catch (error) {
          this.logger.error(
            `Falló el reflejo externo de ${empresa.empresaId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    } finally {
      this.ejecutando = false;
    }
  }

  async reflejarEmpresa(empresaId: string): Promise<ResultadoReflejo> {
    const resultado: ResultadoReflejo = {
      revisados: 0,
      aplicados: 0,
      omitidos: [],
      descartados: [],
      alcance: {
        creditosEnEstadoReflejable: 0,
        conEnlaceExterno: 0,
        sinEnlaceExterno: 0,
        enlaces: [],
      },
    };

    /*
     * Aislamiento. Una empresa que sólo tiene ERP no debe ni consultarse: no
     * basta con descartar la respuesta, porque preguntar ya es enviar sus
     * identificadores a un sistema que no ha contratado.
     */
    if ((await this.modos.modoDe(empresaId)) === ModoCartera.APAGADO) return resultado;

    const cfg = await this.configuraciones.findOne({ where: { empresaId } });
    const cuentaCobranzaExternaId = (cfg?.parametrosProveedor as Record<string, unknown> | null)
      ?.cuentaCobranzaExternaId as string | undefined;
    const cuentaDevolucionExternaId = (cfg?.parametrosProveedor as Record<
      string,
      unknown
    > | null)?.cuentaDevolucionExternaId as string | undefined;

    /*
     * Por qué también los liquidados.
     *
     * El barrido mira sólo lo vigente, y eso deja un punto ciego: un crédito
     * que el ERP da por liquidado puede seguir moviéndose en el core —un pago
     * tardío, una reversa del cobro que lo liquidó— y ninguno de esos
     * movimientos se veía, ni como aplicado ni como pendiente. Las dos
     * carteras se separaban en silencio, que es la única forma en que esto se
     * vuelve grave.
     *
     * No se aplican: un crédito liquidado aquí no acepta cobranza, y forzarlo
     * sería inventar el estado. Se reportan, que es lo que pide una persona.
     */
    const creditos = await this.creditos.find({
      where: {
        empresaId,
        estado: In([EstadoCredito.ACTIVO, EstadoCredito.VENCIDO, EstadoCredito.LIQUIDADO]),
      },
    });

    resultado.alcance.creditosEnEstadoReflejable = creditos.length;

    for (const credito of creditos) {
      const idExterno = await this.vinculos.idExterno(
        empresaId,
        TipoVinculo.CREDITO,
        credito.id,
      );
      if (!idExterno) {
        resultado.alcance.sinEnlaceExterno += 1;
        continue;
      }
      resultado.alcance.conEnlaceExterno += 1;

      let transacciones;
      try {
        transacciones = await this.externa.transaccionesCredito(idExterno);
      } catch (error) {
        // Un fallo de enlace no se trata como «no hubo movimientos»: eso
        // convertiría cada corte de red en un visto bueno silencioso.
        resultado.omitidos.push({
          creditoId: credito.id,
          idTransaccionExterna: '',
          motivo: `No se pudieron leer las transacciones: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
        continue;
      }
      if (!transacciones) continue;
      resultado.alcance.enlaces.push({
        folio: credito.folio,
        estado: credito.estado,
        idExterno,
        transacciones: transacciones.length,
      });

      for (const t of transacciones) {
        /*
         * Una transacción del ERP que alguien reversó allá. El ERP la sigue
         * contando y el externo ya no, así que hay que cancelar el pago aquí.
         * Es el único caso en que una transacción propia obliga a actuar.
         */
        if (t.referenciaErp?.startsWith(PREFIJO_REFERENCIA_ERP)) {
          if (t.reversada) {
            resultado.revisados += 1;
            const pagoId = t.referenciaErp.split(':').pop() ?? '';
            try {
              const r = await this.cobranza.cancelarPago(
                pagoId,
                empresaId,
                {
                  motivo: `Reversado en el registro externo (transacción ${t.idExterno}).`,
                },
                undefined,
                { idTransaccionExterna: t.idExterno },
              );
              if (!r.idempotente) resultado.aplicados += 1;
            } catch (error) {
              resultado.omitidos.push({
                creditoId: credito.id,
                idTransaccionExterna: t.idExterno,
                motivo: `No se pudo cancelar el pago ${pagoId}: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              });
            }
          }
          continue;
        }
        if (t.reversada) continue;
        const tipo = tipoTransaccionNormalizado(t.tipo);

        /*
         * Un crédito que aquí está liquidado y allá sigue moviéndose. No se
         * toca —no acepta cobranza— pero tampoco se calla.
         */
        if (credito.estado === EstadoCredito.LIQUIDADO && TIPOS_TRANSACCION_REFLEJABLES.includes(tipo)) {
          const yaReflejada = await this.vinculos.porIdExterno(
            empresaId,
            TipoVinculo.PAGO_COBRANZA,
            t.idExterno,
          );
          if (!yaReflejada) {
            resultado.descartados.push({
              creditoId: credito.id,
              folio: credito.folio,
              idTransaccionExterna: t.idExterno,
              tipo: t.tipo,
              motivo:
                `El crédito está ${credito.estado} en el ERP y en el registro externo ` +
                `sigue recibiendo movimientos («${t.tipo}» por ${t.monto}). No se aplica ` +
                'porque un crédito liquidado no acepta cobranza: las dos carteras no ' +
                'coinciden y eso lo tiene que mirar una persona.',
            });
          }
          continue;
        }

        /*
         * Sólo se aplica como cobranza lo que ES cobranza. Una devolución al
         * cliente o una bonificación bajan el saldo sin que entre dinero:
         * registrarlas como cobro haría que el ERP moviera tesorería y
         * cargara la caja por algo que nunca recibió. El arqueo saldría
         * descuadrado y el asiento estaría mintiendo.
         *
         * Su reflejo correcto es una devolución del ERP, que necesita la
         * venta de origen. Mientras esa pieza no exista, la conciliación las
         * sigue reportando y aquí no se tocan.
         */
        if (TIPOS_REDUCCION_SIN_COBRO.includes(tipo)) {
          const yaAjustada = await this.vinculos.porIdExterno(
            empresaId,
            TipoVinculo.AJUSTE_DEVOLUCION_EXTERNA,
            t.idExterno,
          );
          if (yaAjustada) continue;

          resultado.revisados += 1;

          /*
           * Tampoco aquí se adivina la cuenta. No hay rol de sistema para
           * devoluciones, y elegir una por parecido de código metería el
           * importe en una cuenta de ingresos equivocada.
           */
          if (!cuentaDevolucionExternaId) {
            resultado.omitidos.push({
              creditoId: credito.id,
              idTransaccionExterna: t.idExterno,
              motivo: `El movimiento «${t.tipo}» baja el saldo sin que entre dinero y requiere la cuenta de devoluciones. Configura parametrosProveedor.cuentaDevolucionExternaId.`,
            });
            continue;
          }

          try {
            const r = await this.cobranza.ajustarPorDevolucionExterna(empresaId, {
              creditoId: credito.id,
              monto: t.monto,
              idTransaccionExterna: t.idExterno,
              fecha: t.fecha,
              cuentaDevolucionId: cuentaDevolucionExternaId,
            });
            await this.vinculos.vincular({
              empresaId,
              tipo: TipoVinculo.AJUSTE_DEVOLUCION_EXTERNA,
              entidadId: t.idExterno,
              idExterno: t.idExterno,
              proveedor: this.externa.proveedor,
            });
            resultado.aplicados += 1;
            if (r.excedente > 0.0001) {
              // El exceso sobre el saldo es dinero a favor del cliente, y eso
              // es otra operación. Se avisa en vez de inventarla.
              resultado.omitidos.push({
                creditoId: credito.id,
                idTransaccionExterna: t.idExterno,
                motivo: `Se aplicaron ${r.aplicado.toFixed(2)} contra el saldo; quedan ${r.excedente.toFixed(2)} de exceso que son saldo a favor del cliente y requieren su propia operación.`,
              });
            }
          } catch (error) {
            resultado.omitidos.push({
              creditoId: credito.id,
              idTransaccionExterna: t.idExterno,
              motivo: error instanceof Error ? error.message : String(error),
            });
          }
          continue;
        }

        if (!TIPOS_COBRANZA_DEL_CLIENTE.includes(tipo)) {
          /*
           * Lo que el core genera por su cuenta —desembolsos, devengos,
           * reprogramaciones— no es movimiento de nadie y no se reporta: sería
           * ruido en cada pasada. Lo que sí se reporta es un tipo que no está
           * en ninguna de las listas, porque eso significa que el core hizo
           * algo que este ERP no sabe clasificar, y saltárselo en silencio es
           * cómo se pierde un movimiento de dinero.
           */
          if (!TIPOS_TRANSACCION_PROPIOS_DEL_CORE.includes(tipo)) {
            resultado.descartados.push({
              creditoId: credito.id,
              folio: credito.folio,
              idTransaccionExterna: t.idExterno,
              tipo: t.tipo,
              motivo:
                `El movimiento «${t.tipo}» (por ${t.monto}) no está clasificado: el ERP no ` +
                'sabe si representa un cobro, una reducción sin cobro o un asiento propio ' +
                'del core. Hay que clasificarlo antes de poder reflejarlo.',
            });
          }
          continue;
        }

        // Ya reflejada en una pasada anterior.
        const vinculo = await this.vinculos.porIdExterno(
          empresaId,
          TipoVinculo.PAGO_COBRANZA,
          t.idExterno,
        );
        if (vinculo) continue;

        resultado.revisados += 1;

        /*
         * Sin cuenta configurada no se inventa dónde entró el dinero. Un
         * asiento de cobranza contra una caja elegida al azar es peor que no
         * tener el asiento: descuadra la tesorería y nadie lo nota hasta el
         * arqueo.
         */
        if (!cuentaCobranzaExternaId) {
          resultado.omitidos.push({
            creditoId: credito.id,
            idTransaccionExterna: t.idExterno,
            motivo:
              'Falta configurar parametrosProveedor.cuentaCobranzaExternaId: no se puede saber qué caja o banco recibió un cobro registrado fuera del ERP.',
          });
          continue;
        }

        try {
          /*
           * La clave se deriva del identificador de la transacción externa, y
           * eso es lo que hace segura toda la operación: si el proceso muere
           * entre aplicar el pago y guardar el vínculo, la siguiente pasada
           * vuelve a intentarlo y la propia cobranza reconoce la clave y
           * devuelve el pago que ya existía, en vez de cobrar dos veces.
           */
          const resPago = await this.cobranza.registrarPago(
            {
              creditoId: credito.id,
              montoPagado: t.monto,
              metodoPago: MetodoPagoCobranza.OTRO,
              cuentaBancariaId: cuentaCobranzaExternaId,
              referencia: `Reflejo del movimiento ${t.idExterno} del registro externo`,
              fechaPago: t.fecha,
              claveIdempotencia: `ext:${this.externa.proveedor}:${t.idExterno}`,
            },
            empresaId,
            undefined,
            { idTransaccionExterna: t.idExterno },
          );

          await this.vinculos.vincular({
            empresaId,
            tipo: TipoVinculo.PAGO_COBRANZA,
            entidadId: resPago.pago.id,
            idExterno: t.idExterno,
            proveedor: this.externa.proveedor,
          });

          resultado.aplicados += 1;

          /*
           * El aviso que anunció este cobro ya no pide nada: queda como
           * bitácora de lo que pasó, con el rastro de lo que se registró.
           * Se hace después de guardar el vínculo, no antes: si el proceso
           * muere en medio, es mejor un aviso abierto de más —que la siguiente
           * pasada cierra— que uno cerrado sobre un pago que no quedó.
           */
          try {
            await this.avisos.marcarReflejado(
              empresaId,
              t.idExterno,
              `Reflejado automáticamente en el ERP: pago ${resPago.pago.id} de ${t.monto} ` +
                `sobre ${credito.folio}.`,
            );
          } catch (error) {
            // Que no se pueda cerrar el aviso no invalida el pago, que ya está
            // aplicado y vinculado. Se reporta y se sigue.
            resultado.descartados.push({
              creditoId: credito.id,
              folio: credito.folio,
              idTransaccionExterna: t.idExterno,
              tipo: t.tipo,
              motivo: `El pago se reflejó pero no se pudo cerrar su aviso: ${
                error instanceof Error ? error.message : String(error)
              }`,
            });
          }
        } catch (error) {
          /*
           * Lo que el ERP rechaza no se fuerza. Un pago que excede el saldo o
           * un crédito ya liquidado aquí son divergencias de fondo que pide
           * mirar una persona; saltarse la validación para que «cuadre» es
           * exactamente como se corrompe una cartera.
           */
          resultado.omitidos.push({
            creditoId: credito.id,
            idTransaccionExterna: t.idExterno,
            motivo: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return resultado;
  }
}
