import {
  BadRequestException, ConflictException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { Venta } from '../entities/venta.entity';
import { DetalleVenta } from '../entities/detalle-venta.entity';
import { MovimientoInventario } from '../../catalogo/entities/movimiento-inventario.entity';
import { LoteInventario } from '../../catalogo/entities/lote-inventario.entity';
import { CreditoCliente, EstadoCredito } from '../../credito/entities/credito-cliente.entity';
import { StockService } from '../../catalogo/services/stock.service';
import { MotorContableService } from '../../finanzas/services/motor-contable.service';
import { AsientosPendientesService } from '../../finanzas/services/asientos-pendientes.service';
import { TipoAsiento } from '../../finanzas/entities/asiento-pendiente.entity';

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
  advertencias: string[];
}

@Injectable()
export class AnulacionVentasService {
  private readonly logger = new Logger(AnulacionVentasService.name);

  constructor(
    @InjectRepository(Venta) private readonly ventaRepo: Repository<Venta>,
    private readonly stockService: StockService,
    private readonly motorContable: MotorContableService,
    private readonly asientos: AsientosPendientesService,
    private readonly dataSource: DataSource,
  ) {}

  async anular(
    id: string,
    empresaId: string,
    motivo: string,
    usuarioId?: string,
  ): Promise<ResultadoAnulacion> {
    if (!motivo?.trim()) {
      throw new BadRequestException(
        'Indica el motivo de la anulación. Queda en la bitácora y en la póliza de reversión.',
      );
    }

    const venta = await this.ventaRepo.findOne({
      where: { id, empresaId },
      relations: ['detalles'],
    });

    if (!venta) throw new NotFoundException('Venta no encontrada.');
    if (venta.estado === 'ANULADA') throw new ConflictException('La venta ya fue anulada.');

    const advertencias: string[] = [];

    return this.dataSource.transaction(async (em) => {
      /* ══ 1. Devolver el inventario al ORIGEN y al COSTO original ══ */

      const movimientosSalida = await em.find(MovimientoInventario, {
        where: { documentoId: venta.id, tipo: 'SALIDA', empresaId },
      });

      const devoluciones: ResultadoAnulacion['inventarioDevuelto'] = [];

      if (movimientosSalida.length > 0) {
        // Camino correcto: se conoce el lote exacto y su costo.
        const porProducto = new Map<string, { almacenId: string; cantidad: number; costo: number; lotes: number }>();

        for (const mov of movimientosSalida) {
          if (mov.loteId) {
            const lote = await em.createQueryBuilder(LoteInventario, 'l')
              .setLock('pessimistic_write')
              .where('l.id = :id', { id: mov.loteId })
              .getOne();

            if (lote) {
              const stockAnterior = Number(lote.stockRestante);
              const stockNuevo = stockAnterior + Number(mov.cantidad);
              lote.stockRestante = stockNuevo;
              lote.valorTotal = redondear2(stockNuevo * Number(lote.costoUnitario));
              await em.save(lote);
            } else {
              advertencias.push(
                `El lote original de un producto ya no existe. La devolución se hizo sin reintegrarlo.`,
              );
            }
          }

          // Contramovimiento con el MISMO costo con el que salió.
          await em.save(em.create(MovimientoInventario, {
            productoId: mov.productoId,
            almacenId: mov.almacenId,
            cantidad: Number(mov.cantidad),
            tipo: 'ENTRADA',
            motivo: `Anulación de venta #${venta.folio}: ${motivo}`,
            empresaId,
            stockAnterior: 0,
            stockNuevo: 0,
            costoUnitario: Number(mov.costoUnitario),
            costoTotal: Number(mov.costoTotal),
            lote: mov.lote,
            loteId: mov.loteId,
            documentoId: venta.id,
            tipoDocumento: 'ANULACION_VENTA',
            usuarioId,
          }));

          const acc = porProducto.get(mov.productoId) ?? {
            almacenId: mov.almacenId, cantidad: 0, costo: 0, lotes: 0,
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
          await this.stockService.sincronizarResumen(productoId, almacenId, empresaId, em);
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
        // Venta anterior al costeo: no hay rastro de lote ni costo.
        advertencias.push(
          'Esta venta se registró antes de que el sistema guardara el costo por lote. ' +
          'El inventario se devolvió al almacén de la venta, pero sin costo: ' +
          'verifica la valuación de estos productos.',
        );

        const almacenId = venta.almacenId;
        if (!almacenId) {
          throw new ConflictException(
            'La venta no tiene almacén registrado y no hay movimientos de inventario ' +
            'asociados. No se puede determinar a dónde devolver la mercancía. ' +
            'Ajústalo manualmente desde Inventario → Ajustes.',
          );
        }

        for (const det of venta.detalles) {
          await em.save(em.create(MovimientoInventario, {
            productoId: det.productoId,
            almacenId,
            cantidad: Number(det.cantidad),
            tipo: 'ENTRADA',
            motivo: `Anulación de venta #${venta.folio}: ${motivo}`,
            empresaId,
            costoUnitario: 0,
            costoTotal: 0,
            documentoId: venta.id,
            tipoDocumento: 'ANULACION_VENTA',
            usuarioId,
          }));

          devoluciones.push({
            productoId: det.productoId,
            almacenId,
            cantidad: Number(det.cantidad),
            costoTotal: 0,
            lotes: 0,
          });
        }
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

        const pagado = Number(credito.montoTotal ?? 0) - Number(credito.saldoPendiente ?? 0);
        if (pagado > 0) {
          advertencias.push(
            `El cliente ya había abonado ${pagado.toFixed(2)} a este crédito. ` +
            `Ese importe queda a su favor y debe devolverse o aplicarse a otra operación.`,
          );
        }

        credito.estado = EstadoCredito.CANCELADO;
        credito.notas = `${credito.notas ?? ''}\nCancelado por anulación de la venta #${venta.folio}: ${motivo}`.trim();
        await em.save(credito);
        creditoCancelado = true;
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

      const datosReversion = {
        ventaId: venta.id,
        folio: venta.folio,
        fecha: new Date(),
        empresaId,
        metodoPago: venta.metodoPago,
        motivo,
        detalles: venta.detalles.map((d: DetalleVenta) => ({
          productoId: d.productoId,
          cantidad: Number(d.cantidad),
          subtotal: Number(d.subtotal),
          impuestoMonto: Number(d.impuestoMonto ?? 0),
          costoTotal: devoluciones.find((x) => x.productoId === d.productoId)?.costoTotal ?? 0,
        })),
      };

      // CANCELACION_VENTA, no VENTA: si se usara VENTA, el motor generaría
      // otra póliza de ingreso idéntica y DUPLICARÍA la venta en lugar de
      // revertirla. El método espejo invierte los cargos y abonos.
      void this.asientos.intentar(
        TipoAsiento.CANCELACION_VENTA,
        datosReversion,
        empresaId,
        `ANUL-${venta.folio}`,
        venta.id,
      );

      /* ══ 5. CFDI ══ */

      const cfdiRequiereCancelacion = venta.metodoPago !== 'EFECTIVO' || !!venta.clienteId;
      if (cfdiRequiereCancelacion) {
        advertencias.push(
          'Si esta venta tenía CFDI timbrado, debes cancelarlo ante el SAT desde el ' +
          'módulo de facturación. La anulación en el ERP no cancela el comprobante fiscal.',
        );
      }

      this.logger.log(
        `Venta #${venta.folio} anulada por ${usuarioId ?? 'sistema'}. ` +
        `Motivo: ${motivo}. Productos devueltos: ${devoluciones.length}. ` +
        `Crédito cancelado: ${creditoCancelado}.`,
      );

      return {
        venta,
        inventarioDevuelto: devoluciones,
        creditoCancelado,
        polizaReversion: true,
        cfdiRequiereCancelacion,
        advertencias,
      };
    });
  }
}
