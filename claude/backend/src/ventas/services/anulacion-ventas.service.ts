import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { Venta } from '../entities/venta.entity';
import { DetalleVenta } from '../entities/detalle-venta.entity';
import { MovimientoInventario } from '../../catalogo/entities/movimiento-inventario.entity';
import { LoteInventario } from '../../catalogo/entities/lote-inventario.entity';
import {
  CreditoCliente,
  EstadoCredito,
} from '../../credito/entities/credito-cliente.entity';
import { StockService } from '../../catalogo/services/stock.service';
import { AsientosPendientesService } from '../../finanzas/services/asientos-pendientes.service';
import { TipoAsiento } from '../../finanzas/entities/asiento-pendiente.entity';
import { TesoreriaService } from '../../tesoreria/services/tesoreria.service';
import { CfdiService } from '../../cfdi/cfdi.service';
import {
  MovimientoTesoreria,
  OrigenMovimiento,
  TipoMovimiento,
} from '../../tesoreria/entities/tesoreria.entity';
import { fechaCalendarioNegocio } from '../../common/utils/business-time.util';
import { CarteraPublicadorService } from '../../integracion/services/cartera-publicador.service';
import { CajaService } from '../../caja/services/caja.service';
import {
  NaturalezaMovimientoCaja,
  TipoMovimientoCaja,
} from '../../caja/entities/movimiento-caja.entity';
import {
  CuentaBancaria,
  TipoCuentaBancaria,
} from '../../credito/entities/cuenta-bancaria.entity';
import {
  ROLES_AUTORIZADORES_ANULACION,
  UMBRAL_APROBACION_ANULACION,
  normalizarRolAutorizador,
} from '../constants/autorizacion-ventas';

/**
 * ============================================================================
 * SyncroERP · Anulación de ventas
 * ----------------------------------------------------------------------------
 * EL PROBLEMA QUE RESUELVE
 *
 * El `anular()` original hacía dos cosas: devolver el stock y marcar la venta
 * como ANULADA. Una venta toca CUATRO sistemas, así que quedaban tres sin
 * revertir:
 *
 *   · La póliza contable seguía viva → se declaraba IVA de ventas que no
 *     ocurrieron. Dinero real saliendo de la empresa cada mes.
 *   · El crédito del cliente seguía activo → cobranza perseguía a alguien por
 *     mercancía que ya había devuelto.
 *   · El CFDI seguía timbrado → para el SAT la operación existía.
 *
 * Y dentro de lo que sí hacía había dos errores más:
 *
 *   · `venta.almacenId || almacenDefault` devolvía la mercancía a un almacén
 *     distinto del que salió. Se teletransportaba entre sucursales.
 *   · La devolución entraba sin costo, así que anular una venta cambiaba el
 *     valor del inventario de la empresa.
 *
 * ── CÓMO SE RESUELVE ───────────────────────────────────────────────────────
 *
 * Se lee `movimientos_inventario` para saber EXACTAMENTE de qué almacén, de
 * qué lote y a qué costo salió cada pieza, y se devuelve ahí mismo. Eso solo
 * es posible porque el costeo de inventario ya guarda `loteId` y
 * `costoUnitario`; sin ese cambio previo, este no se puede hacer bien.
 *
 * La contabilidad NO se edita: se contrarresta con una póliza de reversión.
 * Borrar o modificar una póliza existente rompe la cadena de auditoría y en
 * México además es una infracción.
 * ============================================================================
 */

const redondear2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface ResultadoAnulacion {
  venta: Venta;
  inventarioDevuelto: Array<{
    productoId: string;
    almacenId: string;
    cantidad: number;
    costoTotal: number;
    lotes: number;
  }>;
  creditoCancelado: boolean;
  polizaReversion: boolean;
  cfdiRequiereCancelacion: boolean;
  cfdiId?: string;
  cfdiEstado?: string;
  advertencias: string[];
}

@Injectable()
export class AnulacionVentasService {
  private readonly logger = new Logger(AnulacionVentasService.name);

  constructor(
    @InjectRepository(Venta) private readonly ventaRepo: Repository<Venta>,
    private readonly stockService: StockService,
    private readonly asientos: AsientosPendientesService,
    private readonly dataSource: DataSource,
    private readonly tesoreria: TesoreriaService,
    private readonly cfdi: CfdiService,
    private readonly caja: CajaService,
    private readonly cartera: CarteraPublicadorService,
  ) {}

  async anular(
    id: string,
    empresaId: string,
    motivo: string,
    usuarioId?: string,
    rolUsuario?: string,
  ): Promise<ResultadoAnulacion> {
    if (!motivo?.trim()) {
      throw new BadRequestException(
        'Indica el motivo de la anulación. Queda en la bitácora y en la póliza de reversión.',
      );
    }

    let venta = await this.ventaRepo.findOne({
      where: { id, empresaId },
      relations: ['detalles'],
    });

    if (!venta) throw new NotFoundException('Venta no encontrada.');

    /*
     * Anular revierte inventario, crédito, tesorería, contabilidad y CFDI de
     * una sola vez. No es una operación de mostrador.
     */
    const umbralAnulacion = UMBRAL_APROBACION_ANULACION();
    if (
      Number(venta.total) >= umbralAnulacion &&
      !ROLES_AUTORIZADORES_ANULACION().has(
        normalizarRolAutorizador(rolUsuario),
      )
    ) {
      throw new ConflictException(
        `Anular la venta #${venta.folio} por $${Number(venta.total).toFixed(2)} ` +
          'requiere autorización de gerencia. Registra una devolución si sólo ' +
          'necesitas revertir parte de la operación.',
      );
    }
    if (venta.estado !== 'COMPLETADA') {
      throw new ConflictException(
        venta.estado === 'PARCIALMENTE_DEVUELTA'
          ? 'La venta ya tiene devoluciones parciales. Devuelve el remanente desde el módulo de devoluciones; no puede anularse completa.'
          : `La venta está en estado ${venta.estado} y no puede anularse.`,
      );
    }

    const advertencias: string[] = [];

    const resultado = await this.dataSource.transaction(async (em) => {
      // Anulación y devolución comparten el mismo candado: nunca pueden
      // procesarse simultáneamente sobre la misma venta.
      await em.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))`,
        [`devolucion:${empresaId}:${id}`],
      );
      const bloqueada = await em
        .createQueryBuilder(Venta, 'v')
        .leftJoinAndSelect('v.detalles', 'd')
        .setLock('pessimistic_write')
        .where('v.id = :id AND v.empresaId = :empresaId', { id, empresaId })
        .getOne();
      if (!bloqueada) throw new NotFoundException('Venta no encontrada.');
      if (bloqueada.estado !== 'COMPLETADA') {
        throw new ConflictException(
          `La venta cambió a estado ${bloqueada.estado}; actualiza la pantalla antes de continuar.`,
        );
      }
      venta = bloqueada;

      /* ══ 1. Devolver el inventario al ORIGEN y al COSTO original ══ */

      const movimientosSalida = await em.find(MovimientoInventario, {
        where: { documentoId: venta.id, tipo: 'SALIDA', empresaId },
      });

      const devoluciones: ResultadoAnulacion['inventarioDevuelto'] = [];

      if (movimientosSalida.length > 0) {
        // Camino correcto: se conoce el lote exacto y su costo.
        const porProducto = new Map<
          string,
          { almacenId: string; cantidad: number; costo: number; lotes: number }
        >();

        for (const mov of movimientosSalida) {
          let stockAnteriorDevolucion = 0;
          let stockNuevoDevolucion = 0;
          if (mov.loteId) {
            const lote = await em
              .createQueryBuilder(LoteInventario, 'l')
              .setLock('pessimistic_write')
              .where('l.id = :id', { id: mov.loteId })
              .getOne();

            if (lote) {
              const stockAnterior = Number(lote.stockRestante);
              const stockNuevo = stockAnterior + Number(mov.cantidad);
              stockAnteriorDevolucion = stockAnterior;
              stockNuevoDevolucion = stockNuevo;
              lote.stockRestante = stockNuevo;
              lote.valorTotal = redondear2(
                stockNuevo * Number(lote.costoUnitario),
              );
              await em.save(lote);
            } else {
              advertencias.push(
                `El lote original de un producto ya no existe. La devolución se hizo sin reintegrarlo.`,
              );
            }
          }

          // Contramovimiento con el MISMO costo con el que salió.
          await em.save(
            em.create(MovimientoInventario, {
              productoId: mov.productoId,
              almacenId: mov.almacenId,
              cantidad: Number(mov.cantidad),
              tipo: 'ENTRADA',
              motivo: `Anulación de venta #${venta.folio}: ${motivo}`,
              empresaId,
              stockAnterior: stockAnteriorDevolucion,
              stockNuevo: stockNuevoDevolucion,
              costoUnitario: Number(mov.costoUnitario),
              costoTotal: Number(mov.costoTotal),
              lote: mov.lote,
              loteId: mov.loteId,
              documentoId: venta.id,
              tipoDocumento: 'ANULACION_VENTA',
              usuarioId,
            }),
          );

          const acc = porProducto.get(mov.productoId) ?? {
            almacenId: mov.almacenId,
            cantidad: 0,
            costo: 0,
            lotes: 0,
          };
          acc.cantidad += Number(mov.cantidad);
          acc.costo += Number(mov.costoTotal);
          acc.lotes += 1;
          porProducto.set(mov.productoId, acc);
        }

        // Un solo recálculo por producto y almacén, no uno por movimiento.
        const combinaciones = new Set<string>(
          movimientosSalida.map((m) => `${m.productoId}|${m.almacenId}`),
        );
        for (const clave of combinaciones) {
          const [productoId, almacenId] = clave.split('|');
          await this.stockService.sincronizarResumen(
            productoId,
            almacenId,
            empresaId,
            em,
          );
        }

        for (const [productoId, v] of porProducto) {
          devoluciones.push({
            productoId,
            almacenId: v.almacenId,
            cantidad: v.cantidad,
            costoTotal: redondear2(v.costo),
            lotes: v.lotes,
          });
        }
      } else {
        /*
         * Venta anterior al costeo: no hay rastro de lote ni de costo.
         *
         * La versión anterior escribía un MovimientoInventario de ENTRADA con
         * costo cero y devolvía un mensaje de éxito. Pero la existencia se
         * calcula como SUM(lote.stockRestante) y aquí no se creaba ni se
         * actualizaba ningún lote, así que el stock NO subía: el kardex
         * mostraba una entrada fantasma y la advertencia («el inventario se
         * devolvió, pero sin costo») era falsa.
         *
         * Entre mentir y detenerse, se detiene. La anulación de una venta
         * histórica exige un ajuste manual donde el usuario decide a qué lote
         * y a qué costo entra la mercancía.
         */
        const almacenId = venta.almacenId;
        throw new ConflictException(
          `La venta #${venta.folio} es anterior al costeo por lote: no existe ` +
            'registro de a qué lote ni a qué costo salió la mercancía, así que ' +
            'el sistema no puede reintegrarla sin corromper la valuación. ' +
            (almacenId
              ? 'Registra la entrada manualmente desde Inventario → Ajustes y ' +
                'después anula la venta, o procesa una devolución indicando el lote.'
              : 'Además la venta no tiene almacén registrado. ') +
            'Ninguna existencia fue modificada.',
        );
      }

      /*
       * El saldo a favor aplicado no se puede revertir por esta vía.
       * `generarAsientoDeVenta` carga la cuenta de saldos a favor de clientes
       * cuando se aplica, pero `generarAsientoDeCancelacionVenta` no recibe
       * `saldoFavorAplicado` y abona el total íntegro a la cuenta del método
       * de pago: el pasivo con el cliente quedaría sin cancelar y la cuenta de
       * cobro sobreabonada. Hasta que la reversión maneje el desglose, se
       * exige procesarlo como devolución, que sí lo contempla.
       */
      if (Number(venta.saldoFavorAplicado ?? 0) > 0) {
        throw new ConflictException(
          `La venta #${venta.folio} aplicó $${Number(venta.saldoFavorAplicado).toFixed(2)} ` +
            'de saldo a favor del cliente. Anularla dejaría ese saldo sin restituir ' +
            'y la cuenta de cobro descuadrada. Regístralo como devolución total.',
        );
      }

      /* ══ 2. Cancelar el crédito ══ */

      let creditoCancelado = false;
      const credito = await em.findOne(CreditoCliente, {
        where: { ventaId: venta.id, empresaId },
      });

      if (credito) {
        if (credito.estado === EstadoCredito.LIQUIDADO) {
          throw new ConflictException(
            'El crédito de esta venta ya fue liquidado. Anular dejaría un pago sin ' +
              'documento que lo respalde. Registra una devolución en su lugar.',
          );
        }

        const pagado =
          Number(credito.montoTotal ?? 0) - Number(credito.saldoPendiente ?? 0);
        const enganche = Number(credito.enganche ?? 0);
        if (pagado > 0 || enganche > 0) {
          throw new ConflictException(
            `La venta a crédito tiene ${enganche > 0 ? `un enganche de ${enganche.toFixed(2)}` : ''}` +
              `${enganche > 0 && pagado > 0 ? ' y ' : ''}` +
              `${pagado > 0 ? `abonos por ${pagado.toFixed(2)}` : ''}. ` +
              'Debe procesarse como devolución con reembolso para no dejar CxC, caja e IVA inconsistentes.',
          );
        }

        credito.estado = EstadoCredito.CANCELADO;
        credito.notas =
          `${credito.notas ?? ''}\nCancelado por anulación de la venta #${venta.folio}: ${motivo}`.trim();
        await em.save(credito);
        creditoCancelado = true;

        // El hecho se publica DENTRO de la transacción: si la anulación se
        // revierte, el aviso se revierte con ella y el registro externo nunca
        // supo de una cancelación que no ocurrió.
        await this.cartera.creditoCancelado(
          empresaId,
          {
            creditoId: credito.id,
            motivo: `Anulación de la venta #${venta.folio}: ${motivo}`,
          },
          em,
        );
      }

      // Revierte el dinero sólo cuando existe el ingreso de tesorería original.
      // Las ventas históricas anteriores al módulo no crean una salida ficticia.
      const ingresoOriginal = await em.findOne(MovimientoTesoreria, {
        where: {
          empresaId,
          documentoId: venta.id,
          origen: OrigenMovimiento.VENTA,
          cancelado: false,
        },
        order: { fechaCreacion: 'ASC' },
      });
      if (ingresoOriginal) {
        await this.tesoreria.registrarEnTransaccion(
          {
            cuentaBancariaId: ingresoOriginal.cuentaBancariaId,
            fecha: fechaCalendarioNegocio(),
            tipo: TipoMovimiento.EGRESO,
            importe: Number(ingresoOriginal.importe),
            concepto: `Anulación de venta #${venta.folio}`,
            origen: OrigenMovimiento.DEVOLUCION_VENTA,
            documentoId: venta.id,
            tipoDocumento: 'ANULACION_VENTA',
            terceroId: venta.clienteId,
          },
          empresaId,
          usuarioId,
          em,
        );

        /*
         * El turno de caja también tiene que descargarse. Sin esto el
         * `efectivoEsperado` seguía incluyendo el cobro anulado: el cajero
         * devolvía el dinero al cliente y al cerrar aparecía un FALTANTE por
         * ese importe que se le imputaba a él.
         */
        const cuentaOriginal = await em.findOne(CuentaBancaria, {
          where: { id: ingresoOriginal.cuentaBancariaId, empresaId },
        });
        if (cuentaOriginal?.tipo === TipoCuentaBancaria.CAJA) {
          await this.caja.registrarEnTransaccion(
            em,
            {
              cuentaCajaId: cuentaOriginal.id,
              naturaleza: NaturalezaMovimientoCaja.SALIDA,
              tipo: TipoMovimientoCaja.REEMBOLSO,
              importe: Number(ingresoOriginal.importe),
              concepto: `Anulación de venta #${venta.folio}`,
              documentoId: venta.id,
              tipoDocumento: 'ANULACION_VENTA',
            },
            empresaId,
            usuarioId,
          );
        }
      } else if (!credito) {
        advertencias.push(
          'La venta es anterior a la integración de tesorería; no se creó una salida de caja automática.',
        );
      }

      /* ══ 3. Marcar la venta ══ */

      venta.estado = 'ANULADA';
      venta.notas = `${venta.notas ?? ''}\nANULADA: ${motivo}`.trim();
      await em.save(venta);

      /* ══ 4. Póliza de reversión ══ */
      // Fuera del alcance de la transacción de negocio a propósito: si la
      // contabilidad falla, la anulación no debe quedar a medias. El servicio
      // de asientos pendientes se encarga de reintentarlo y de que quede
      // visible si no lo logra.

      // Un producto puede aparecer en más de un renglón. El costo devuelto
      // está agregado por producto; asignarlo completo a cada renglón
      // duplicaba el costo de la póliza.
      const costoPendiente = new Map(
        devoluciones.map((d) => [d.productoId, Number(d.costoTotal)]),
      );
      const cantidadPendiente = new Map<string, number>();
      for (const detalle of venta.detalles) {
        cantidadPendiente.set(
          detalle.productoId,
          Number(cantidadPendiente.get(detalle.productoId) ?? 0) +
            Number(detalle.cantidad),
        );
      }

      const datosReversion = {
        ventaId: venta.id,
        folio: venta.folio,
        fecha: new Date(),
        empresaId,
        metodoPago: venta.metodoPago,
        motivo,
        detalles: venta.detalles.map((d: DetalleVenta) => {
          const costoDisponible = Number(costoPendiente.get(d.productoId) ?? 0);
          const cantidadDisponible = Number(
            cantidadPendiente.get(d.productoId) ?? 0,
          );
          const costo =
            Number(d.cantidad) + 0.0001 >= cantidadDisponible
              ? costoDisponible
              : redondear2(
                  costoDisponible * (Number(d.cantidad) / cantidadDisponible),
                );
          costoPendiente.set(d.productoId, redondear2(costoDisponible - costo));
          cantidadPendiente.set(
            d.productoId,
            cantidadDisponible - Number(d.cantidad),
          );
          return {
            productoId: d.productoId,
            cantidad: Number(d.cantidad),
            subtotal: Number(d.subtotal),
            impuestoMonto: Number(d.impuestoMonto ?? 0),
            costoTotal: costo,
          };
        }),
      };

      // CANCELACION_VENTA, no VENTA: el evento se inserta en la misma
      // transacción que la anulación. Si el proceso cae antes de generar la
      // póliza, el cron conserva toda la información para reintentarla.
      const eventoContable = await this.asientos.encolarEnTransaccion(
        em,
        TipoAsiento.CANCELACION_VENTA,
        datosReversion,
        empresaId,
        `ANUL-${venta.folio}`,
        venta.id,
      );

      /* ══ 5. CFDI ══ */

      // La cancelación fiscal ocurre después del commit. No se llama al PAC
      // dentro de la transacción SQL para no mantener bloqueos durante una
      // operación de red.
      const cfdiRequiereCancelacion = false;

      this.logger.log(
        `Venta #${venta.folio} anulada por ${usuarioId ?? 'sistema'}. ` +
          `Motivo: ${motivo}. Productos devueltos: ${devoluciones.length}. ` +
          `Crédito cancelado: ${creditoCancelado}.`,
      );

      return {
        venta,
        inventarioDevuelto: devoluciones,
        creditoCancelado,
        polizaReversion: false,
        cfdiRequiereCancelacion,
        advertencias,
        asientoPendienteId: eventoContable.id,
      };
    });

    let asiento: { generado: boolean; polizaId?: string } = {
      generado: false,
    };
    try {
      asiento = await this.asientos.reintentarAhora(
        resultado.asientoPendienteId,
        empresaId,
      );
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Venta #${resultado.venta.folio} anulada, pero falló el intento inmediato de la póliza de reversión: ${mensaje}`,
      );
      resultado.advertencias.push(
        'La anulación fue confirmada; la póliza contable quedó pendiente para el procesador automático.',
      );
    }
    let cfdiCancelado: { id: string; estado: string } | null = null;
    try {
      const factura = await this.cfdi.cancelarPorVenta(
        resultado.venta.id,
        empresaId,
        '03',
      );
      if (factura) {
        cfdiCancelado = { id: factura.id, estado: factura.estado };
      }
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Venta #${resultado.venta.folio} anulada, pero el CFDI no pudo cancelarse: ${mensaje}`,
      );
      resultado.cfdiRequiereCancelacion = true;
      resultado.advertencias.push(
        'La venta quedó anulada, pero la cancelación fiscal quedó pendiente. Reinténtala desde Facturación.',
      );
    }

    return {
      ...resultado,
      cfdiId: cfdiCancelado?.id,
      cfdiEstado: cfdiCancelado?.estado,
      polizaReversion: asiento.generado,
      polizaId: asiento.polizaId,
      estadoContable: asiento.generado ? 'GENERADO' : 'PENDIENTE',
    } as ResultadoAnulacion & {
      asientoPendienteId: string;
      polizaId?: string;
      estadoContable: 'GENERADO' | 'PENDIENTE';
    };
  }
}
