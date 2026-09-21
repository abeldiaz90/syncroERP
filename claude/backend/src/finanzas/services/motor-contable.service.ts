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
  metodoPago?: string; // EFECTIVO | TARJETA | TRANSFERENCIA | MSI_BANCO | CREDITO_* | MENSUALIDADES
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
    // El PMS usa nombres propios, pero contablemente siguen siendo cuentas
    // por cobrar. Omitirlos cargaba Caja e IVA cobrado sin entrada de dinero.
    'CREDITO_EMPRESA',
    'CREDITO_AGENCIA',
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
          partidasIngreso.unshift({
            cuentaContableId: cuentaEnganche.id,
            cargo: enganche,
            abono: 0,
            referencia: `ENG-V#${datos.folio}`,
          });
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
  // 4. AJUSTE DE INVENTARIO POR CONTEO FÍSICO
  //    Sobrante: Dr. Inventario / Cr. Diferencias de inventario
  //    Faltante: Dr. Diferencias de inventario / Cr. Inventario
  // ══════════════════════════════════════════════════════════════════════════
  async generarAsientoDeAjusteInventario(datos: {
    ajusteId: string;
    folio: string;
    fecha: Date;
    empresaId: string;
    detalles: Array<{
      productoId: string;
      diferencia: number;
      costoUnitario: number;
    }>;
  }): Promise<{ id: string }> {
    const prodMap = await this.cargarProductosConCategoria(
      datos.detalles.map((detalle) => detalle.productoId),
      datos.empresaId,
    );
    const partidas: PartidaInput[] = [];
    const faltantes: string[] = [];

    for (const detalle of datos.detalles) {
      const diferencia = Number(detalle.diferencia);
      const costoUnitario = Number(detalle.costoUnitario);
      const monto = this.redondear(Math.abs(diferencia) * costoUnitario);
      if (Math.abs(diferencia) < 0.0001 || monto <= 0) continue;

      const producto = prodMap.get(detalle.productoId);
      const categoria = producto?.categoria as any;
      const cuentaInventarioId = categoria?.cuentaInventarioId;
      const cuentaDiferenciasId =
        categoria?.cuentaMermasId ?? categoria?.cuentaCostoVentasId;
      if (!cuentaInventarioId || !cuentaDiferenciasId) {
        faltantes.push(
          `${producto?.sku ?? detalle.productoId}: cuenta de inventario y/o diferencias`,
        );
        continue;
      }

      const referencia = `${datos.folio}/${producto?.sku ?? detalle.productoId}`.slice(
        0,
        80,
      );
      if (diferencia > 0) {
        partidas.push({
          cuentaContableId: cuentaInventarioId,
          cargo: monto,
          abono: 0,
          referencia,
        });
        partidas.push({
          cuentaContableId: cuentaDiferenciasId,
          cargo: 0,
          abono: monto,
          referencia,
        });
      } else {
        partidas.push({
          cuentaContableId: cuentaDiferenciasId,
          cargo: monto,
          abono: 0,
          referencia,
        });
        partidas.push({
          cuentaContableId: cuentaInventarioId,
          cargo: 0,
          abono: monto,
          referencia,
        });
      }
    }

    if (faltantes.length) {
      throw new Error(
        `No se puede contabilizar el conteo ${datos.folio}; faltan configuraciones: ${[...new Set(faltantes)].join(', ')}.`,
      );
    }
    if (!partidas.length) {
      throw new Error(
        `El conteo ${datos.folio} no contiene diferencias con valor contable.`,
      );
    }

    const id = await this.crearPoliza({
      empresaId: datos.empresaId,
      tipo: TipoPoliza.DIARIO,
      concepto: `Ajuste de inventario por conteo ${datos.folio}`,
      fecha: datos.fecha,
      partidas,
      origenClave: `AJUSTE_INVENTARIO:${datos.ajusteId}`,
      origenTipo: 'AJUSTE_INVENTARIO',
      origenId: datos.ajusteId,
    });
    this.logger.log(`Póliza de ajuste de inventario ${datos.folio} generada`);
    return { id };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 5. ASIENTO DE COBRANZA
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

  /**
   * Reversa contable de una cobranza cancelada.
   *
   * Es el mismo asiento con cargo y abono invertidos, y va como póliza propia,
   * no tocando la original. Una póliza registrada no se edita: lo que se hizo
   * y lo que se deshizo son dos hechos, y los dos tienen que poder contarse.
   *
   * Se reconstruye desde los mismos datos que generaron la original —capital,
   * interés, IVA reclasificado— en vez de leer la póliza. Si el catálogo de
   * cuentas cambió, la reversa usa las cuentas vigentes y eso es lo correcto:
   * el asiento tiene que ser válido hoy, no en el momento del cobro.
   */
  async generarAsientoDeCancelacionCobranza(datos: {
    pagoId: string;
    creditoId: string;
    fechaCancelacion: Date | string;
    empresaId: string;
    montoCapital: number;
    montoInteres: number;
    ivaReclasificado?: number;
    totalPagado: number;
    cuentaBancariaId?: string;
    motivo?: string;
  }): Promise<void> {
    try {
      const { empresaId } = datos;

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
      const cuentaCxC = await this.buscarCuentaPorRol(
        empresaId,
        RolCuentaSistema.CLIENTES_CXC,
        'ACTIVO',
        '14',
      );

      if (!cuentaCaja)
        throw new Error('Cancelación de cobranza: falta la cuenta de caja/banco.');
      if (!cuentaCxC)
        throw new Error('Cancelación de cobranza: falta la cuenta Clientes CxC (140-xx).');

      const ref = `Cancelación cobro CRD-${datos.creditoId.slice(0, 8)}`;
      // Invertido respecto al cobro: sale el dinero de caja y vuelve la deuda.
      const partidas: PartidaInput[] = [
        {
          cuentaContableId: cuentaCaja.id,
          cargo: 0,
          abono: datos.totalPagado,
          referencia: ref,
        },
        {
          cuentaContableId: cuentaCxC.id,
          cargo: datos.montoCapital,
          abono: 0,
          referencia: ref,
        },
      ];

      if (datos.montoInteres > 0) {
        const cuentaInteres = await this.buscarCuentaPorRol(
          empresaId,
          RolCuentaSistema.INTERESES,
          'INGRESO',
          '402',
        );
        if (!cuentaInteres)
          throw new Error(
            'Cancelación de cobranza: falta la cuenta de ingresos por intereses.',
          );
        partidas.push({
          cuentaContableId: cuentaInteres.id,
          cargo: datos.montoInteres,
          abono: 0,
          referencia: 'Intereses cancelados',
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
            'Cancelación de cobranza: faltan las cuentas de IVA no cobrado y cobrado.',
          );
        }
        partidas.push(
          {
            cuentaContableId: ivaNoCobrado.id,
            cargo: 0,
            abono: ivaReclasificado,
            referencia: `IVA ${ref}`,
          },
          {
            cuentaContableId: ivaCobrado.id,
            cargo: ivaReclasificado,
            abono: 0,
            referencia: `IVA ${ref}`,
          },
        );
      }

      await this.crearPoliza({
        empresaId,
        tipo: TipoPoliza.DIARIO,
        concepto: `Cancelación de cobranza — Crédito ${datos.creditoId.slice(
          0,
          8,
        )}${datos.motivo ? `. ${datos.motivo}` : ''}`,
        /*
         * El payload viaja serializado en la bandeja de asientos, así que la
         * fecha vuelve como texto. Reconstruirla aquí evita el fallo que sólo
         * aparece al reintentar, no al encolar.
         */
        fecha: new Date(datos.fechaCancelacion),
        partidas,
        origenClave: `CANCELACION_COBRANZA:${datos.pagoId}`,
        origenTipo: 'CANCELACION_COBRANZA',
        origenId: datos.pagoId,
      });
      this.logger.log(
        `Póliza de cancelación de cobranza generada: pago ${datos.pagoId.slice(0, 8)}`,
      );
    } catch (err: any) {
      this.logger.error(
        `[Cancelación cobranza ${datos.pagoId}] ${err?.message}`,
      );
      throw err;
    }
  }

  /**
   * Devolución registrada directamente en el registro externo.
   *
   * Baja la cuenta por cobrar contra la cuenta de devoluciones que la empresa
   * haya designado. La cuenta NO se adivina: no hay rol de sistema para
   * devoluciones y elegir una por parecido de código acabaría metiendo el
   * importe en una cuenta de ingresos equivocada, que es de los errores más
   * difíciles de encontrar meses después.
   *
   * Este asiento refleja el efecto financiero. NO sustituye a la nota de
   * crédito: el CFDI sigue siendo necesario y se anuncia en el concepto para
   * que quede a la vista de quien revise la póliza.
   */
  async generarAsientoDeAjusteDevolucionExterna(datos: {
    creditoId: string;
    idTransaccionExterna: string;
    fecha: Date | string;
    empresaId: string;
    monto: number;
    cuentaDevolucionId: string;
  }): Promise<void> {
    try {
      const { empresaId } = datos;
      const cuentaCxC = await this.buscarCuentaPorRol(
        empresaId,
        RolCuentaSistema.CLIENTES_CXC,
        'ACTIVO',
        '14',
      );
      if (!cuentaCxC)
        throw new Error(
          'Ajuste por devolución externa: falta la cuenta Clientes CxC.',
        );

      const ref = `Devolución externa ${datos.idTransaccionExterna}`;
      await this.crearPoliza({
        empresaId,
        tipo: TipoPoliza.DIARIO,
        concepto:
          `Ajuste por devolución en el registro externo — Crédito ${datos.creditoId.slice(
            0,
            8,
          )}. PENDIENTE DE NOTA DE CRÉDITO.`,
        fecha: new Date(datos.fecha),
        partidas: [
          {
            cuentaContableId: datos.cuentaDevolucionId,
            cargo: datos.monto,
            abono: 0,
            referencia: ref,
          },
          {
            cuentaContableId: cuentaCxC.id,
            cargo: 0,
            abono: datos.monto,
            referencia: ref,
          },
        ],
        origenClave: `AJUSTE_DEVOLUCION_EXTERNA:${datos.idTransaccionExterna}`,
        origenTipo: 'AJUSTE_DEVOLUCION_EXTERNA',
        origenId: datos.creditoId,
      });
    } catch (err: any) {
      this.logger.error(
        `[Ajuste devolución externa ${datos.idTransaccionExterna}] ${err?.message}`,
      );
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

    const requiereCuenta = new Set(['TARJETA', 'TRANSFERENCIA', 'MSI_BANCO']);
    if (metodoPago && requiereCuenta.has(metodoPago) && !cuentaBancariaId) {
      this.logger.warn(
        `El método ${metodoPago} requiere una cuenta financiera/TPV.`,
      );
      return null;
    }

    // Con cuenta bancaria → usar su cuenta contable (TPV, BANCO, etc.)
    if (cuentaBancariaId) {
      try {
        const rows = await this.dataSource.query(
          `SELECT cuentaContableId FROM cuentas_bancarias WHERE id = $1 AND empresaId = $2`,
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
      `SELECT folio FROM polizas
       WHERE empresaId = $1 AND folio LIKE $2
       ORDER BY folio DESC LIMIT 1`,
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
  }): Promise<string> {
    // Compara centavos por partida, no flotantes agregados. Esto evita que
    // dos errores de redondeo opuestos se compensen y aparenten un cuadre.
    const cargosCentavos = data.partidas.reduce(
      (s, p) => s + Math.round(Number(p.cargo) * 100),
      0,
    );
    const abonosCentavos = data.partidas.reduce(
      (s, p) => s + Math.round(Number(p.abono) * 100),
      0,
    );
    if (Math.abs(cargosCentavos - abonosCentavos) > 0) {
      throw new Error(
        `Póliza descuadrada (cargos ${cargosCentavos / 100}, abonos ${abonosCentavos / 100}): ${data.concepto}.`,
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
        `SELECT 0 AS resultado, pg_advisory_xact_lock(hashtextextended($1::text, 0));`,
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
        `SELECT 0 AS resultado, pg_advisory_xact_lock(hashtextextended($1::text, 0));`,
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
          return existente.id;
        }
      }

      const cerrado = await qr.query(
        `SELECT id FROM cierres_contables
         WHERE empresaId = $1 AND mes = $2 AND anio = $3`,
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
      return saved.id;
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
    folio: string;
    fecha: Date;
    subtotal: number;
    subtotalHospedaje?: number;
    subtotalConsumos?: number;
    iva: number;
    impuestoHospedaje?: number;
    total: number;
    pagos: Array<{
      metodoPago: string;
      importe: number;
      cuentaBancariaId?: string;
    }>;
    /**
     * Costo real de los consumibles entregados: dotación de habitación,
     * minibar, restaurante y consumos cargados al folio.
     *
     * Antes no existía. `operacion-hotel.service.ts` llamaba a
     * `registrarSalida`, que devuelve el `costoTotal` calculado lote por lote,
     * y ese valor se DESCARTABA. El resultado era que el inventario físico
     * bajaba pero la cuenta contable de Inventario nunca se acreditaba: crecía
     * indefinidamente respecto a la existencia real, el Costo de ventas
     * quedaba subvaluado y la utilidad, inflada. En un hotel con restaurante
     * son decenas de miles de pesos al mes que nadie puede explicar en el
     * cierre.
     */
    costoConsumos?: number;
  }): Promise<{ id: string }> {
    try {
      const subtotal = this.redondear(datos.subtotal);
      const iva = this.redondear(datos.iva);
      const ish = this.redondear(Number(datos.impuestoHospedaje ?? 0));
      const total = this.redondear(datos.total);
      if (this.redondear(subtotal + iva + ish) !== total) {
        throw new Error(
          `Hospedaje ${datos.folio}: subtotal, IVA e impuesto local no cuadran con el total.`,
        );
      }
      const pagos = Array.isArray(datos.pagos) ? datos.pagos : [];
      if (
        this.redondear(pagos.reduce((s, p) => s + Number(p.importe), 0)) !==
        total
      ) {
        throw new Error(
          `Hospedaje ${datos.folio}: las aplicaciones de pago no cuadran.`,
        );
      }

      const subtotalConsumos = this.redondear(
        Number(datos.subtotalConsumos ?? 0),
      );
      const subtotalHospedaje = this.redondear(
        datos.subtotalHospedaje ?? subtotal - subtotalConsumos,
      );
      if (this.redondear(subtotalHospedaje + subtotalConsumos) !== subtotal) {
        throw new Error(
          `Hospedaje ${datos.folio}: el desglose de hospedaje y consumos no cuadra.`,
        );
      }
      const cuentaIngreso =
        (await this.buscarCuentaPorRol(
          datos.empresaId,
          RolCuentaSistema.INGRESOS_HOSPEDAJE,
          'INGRESO',
          '401',
        )) ?? (await this.buscarCuentaGlobal(datos.empresaId, 'INGRESO', '4'));
      if (!cuentaIngreso) {
        throw new Error(
          `Hospedaje ${datos.folio}: falta la cuenta de ingresos por hospedaje.`,
        );
      }

      const partidas: PartidaInput[] = [];
      const ref = `HOSP ${datos.folio}`;
      for (const pago of pagos) {
        const cuenta = await this.buscarCuentaSegunMetodoPago(
          datos.empresaId,
          pago.metodoPago,
          pago.cuentaBancariaId,
        );
        if (!cuenta) {
          throw new Error(
            `Hospedaje ${datos.folio}: falta cuenta para ${pago.metodoPago}.`,
          );
        }
        partidas.push({
          cuentaContableId: cuenta.id,
          cargo: this.redondear(pago.importe),
          abono: 0,
          referencia: ref,
        });
      }
      if (subtotalHospedaje > 0) {
        partidas.push({
          cuentaContableId: cuentaIngreso.id,
          cargo: 0,
          abono: subtotalHospedaje,
          referencia: ref,
        });
      }
      if (subtotalConsumos > 0) {
        const cuentaConsumos =
          (await this.buscarCuentaPorRol(
            datos.empresaId,
            RolCuentaSistema.VENTAS,
            'INGRESO',
            '402',
          )) ?? cuentaIngreso;
        partidas.push({
          cuentaContableId: cuentaConsumos.id,
          cargo: 0,
          abono: subtotalConsumos,
          referencia: ref,
        });
      }

      if (iva > 0) {
        const hayCredito = pagos.some((p) =>
          this.METODOS_CREDITO.has(p.metodoPago),
        );
        const hayContado = pagos.some(
          (p) => !this.METODOS_CREDITO.has(p.metodoPago),
        );
        if (hayCredito && hayContado) {
          // La reclasificación de IVA por cobro parcial requiere separar la base
          // por aplicación. El PMS actualmente cierra sólo cuando el folio queda
          // totalmente aplicado; para no registrar IVA en una cuenta incorrecta,
          // se exige un único régimen de cobro por folio.
          throw new Error(
            `Hospedaje ${datos.folio}: no se permite mezclar crédito y contado en el mismo cierre hasta configurar la reclasificación de IVA por cobranza.`,
          );
        }
        const cuentaIva = await this.buscarCuentaPorRol(
          datos.empresaId,
          hayCredito
            ? RolCuentaSistema.IVA_TRASLADADO_NO_COBRADO
            : RolCuentaSistema.IVA_TRASLADADO_COBRADO,
          'PASIVO',
          hayCredito ? '209' : '208',
        );
        if (!cuentaIva)
          throw new Error(
            `Hospedaje ${datos.folio}: falta la cuenta de IVA trasladado.`,
          );
        partidas.push({
          cuentaContableId: cuentaIva.id,
          cargo: 0,
          abono: iva,
          referencia: ref,
        });
      }

      if (ish > 0) {
        const cuentaIsh = await this.buscarCuentaPorRol(
          datos.empresaId,
          RolCuentaSistema.IMPUESTO_HOSPEDAJE_POR_PAGAR,
          'PASIVO',
          '213',
        );
        if (!cuentaIsh) {
          throw new Error(
            `Hospedaje ${datos.folio}: falta la cuenta de impuesto sobre hospedaje por pagar.`,
          );
        }
        partidas.push({
          cuentaContableId: cuentaIsh.id,
          cargo: 0,
          abono: ish,
          referencia: ref,
        });
      }

      /*
       * COSTO DE VENTAS — Dr. Costo de ventas / Cr. Inventario
       *
       * Mismo tratamiento que en `generarAsientoDeVenta`. Va dentro de la
       * misma póliza porque el ingreso y su costo pertenecen al mismo hecho
       * económico: separarlos permitiría que uno quedara registrado sin el
       * otro.
       */
      const costoConsumos = this.redondear(Number(datos.costoConsumos ?? 0));
      if (costoConsumos > 0) {
        const [cuentaCosto, cuentaInventario] = await Promise.all([
          this.buscarCuentaPorRol(
            datos.empresaId,
            RolCuentaSistema.COSTO_VENTAS,
            'COSTO',
            '501',
          ),
          this.buscarCuentaPorRol(
            datos.empresaId,
            RolCuentaSistema.INVENTARIO,
            'ACTIVO',
            '115',
          ),
        ]);
        if (!cuentaCosto || !cuentaInventario) {
          throw new Error(
            `Hospedaje ${datos.folio}: faltan las cuentas de costo de ventas o ` +
              'inventario. Sin ellas los consumos saldrían del almacén sin ' +
              'reflejarse en la contabilidad.',
          );
        }
        partidas.push(
          {
            cuentaContableId: cuentaCosto.id,
            cargo: costoConsumos,
            abono: 0,
            referencia: ref,
          },
          {
            cuentaContableId: cuentaInventario.id,
            cargo: 0,
            abono: costoConsumos,
            referencia: ref,
          },
        );
      }

      const id = await this.crearPoliza({
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
      return { id };
    } catch (err: any) {
      this.logger.error(`[Hospedaje ${datos.folio}] ${err?.message}`);
      throw err;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 7. ASIENTO DE DEPRECIACIÓN MENSUAL
  //    Dr. Gasto por depreciación / Cr. Depreciación acumulada
  // ══════════════════════════════════════════════════════════════════════════
  async generarAsientoDeDepreciacion(datos: {
    corridaId: string;
    ejercicio: number;
    mes: number;
    fecha: Date;
    empresaId: string;
    detalles: Array<{
      activoId: string;
      codigo: string;
      categoriaId: string;
      cuentaGastoDepreciacionId?: string;
      cuentaDepreciacionAcumuladaId?: string;
      importe: number;
    }>;
  }): Promise<{ id: string }> {
    const acumulado = new Map<
      string,
      { gastoId: string; acumuladaId: string; importe: number }
    >();
    const faltantes: string[] = [];

    for (const detalle of datos.detalles) {
      const importe = this.redondear(Number(detalle.importe));
      if (importe <= 0) continue;
      if (
        !detalle.cuentaGastoDepreciacionId ||
        !detalle.cuentaDepreciacionAcumuladaId
      ) {
        faltantes.push(detalle.codigo);
        continue;
      }
      const clave = `${detalle.cuentaGastoDepreciacionId}:${detalle.cuentaDepreciacionAcumuladaId}`;
      const actual = acumulado.get(clave) ?? {
        gastoId: detalle.cuentaGastoDepreciacionId,
        acumuladaId: detalle.cuentaDepreciacionAcumuladaId,
        importe: 0,
      };
      actual.importe = this.redondear(actual.importe + importe);
      acumulado.set(clave, actual);
    }

    if (faltantes.length) {
      throw new Error(
        `No se puede contabilizar la depreciación ${datos.mes}/${datos.ejercicio}; ` +
          `faltan cuentas en las categorías de los activos: ${[...new Set(faltantes)].join(', ')}.`,
      );
    }
    if (!acumulado.size) {
      throw new Error(
        `La corrida ${datos.mes}/${datos.ejercicio} no contiene importes de depreciación contabilizables.`,
      );
    }

    const partidas: PartidaInput[] = [];
    for (const grupo of acumulado.values()) {
      partidas.push({
        cuentaContableId: grupo.gastoId,
        cargo: grupo.importe,
        abono: 0,
        referencia: `DEP-${datos.ejercicio}-${String(datos.mes).padStart(2, '0')}`,
      });
      partidas.push({
        cuentaContableId: grupo.acumuladaId,
        cargo: 0,
        abono: grupo.importe,
        referencia: `DEP-${datos.ejercicio}-${String(datos.mes).padStart(2, '0')}`,
      });
    }

    const id = await this.crearPoliza({
      empresaId: datos.empresaId,
      tipo: TipoPoliza.DIARIO,
      concepto: `Depreciación mensual ${datos.mes}/${datos.ejercicio}`,
      fecha: datos.fecha,
      partidas,
      origenClave: `DEPRECIACION:${datos.corridaId}`,
      origenTipo: 'DEPRECIACION',
      origenId: datos.corridaId,
    });

    await this.dataSource.query(
      `UPDATE activos_depreciaciones
          SET polizaId = $1
        WHERE empresaId = $2
          AND ejercicio = $3
          AND mes = $4
          AND polizaId IS NULL`,
      [id, datos.empresaId, datos.ejercicio, datos.mes],
    );
    this.logger.log(
      `Póliza de depreciación ${datos.mes}/${datos.ejercicio} generada`,
    );
    return { id };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 8. ASIENTO DE INVENTARIO INICIAL (carga de saldos, estilo SAP 561)
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
  // ══════════════════════════════════════════════════════════════════════════
  // ASIENTO DE TESORERÍA — movimientos manuales y traspasos entre cuentas
  //
  // POR QUÉ EXISTE
  //
  // `TipoAsiento.TESORERIA` estaba declarado en el enum y el despachador de
  // asientos lo mapeaba a `generarAsientoDeTesoreria`, un método que NO
  // existía. No explotaba únicamente porque nadie lo encolaba: el módulo de
  // tesorería no tenía ni una sola referencia contable.
  //
  // El efecto era que `POST /tesoreria/movimientos`, `POST /tesoreria/traspasos`
  // y las entradas y retiros manuales de caja movían dinero en el auxiliar y
  // NUNCA tocaban el mayor. Tres capas — turno de caja, tesorería y
  // contabilidad — que debían decir lo mismo y divergían.
  //
  //   MOVIMIENTO INGRESO:  Dr. Caja/Banco      / Cr. Contrapartida
  //   MOVIMIENTO EGRESO:   Dr. Contrapartida   / Cr. Caja/Banco
  //   TRASPASO:            Dr. Cuenta destino  / Cr. Cuenta origen
  //
  // La contrapartida la elige quien captura: el sistema no puede adivinar si
  // un ingreso manual es una aportación de capital, un préstamo o un cobro
  // extraordinario. Por eso es obligatoria y no tiene valor por defecto.
  //
  // El traspaso se registra como UNA sola póliza con los dos lados. Emitir dos
  // pólizas independientes dejaría medio traspaso contabilizado si la segunda
  // fallaba.
  // ══════════════════════════════════════════════════════════════════════════
  async generarAsientoDeTesoreria(datos: {
    movimientoId: string;
    empresaId: string;
    fecha: Date;
    folio: string;
    concepto: string;
    importe: number;
    operacion: 'MOVIMIENTO' | 'TRASPASO';
    /** Sólo para operacion = 'MOVIMIENTO'. */
    tipo?: 'INGRESO' | 'EGRESO';
    cuentaBancariaId?: string;
    cuentaContrapartidaId?: string;
    /** Sólo para operacion = 'TRASPASO'. */
    cuentaBancariaOrigenId?: string;
    cuentaBancariaDestinoId?: string;
  }): Promise<{ id: string }> {
    try {
      const importe = this.redondear(Number(datos.importe));
      if (!(importe > 0)) {
        throw new Error(
          `Tesorería ${datos.folio}: el importe debe ser mayor que cero.`,
        );
      }

      const ref = `TES ${datos.folio}`;
      const partidas: PartidaInput[] = [];

      if (datos.operacion === 'TRASPASO') {
        const [origen, destino] = await Promise.all([
          this.cuentaContableDeCuentaBancaria(
            datos.empresaId,
            datos.cuentaBancariaOrigenId,
          ),
          this.cuentaContableDeCuentaBancaria(
            datos.empresaId,
            datos.cuentaBancariaDestinoId,
          ),
        ]);
        if (!origen || !destino) {
          throw new Error(
            `Traspaso ${datos.folio}: alguna de las cuentas de caja o banco no ` +
              'tiene cuenta contable asociada. Configúrala antes de traspasar.',
          );
        }
        if (origen.id === destino.id) {
          throw new Error(
            `Traspaso ${datos.folio}: origen y destino comparten la misma ` +
              'cuenta contable; el asiento no reflejaría movimiento alguno.',
          );
        }
        partidas.push(
          {
            cuentaContableId: destino.id,
            cargo: importe,
            abono: 0,
            referencia: ref,
          },
          {
            cuentaContableId: origen.id,
            cargo: 0,
            abono: importe,
            referencia: ref,
          },
        );
      } else {
        const banco = await this.cuentaContableDeCuentaBancaria(
          datos.empresaId,
          datos.cuentaBancariaId,
        );
        if (!banco) {
          throw new Error(
            `Tesorería ${datos.folio}: la cuenta de caja o banco no tiene ` +
              'cuenta contable asociada. Configúrala en el catálogo.',
          );
        }
        if (!datos.cuentaContrapartidaId) {
          throw new Error(
            `Tesorería ${datos.folio}: falta la cuenta de contrapartida. Un ` +
              'movimiento manual no se puede contabilizar sin indicar contra qué ' +
              'cuenta se registra.',
          );
        }
        const contrapartida = await this.dataSource
          .getRepository('CuentaContable')
          .findOne({
            where: {
              id: datos.cuentaContrapartidaId,
              empresaId: datos.empresaId,
            },
          });
        if (!contrapartida) {
          throw new Error(
            `Tesorería ${datos.folio}: la cuenta de contrapartida no existe o ` +
              'pertenece a otra empresa.',
          );
        }
        if ((contrapartida as any).id === banco.id) {
          throw new Error(
            `Tesorería ${datos.folio}: la contrapartida no puede ser la misma ` +
              'cuenta de caja o banco.',
          );
        }

        const esIngreso = datos.tipo === 'INGRESO';
        partidas.push(
          {
            cuentaContableId: esIngreso ? banco.id : (contrapartida as any).id,
            cargo: importe,
            abono: 0,
            referencia: ref,
          },
          {
            cuentaContableId: esIngreso ? (contrapartida as any).id : banco.id,
            cargo: 0,
            abono: importe,
            referencia: ref,
          },
        );
      }

      const poliza = await this.crearPoliza({
        empresaId: datos.empresaId,
        tipo:
          datos.operacion === 'TRASPASO'
            ? TipoPoliza.DIARIO
            : datos.tipo === 'INGRESO'
              ? TipoPoliza.INGRESO
              : TipoPoliza.EGRESO,
        concepto: `${datos.concepto} — ${datos.folio}`,
        fecha: datos.fecha,
        partidas,
        origenClave: `TESORERIA:${datos.movimientoId}`,
        origenTipo: 'TESORERIA',
        origenId: datos.movimientoId,
      });
      return { id: poliza };
    } catch (err: any) {
      this.logger.error(`[Tesorería ${datos.folio}] ${err?.message}`);
      throw err;
    }
  }

  /**
   * Resuelve la cuenta contable asociada a una caja, banco o TPV.
   * A diferencia de `buscarCuentaSegunMetodoPago`, no aplica valores por
   * defecto: si la cuenta bancaria no tiene cuenta contable configurada
   * devuelve null y el asiento falla de forma visible en lugar de aterrizar
   * en una cuenta genérica que nadie podrá explicar en el cierre.
   */
  private async cuentaContableDeCuentaBancaria(
    empresaId: string,
    cuentaBancariaId?: string,
  ): Promise<{ id: string } | null> {
    if (!cuentaBancariaId) return null;
    const filas = await this.dataSource.query(
      `SELECT cuentaContableId FROM cuentas_bancarias WHERE id = $1 AND empresaId = $2`,
      [cuentaBancariaId, empresaId],
    );
    const id = filas?.[0]?.cuentaContableId;
    if (!id) return null;
    const cuenta = await this.dataSource
      .getRepository('CuentaContable')
      .findOne({ where: { id, empresaId } });
    return cuenta ? { id: (cuenta as any).id } : null;
  }
  // ══════════════════════════════════════════════════════════════════════════
  // ASIENTO DE BAJA DE ACTIVO FIJO
  //
  //   Dr. Depreciación acumulada    (se cancela la acumulada del activo)
  //   Dr. Caja/Banco                (sólo si fue venta)
  //   Dr. Pérdida en baja           (si el resultado es negativo)
  //   Cr. Activo fijo               (se da de baja a costo histórico)
  //   Cr. Utilidad en venta         (si el resultado es positivo)
  //
  // POR QUÉ EXISTE
  //
  // `ActivosService.darDeBaja` calculaba el valor en libros y el resultado de
  // la baja —su propio comentario decía «lo que contabilidad necesita para la
  // póliza»— y lo devolvía en el JSON de la respuesta HTTP. Nunca generaba ni
  // encolaba nada. El activo se marcaba BAJA o VENDIDO pero seguía en el
  // balance a costo histórico con su depreciación acumulada, la utilidad o
  // pérdida no se reconocía, y si fue venta el dinero tampoco entraba.
  // ══════════════════════════════════════════════════════════════════════════
  async generarAsientoDeBajaActivo(datos: {
    activoId: string;
    empresaId: string;
    fecha: Date;
    codigo: string;
    nombre: string;
    motivo: string;
    costoAdquisicion: number;
    depreciacionAcumulada: number;
    valorVenta?: number;
    cuentaActivoId?: string;
    cuentaDepreciacionAcumuladaId?: string;
    /** Caja o banco donde entró el importe de la venta, si la hubo. */
    cuentaBancariaId?: string;
  }): Promise<{ id: string }> {
    try {
      const costo = this.redondear(Number(datos.costoAdquisicion));
      const acumulada = this.redondear(Number(datos.depreciacionAcumulada));
      const venta = this.redondear(Number(datos.valorVenta ?? 0));
      const enLibros = this.redondear(costo - acumulada);
      const resultado = this.redondear(venta - enLibros);

      if (!datos.cuentaActivoId || !datos.cuentaDepreciacionAcumuladaId) {
        throw new Error(
          `Baja de activo ${datos.codigo}: la categoría no tiene configuradas ` +
            'las cuentas de activo fijo y depreciación acumulada. Sin ellas la ' +
            'baja no se puede contabilizar.',
        );
      }

      const ref = `BAJA ${datos.codigo}`;
      const partidas: PartidaInput[] = [];

      // Se cancela la depreciación acumulada del activo.
      if (acumulada > 0) {
        partidas.push({
          cuentaContableId: datos.cuentaDepreciacionAcumuladaId,
          cargo: acumulada,
          abono: 0,
          referencia: ref,
        });
      }

      // Entra el dinero de la venta, si la hubo.
      if (venta > 0) {
        const cuentaCobro = await this.buscarCuentaSegunMetodoPago(
          datos.empresaId,
          undefined,
          datos.cuentaBancariaId,
        );
        if (!cuentaCobro) {
          throw new Error(
            `Baja de activo ${datos.codigo}: falta la cuenta de caja o banco ` +
              'donde entró el importe de la venta.',
          );
        }
        partidas.push({
          cuentaContableId: cuentaCobro.id,
          cargo: venta,
          abono: 0,
          referencia: ref,
        });
      }

      // Sale el activo a costo histórico.
      partidas.push({
        cuentaContableId: datos.cuentaActivoId,
        cargo: 0,
        abono: costo,
        referencia: ref,
      });

      if (resultado !== 0) {
        const esUtilidad = resultado > 0;
        const cuentaResultado = await this.buscarCuentaPorRol(
          datos.empresaId,
          esUtilidad
            ? RolCuentaSistema.OTROS_INGRESOS
            : RolCuentaSistema.OTROS_GASTOS,
          esUtilidad ? 'INGRESO' : 'GASTO',
          esUtilidad ? '701' : '702',
        );
        if (!cuentaResultado) {
          throw new Error(
            `Baja de activo ${datos.codigo}: falta la cuenta de ` +
              `${esUtilidad ? 'otros ingresos' : 'otros gastos'} para reconocer ` +
              `${esUtilidad ? 'la utilidad' : 'la pérdida'} en la baja.`,
          );
        }
        partidas.push({
          cuentaContableId: cuentaResultado.id,
          cargo: esUtilidad ? 0 : Math.abs(resultado),
          abono: esUtilidad ? resultado : 0,
          referencia: ref,
        });
      }

      const id = await this.crearPoliza({
        empresaId: datos.empresaId,
        tipo: TipoPoliza.DIARIO,
        concepto: `Baja de activo ${datos.codigo} — ${datos.nombre} (${datos.motivo})`,
        fecha: datos.fecha,
        partidas,
        origenClave: `BAJA_ACTIVO:${datos.activoId}`,
        origenTipo: 'BAJA_ACTIVO',
        origenId: datos.activoId,
      });
      return { id };
    } catch (err: any) {
      this.logger.error(`[Baja activo ${datos.codigo}] ${err?.message}`);
      throw err;
    }
  }

}
