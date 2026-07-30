import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, QueryRunner } from 'typeorm';
import { Producto } from '../../catalogo/entities/producto.entity';
import { Poliza, TipoPoliza } from '../entities/poliza.entity';
import { PartidaPoliza } from '../entities/partida-poliza.entity';
import { RolCuentaSistema } from '../entities/cuenta-contable.entity';

// ─── Interfaces ───────────────────────────────────────────────────────────────
export interface DetalleVentaContable {
  productoId: string;
  cantidad: number;
  subtotal: number;
  impuestoMonto: number;
  /**
   * Costo REAL de lo que salió, calculado por el inventario a partir de los
   * lotes que efectivamente se consumieron. Opcional por compatibilidad, pero
   * todo llamador nuevo debe enviarlo.
   */
  costoTotal?: number;
}
export interface DatosVentaContable {
  ventaId: string;
  folio: number;
  fecha: Date;
  empresaId: string;
  detalles: DetalleVentaContable[];
  totalGeneral: number;
  metodoPago?: string; // EFECTIVO | TARJETA | TRANSFERENCIA | CREDITO_* | MENSUALIDADES
  cuentaBancariaId?: string; // ID de CuentaBancaria para saber en qué cuenta cae el dinero
  enganche?: number;
  saldoFavorAplicado?: number;
  cuentaBancariaEngancheId?: string;
}
export interface DetalleCompraContable {
  productoId: string;
  cantidad: number;
  costoUnitario: number;
  tasaIva?: number; // 0.16 por defecto (IVA México)
}
export interface DatosCompraContable {
  compraId: string;
  folio: string;
  fecha: Date;
  empresaId: string;
  detalles: DetalleCompraContable[];
  totalGeneral: number;
}
export type TipoSalida = 'MERMA' | 'AJUSTE' | 'CONSUMO' | 'MUESTRA';
export interface DetalleMovimientoContable {
  productoId: string;
  cantidad: number;
  costoUnitario: number;
}
export interface DatosMovimientoContable {
  movimientoId: string;
  tipo: TipoSalida;
  motivo: string;
  fecha: Date;
  empresaId: string;
  detalles: DetalleMovimientoContable[];
}

type PartidaInput = {
  cuentaContableId: string;
  cargo: number;
  abono: number;
  referencia: string;
};

@Injectable()
export class MotorContableService {
  private readonly logger = new Logger(MotorContableService.name);

  private readonly METODOS_CREDITO = new Set([
    'CREDITO_30D',
    'CREDITO_60D',
    'CREDITO_90D',
    'MENSUALIDADES',
  ]);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Producto)
    private readonly productoRepo: Repository<Producto>,
  ) {}

  // ══════════════════════════════════════════════════════════════════════════
  // 1. ASIENTO DE VENTA
  //    CONTADO:  Dr. Caja/Banco   / Cr. Ventas / Cr. IVA
  //    CRÉDITO:  Dr. Clientes CxC / Cr. Ventas / Cr. IVA
  //    COSTO:    Dr. CostoVentas  / Cr. Inventario
  // ══════════════════════════════════════════════════════════════════════════
  async generarAsientoDeVenta(datos: DatosVentaContable): Promise<void> {
    try {
      this.logger.log(
        `[Venta #${datos.folio}] metodoPago="${datos.metodoPago}" cuentaBancaria="${datos.cuentaBancariaId}"`,
      );

      const prodMap = await this.cargarProductosConCategoria(
        datos.detalles.map((d) => d.productoId),
        datos.empresaId,
      );

      // ── Partidas de COSTO ──
      const partidasCosto: PartidaInput[] = [];
      for (const det of datos.detalles) {
        const prod = prodMap.get(det.productoId);
        const cat = prod?.categoria as any;
        // `precioCompra` es el precio de REPOSICIÓN del catálogo: cuánto
        // costaría comprar hoy. No es lo que costó la mercancía que salió.
        // Usarlo separaba la cuenta de Inventario del valor físico un poco en
        // cada venta, y al cierre nadie podía explicar la diferencia.
        const costo =
          det.costoTotal !== undefined
            ? this.redondear(Number(det.costoTotal))
            : this.redondear(Number(prod.precioCompra || 0) * det.cantidad);
        if (costo <= 0) {
          if (Number(det.cantidad) > 0 && (prod as any)?.tipo !== 'SERVICIO') {
            throw new Error(
              `${prod?.nombre ?? det.productoId}: la salida de inventario tiene costo cero. ` +
                'Regulariza el lote antes de contabilizar la venta.',
            );
          }
          continue;
        }
        if (!cat?.cuentaCostoVentasId || !cat?.cuentaInventarioId) {
          throw new Error(
            `${prod?.nombre ?? det.productoId}: faltan las cuentas de inventario o costo de ventas.`,
          );
        }
        const ref = `V#${datos.folio}`;
        partidasCosto.push({
          cuentaContableId: cat.cuentaCostoVentasId,
          cargo: costo,
          abono: 0,
          referencia: ref,
        });
        partidasCosto.push({
          cuentaContableId: cat.cuentaInventarioId,
          cargo: 0,
          abono: costo,
          referencia: ref,
        });
      }
      if (partidasCosto.length > 0)
        await this.crearPoliza({
          empresaId: datos.empresaId,
          tipo: TipoPoliza.DIARIO,
          concepto: `Costo de ventas — Ticket #${datos.folio}`,
          fecha: datos.fecha,
          partidas: partidasCosto,
          origenClave: `VENTA:${datos.ventaId}:COSTO`,
          origenTipo: 'VENTA',
          origenId: datos.ventaId,
        });

      // ── Partidas de INGRESO ──
      // La cuenta débito depende del método de pago
      const cuentaDebito = await this.buscarCuentaSegunMetodoPago(
        datos.empresaId,
        datos.metodoPago,
        datos.cuentaBancariaId,
      );
      const esCredito = this.METODOS_CREDITO.has(datos.metodoPago ?? '');
      const cuentaIvaCobrado = await this.buscarCuentaPorRol(
        datos.empresaId,
        RolCuentaSistema.IVA_TRASLADADO_COBRADO,
        'PASIVO',
        '208',
      );
      const cuentaIvaNoCobrado = esCredito
        ? await this.buscarCuentaPorRol(
            datos.empresaId,
            RolCuentaSistema.IVA_TRASLADADO_NO_COBRADO,
            'PASIVO',
            '207',
          )
        : null;

      if (!cuentaDebito) {
        throw new Error(
          `Venta #${datos.folio}: no hay cuenta para el método "${datos.metodoPago ?? 'EFECTIVO'}".`,
        );
      }

      const partidasIngreso: PartidaInput[] = [];
      let totalVentas = 0,
        totalIva = 0;
      for (const det of datos.detalles) {
        const prod = prodMap.get(det.productoId);
        const cat = prod?.categoria as any;
        if (!cat?.cuentaVentasId) {
          throw new Error(
            `${prod?.nombre ?? det.productoId}: falta la cuenta contable de ventas.`,
          );
        }
        const sub = this.redondear(det.subtotal);
        const iva = this.redondear(det.impuestoMonto);
        partidasIngreso.push({
          cuentaContableId: cat.cuentaVentasId,
          cargo: 0,
          abono: sub,
          referencia: `V#${datos.folio}`,
        });
        totalVentas += sub;
        totalIva += iva;
      }
      if (partidasIngreso.length > 0) {
        const totalCobrado = this.redondear(totalVentas + totalIva);
        const enganche = this.redondear(Number(datos.enganche ?? 0));
        const saldoFavor = this.redondear(
          Number(datos.saldoFavorAplicado ?? 0),
        );
        if (
          enganche < 0 ||
          saldoFavor < 0 ||
          enganche + saldoFavor > totalCobrado
        ) {
          throw new Error(`Venta #${datos.folio}: enganche contable inválido.`);
        }
        const importeRealizado = this.redondear(enganche + saldoFavor);
        const ivaCobrado = esCredito
          ? this.redondear(
              totalCobrado > 0
                ? (totalIva * importeRealizado) / totalCobrado
                : 0,
            )
          : totalIva;
        const ivaNoCobrado = this.redondear(totalIva - ivaCobrado);
        if (ivaCobrado > 0 && !cuentaIvaCobrado) {
          throw new Error('Falta la cuenta de IVA trasladado cobrado.');
        }
        if (ivaNoCobrado > 0 && !cuentaIvaNoCobrado) {
          throw new Error('Falta la cuenta de IVA trasladado no cobrado.');
        }
        if (ivaCobrado > 0) {
          partidasIngreso.push({
            cuentaContableId: cuentaIvaCobrado.id,
            cargo: 0,
            abono: ivaCobrado,
            referencia: `IVA-COB-V#${datos.folio}`,
          });
        }
        if (ivaNoCobrado > 0) {
          partidasIngreso.push({
            cuentaContableId: cuentaIvaNoCobrado.id,
            cargo: 0,
            abono: ivaNoCobrado,
            referencia: `IVA-PEND-V#${datos.folio}`,
          });
        }

        if (saldoFavor > 0) {
          const cuentaSaldoFavor = await this.buscarCuentaPorRol(
            datos.empresaId,
            RolCuentaSistema.SALDOS_FAVOR_CLIENTES,
            'PASIVO',
            '206',
          );
          if (!cuentaSaldoFavor) {
            throw new Error('Falta la cuenta de saldos a favor de clientes.');
          }
          partidasIngreso.unshift({
            cuentaContableId: cuentaSaldoFavor.id,
            cargo: saldoFavor,
            abono: 0,
            referencia: `SF-V#${datos.folio}`,
          });
        }

        // Crédito: caja recibe el enganche, saldo a favor cancela pasivo y
        // únicamente el remanente se reconoce como cuenta por cobrar.
        if (esCredito) {
          const remanenteCxC = this.redondear(
            totalCobrado - enganche - saldoFavor,
          );
          if (remanenteCxC > 0) {
            partidasIngreso.unshift({
              cuentaContableId: cuentaDebito.id,
              cargo: remanenteCxC,
              abono: 0,
              referencia: `V#${datos.folio}`,
            });
          }
        }
        if (enganche > 0 && esCredito) {
          const cuentaEnganche = await this.buscarCuentaSegunMetodoPago(
            datos.empresaId,
            'EFECTIVO',
            datos.cuentaBancariaEngancheId,
          );
          if (!cuentaEnganche) {
            throw new Error(
              'No hay cuenta contable para registrar el enganche.',
            );
          }
          partidasIngreso.unshift(
            {
              cuentaContableId: cuentaEnganche.id,
              cargo: enganche,
              abono: 0,
              referencia: `ENG-V#${datos.folio}`,
            },
          );
        } else if (!esCredito && totalCobrado - saldoFavor > 0) {
          partidasIngreso.unshift({
            cuentaContableId: cuentaDebito.id,
            cargo: this.redondear(totalCobrado - saldoFavor),
            abono: 0,
            referencia: `V#${datos.folio}`,
          });
        }
        await this.crearPoliza({
          empresaId: datos.empresaId,
          tipo: TipoPoliza.INGRESO,
          concepto: `Ingresos — Ticket #${datos.folio}`,
          fecha: datos.fecha,
          partidas: partidasIngreso,
          origenClave: `VENTA:${datos.ventaId}:INGRESO`,
          origenTipo: 'VENTA',
          origenId: datos.ventaId,
        });
      }
    } catch (err: any) {
      this.logger.error(`[Venta #${datos.folio}] ${err?.message}`);
      // Se propaga a propósito: AsientosPendientesService lo captura,
      // lo registra y lo reintenta. Tragárselo aquí dejaba las
      // operaciones sin póliza en silencio.
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REVERSIÓN DE VENTA — anulaciones y devoluciones
  //
  // NO modifica ni borra la póliza original: crea una que la contrarresta.
  // Editar un asiento aplicado rompe la cadena de auditoría y en México es una
  // infracción. Los lados van invertidos respecto a la venta:
  //
  //   Costo:    Dr. Inventario         / Cr. Costo de ventas
  //   Ingreso:  Dr. Ventas + Dr. IVA   / Cr. Caja, Banco o CxC
  //
  // Cancelar el IVA trasladado es lo que evita enterarle al SAT impuesto de una
  // venta que no ocurrió.
  // ═══════════════════════════════════════════════════════════════════════════
  async generarAsientoDeCancelacionVenta(datos: {
    ventaId: string;
    folio: string;
    fecha: Date;
    empresaId: string;
    metodoPago?: string;
    cuentaBancariaId?: string;
    motivo: string;
    detalles: DetalleVentaContable[];
  }): Promise<void> {
    try {
      const ref = `ANUL-V#${datos.folio}`;
      const prodMap = await this.cargarProductosConCategoria(
        datos.detalles.map((d) => d.productoId),
        datos.empresaId,
      );

      // ── Reversión del costo: el inventario regresa ──
      const partidasCosto: PartidaInput[] = [];
      for (const det of datos.detalles) {
        const prod = prodMap.get(det.productoId);
        const cat = prod?.categoria as any;
        const costo = this.redondear(Number(det.costoTotal ?? 0));
        if (
          costo <= 0 &&
          Number(det.cantidad) > 0 &&
          (prod as any)?.tipo !== 'SERVICIO'
        ) {
          throw new Error(
            `${prod?.nombre ?? det.productoId}: no se puede revertir un costo cero.`,
          );
        }
        if (costo <= 0) continue;
        if (!cat?.cuentaCostoVentasId || !cat?.cuentaInventarioId) {
          throw new Error(
            `${prod?.nombre ?? det.productoId}: faltan las cuentas de inventario o costo de ventas.`,
          );
        }

        partidasCosto.push({
          cuentaContableId: cat.cuentaInventarioId,
          cargo: costo,
          abono: 0,
          referencia: ref,
        });
        partidasCosto.push({
          cuentaContableId: cat.cuentaCostoVentasId,
          cargo: 0,
          abono: costo,
          referencia: ref,
        });
      }

      if (partidasCosto.length > 0) {
        await this.crearPoliza({
          empresaId: datos.empresaId,
          tipo: TipoPoliza.DIARIO,
          concepto: `Reversión de costo — ${datos.folio}. ${datos.motivo}`,
          fecha: datos.fecha,
          partidas: partidasCosto,
          origenClave: `ANULACION_VENTA:${datos.ventaId}:COSTO`,
          origenTipo: 'ANULACION_VENTA',
          origenId: datos.ventaId,
        });
      }

      // ── Reversión del ingreso ──
      const cuentaCredito = await this.buscarCuentaSegunMetodoPago(
        datos.empresaId,
        datos.metodoPago,
        datos.cuentaBancariaId,
      );

      if (!cuentaCredito) {
        throw new Error(
          `Reversión ${datos.folio}: no hay cuenta configurada para el método ` +
            `"${datos.metodoPago ?? 'EFECTIVO'}".`,
        );
      }

      const esCredito = this.METODOS_CREDITO.has(datos.metodoPago ?? '');
      const cuentaIva = await this.buscarCuentaPorRol(
        datos.empresaId,
        esCredito
          ? RolCuentaSistema.IVA_TRASLADADO_NO_COBRADO
          : RolCuentaSistema.IVA_TRASLADADO_COBRADO,
        'PASIVO',
        esCredito ? '207' : '208',
      );
      const partidasIngreso: PartidaInput[] = [];
      let totalVentas = 0,
        totalIva = 0;

      for (const det of datos.detalles) {
        const prod = prodMap.get(det.productoId);
        const cat = prod?.categoria as any;
        if (!cat?.cuentaVentasId) {
          throw new Error(
            `${prod?.nombre ?? det.productoId}: falta la cuenta contable de ventas.`,
          );
        }

        const sub = this.redondear(det.subtotal);
        const iva = this.redondear(det.impuestoMonto ?? 0);

        partidasIngreso.push({
          cuentaContableId: cat.cuentaVentasId,
          cargo: sub,
          abono: 0,
          referencia: ref,
        });
        totalVentas += sub;

        if (iva > 0 && !cuentaIva) {
          throw new Error(
            `Falta la cuenta de IVA trasladado ${esCredito ? 'no cobrado' : 'cobrado'}.`,
          );
        }
        if (iva > 0 && cuentaIva) {
          partidasIngreso.push({
            cuentaContableId: cuentaIva.id,
            cargo: iva,
            abono: 0,
            referencia: ref,
          });
          totalIva += iva;
        }
      }

      if (partidasIngreso.length > 0) {
        partidasIngreso.push({
          cuentaContableId: cuentaCredito.id,
          cargo: 0,
          abono: this.redondear(totalVentas + totalIva),
          referencia: ref,
        });

        await this.crearPoliza({
          empresaId: datos.empresaId,
          tipo: TipoPoliza.EGRESO,
          concepto: `Reversión de ingreso — ${datos.folio}. ${datos.motivo}`,
          fecha: datos.fecha,
          partidas: partidasIngreso,
          origenClave: `ANULACION_VENTA:${datos.ventaId}:INGRESO`,
          origenTipo: 'ANULACION_VENTA',
          origenId: datos.ventaId,
        });
      }
    } catch (err: any) {
      this.logger.error(`[Reversión ${datos.folio}] ${err?.message}`);
      throw err;
    }
  }

  /**
   * Contabiliza una devolución sin alterar la póliza de venta:
   *
   * Importe:
   *   Dr. Devoluciones sobre ventas + IVA trasladado
   *   Cr. Clientes / Caja-Banco / Saldo a favor
   *
   * Costo:
   *   mercancía reintegrable: Dr. Inventario / Cr. Costo de ventas
   *   mercancía dañada:      Dr. Mermas     / Cr. Costo de ventas
   */
  async generarAsientoDeDevolucionVenta(datos: {
    devolucionId: string;
    ventaId: string;
    folio: number;
    folioVenta: number;
    fecha: Date;
    empresaId: string;
    motivo: string;
    cuentaBancariaId?: string;
    ajusteCxC: number;
    importeReembolso: number;
    saldoFavorGenerado: number;
    ivaCobrado: number;
    ivaNoCobrado: number;
    detalles: Array<{
      productoId: string;
      cantidad: number;
      subtotal: number;
      impuestoMonto: number;
      costoReintegrado: number;
      costoDanado: number;
    }>;
  }): Promise<void> {
    try {
      const ref = `DEV-${datos.folio}`;
      const productos = await this.cargarProductosConCategoria(
        datos.detalles.map((detalle) => detalle.productoId),
        datos.empresaId,
      );

      const partidasCosto: PartidaInput[] = [];
      for (const detalle of datos.detalles) {
        const producto = productos.get(detalle.productoId);
        const categoria = producto?.categoria as any;
        const reintegrado = this.redondear(
          Number(detalle.costoReintegrado ?? 0),
        );
        const danado = this.redondear(Number(detalle.costoDanado ?? 0));
        if (reintegrado > 0) {
          if (
            !categoria?.cuentaInventarioId ||
            !categoria?.cuentaCostoVentasId
          ) {
            throw new Error(
              `${producto?.nombre ?? detalle.productoId}: faltan las cuentas de inventario o costo de ventas.`,
            );
          }
          partidasCosto.push(
            {
              cuentaContableId: categoria.cuentaInventarioId,
              cargo: reintegrado,
              abono: 0,
              referencia: ref,
            },
            {
              cuentaContableId: categoria.cuentaCostoVentasId,
              cargo: 0,
              abono: reintegrado,
              referencia: ref,
            },
          );
        }
        if (danado > 0) {
          if (!categoria?.cuentaMermasId || !categoria?.cuentaCostoVentasId) {
            throw new Error(
              `${producto?.nombre ?? detalle.productoId}: faltan las cuentas de mermas o costo de ventas.`,
            );
          }
          partidasCosto.push(
            {
              cuentaContableId: categoria.cuentaMermasId,
              cargo: danado,
              abono: 0,
              referencia: ref,
            },
            {
              cuentaContableId: categoria.cuentaCostoVentasId,
              cargo: 0,
              abono: danado,
              referencia: ref,
            },
          );
        }
      }
      if (partidasCosto.length > 0) {
        await this.crearPoliza({
          empresaId: datos.empresaId,
          tipo: TipoPoliza.DIARIO,
          concepto: `Costo de devolución DEV-${datos.folio} · Venta #${datos.folioVenta}`,
          fecha: datos.fecha,
          partidas: partidasCosto,
          origenClave: `DEVOLUCION_VENTA:${datos.devolucionId}:COSTO`,
          origenTipo: 'DEVOLUCION_VENTA',
          origenId: datos.devolucionId,
        });
      }

      const partidasImporte: PartidaInput[] = [];
      for (const detalle of datos.detalles) {
        const producto = productos.get(detalle.productoId);
        const categoria = producto?.categoria as any;
        if (!categoria?.cuentaDevolucionesId) {
          throw new Error(
            `${producto?.nombre ?? detalle.productoId}: falta la cuenta de devoluciones sobre ventas (SAT 402.01).`,
          );
        }
        const subtotal = this.redondear(Number(detalle.subtotal));
        if (subtotal > 0) {
          partidasImporte.push({
            cuentaContableId: categoria.cuentaDevolucionesId,
            cargo: subtotal,
            abono: 0,
            referencia: ref,
          });
        }
      }

      const ivaCobrado = this.redondear(Number(datos.ivaCobrado ?? 0));
      const ivaNoCobrado = this.redondear(Number(datos.ivaNoCobrado ?? 0));
      if (ivaCobrado > 0) {
        const cuenta = await this.buscarCuentaPorRol(
          datos.empresaId,
          RolCuentaSistema.IVA_TRASLADADO_COBRADO,
          'PASIVO',
          '208',
        );
        if (!cuenta)
          throw new Error('Falta la cuenta de IVA trasladado cobrado.');
        partidasImporte.push({
          cuentaContableId: cuenta.id,
          cargo: ivaCobrado,
          abono: 0,
          referencia: ref,
        });
      }
      if (ivaNoCobrado > 0) {
        const cuenta = await this.buscarCuentaPorRol(
          datos.empresaId,
          RolCuentaSistema.IVA_TRASLADADO_NO_COBRADO,
          'PASIVO',
          '207',
        );
        if (!cuenta)
          throw new Error('Falta la cuenta de IVA trasladado no cobrado.');
        partidasImporte.push({
          cuentaContableId: cuenta.id,
          cargo: ivaNoCobrado,
          abono: 0,
          referencia: ref,
        });
      }

      const ajusteCxC = this.redondear(Number(datos.ajusteCxC ?? 0));
      if (ajusteCxC > 0) {
        const cuenta = await this.buscarCuentaPorRol(
          datos.empresaId,
          RolCuentaSistema.CLIENTES_CXC,
          'ACTIVO',
          '105',
        );
        if (!cuenta) throw new Error('Falta la cuenta de clientes por cobrar.');
        partidasImporte.push({
          cuentaContableId: cuenta.id,
          cargo: 0,
          abono: ajusteCxC,
          referencia: ref,
        });
      }

      const reembolso = this.redondear(Number(datos.importeReembolso ?? 0));
      if (reembolso > 0) {
        const cuenta = await this.buscarCuentaSegunMetodoPago(
          datos.empresaId,
          'EFECTIVO',
          datos.cuentaBancariaId,
        );
        if (!cuenta) throw new Error('Falta la cuenta contable del reembolso.');
        partidasImporte.push({
          cuentaContableId: cuenta.id,
          cargo: 0,
          abono: reembolso,
          referencia: ref,
        });
      }

      const saldoFavor = this.redondear(Number(datos.saldoFavorGenerado ?? 0));
      if (saldoFavor > 0) {
        const cuenta = await this.buscarCuentaPorRol(
          datos.empresaId,
          RolCuentaSistema.SALDOS_FAVOR_CLIENTES,
          'PASIVO',
          '206',
        );
        if (!cuenta) {
          throw new Error(
            'Falta la cuenta de anticipos o saldos a favor de clientes (206.01).',
          );
        }
        partidasImporte.push({
          cuentaContableId: cuenta.id,
          cargo: 0,
          abono: saldoFavor,
          referencia: ref,
        });
      }

      if (partidasImporte.length > 0) {
        // Los detalles se almacenan a cuatro decimales, pero la póliza opera
        // en centavos. Al redondear varios renglones por separado puede quedar
        // un centavo residual; se absorbe en devoluciones sobre ventas.
        const cargos = this.redondear(
          partidasImporte.reduce((s, p) => s + Number(p.cargo), 0),
        );
        const abonos = this.redondear(
          partidasImporte.reduce((s, p) => s + Number(p.abono), 0),
        );
        const diferencia = this.redondear(abonos - cargos);
        if (Math.abs(diferencia) > 0.05) {
          throw new Error(
            `La devolución no cuadra: cargos ${cargos.toFixed(2)}, abonos ${abonos.toFixed(2)}.`,
          );
        }
        if (diferencia !== 0) {
          const partidaDevolucion = partidasImporte
            .filter((p) => p.cargo > 0)
            .sort((a, b) => b.cargo - a.cargo)[0];
          if (!partidaDevolucion) {
            throw new Error('No existe partida de devolución para ajustar.');
          }
          partidaDevolucion.cargo = this.redondear(
            partidaDevolucion.cargo + diferencia,
          );
        }
        await this.crearPoliza({
          empresaId: datos.empresaId,
          tipo: reembolso > 0 ? TipoPoliza.EGRESO : TipoPoliza.DIARIO,
          concepto: `Devolución DEV-${datos.folio} · Venta #${datos.folioVenta}. ${datos.motivo}`,
          fecha: datos.fecha,
          partidas: partidasImporte,
          origenClave: `DEVOLUCION_VENTA:${datos.devolucionId}:IMPORTE`,
          origenTipo: 'DEVOLUCION_VENTA',
          origenId: datos.devolucionId,
        });
      }
    } catch (err: any) {
      this.logger.error(`[Devolución DEV-${datos.folio}] ${err?.message}`);
      throw err;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 2. ASIENTO DE COMPRA
  //    Dr. Inventario          (precio neto sin IVA)
  //    Dr. IVA Acreditable     (116-xx — IVA pagado al proveedor, deducible SAT)
  //    Cr. Proveedores         (210-xx — total con IVA, lo que le debemos)
  // ══════════════════════════════════════════════════════════════════════════
  async generarAsientoDeCompra(datos: DatosCompraContable): Promise<void> {
    try {
      const prodMap = await this.cargarProductosConCategoria(
        datos.detalles.map((d) => d.productoId),
        datos.empresaId,
      );
      const cuentaProveedores = await this.buscarCuentaPorRol(
        datos.empresaId,
        RolCuentaSistema.PROVEEDORES,
        'PASIVO',
        '21',
      );
      const cuentaIvaAcred = await this.buscarCuentaPorRol(
        datos.empresaId,
        RolCuentaSistema.IVA_ACREDITABLE_PENDIENTE,
        'ACTIVO',
        '117',
      );

      if (!cuentaProveedores) {
        throw new Error(
          `Compra ${datos.folio}: falta la cuenta de proveedores.`,
        );
      }

      const partidas: PartidaInput[] = [];
      let totalInventario = 0;
      let totalIvaAcreditable = 0;

      for (const det of datos.detalles) {
        const cat = prodMap.get(det.productoId)?.categoria as any;
        if (!cat?.cuentaInventarioId) {
          throw new Error(
            `${prodMap.get(det.productoId)?.nombre ?? det.productoId}: falta la cuenta de inventario.`,
          );
        }
        const neto = this.redondear(det.costoUnitario * det.cantidad);
        if (neto <= 0) continue;
        const tasa = det.tasaIva ?? 0;
        const iva = this.redondear(neto * tasa);
        if (iva > 0 && !cuentaIvaAcred) {
          throw new Error('Falta la cuenta de IVA acreditable pendiente.');
        }

        // Dr. Inventario (precio neto)
        partidas.push({
          cuentaContableId: cat.cuentaInventarioId,
          cargo: neto,
          abono: 0,
          referencia: `C#${datos.folio}`,
        });
        totalInventario += neto;

        // Dr. IVA pendiente. Se vuelve acreditable pagado al liquidar.
        if (cuentaIvaAcred && iva > 0) {
          partidas.push({
            cuentaContableId: cuentaIvaAcred.id,
            cargo: iva,
            abono: 0,
            referencia: `IVA-C#${datos.folio}`,
          });
          totalIvaAcreditable += iva;
        }
      }

      if (partidas.length === 0) return;

      // Cr. Proveedores = Inventario + IVA Acreditable
      const totalProveedor = this.redondear(
        totalInventario + totalIvaAcreditable,
      );
      partidas.push({
        cuentaContableId: cuentaProveedores.id,
        cargo: 0,
        abono: totalProveedor,
        referencia: `C#${datos.folio}`,
      });

      await this.crearPoliza({
        empresaId: datos.empresaId,
        tipo: TipoPoliza.EGRESO,
        concepto: `Compra de mercancía — Orden #${datos.folio}`,
        fecha: datos.fecha,
        partidas,
        origenClave: `COMPRA:${datos.compraId}`,
        origenTipo: 'RECEPCION_COMPRA',
        origenId: datos.compraId,
      });
      this.logger.log(
        `Póliza de compra generada: ${datos.folio} | Inventario: ${totalInventario} | IVA: ${totalIvaAcreditable}`,
      );
    } catch (err: any) {
      this.logger.error(`[Compra ${datos.folio}] ${err?.message}`);
      // Se propaga a propósito: AsientosPendientesService lo captura,
      // lo registra y lo reintenta. Tragárselo aquí dejaba las
      // operaciones sin póliza en silencio.
      throw err;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 3. ASIENTO DE SALIDA / MERMA / AJUSTE
  // ══════════════════════════════════════════════════════════════════════════
  async generarAsientoDeSalida(datos: DatosMovimientoContable): Promise<void> {
    try {
      const prodMap = await this.cargarProductosConCategoria(
        datos.detalles.map((d) => d.productoId),
        datos.empresaId,
      );
      const partidas: PartidaInput[] = [];
      for (const det of datos.detalles) {
        const cat = prodMap.get(det.productoId)?.categoria as any;
        if (!cat?.cuentaInventarioId) continue;
        const monto = this.redondear(det.costoUnitario * det.cantidad);
        if (monto <= 0) continue;
        const ref = `${datos.tipo}/${datos.motivo}`.substring(0, 80);
        const cuentaDebitoId =
          datos.tipo === 'MERMA'
            ? (cat.cuentaMermasId ?? cat.cuentaCostoVentasId)
            : cat.cuentaCostoVentasId;
        if (!cuentaDebitoId) continue;
        partidas.push({
          cuentaContableId: cuentaDebitoId,
          cargo: monto,
          abono: 0,
          referencia: ref,
        });
        partidas.push({
          cuentaContableId: cat.cuentaInventarioId,
          cargo: 0,
          abono: monto,
          referencia: ref,
        });
      }
      if (partidas.length === 0) return;
      const tipoLabel: Record<TipoSalida, string> = {
        MERMA: 'Merma',
        AJUSTE: 'Ajuste',
        CONSUMO: 'Consumo',
        MUESTRA: 'Muestra',
      };
      await this.crearPoliza({
        empresaId: datos.empresaId,
        tipo: TipoPoliza.DIARIO,
        concepto: `${tipoLabel[datos.tipo]} de inventario — ${datos.motivo}`,
        fecha: datos.fecha,
        partidas,
      });
      this.logger.log(`Póliza de ${datos.tipo} generada`);
    } catch (err: any) {
      this.logger.error(`[Salida ${datos.tipo}] ${err?.message}`);
      // Se propaga a propósito: AsientosPendientesService lo captura,
      // lo registra y lo reintenta. Tragárselo aquí dejaba las
      // operaciones sin póliza en silencio.
      throw err;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 4. ASIENTO DE COBRANZA
  //    Dr. Caja/Banco (donde entra el pago)
  //    Cr. Clientes CxC (140-xx)
  //    Cr. Intereses por Cobrar (4xxx) — si aplica
  // ══════════════════════════════════════════════════════════════════════════
  async generarAsientoDeCobranza(datos: {
    pagoId: string;
    creditoId: string;
    clienteId: string;
    fechaPago: Date;
    empresaId: string;
    montoCapital: number;
    montoInteres: number;
    ivaReclasificado?: number;
    totalPagado: number;
    cuentaBancariaId?: string;
  }): Promise<void> {
    try {
      const { empresaId } = datos;

      // Dr. Caja/Banco — donde físicamente entró el dinero
      const cuentaCaja = datos.cuentaBancariaId
        ? await this.buscarCuentaSegunMetodoPago(
            empresaId,
            'EFECTIVO',
            datos.cuentaBancariaId,
          )
        : await this.buscarCuentaPorRol(
            empresaId,
            RolCuentaSistema.CAJA,
            'ACTIVO',
            '1',
          );

      // Cr. Clientes CxC — la deuda del cliente que se cancela
      const cuentaCxC = await this.buscarCuentaPorRol(
        empresaId,
        RolCuentaSistema.CLIENTES_CXC,
        'ACTIVO',
        '14',
      );

      if (!cuentaCaja)
        throw new Error('Cobranza: falta la cuenta de caja/banco.');
      if (!cuentaCxC)
        throw new Error('Cobranza: falta la cuenta Clientes CxC (140-xx).');

      const ref = `Cobro CRD-${datos.creditoId.slice(0, 8)}`;
      const partidas: PartidaInput[] = [
        {
          cuentaContableId: cuentaCaja.id,
          cargo: datos.totalPagado,
          abono: 0,
          referencia: ref,
        },
        {
          cuentaContableId: cuentaCxC.id,
          cargo: 0,
          abono: datos.montoCapital,
          referencia: ref,
        },
      ];

      // Si hay intereses → abonar a cuenta de ingresos
      if (datos.montoInteres > 0) {
        const cuentaInteres = await this.buscarCuentaPorRol(
          empresaId,
          RolCuentaSistema.INTERESES,
          'INGRESO',
          '402',
        );
        if (!cuentaInteres)
          throw new Error(
            'Cobranza: falta la cuenta de ingresos por intereses.',
          );
        partidas.push({
          cuentaContableId: cuentaInteres.id,
          cargo: 0,
          abono: datos.montoInteres,
          referencia: 'Intereses cobrados',
        });
      }

      const ivaReclasificado = this.redondear(
        Number(datos.ivaReclasificado ?? 0),
      );
      if (ivaReclasificado > 0) {
        const [ivaNoCobrado, ivaCobrado] = await Promise.all([
          this.buscarCuentaPorRol(
            empresaId,
            RolCuentaSistema.IVA_TRASLADADO_NO_COBRADO,
            'PASIVO',
            '207',
          ),
          this.buscarCuentaPorRol(
            empresaId,
            RolCuentaSistema.IVA_TRASLADADO_COBRADO,
            'PASIVO',
            '208',
          ),
        ]);
        if (!ivaNoCobrado || !ivaCobrado) {
          throw new Error(
            'Cobranza: faltan las cuentas de IVA no cobrado y cobrado.',
          );
        }
        partidas.push(
          {
            cuentaContableId: ivaNoCobrado.id,
            cargo: ivaReclasificado,
            abono: 0,
            referencia: `IVA ${ref}`,
          },
          {
            cuentaContableId: ivaCobrado.id,
            cargo: 0,
            abono: ivaReclasificado,
            referencia: `IVA ${ref}`,
          },
        );
      }

      await this.crearPoliza({
        empresaId,
        tipo: TipoPoliza.INGRESO,
        concepto: `Cobranza — Crédito ${datos.creditoId.slice(0, 8)}`,
        fecha: datos.fechaPago,
        partidas,
        origenClave: `COBRANZA:${datos.pagoId}`,
        origenTipo: 'COBRANZA',
        origenId: datos.pagoId,
      });
      this.logger.log(
        `Póliza de cobranza generada: crédito ${datos.creditoId.slice(0, 8)}`,
      );
    } catch (err: any) {
      this.logger.error(`[Cobranza ${datos.creditoId}] ${err?.message}`);
      // Se propaga a propósito: AsientosPendientesService lo captura,
      // lo registra y lo reintenta. Tragárselo aquí dejaba las
      // operaciones sin póliza en silencio.
      throw err;
    }
  }

  // ─── Helpers privados ─────────────────────────────────────────────────────

  private async cargarProductosConCategoria(
    ids: string[],
    empresaId: string,
  ): Promise<Map<string, Producto>> {
    if (!ids.length) return new Map();
    const productos = await this.productoRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.categoria', 'cat')
      .whereInIds([...new Set(ids)])
      .andWhere('p.empresaId = :empresaId', { empresaId })
      .getMany();
    return new Map(productos.map((p) => [p.id, p]));
  }

  /**
   * Resuelve la cuenta contable débito según el método de pago:
   * - Crédito empresa → Clientes CxC (ACTIVO 14xxx)
   * - Con cuentaBancariaId → cuenta contable de esa CuentaBancaria
   * - Efectivo sin cuenta → Caja General (ACTIVO 1xxx)
   */
  private async buscarCuentaSegunMetodoPago(
    empresaId: string,
    metodoPago?: string,
    cuentaBancariaId?: string,
  ): Promise<any> {
    // Venta a crédito empresa → Dr. Clientes CxC (140-xx)
    if (metodoPago && this.METODOS_CREDITO.has(metodoPago)) {
      const cxc = await this.buscarCuentaPorRol(
        empresaId,
        RolCuentaSistema.CLIENTES_CXC,
        'ACTIVO',
        '14',
      );
      if (cxc) return cxc;
      this.logger.warn(
        'Sin cuenta Clientes CxC (140-xx). Crea la cuenta en el catálogo.',
      );
      return null;
    }

    // Con cuenta bancaria → usar su cuenta contable (TPV, BANCO, etc.)
    if (cuentaBancariaId) {
      try {
        const rows = await this.dataSource.query(
          `SELECT cuentaContableId FROM cuentas_bancarias WHERE id = @0 AND empresaId = @1`,
          [cuentaBancariaId, empresaId],
        );
        if (rows?.[0]?.cuentaContableId) {
          const cuenta = await this.dataSource
            .getRepository('CuentaContable')
            .findOne({ where: { id: rows[0].cuentaContableId } });
          if (cuenta) return cuenta;
        }
      } catch (e: any) {
        this.logger.warn('No se pudo leer CuentaBancaria: ' + e?.message);
      }
    }

    // Fallback → Caja General (1xxx)
    return this.buscarCuentaPorRol(
      empresaId,
      RolCuentaSistema.CAJA,
      'ACTIVO',
      '1',
    );
  }

  /**
   * Busca primero por la función explícita configurada por la empresa.
   * El prefijo sólo se conserva como compatibilidad para bases anteriores a
   * la migración; la precarga estándar asigna los roles automáticamente.
   */
  private async buscarCuentaPorRol(
    empresaId: string,
    rol: RolCuentaSistema,
    tipoCompatibilidad: string,
    prefijoCompatibilidad: string,
  ): Promise<any> {
    const porRol = await this.dataSource
      .getRepository('CuentaContable')
      .createQueryBuilder('cc')
      .where('cc.empresaId = :e', { e: empresaId })
      .andWhere('cc.rolSistema = :rol', { rol })
      .andWhere('cc.esAfectable = :a', { a: true })
      .andWhere('cc.activo = :activo', { activo: true })
      .getOne();

    if (porRol) return porRol;

    const legado = await this.buscarCuentaGlobal(
      empresaId,
      tipoCompatibilidad,
      prefijoCompatibilidad,
    );
    if (legado) {
      this.logger.warn(
        `La cuenta ${legado.numeroCuenta ?? legado.id} se resolvió por prefijo para el rol ${rol}. ` +
          'Asígnale el rol explícito desde el catálogo contable.',
      );
    }
    return legado;
  }

  private async buscarCuentaGlobal(
    empresaId: string,
    tipo: string,
    iniciaConDigito: string,
  ): Promise<any> {
    return this.dataSource
      .getRepository('CuentaContable')
      .createQueryBuilder('cc')
      .where('cc.empresaId = :e', { e: empresaId })
      .andWhere('cc.tipo = :t', { t: tipo })
      .andWhere('cc.esAfectable = :a', { a: true })
      .andWhere('cc.activo = :activo', { activo: true })
      .andWhere('cc.numeroCuenta LIKE :d', { d: `${iniciaConDigito}%` })
      .orderBy('cc.numeroCuenta', 'ASC')
      .getOne();
  }

  private redondear(n: number): number {
    return Math.round(n * 100) / 100;
  }

  // ── Folio correlativo: DI-2026-0001, IN-2026-0001, EG-2026-0001 ──────────
  private async generarFolio(
    empresaId: string,
    tipo: TipoPoliza,
    anio: number,
    qr: QueryRunner,
  ): Promise<string> {
    const prefijos: Record<TipoPoliza, string> = {
      [TipoPoliza.DIARIO]: 'DI',
      [TipoPoliza.INGRESO]: 'IN',
      [TipoPoliza.EGRESO]: 'EG',
    };
    const pref = prefijos[tipo] ?? 'DI';
    const like = `${pref}-${anio}-%`;
    const [last] = await qr.query(
      `SELECT TOP 1 folio FROM polizas
       WHERE empresaId = @0 AND folio LIKE @1
       ORDER BY folio DESC`,
      [empresaId, like],
    );
    const seq = last ? parseInt(last.folio.split('-')[2] || '0') + 1 : 1;
    return `${pref}-${anio}-${String(seq).padStart(5, '0')}`;
  }

  private async crearPoliza(data: {
    empresaId: string;
    tipo: TipoPoliza;
    concepto: string;
    fecha: Date;
    partidas: PartidaInput[];
    origenClave?: string;
    origenTipo?: string;
    origenId?: string;
  }): Promise<void> {
    const cargos = this.redondear(
      data.partidas.reduce((s, p) => s + Number(p.cargo), 0),
    );
    const abonos = this.redondear(
      data.partidas.reduce((s, p) => s + Number(p.abono), 0),
    );
    if (cargos !== abonos) {
      throw new Error(
        `Póliza descuadrada (cargos ${cargos}, abonos ${abonos}): ${data.concepto}.`,
      );
    }

    const mes = data.fecha.getMonth() + 1;
    const anio = data.fecha.getFullYear();
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      // Serializa la asignación del folio por empresa, tipo y año. El candado
      // pertenece a la transacción y SQL Server lo libera siempre al terminar.
      const recurso = `POLIZA_FOLIO:${data.empresaId}:${data.tipo}:${anio}`;
      const resultadoLock = await qr.query(
        `DECLARE @resultado int;
         EXEC @resultado = sys.sp_getapplock
           @Resource = @0,
           @LockMode = 'Exclusive',
           @LockOwner = 'Transaction',
           @LockTimeout = 10000;
         SELECT @resultado AS resultado;`,
        [recurso],
      );
      if (Number(resultadoLock?.[0]?.resultado ?? -999) < 0) {
        throw new Error(
          'No fue posible reservar el siguiente folio contable. Intenta nuevamente.',
        );
      }

      // Candado compartido con el cierre mensual: una creación que ya empezó
      // termina antes del cierre, y ninguna nueva entra después del candado
      // exclusivo de cierre.
      const resultadoPeriodo = await qr.query(
        `DECLARE @resultado int;
         EXEC @resultado = sys.sp_getapplock
           @Resource = @0,
           @LockMode = 'Shared',
           @LockOwner = 'Transaction',
           @LockTimeout = 10000;
         SELECT @resultado AS resultado;`,
        [`CIERRE_CONTABLE:${data.empresaId}:${anio}:${mes}`],
      );
      if (Number(resultadoPeriodo?.[0]?.resultado ?? -999) < 0) {
        throw new Error(
          'El período está siendo cerrado. Intenta registrar la operación nuevamente.',
        );
      }

      // La idempotencia se comprueba dentro del mismo candado. El índice único
      // de base de datos permanece como la garantía definitiva.
      if (data.origenClave) {
        const existente = await qr.manager.findOne(Poliza, {
          where: {
            empresaId: data.empresaId,
            origenClave: data.origenClave,
          },
        });
        if (existente) {
          await qr.commitTransaction();
          this.logger.log(
            `Póliza ${data.origenClave} ya generada; reintento omitido.`,
          );
          return;
        }
      }

      const cerrado = await qr.query(
        `SELECT id FROM cierres_contables
         WHERE empresaId = @0 AND mes = @1 AND anio = @2`,
        [data.empresaId, mes, anio],
      );
      if (cerrado?.length > 0) {
        this.logger.warn(
          `Período ${mes}/${anio} cerrado — póliza bloqueada: ${data.concepto}`,
        );
        throw new Error(
          `El período ${mes}/${anio} está cerrado. No se pueden crear pólizas.`,
        );
      }

      const poliza = qr.manager.create(Poliza, {
        empresaId: data.empresaId,
        tipo: data.tipo,
        folio: await this.generarFolio(data.empresaId, data.tipo, anio, qr),
        fecha: data.fecha,
        mes,
        anio,
        concepto: data.concepto,
        origenClave: data.origenClave ?? null,
        origenTipo: data.origenTipo ?? null,
        origenId: data.origenId ?? null,
      });
      const saved = await qr.manager.save(poliza);
      await qr.manager.save(
        PartidaPoliza,
        data.partidas.map((p) =>
          qr.manager.create(PartidaPoliza, { polizaId: saved.id, ...p }),
        ),
      );
      await qr.commitTransaction();
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 5. PAGO A PROVEEDOR
  //    Dr. Proveedores (210-xx) / Cr. Caja/Banco
  // ══════════════════════════════════════════════════════════════════════════
  async generarAsientoDePagoProveedor(datos: {
    ocId: string;
    pagoId?: string;
    folio: string;
    fecha: Date;
    empresaId: string;
    montoPagado: number;
    ivaReclasificado?: number;
    cuentaBancariaId?: string;
  }): Promise<void> {
    try {
      const cuentaProveedores = await this.buscarCuentaPorRol(
        datos.empresaId,
        RolCuentaSistema.PROVEEDORES,
        'PASIVO',
        '21',
      ); // 210-xx Proveedores
      const cuentaCaja = await this.buscarCuentaSegunMetodoPago(
        datos.empresaId,
        'EFECTIVO',
        datos.cuentaBancariaId,
      );
      if (!cuentaProveedores) {
        throw new Error('Pago proveedor: falta la cuenta de proveedores.');
      }
      if (!cuentaCaja) {
        throw new Error('Pago proveedor: falta la cuenta de caja/banco.');
      }
      const partidas: PartidaInput[] = [
        {
          cuentaContableId: cuentaProveedores.id,
          cargo: datos.montoPagado,
          abono: 0,
          referencia: `OC-${datos.folio}`,
        },
        {
          cuentaContableId: cuentaCaja.id,
          cargo: 0,
          abono: datos.montoPagado,
          referencia: `OC-${datos.folio}`,
        },
      ];
      const ivaReclasificado = this.redondear(
        Number(datos.ivaReclasificado ?? 0),
      );
      if (ivaReclasificado > 0) {
        const [ivaPendiente, ivaPagado] = await Promise.all([
          this.buscarCuentaPorRol(
            datos.empresaId,
            RolCuentaSistema.IVA_ACREDITABLE_PENDIENTE,
            'ACTIVO',
            '117',
          ),
          this.buscarCuentaPorRol(
            datos.empresaId,
            RolCuentaSistema.IVA_ACREDITABLE_PAGADO,
            'ACTIVO',
            '116',
          ),
        ]);
        if (!ivaPendiente || !ivaPagado) {
          throw new Error(
            'Pago proveedor: faltan las cuentas de IVA pendiente y pagado.',
          );
        }
        partidas.push(
          {
            cuentaContableId: ivaPagado.id,
            cargo: ivaReclasificado,
            abono: 0,
            referencia: `IVA OC-${datos.folio}`,
          },
          {
            cuentaContableId: ivaPendiente.id,
            cargo: 0,
            abono: ivaReclasificado,
            referencia: `IVA OC-${datos.folio}`,
          },
        );
      }
      await this.crearPoliza({
        empresaId: datos.empresaId,
        tipo: TipoPoliza.EGRESO,
        concepto: `Pago a proveedor — OC ${datos.folio}`,
        fecha: datos.fecha,
        partidas,
        origenClave: `PAGO_PROVEEDOR:${datos.pagoId ?? datos.ocId}`,
        origenTipo: 'PAGO_PROVEEDOR',
        origenId: datos.pagoId ?? datos.ocId,
      });
      this.logger.log(`Póliza de pago proveedor generada: OC ${datos.folio}`);
    } catch (err: any) {
      this.logger.error(`[PagoProveedor OC-${datos.folio}] ${err?.message}`);
      // Se propaga a propósito: AsientosPendientesService lo captura,
      // lo registra y lo reintenta. Tragárselo aquí dejaba las
      // operaciones sin póliza en silencio.
      throw err;
    }
  }

  async generarAsientoDeHospedaje(datos: {
    documentoId?: string;
    empresaId: string;
    folio: string; // p. ej. el código de reserva RES-000123
    fecha: Date;
    total: number; // total con IVA
    iva: number; // IVA contenido
    metodoPago?: string;
    cuentaBancariaId?: string;
    esCredito?: boolean; // true = factura a crédito (CxC)
  }): Promise<void> {
    try {
      const base = this.redondear(datos.total - datos.iva);
      const iva = this.redondear(datos.iva);
      const total = this.redondear(datos.total);

      // Cuenta de ingresos por hospedaje (4xx). Toma la primera cuenta de
      // ingreso disponible; idealmente crea una "Ingresos por Hospedaje" 401-xx.
      const cuentaIngreso = await this.buscarCuentaGlobal(
        datos.empresaId,
        'INGRESO',
        '4',
      );
      if (!cuentaIngreso) {
        throw new Error(
          `Hospedaje ${datos.folio}: falta la cuenta de ingresos por hospedaje.`,
        );
      }

      // Cuenta de cargo: CxC si es crédito, o Caja/Banco según método de pago
      const cuentaDebito = datos.esCredito
        ? await this.buscarCuentaPorRol(
            datos.empresaId,
            RolCuentaSistema.CLIENTES_CXC,
            'ACTIVO',
            '14',
          )
        : await this.buscarCuentaSegunMetodoPago(
            datos.empresaId,
            datos.metodoPago ?? 'EFECTIVO',
            datos.cuentaBancariaId,
          );

      if (!cuentaDebito) {
        throw new Error(`Hospedaje ${datos.folio}: falta la cuenta de cobro.`);
      }

      const cuentaIva =
        iva > 0
          ? await this.buscarCuentaPorRol(
              datos.empresaId,
              datos.esCredito
                ? RolCuentaSistema.IVA_TRASLADADO_NO_COBRADO
                : RolCuentaSistema.IVA_TRASLADADO_COBRADO,
              'PASIVO',
              datos.esCredito ? '207' : '208',
            )
          : null;

      const partidas: any[] = [];
      const ref = `HOSP ${datos.folio}`;

      // Dr. Caja/Banco/CxC por el total
      partidas.push({
        cuentaContableId: cuentaDebito.id,
        cargo: total,
        abono: 0,
        referencia: ref,
      });
      // Cr. Ingresos por la base
      partidas.push({
        cuentaContableId: cuentaIngreso.id,
        cargo: 0,
        abono: base,
        referencia: ref,
      });
      // Cr. IVA
      if (iva > 0 && !cuentaIva) {
        throw new Error(
          `Hospedaje ${datos.folio}: falta la cuenta de IVA trasladado.`,
        );
      }
      if (cuentaIva && iva > 0) {
        partidas.push({
          cuentaContableId: cuentaIva.id,
          cargo: 0,
          abono: iva,
          referencia: ref,
        });
      }

      await this.crearPoliza({
        empresaId: datos.empresaId,
        tipo: TipoPoliza.INGRESO,
        concepto: `Ingreso por hospedaje — ${datos.folio}`,
        fecha: datos.fecha,
        partidas,
        origenClave: datos.documentoId
          ? `HOSPEDAJE:${datos.documentoId}`
          : undefined,
        origenTipo: 'HOSPEDAJE',
        origenId: datos.documentoId,
      });

      this.logger.log(
        `Póliza de hospedaje generada: ${datos.folio} | Base: ${base} | IVA: ${iva}`,
      );
    } catch (err: any) {
      this.logger.error(`[Hospedaje ${datos.folio}] ${err?.message}`);
      // Se propaga a propósito: AsientosPendientesService lo captura,
      // lo registra y lo reintenta. Tragárselo aquí dejaba las
      // operaciones sin póliza en silencio.
      throw err;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 7. ASIENTO DE INVENTARIO INICIAL (carga de saldos, estilo SAP 561)
  //    Dr. Inventario (agrupado por cuenta de la categoría de cada producto)
  //    Cr. 399-01 Carga de saldos iniciales (cuenta puente)
  //    Genera UNA sola póliza por toda la carga.
  // ══════════════════════════════════════════════════════════════════════════
  async generarAsientoDeInventarioInicial(datos: {
    empresaId: string;
    fecha: Date;
    detalles: { productoId: string; cantidad: number; costoUnitario: number }[];
  }): Promise<void> {
    try {
      const prodMap = await this.cargarProductosConCategoria(
        datos.detalles.map((d) => d.productoId),
        datos.empresaId,
      );
      const cuentaPuente = await this.buscarCuentaPorRol(
        datos.empresaId,
        RolCuentaSistema.SALDOS_INICIALES,
        'CAPITAL',
        '399',
      );
      if (!cuentaPuente) {
        this.logger.warn(
          'Inventario inicial: no existe la cuenta 399-xx "Carga de saldos iniciales". ' +
            'Ejecuta la precarga estándar de cuentas. Asiento omitido.',
        );
        return;
      }

      // Dr. Inventario, AGRUPADO por cuenta de inventario de la categoría
      const porCuenta = new Map<string, number>();
      for (const det of datos.detalles) {
        const cat = prodMap.get(det.productoId)?.categoria as any;
        if (!cat?.cuentaInventarioId) continue;
        const valor = this.redondear(det.costoUnitario * det.cantidad);
        if (valor <= 0) continue;
        porCuenta.set(
          cat.cuentaInventarioId,
          this.redondear((porCuenta.get(cat.cuentaInventarioId) ?? 0) + valor),
        );
      }
      if (porCuenta.size === 0) {
        this.logger.warn(
          'Inventario inicial: ninguna categoría con cuenta de inventario. Asiento omitido.',
        );
        return;
      }

      const partidas: PartidaInput[] = [];
      let total = 0;
      for (const [cuentaId, valor] of porCuenta) {
        partidas.push({
          cuentaContableId: cuentaId,
          cargo: valor,
          abono: 0,
          referencia: 'INV-INICIAL',
        });
        total = this.redondear(total + valor);
      }
      // Cr. cuenta puente por el total
      partidas.push({
        cuentaContableId: cuentaPuente.id,
        cargo: 0,
        abono: total,
        referencia: 'INV-INICIAL',
      });

      await this.crearPoliza({
        empresaId: datos.empresaId,
        tipo: TipoPoliza.DIARIO,
        concepto: `Carga de inventario inicial — ${datos.detalles.length} productos`,
        fecha: datos.fecha,
        partidas,
      });
      this.logger.log(
        `Póliza de inventario inicial: $${total} en ${porCuenta.size} cuentas de inventario`,
      );
    } catch (err: any) {
      this.logger.error(`[Inventario inicial] ${err?.message}`);
      // Se propaga a propósito: AsientosPendientesService lo captura,
      // lo registra y lo reintenta. Tragárselo aquí dejaba las
      // operaciones sin póliza en silencio.
      throw err;
    }
  }
}
