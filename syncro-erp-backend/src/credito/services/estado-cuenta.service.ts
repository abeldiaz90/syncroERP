import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class EstadoCuentaService {
  constructor(private readonly dataSource: DataSource) {}

  async obtenerEstadoCuenta(
    clienteId: string,
    empresaId: string,
    fechaDesde?: string,
    fechaHasta?: string,
  ) {
    // 1. Datos del cliente
    const [cliente] = await this.dataSource.query(
      `SELECT id, nombre, rfc, email, telefono FROM clientes WHERE id = @0 AND empresaId = @1`,
      [clienteId, empresaId],
    );
    if (!cliente) throw new Error('Cliente no encontrado');

    const desde = fechaDesde ? new Date(fechaDesde) : null;
    const hasta = fechaHasta ? new Date(fechaHasta + 'T23:59:59') : null;

    // 2. Ventas a crédito en el período
    const ventasCredito = await this.dataSource.query(
      `
      SELECT v.id, v.folio, v.fechaVenta, v.total, v.metodoPago
      FROM ventas v
      WHERE v.clienteId = @0 AND v.empresaId = @1
        AND v.estado != 'ANULADA'
        AND v.metodoPago IN ('CREDITO_30D','CREDITO_60D','CREDITO_90D','MENSUALIDADES')
        ${desde ? 'AND v.fechaVenta >= @2' : ''}
        ${hasta ? `AND v.fechaVenta <= @${desde ? 3 : 2}` : ''}
      ORDER BY v.fechaVenta ASC
    `,
      [
        clienteId,
        empresaId,
        ...(desde ? [desde] : []),
        ...(hasta ? [hasta] : []),
      ],
    );

    // 3. Pagos de cobranza en el período
    const pagos = await this.dataSource.query(
      `
      SELECT pc.id, pc.fechaPago, pc.montoPagado, pc.metodoPago,
             cc.folio AS creditoFolio
      FROM pagos_cobranza pc
      JOIN creditos_clientes cc ON cc.id = pc.creditoId
      WHERE cc.clienteId = @0 AND cc.empresaId = @1
        ${desde ? 'AND pc.fechaPago >= @2' : ''}
        ${hasta ? `AND pc.fechaPago <= @${desde ? 3 : 2}` : ''}
      ORDER BY pc.fechaPago ASC
    `,
      [
        clienteId,
        empresaId,
        ...(desde ? [desde] : []),
        ...(hasta ? [hasta] : []),
      ],
    );

    // 4. Saldo anterior (ventas crédito antes del período, menos pagos antes del período)
    const [saldoAnt] = await this.dataSource.query(
      `
      SELECT
        ISNULL((
          SELECT SUM(v2.total) FROM ventas v2
          WHERE v2.clienteId = @0 AND v2.empresaId = @1
            AND v2.estado != 'ANULADA'
            AND v2.metodoPago IN ('CREDITO_30D','CREDITO_60D','CREDITO_90D','MENSUALIDADES')
            ${desde ? 'AND v2.fechaVenta < @2' : ''}
        ), 0) -
        ISNULL((
          SELECT SUM(pc2.montoPagado) FROM pagos_cobranza pc2
          JOIN creditos_clientes cc2 ON cc2.id = pc2.creditoId
          WHERE cc2.clienteId = @0 AND cc2.empresaId = @1
            ${desde ? 'AND pc2.fechaPago < @2' : ''}
        ), 0) AS saldoAnterior
    `,
      [clienteId, empresaId, ...(desde ? [desde] : [])],
    );

    const saldoAnterior = Math.max(0, Number(saldoAnt?.saldoAnterior ?? 0));

    // 5. Construir movimientos y saldo corriente
    const movimientos: any[] = [];
    let saldoActual = saldoAnterior;

    const todos = [
      ...ventasCredito.map((v: any) => ({
        fecha: new Date(v.fechaVenta).toISOString().split('T')[0],
        tipo: 'VENTA' as const,
        folio: `#${String(v.folio).padStart(5, '0')}`,
        descripcion: `Venta a crédito — ${v.metodoPago}`,
        cargo: Number(v.total),
        abono: 0,
        _ts: new Date(v.fechaVenta).getTime(),
      })),
      ...pagos.map((p: any) => ({
        fecha: new Date(p.fechaPago).toISOString().split('T')[0],
        tipo: 'ABONO' as const,
        folio: p.creditoFolio,
        descripcion: `Abono — ${p.metodoPago ?? 'EFECTIVO'}`,
        cargo: 0,
        abono: Number(p.montoPagado),
        _ts: new Date(p.fechaPago).getTime(),
      })),
    ].sort((a, b) => a._ts - b._ts);

    for (const m of todos) {
      saldoActual = Math.round((saldoActual + m.cargo - m.abono) * 100) / 100;
      movimientos.push({ ...m, saldo: saldoActual });
    }

    const totalCargos = movimientos.reduce((s, m) => s + m.cargo, 0);
    const totalAbonos = movimientos.reduce((s, m) => s + m.abono, 0);

    return {
      cliente,
      periodo: { desde: fechaDesde ?? null, hasta: fechaHasta ?? null },
      saldoAnterior,
      totalCargos: Math.round(totalCargos * 100) / 100,
      totalAbonos: Math.round(totalAbonos * 100) / 100,
      saldoActual: Math.round(saldoActual * 100) / 100,
      movimientos,
    };
  }
}
