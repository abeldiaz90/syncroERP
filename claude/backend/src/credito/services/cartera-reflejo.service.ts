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
  TipoVinculo,
  tipoTransaccionNormalizado,
} from '../../integracion/integracion.constants';
import { PuertoCarteraExterna } from '../../integracion/ports/cartera-externa.port';
import { IntegracionModoService } from '../../integracion/services/integracion-modo.service';
import { IntegracionVinculosService } from '../../integracion/services/integracion-vinculos.service';
import { MetodoPagoCobranza } from '../dto/registrar-pago-cobranza.dto';
import { CreditoCliente, EstadoCredito } from '../entities/credito-cliente.entity';
import { CobranzaService } from './cobranza.service';

export interface ResultadoReflejo {
  revisados: number;
  aplicados: number;
  omitidos: { creditoId: string; idTransaccionExterna: string; motivo: string }[];
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
          if (r.aplicados || r.omitidos.length) {
            this.logger.log(
              `Reflejo externo ${empresa.empresaId}: ${r.aplicados} aplicado(s), ${r.omitidos.length} omitido(s).`,
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
    const resultado: ResultadoReflejo = { revisados: 0, aplicados: 0, omitidos: [] };

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

    const creditos = await this.creditos.find({
      where: { empresaId, estado: In([EstadoCredito.ACTIVO, EstadoCredito.VENCIDO]) },
    });

    for (const credito of creditos) {
      const idExterno = await this.vinculos.idExterno(
        empresaId,
        TipoVinculo.CREDITO,
        credito.id,
      );
      if (!idExterno) continue;

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

        if (!TIPOS_COBRANZA_DEL_CLIENTE.includes(tipo)) continue;

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
