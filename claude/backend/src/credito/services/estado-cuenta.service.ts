import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Un `aaaa-mm-dd` a partir de lo que devuelva la base.
 *
 * Una columna `date` consultada con `dataSource.query` llega como objeto
 * `Date`, no como texto: `String(fecha).slice(0, 10)` daba «Mon Sep 28», que
 * es lo que acabó impreso en el estado de cuenta del cliente. Y convertirla
 * con `toISOString()` la movería al día anterior en México. Se lee por sus
 * componentes locales, que es lo único que no miente.
 */
function soloFecha(valor: unknown): string {
  if (valor instanceof Date) {
    const mes = String(valor.getMonth() + 1).padStart(2, '0');
    const dia = String(valor.getDate()).padStart(2, '0');
    return `${valor.getFullYear()}-${mes}-${dia}`;
  }
  return String(valor ?? '').slice(0, 10);
}

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
             cc.montoTotal AS total, cc.tipoCredito AS "metodoPago",
             -- Lo que se le devolvió al cliente sobre este crédito. Sin esta
             -- columna el documento cobra mercancía que el ERP ya canceló.
             COALESCE(cc.montoAjustesDevolucion, 0) AS "ajustesDevolucion"
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

    /*
     * ── 3-bis. Y lo que debe por City Ledger ─────────────────────────────
     *
     * Este documento es EL QUE SE LE MANDA AL CLIENTE, y leía sólo
     * `creditos_clientes`: el crédito de ventas. Una agencia que se hospeda a
     * crédito no tiene un solo renglón ahí, así que su estado de cuenta salía
     * con saldo CERO teniendo la cuenta abierta.
     *
     * Medido el 27-sep-2026: «Agencia de Viajes del Bajío», con $2,700 de
     * hospedaje cargados y dos cobros aplicados en septiembre, recibía un
     * estado de cuenta en blanco.
     *
     * Y no es un olvido sin consecuencia: el propio sistema dice en la
     * pantalla de convenios que la línea es UNA SOLA y que la disponibilidad
     * se calcula con ventas a crédito y City Ledger juntos. Un estado de
     * cuenta que sólo enseña una mitad contradice el modelo que el resto del
     * ERP defiende, y además es el que sostiene una gestión de cobranza.
     *
     * Las cuentas CANCELADAS no son deuda; los cobros van todos, porque un
     * cobro de City Ledger no se cancela: se reversa con su propio documento.
     */
    const cargosHotel = await this.dataSource.query(
      `
      SELECT cl.id,
             cl.folioReferencia AS "folio",
             cl.fechaEmision    AS "fecha",
             cl.importeOriginal AS "importe",
             cl.numeroConvenioSnapshot AS "convenio"
        FROM hoteleria_city_ledger_cuentas cl
       WHERE cl.clienteId = $1 AND cl.empresaId = $2
         AND cl.estado <> 'CANCELADA'
         ${desde ? 'AND cl.fechaEmision >= $3' : ''}
         ${hasta ? `AND cl.fechaEmision <= $${desde ? 4 : 3}` : ''}
       ORDER BY cl.fechaEmision ASC
    `,
      [
        clienteId,
        empresaId,
        ...(desde ? [desde] : []),
        ...(hasta ? [hasta] : []),
      ],
    );

    const abonosHotel = await this.dataSource.query(
      `
      SELECT co.id,
             co.fechaPago AS "fecha",
             co.importe   AS "importe",
             co.metodoPago AS "metodoPago",
             cl.folioReferencia AS "folio",
             cl.fechaEmision AS "fechaCargo"
        FROM hoteleria_city_ledger_cobros co
        JOIN hoteleria_city_ledger_cuentas cl ON cl.id = co.cuentaCobrarId
       WHERE cl.clienteId = $1 AND co.empresaId = $2
         ${desde ? 'AND co.fechaPago >= $3' : ''}
         ${hasta ? `AND co.fechaPago <= $${desde ? 4 : 3}` : ''}
       ORDER BY co.fechaPago ASC
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
          -- Y los ajustes por devolución de esos mismos créditos: si no, el
          -- arrastre vuelve a meter el importe devuelto por la puerta de atrás.
          SELECT SUM(COALESCE(cc4.montoAjustesDevolucion, 0)) FROM creditos_clientes cc4
          WHERE cc4.clienteId = $1 AND cc4.empresaId = $2
            AND cc4.estado != 'CANCELADO'
            ${desde ? 'AND cc4.fechaInicio < $3' : ''}
        ), 0) -
        COALESCE((
          SELECT SUM(pc2.montoPagado) FROM pagos_cobranza pc2
          JOIN creditos_clientes cc2 ON cc2.id = pc2.creditoId
          -- Misma razón: el saldo anterior no descuenta pagos cancelados.
          WHERE cc2.clienteId = $1 AND cc2.empresaId = $2 AND pc2.cancelado = false
            ${desde ? 'AND pc2.fechaPago < $3' : ''}
        ), 0) +
        COALESCE((
          SELECT SUM(cl3.importeOriginal) FROM hoteleria_city_ledger_cuentas cl3
          WHERE cl3.clienteId = $1 AND cl3.empresaId = $2
            AND cl3.estado <> 'CANCELADA'
            ${desde ? 'AND cl3.fechaEmision < $3' : ''}
        ), 0) -
        COALESCE((
          SELECT SUM(co2.importe) FROM hoteleria_city_ledger_cobros co2
          JOIN hoteleria_city_ledger_cuentas cl2 ON cl2.id = co2.cuentaCobrarId
          WHERE cl2.clienteId = $1 AND co2.empresaId = $2
            ${desde ? 'AND co2.fechaPago < $3' : ''}
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

    /*
     * ══════════════════════════════════════════════════════════════════════
     * DOS DEFECTOS EN ESTE MISMO BLOQUE, Y ES EL DOCUMENTO QUE VE EL CLIENTE
     * ----------------------------------------------------------------------
     * 31 · El estado de cuenta tomaba `montoTotal` del crédito y no miraba
     *      `montoAjustesDevolucion`, que es lo que se le devolvió al cliente.
     *      El crédito sí baja su `saldoPendiente` cuando hay una devolución
     *      —lo hacen `devoluciones-ventas` y `cobranza`—, pero este documento
     *      seguía cobrando el importe completo. O sea que cobranza perseguía
     *      dinero que el propio ERP ya había cancelado, con un papel firmado
     *      por la empresa en la mano. Ahora la devolución aparece como un
     *      renglón propio, que es como lo entiende quien lo lee: el cargo
     *      completo y debajo su nota de crédito.
     *
     * 32 · `new Date(columna date).toISOString()` imprime el día ANTERIOR en
     *      México. El helper `soloFecha` existe en este archivo desde el
     *      27-sep, con su comentario explicando justo esto, y sólo lo usaban
     *      los renglones de City Ledger. Los de crédito y cobranza seguían con
     *      `toISOString()`: un estado de cuenta donde la venta del día 1
     *      aparece el 30 del mes anterior, y por tanto en otro período.
     * ══════════════════════════════════════════════════════════════════════
     */
    const todos = [
      ...ventasCredito.map((v: any) => ({
        fecha: soloFecha(v.fechaVenta),
        tipo: 'VENTA' as const,
        folio: `#${String(v.folio).padStart(5, '0')}`,
        descripcion: `Crédito otorgado — ${v.metodoPago}`,
        cargo: Number(v.total),
        abono: 0,
        _ts: new Date(v.fechaVenta).getTime(),
      })),
      ...ventasCredito
        .filter((v: any) => Number(v.ajustesDevolucion ?? 0) > 0)
        .map((v: any) => ({
          fecha: soloFecha(v.fechaVenta),
          tipo: 'DEVOLUCION' as const,
          folio: `#${String(v.folio).padStart(5, '0')}`,
          descripcion: 'Ajuste por devolución de mercancía',
          cargo: 0,
          abono: Number(v.ajustesDevolucion),
          /* Un milisegundo después del cargo: nunca por delante de lo que ajusta. */
          _ts: new Date(v.fechaVenta).getTime() + 1,
        })),
      ...pagos.map((p: any) => ({
        fecha: soloFecha(p.fechaPago),
        tipo: 'ABONO' as const,
        folio: p.creditoFolio,
        descripcion: `Abono — ${p.metodoPago ?? 'EFECTIVO'}`,
        cargo: 0,
        abono: Number(p.montoPagado),
        _ts: new Date(p.fechaPago).getTime(),
      })),
      /*
       * Las fechas de City Ledger son columnas `date`: llegan como
       * `aaaa-mm-dd` y se quedan así. Pasarlas por `new Date(...)` las
       * interpretaría en UTC y en México saldrían un día antes, que es el
       * mismo defecto que ya costó dos reportes.
       */
      ...cargosHotel.map((c: any) => ({
        fecha: soloFecha(c.fecha),
        tipo: 'HOSPEDAJE' as const,
        folio: c.folio,
        descripcion: `Hospedaje a crédito — convenio ${c.convenio ?? 'sin número'}`,
        cargo: Number(c.importe),
        abono: 0,
        _ts: new Date(`${soloFecha(c.fecha)}T00:00:00`).getTime(),
      })),
      ...abonosHotel.map((a: any) => {
        /*
         * Un abono no puede ir ANTES del cargo que paga. La fecha de emisión
         * de una cuenta de City Ledger es la fecha OPERATIVA del hotel, que va
         * por delante del calendario: el hospedaje se emitió el 28 y se cobró
         * el 27. Ordenar por fecha a secas pondría los abonos primero y el
         * saldo corrido saldría en negativo hasta el final. Para el orden —no
         * para la fecha que se imprime— el abono se ancla al cargo.
         */
        const cobro = new Date(`${soloFecha(a.fecha)}T00:00:01`).getTime();
        const cargo = new Date(`${soloFecha(a.fechaCargo)}T00:00:01`).getTime();
        return {
          fecha: soloFecha(a.fecha),
          tipo: 'ABONO' as const,
          folio: a.folio,
          descripcion: `Abono City Ledger — ${a.metodoPago ?? 'EFECTIVO'}`,
          cargo: 0,
          abono: Number(a.importe),
          _ts: Math.max(cobro, cargo),
        };
      }),
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
