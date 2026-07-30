import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Producto } from '../../catalogo/entities/producto.entity';
import { Poliza, TipoPoliza } from '../entities/poliza.entity';
import { PartidaPoliza } from '../entities/partida-poliza.entity';

// ─── Interfaces ───────────────────────────────────────────────────────────────
export interface DetalleVentaContable {
  productoId: string; cantidad: number;
  subtotal: number; impuestoMonto: number;
  /**
   * Costo REAL de lo que salió, calculado por el inventario a partir de los
   * lotes que efectivamente se consumieron. Opcional por compatibilidad, pero
   * todo llamador nuevo debe enviarlo.
   */
  costoTotal?: number;
}
export interface DatosVentaContable {
  ventaId: string; folio: number; fecha: Date;
  empresaId: string; detalles: DetalleVentaContable[]; totalGeneral: number;
  metodoPago?: string;        // EFECTIVO | TARJETA | TRANSFERENCIA | CREDITO_* | MENSUALIDADES
  cuentaBancariaId?: string;  // ID de CuentaBancaria para saber en qué cuenta cae el dinero
}
export interface DetalleCompraContable {
  productoId: string; cantidad: number; costoUnitario: number;
  tasaIva?: number; // 0.16 por defecto (IVA México)
}
export interface DatosCompraContable {
  compraId: string; folio: string; fecha: Date;
  empresaId: string; detalles: DetalleCompraContable[]; totalGeneral: number;
}
export type TipoSalida = 'MERMA' | 'AJUSTE' | 'CONSUMO' | 'MUESTRA';
export interface DetalleMovimientoContable {
  productoId: string; cantidad: number; costoUnitario: number;
}
export interface DatosMovimientoContable {
  movimientoId: string; tipo: TipoSalida; motivo: string;
  fecha: Date; empresaId: string;
  detalles: DetalleMovimientoContable[];
}

type PartidaInput = { cuentaContableId: string; cargo: number; abono: number; referencia: string };

@Injectable()
export class MotorContableService {
  private readonly logger = new Logger(MotorContableService.name);

  private readonly METODOS_CREDITO = new Set([
    'CREDITO_30D', 'CREDITO_60D', 'CREDITO_90D', 'MENSUALIDADES',
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
      this.logger.log(`[Venta #${datos.folio}] metodoPago="${datos.metodoPago}" cuentaBancaria="${datos.cuentaBancariaId}"`);

      const prodMap = await this.cargarProductosConCategoria(datos.detalles.map(d => d.productoId));

      // ── Partidas de COSTO ──
      const partidasCosto: PartidaInput[] = [];
      for (const det of datos.detalles) {
        const prod = prodMap.get(det.productoId);
        const cat  = (prod?.categoria) as any;
        if (!cat?.cuentaCostoVentasId || !cat?.cuentaInventarioId) continue;
        // `precioCompra` es el precio de REPOSICIÓN del catálogo: cuánto
        // costaría comprar hoy. No es lo que costó la mercancía que salió.
        // Usarlo separaba la cuenta de Inventario del valor físico un poco en
        // cada venta, y al cierre nadie podía explicar la diferencia.
        const costo = det.costoTotal !== undefined
          ? this.redondear(Number(det.costoTotal))
          : this.redondear(Number(prod!.precioCompra || 0) * det.cantidad);
        if (costo <= 0) continue;
        const ref = `V#${datos.folio}`;
        partidasCosto.push({ cuentaContableId: cat.cuentaCostoVentasId, cargo: costo, abono: 0,     referencia: ref });
        partidasCosto.push({ cuentaContableId: cat.cuentaInventarioId,  cargo: 0,     abono: costo, referencia: ref });
      }
      if (partidasCosto.length > 0)
        await this.crearPoliza({
          empresaId: datos.empresaId, tipo: TipoPoliza.DIARIO,
          concepto: `Costo de ventas — Ticket #${datos.folio}`,
          fecha: datos.fecha, partidas: partidasCosto,
        });

      // ── Partidas de INGRESO ──
      // La cuenta débito depende del método de pago
      const cuentaDebito = await this.buscarCuentaSegunMetodoPago(
        datos.empresaId, datos.metodoPago, datos.cuentaBancariaId,
      );
      const cuentaIva = await this.buscarCuentaGlobal(datos.empresaId, 'PASIVO', '20'); // 208-xx IVA Trasladado

      if (!cuentaDebito) {
        this.logger.warn(`Venta #${datos.folio}: sin cuenta para método "${datos.metodoPago ?? 'EFECTIVO'}". Asiento omitido.`);
        return;
      }

      const partidasIngreso: PartidaInput[] = [];
      let totalVentas = 0, totalIva = 0;
      for (const det of datos.detalles) {
        const cat = (prodMap.get(det.productoId)?.categoria) as any;
        if (!cat?.cuentaVentasId) continue;
        const sub = this.redondear(det.subtotal);
        const iva = this.redondear(det.impuestoMonto);
        partidasIngreso.push({ cuentaContableId: cat.cuentaVentasId, cargo: 0, abono: sub, referencia: `V#${datos.folio}` });
        totalVentas += sub;
        if (iva > 0 && cuentaIva) {
          partidasIngreso.push({ cuentaContableId: cuentaIva.id, cargo: 0, abono: iva, referencia: `V#${datos.folio}` });
          totalIva += iva;
        }
      }
      if (partidasIngreso.length > 0) {
        // Dr. Caja/Banco/CxC según método de pago
        partidasIngreso.unshift({
          cuentaContableId: cuentaDebito.id,
          cargo: this.redondear(totalVentas + totalIva),
          abono: 0,
          referencia: `V#${datos.folio}`,
        });
        await this.crearPoliza({
          empresaId: datos.empresaId, tipo: TipoPoliza.INGRESO,
          concepto: `Ingresos — Ticket #${datos.folio}`,
          fecha: datos.fecha, partidas: partidasIngreso,
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
        datos.detalles.map(d => d.productoId),
      );

      // ── Reversión del costo: el inventario regresa ──
      const partidasCosto: PartidaInput[] = [];
      for (const det of datos.detalles) {
        const cat = (prodMap.get(det.productoId)?.categoria) as any;
        if (!cat?.cuentaCostoVentasId || !cat?.cuentaInventarioId) continue;

        const costo = this.redondear(Number(det.costoTotal ?? 0));
        if (costo <= 0) continue;

        partidasCosto.push({ cuentaContableId: cat.cuentaInventarioId,  cargo: costo, abono: 0,     referencia: ref });
        partidasCosto.push({ cuentaContableId: cat.cuentaCostoVentasId, cargo: 0,     abono: costo, referencia: ref });
      }

      if (partidasCosto.length > 0) {
        await this.crearPoliza({
          empresaId: datos.empresaId,
          tipo: TipoPoliza.DIARIO,
          concepto: `Reversión de costo — ${datos.folio}. ${datos.motivo}`,
          fecha: datos.fecha,
          partidas: partidasCosto,
        });
      }

      // ── Reversión del ingreso ──
      const cuentaCredito = await this.buscarCuentaSegunMetodoPago(
        datos.empresaId, datos.metodoPago, datos.cuentaBancariaId,
      );

      if (!cuentaCredito) {
        throw new Error(
          `Reversión ${datos.folio}: no hay cuenta configurada para el método ` +
          `"${datos.metodoPago ?? 'EFECTIVO'}".`,
        );
      }

      const cuentaIva = await this.buscarCuentaGlobal(datos.empresaId, 'PASIVO', '20');
      const partidasIngreso: PartidaInput[] = [];
      let totalVentas = 0, totalIva = 0;

      for (const det of datos.detalles) {
        const cat = (prodMap.get(det.productoId)?.categoria) as any;
        if (!cat?.cuentaVentasId) continue;

        const sub = this.redondear(det.subtotal);
        const iva = this.redondear(det.impuestoMonto ?? 0);

        partidasIngreso.push({ cuentaContableId: cat.cuentaVentasId, cargo: sub, abono: 0, referencia: ref });
        totalVentas += sub;

        if (iva > 0 && cuentaIva) {
          partidasIngreso.push({ cuentaContableId: cuentaIva.id, cargo: iva, abono: 0, referencia: ref });
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
        });
      }
    } catch (err: any) {
      this.logger.error(`[Reversión ${datos.folio}] ${err?.message}`);
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
      const prodMap         = await this.cargarProductosConCategoria(datos.detalles.map(d => d.productoId));
      const cuentaProveedores = await this.buscarCuentaGlobal(datos.empresaId, 'PASIVO', '21');
      const cuentaIvaAcred  = await this.buscarCuentaGlobal(datos.empresaId, 'ACTIVO', '116'); // 116-xx IVA Acreditable

      if (!cuentaProveedores) {
        this.logger.warn(`Compra ${datos.folio}: sin cuenta Proveedores (210-xx). Asiento omitido.`);
        return;
      }

      const partidas: PartidaInput[] = [];
      let totalInventario = 0;
      let totalIvaAcreditable = 0;

      for (const det of datos.detalles) {
        const cat    = (prodMap.get(det.productoId)?.categoria) as any;
        if (!cat?.cuentaInventarioId) continue;
        const neto   = this.redondear(det.costoUnitario * det.cantidad);
        if (neto <= 0) continue;
        const tasa   = det.tasaIva ?? 0.16;
        const iva    = this.redondear(neto * tasa);

        // Dr. Inventario (precio neto)
        partidas.push({
          cuentaContableId: cat.cuentaInventarioId,
          cargo: neto, abono: 0,
          referencia: `C#${datos.folio}`,
        });
        totalInventario += neto;

        // Dr. IVA Acreditable (si hay cuenta y hay IVA)
        if (cuentaIvaAcred && iva > 0) {
          partidas.push({
            cuentaContableId: cuentaIvaAcred.id,
            cargo: iva, abono: 0,
            referencia: `IVA-C#${datos.folio}`,
          });
          totalIvaAcreditable += iva;
        }
      }

      if (partidas.length === 0) return;

      // Cr. Proveedores = Inventario + IVA Acreditable
      const totalProveedor = this.redondear(totalInventario + totalIvaAcreditable);
      partidas.push({
        cuentaContableId: cuentaProveedores.id,
        cargo: 0, abono: totalProveedor,
        referencia: `C#${datos.folio}`,
      });

      await this.crearPoliza({
        empresaId: datos.empresaId,
        tipo:      TipoPoliza.EGRESO,
        concepto:  `Compra de mercancía — Orden #${datos.folio}`,
        fecha:     datos.fecha,
        partidas,
      });
      this.logger.log(`Póliza de compra generada: ${datos.folio} | Inventario: ${totalInventario} | IVA: ${totalIvaAcreditable}`);
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
      const prodMap = await this.cargarProductosConCategoria(datos.detalles.map(d => d.productoId));
      const partidas: PartidaInput[] = [];
      for (const det of datos.detalles) {
        const cat = (prodMap.get(det.productoId)?.categoria) as any;
        if (!cat?.cuentaInventarioId) continue;
        const monto = this.redondear(det.costoUnitario * det.cantidad);
        if (monto <= 0) continue;
        const ref = `${datos.tipo}/${datos.motivo}`.substring(0, 80);
        const cuentaDebitoId = datos.tipo === 'MERMA'
          ? (cat.cuentaMermasId ?? cat.cuentaCostoVentasId)
          : cat.cuentaCostoVentasId;
        if (!cuentaDebitoId) continue;
        partidas.push({ cuentaContableId: cuentaDebitoId,         cargo: monto, abono: 0,     referencia: ref });
        partidas.push({ cuentaContableId: cat.cuentaInventarioId, cargo: 0,     abono: monto, referencia: ref });
      }
      if (partidas.length === 0) return;
      const tipoLabel: Record<TipoSalida, string> = { MERMA: 'Merma', AJUSTE: 'Ajuste', CONSUMO: 'Consumo', MUESTRA: 'Muestra' };
      await this.crearPoliza({
        empresaId: datos.empresaId, tipo: TipoPoliza.DIARIO,
        concepto: `${tipoLabel[datos.tipo]} de inventario — ${datos.motivo}`,
        fecha: datos.fecha, partidas,
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
    pagoId: string; creditoId: string; clienteId: string;
    fechaPago: Date; empresaId: string;
    montoCapital: number; montoInteres: number; totalPagado: number;
    cuentaBancariaId?: string;
  }): Promise<void> {
    try {
      const { empresaId } = datos;

      // Dr. Caja/Banco — donde físicamente entró el dinero
      const cuentaCaja = datos.cuentaBancariaId
        ? await this.buscarCuentaSegunMetodoPago(empresaId, 'EFECTIVO', datos.cuentaBancariaId)
        : await this.buscarCuentaGlobal(empresaId, 'ACTIVO', '1');

      // Cr. Clientes CxC — la deuda del cliente que se cancela
      const cuentaCxC = await this.buscarCuentaGlobal(empresaId, 'ACTIVO', '14');

      if (!cuentaCaja) {
        this.logger.warn(`Cobranza: sin cuenta de caja/banco. Omitido.`);
        return;
      }
      if (!cuentaCxC) {
        this.logger.warn(`Cobranza: sin cuenta Clientes CxC (140-xx). Omitido.`);
        return;
      }

      const ref = `Cobro CRD-${datos.creditoId.slice(0, 8)}`;
      const partidas: PartidaInput[] = [
        { cuentaContableId: cuentaCaja.id, cargo: datos.totalPagado,   abono: 0,                  referencia: ref },
        { cuentaContableId: cuentaCxC.id,  cargo: 0,                   abono: datos.montoCapital, referencia: ref },
      ];

      // Si hay intereses → abonar a cuenta de ingresos
      if (datos.montoInteres > 0) {
        const cuentaInteres = await this.buscarCuentaGlobal(empresaId, 'INGRESO', '4');
        if (cuentaInteres) {
          partidas.push({ cuentaContableId: cuentaInteres.id, cargo: 0, abono: datos.montoInteres, referencia: 'Intereses cobrados' });
        }
      }

      await this.crearPoliza({
        empresaId,
        tipo:     TipoPoliza.INGRESO,
        concepto: `Cobranza — Crédito ${datos.creditoId.slice(0, 8)}`,
        fecha:    datos.fechaPago,
        partidas,
      });
      this.logger.log(`Póliza de cobranza generada: crédito ${datos.creditoId.slice(0, 8)}`);
    } catch (err: any) {
      this.logger.error(`[Cobranza ${datos.creditoId}] ${err?.message}`);
      // Se propaga a propósito: AsientosPendientesService lo captura,
      // lo registra y lo reintenta. Tragárselo aquí dejaba las
      // operaciones sin póliza en silencio.
      throw err;
    }
  }

  // ─── Helpers privados ─────────────────────────────────────────────────────

  private async cargarProductosConCategoria(ids: string[]): Promise<Map<string, Producto>> {
    if (!ids.length) return new Map();
    const productos = await this.productoRepo.createQueryBuilder('p')
      .leftJoinAndSelect('p.categoria', 'cat')
      .whereInIds([...new Set(ids)])
      .getMany();
    return new Map(productos.map(p => [p.id, p]));
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
      const cxc = await this.buscarCuentaGlobal(empresaId, 'ACTIVO', '14');
      if (cxc) return cxc;
      this.logger.warn('Sin cuenta Clientes CxC (140-xx). Crea la cuenta en el catálogo.');
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
    return this.buscarCuentaGlobal(empresaId, 'ACTIVO', '1');
  }

  private async buscarCuentaGlobal(empresaId: string, tipo: string, iniciaConDigito: string): Promise<any> {
    return this.dataSource.getRepository('CuentaContable')
      .createQueryBuilder('cc')
      .where('cc.empresaId = :e',   { e: empresaId })
      .andWhere('cc.tipo = :t',     { t: tipo })
      .andWhere('cc.esAfectable = :a', { a: true })
      .andWhere('cc.numeroCuenta LIKE :d', { d: `${iniciaConDigito}%` })
      .orderBy('cc.numeroCuenta', 'ASC')
      .getOne();
  }

  private redondear(n: number): number { return Math.round(n * 100) / 100; }

  // ── Folio correlativo: DI-2026-0001, IN-2026-0001, EG-2026-0001 ──────────
  private async generarFolio(empresaId: string, tipo: TipoPoliza): Promise<string> {
    const prefijos: Record<TipoPoliza, string> = {
      [TipoPoliza.DIARIO]:  'DI',
      [TipoPoliza.INGRESO]: 'IN',
      [TipoPoliza.EGRESO]:  'EG',
    };
    const pref = prefijos[tipo] ?? 'DI';
    const anio = new Date().getFullYear();
    const like = `${pref}-${anio}-%`;
    const [last] = await this.dataSource.query(
      `SELECT TOP 1 folio FROM polizas
       WHERE empresaId = @0 AND folio LIKE @1
       ORDER BY folio DESC`,
      [empresaId, like]
    ).catch(() => [null]);
    const seq = last ? parseInt(last.folio.split('-')[2] || '0') + 1 : 1;
    return `${pref}-${anio}-${String(seq).padStart(5, '0')}`;
  }

  private async crearPoliza(data: {
    empresaId: string; tipo: TipoPoliza; concepto: string; fecha: Date; partidas: PartidaInput[];
  }): Promise<void> {
    // Validar período cerrado
    const mes  = data.fecha.getMonth() + 1;
    const anio = data.fecha.getFullYear();
    const cerrado = await this.dataSource.query(
      `SELECT id FROM cierres_contables WHERE empresaId = @0 AND mes = @1 AND anio = @2`,
      [data.empresaId, mes, anio]
    ).catch(() => []);
    if (cerrado?.length > 0) {
      this.logger.warn(`Período ${mes}/${anio} cerrado — póliza bloqueada: ${data.concepto}`);
      throw new Error(`El período ${mes}/${anio} está cerrado. No se pueden crear pólizas.`);
    }

    const cargos = this.redondear(data.partidas.reduce((s, p) => s + Number(p.cargo), 0));
    const abonos = this.redondear(data.partidas.reduce((s, p) => s + Number(p.abono), 0));
    if (cargos !== abonos) {
      this.logger.warn(`Póliza DESCUADRADA (C:${cargos} A:${abonos}). No se guardó.`);
      return;
    }
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const pref  = data.tipo.substring(0, 2).toUpperCase();
      const poliza = qr.manager.create(Poliza, {
        empresaId: data.empresaId,
        tipo:      data.tipo,
        folio:     await this.generarFolio(data.empresaId, data.tipo),
        fecha:     data.fecha,
        mes:       data.fecha.getMonth() + 1,
        anio:      data.fecha.getFullYear(),
        concepto:  data.concepto,
      });
      const saved = await qr.manager.save(poliza);
      await qr.manager.save(PartidaPoliza,
        data.partidas.map(p => qr.manager.create(PartidaPoliza, { polizaId: saved.id, ...p }))
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
    ocId: string; folio: string; fecha: Date;
    empresaId: string; montoPagado: number;
    cuentaBancariaId?: string;
  }): Promise<void> {
    try {
      // Anti-duplicado: verificar si ya existe póliza para esta OC
      const [yaExiste] = await this.dataSource.query(
        `SELECT id FROM polizas WHERE concepto LIKE @0`,
        [`%OC ${datos.folio}%`]
      ).catch(() => [null]);
      if (yaExiste) {
        this.logger.warn(`Pago proveedor OC ${datos.folio}: póliza ya existe. Omitido.`);
        return;
      }
      const cuentaProveedores = await this.buscarCuentaGlobal(datos.empresaId, 'PASIVO', '21'); // 210-xx Proveedores
      const cuentaCaja = await this.buscarCuentaSegunMetodoPago(
        datos.empresaId, 'EFECTIVO', datos.cuentaBancariaId,
      );
      if (!cuentaProveedores) {
        this.logger.warn('Pago proveedor: sin cuenta Proveedores (PASIVO 2xxx). Omitido.');
        return;
      }
      if (!cuentaCaja) {
        this.logger.warn('Pago proveedor: sin cuenta de caja/banco. Omitido.');
        return;
      }
      await this.crearPoliza({
        empresaId: datos.empresaId,
        tipo:      TipoPoliza.EGRESO,
        concepto:  `Pago a proveedor — OC ${datos.folio}`,
        fecha:     datos.fecha,
        partidas: [
          { cuentaContableId: cuentaProveedores.id, cargo: datos.montoPagado, abono: 0,                referencia: `OC-${datos.folio}` },
          { cuentaContableId: cuentaCaja.id,        cargo: 0,                 abono: datos.montoPagado, referencia: `OC-${datos.folio}` },
        ],
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
    empresaId: string;
    folio: string;            // p. ej. el código de reserva RES-000123
    fecha: Date;
    total: number;            // total con IVA
    iva: number;              // IVA contenido
    metodoPago?: string;
    cuentaBancariaId?: string;
    esCredito?: boolean;      // true = factura a crédito (CxC)
  }): Promise<void> {
    try {
      const base = this.redondear(datos.total - datos.iva);
      const iva  = this.redondear(datos.iva);
      const total = this.redondear(datos.total);

      // Cuenta de ingresos por hospedaje (4xx). Toma la primera cuenta de
      // ingreso disponible; idealmente crea una "Ingresos por Hospedaje" 401-xx.
      const cuentaIngreso = await this.buscarCuentaGlobal(datos.empresaId, 'INGRESO', '4');
      if (!cuentaIngreso) {
        this.logger.warn(`Hospedaje ${datos.folio}: sin cuenta de ingresos (4xx). Asiento omitido.`);
        return;
      }

      // Cuenta de cargo: CxC si es crédito, o Caja/Banco según método de pago
      const cuentaDebito = datos.esCredito
        ? await this.buscarCuentaGlobal(datos.empresaId, 'ACTIVO', '14')  // Clientes CxC
        : await this.buscarCuentaSegunMetodoPago(datos.empresaId, datos.metodoPago ?? 'EFECTIVO', datos.cuentaBancariaId);

      if (!cuentaDebito) {
        this.logger.warn(`Hospedaje ${datos.folio}: sin cuenta de cargo. Asiento omitido.`);
        return;
      }

      const cuentaIva = iva > 0
        ? await this.buscarCuentaGlobal(datos.empresaId, 'PASIVO', '20')  // IVA Trasladado 208-xx
        : null;

      const partidas: any[] = [];
      const ref = `HOSP ${datos.folio}`;

      // Dr. Caja/Banco/CxC por el total
      partidas.push({ cuentaContableId: cuentaDebito.id, cargo: total, abono: 0, referencia: ref });
      // Cr. Ingresos por la base
      partidas.push({ cuentaContableId: cuentaIngreso.id, cargo: 0, abono: base, referencia: ref });
      // Cr. IVA
      if (cuentaIva && iva > 0) {
        partidas.push({ cuentaContableId: cuentaIva.id, cargo: 0, abono: iva, referencia: ref });
      }

      await this.crearPoliza({
        empresaId: datos.empresaId,
        tipo: TipoPoliza.INGRESO,
        concepto: `Ingreso por hospedaje — ${datos.folio}`,
        fecha: datos.fecha,
        partidas,
      });

      this.logger.log(`Póliza de hospedaje generada: ${datos.folio} | Base: ${base} | IVA: ${iva}`);
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
        datos.detalles.map(d => d.productoId),
      );
      const cuentaPuente = await this.buscarCuentaGlobal(datos.empresaId, 'CAPITAL', '399');
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
        const cat = (prodMap.get(det.productoId)?.categoria) as any;
        if (!cat?.cuentaInventarioId) continue;
        const valor = this.redondear(det.costoUnitario * det.cantidad);
        if (valor <= 0) continue;
        porCuenta.set(
          cat.cuentaInventarioId,
          this.redondear((porCuenta.get(cat.cuentaInventarioId) ?? 0) + valor),
        );
      }
      if (porCuenta.size === 0) {
        this.logger.warn('Inventario inicial: ninguna categoría con cuenta de inventario. Asiento omitido.');
        return;
      }

      const partidas: PartidaInput[] = [];
      let total = 0;
      for (const [cuentaId, valor] of porCuenta) {
        partidas.push({ cuentaContableId: cuentaId, cargo: valor, abono: 0, referencia: 'INV-INICIAL' });
        total = this.redondear(total + valor);
      }
      // Cr. cuenta puente por el total
      partidas.push({ cuentaContableId: cuentaPuente.id, cargo: 0, abono: total, referencia: 'INV-INICIAL' });

      await this.crearPoliza({
        empresaId: datos.empresaId,
        tipo:      TipoPoliza.DIARIO,
        concepto:  `Carga de inventario inicial — ${datos.detalles.length} productos`,
        fecha:     datos.fecha,
        partidas,
      });
      this.logger.log(`Póliza de inventario inicial: $${total} en ${porCuenta.size} cuentas de inventario`);
    } catch (err: any) {
      this.logger.error(`[Inventario inicial] ${err?.message}`);
      // Se propaga a propósito: AsientosPendientesService lo captura,
      // lo registra y lo reintenta. Tragárselo aquí dejaba las
      // operaciones sin póliza en silencio.
      throw err;
    }
  }
}