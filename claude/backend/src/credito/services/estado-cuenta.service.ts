import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
      `SELECT id, nombre, rfc, email, telefono FROM clientes WHERE id = $1 AND empresaId = $2`,
      [clienteId, empresaId],
    );
    if (!cliente) throw new NotFoundException('Cliente no encontrado.');

    if (fechaDesde && !/^\d{4}-\d{2}-\d{2}$/.test(fechaDesde)) {
      throw new BadRequestException('La fecha inicial debe usar el formato AAAA-MM-DD.');
    }
    if (fechaHasta && !/^\d{4}-\d{2}-\d{2}$/.test(fechaHasta)) {
      throw new BadRequestException('La fecha final debe usar el formato AAAA-MM-DD.');
    }
    if (fechaDesde && fechaHasta && fechaDesde > fechaHasta) {
      throw new BadRequestException('La fecha inicial no puede ser posterior a la final.');
    }

    const desde = fechaDesde ? new Date(fechaDesde) : null;
    const hasta = fechaHasta ? new Date(fechaHasta + 'T23:59:59') : null;

    // 2. Cargos de crédito en el período. Se usa `montoTotal` del crédito y
    // no `ventas.total`: así no se vuelve a cobrar el enganche y también se
    // incluyen créditos independientes de una venta.
    /*
     * Los parámetros van con `$N`, no con `@N`: lo segundo es de SQL Server y en
     * PostgreSQL `@` es valor absoluto. Con `hasta` puesto, el estado de cuenta
     * de un cliente reventaba — y es el documento que se le manda al cliente.
     */
    const ventasCredito = await this.dataSource.query(
      `
      -- Alias entrecomillados: sin comillas Postgres los pliega a minúsculas
      -- y el código, que los lee en camelCase, recibe undefined.
      SELECT cc.id, cc.folio, cc.fechaInicio AS "fechaVenta",
             cc.montoTotal AS total, cc.tipoCredito AS "metodoPago"
      FROM creditos_clientes cc
      WHERE cc.clienteId = $1 AND cc.empresaId = $2
        AND cc.estado != 'CANCELADO'
        ${desde ? 'AND cc.fechaInicio >= $3' : ''}
        ${hasta ? `AND cc.fechaInicio <= $${desde ? 4 : 3}` : ''}
      ORDER BY cc.fechaInicio ASC
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
      -- El folio sí llevaba comillas; las tres columnas de pc, no. Con
      -- p.fechaPago en undefined, new Date(undefined).toISOString() LANZA,
      -- así que el estado de cuenta de cualquier cliente con un pago se caía.
      SELECT pc.id AS id, pc.fechaPago AS "fechaPago",
             pc.montoPagado AS "montoPagado", pc.metodoPago AS "metodoPago",
             cc.folio AS "creditoFolio"
      FROM pagos_cobranza pc
      JOIN creditos_clientes cc ON cc.id = pc.creditoId
      -- Un pago cancelado no es un abono. Al cancelarlo, el saldo del crédito
      -- vuelve a subir, pero este documento —el que se le manda al cliente—
      -- seguía mostrando el abono y un saldo menor, y cobranza dejaba de
      -- perseguir esa deuda.
      WHERE cc.clienteId = $1 AND cc.empresaId = $2 AND pc.cancelado = false
        ${desde ? 'AND pc.fechaPago >= $3' : ''}
        ${hasta ? `AND pc.fechaPago <= $${desde ? 4 : 3}` : ''}
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
        COALESCE((
          SELECT SUM(cc3.montoTotal) FROM creditos_clientes cc3
          WHERE cc3.clienteId = $1 AND cc3.empresaId = $2
            AND cc3.estado != 'CANCELADO'
            ${desde ? 'AND cc3.fechaInicio < $3' : ''}
        ), 0) -
        COALESCE((
          SELECT SUM(pc2.montoPagado) FROM pagos_cobranza pc2
          JOIN creditos_clientes cc2 ON cc2.id = pc2.creditoId
          -- Misma razón: el saldo anterior no descuenta pagos cancelados.
          WHERE cc2.clienteId = $1 AND cc2.empresaId = $2 AND pc2.cancelado = false
            ${desde ? 'AND pc2.fechaPago < $3' : ''}
        ), 0) AS "saldoAnterior"
    `,
      [clienteId, empresaId, ...(desde ? [desde] : [])],
    );

    /*
     * El alias va entrecomillado en la consulta. Sin comillas, PostgreSQL lo
     * pliega a `saldoanterior`, la lectura da undefined, `Number(undefined)`
     * es NaN y `Math.max(0, NaN)` también: el saldo anterior y TODO el saldo
     * corrido del estado de cuenta salían NaN. Un NaN se imprime como «NaN»
     * en la pantalla, pero en una suma contamina en silencio.
     */
    const saldoAnterior = Math.max(0, Number(saldoAnt?.saldoAnterior ?? 0));

    // 5. Construir movimientos y saldo corriente
    const movimientos: any[] = [];
    let saldoActual = saldoAnterior;

    const todos = [
      ...ventasCredito.map((v: any) => ({
        fecha: new Date(v.fechaVenta).toISOString().split('T')[0],
        tipo: 'VENTA' as const,
        folio: `#${String(v.folio).padStart(5, '0')}`,
        descripcion: `Crédito otorgado — ${v.metodoPago}`,
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
      const { _ts, ...movimiento } = m;
      movimientos.push({ ...movimiento, saldo: saldoActual });
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
