import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class DashboardEjecutivoService {
  constructor(private readonly dataSource: DataSource) {}

  async obtenerResumen(empresaId: string) {
    const hoy = new Date();
    const inicioHoy = new Date(hoy);
    inicioHoy.setUTCHours(0, 0, 0, 0);
    const finHoy = new Date(hoy);
    finHoy.setUTCHours(23, 59, 59, 999);
    const inicio7d = new Date(hoy);
    inicio7d.setDate(hoy.getDate() - 6);
    inicio7d.setUTCHours(0, 0, 0, 0);
    const inicio30d = new Date(hoy);
    inicio30d.setDate(hoy.getDate() - 29);
    inicio30d.setUTCHours(0, 0, 0, 0);
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    const [
      ventasHoy,
      ventasSemana,
      ventasMes,
      ventasDiarias,
      topProductos,
      saldoCxC,
      saldoCxP,
      valorInventario,
      ivaDeclaracion,
      alertasVencidas,
      alertasStockBajo,
      alertasReq,
      cobranzaHoy,
    ] = await Promise.all([
      this.dataSource.query(
        'SELECT COUNT(*) AS cantidad, ISNULL(SUM(total-totalDevuelto),0) AS total FROM ventas ' +
          'WHERE empresaId=@0 AND estado!=@1 AND fechaVenta>=@2 AND fechaVenta<=@3',
        [empresaId, 'ANULADA', inicioHoy, finHoy],
      ),

      this.dataSource.query(
        'SELECT ISNULL(SUM(total-totalDevuelto),0) AS total, COUNT(*) AS cantidad FROM ventas ' +
          'WHERE empresaId=@0 AND estado!=@1 AND fechaVenta>=@2',
        [empresaId, 'ANULADA', inicio7d],
      ),

      this.dataSource.query(
        'SELECT ISNULL(SUM(total-totalDevuelto),0) AS total, COUNT(*) AS cantidad FROM ventas ' +
          'WHERE empresaId=@0 AND estado!=@1 AND fechaVenta>=@2',
        [empresaId, 'ANULADA', inicioMes],
      ),

      this.dataSource.query(
        'SELECT CAST(fechaVenta AS DATE) AS dia, ISNULL(SUM(total-totalDevuelto),0) AS total, COUNT(*) AS cantidad ' +
          'FROM ventas WHERE empresaId=@0 AND estado!=@1 AND fechaVenta>=@2 ' +
          'GROUP BY CAST(fechaVenta AS DATE) ORDER BY dia ASC',
        [empresaId, 'ANULADA', inicio30d],
      ),

      this.dataSource.query(
        'SELECT TOP 5 p.nombre, p.sku, SUM(dv.cantidad-dv.cantidadDevuelta) AS unidades, ' +
          'SUM(CASE WHEN dv.cantidad=0 THEN 0 ELSE dv.subtotal*(dv.cantidad-dv.cantidadDevuelta)/dv.cantidad END) AS importe ' +
          'FROM detalles_venta dv JOIN productos p ON p.id=dv.productoId ' +
          'JOIN ventas v ON v.id=dv.ventaId ' +
          'WHERE v.empresaId=@0 AND v.estado!=@1 AND v.fechaVenta>=@2 ' +
          'GROUP BY p.nombre,p.sku ORDER BY importe DESC',
        [empresaId, 'ANULADA', inicioMes],
      ),

      this.dataSource.query(
        'SELECT ISNULL(SUM(saldoPendiente),0) AS saldo, COUNT(*) AS creditos ' +
          'FROM creditos_clientes WHERE empresaId=@0 AND estado IN (@1,@2)',
        [empresaId, 'ACTIVO', 'VENCIDO'],
      ),

      this.dataSource.query(
        'SELECT ISNULL(SUM(total),0) AS saldo, COUNT(*) AS ordenes ' +
          'FROM ordenes_compra WHERE empresaId=@0 AND estado IN (@1,@2)',
        [empresaId, 'RECIBIDA', 'CON_INCIDENCIAS'],
      ),

      this.dataSource.query(
        'SELECT ISNULL(SUM(s.cantidad * p.precioCompra),0) AS valor ' +
          'FROM stock_por_almacen s JOIN productos p ON p.id=s.productoId ' +
          'WHERE s.empresaId=@0',
        [empresaId],
      ),

      this.dataSource.query(
        'SELECT ' +
          'ISNULL((SELECT SUM(pp.abono) FROM partidas_poliza pp ' +
          ' JOIN cuentas_contables cc ON cc.id=pp.cuentaContableId ' +
          ' JOIN polizas pol ON pol.id=pp.polizaId ' +
          ' WHERE pol.empresaId=@0 AND cc.numeroCuenta LIKE @1 AND pol.mes=@2 AND pol.anio=@3),0) AS ivaTraslado,' +
          'ISNULL((SELECT SUM(pp.cargo) FROM partidas_poliza pp ' +
          ' JOIN cuentas_contables cc ON cc.id=pp.cuentaContableId ' +
          ' JOIN polizas pol ON pol.id=pp.polizaId ' +
          ' WHERE pol.empresaId=@0 AND cc.numeroCuenta LIKE @4 AND pol.mes=@2 AND pol.anio=@3),0) AS ivaAcreditable',
        [empresaId, '208%', hoy.getMonth() + 1, hoy.getFullYear(), '116%'],
      ),

      this.dataSource.query(
        'SELECT COUNT(*) AS total, ISNULL(SUM(montoCuota-montoPagado),0) AS monto ' +
          'FROM amortizacion_cuotas ac JOIN creditos_clientes cc ON cc.id=ac.creditoId ' +
          'WHERE cc.empresaId=@0 AND ac.estado IN (@1,@2) AND ac.fechaVencimiento<GETDATE()',
        [empresaId, 'VENCIDA', 'PENDIENTE'],
      ),

      this.dataSource.query(
        'SELECT COUNT(*) AS total FROM (' +
          ' SELECT p.id FROM productos p JOIN stock_por_almacen s ON s.productoId=p.id ' +
          ' WHERE s.empresaId=@0 AND p.stockMinimo>0 ' +
          ' GROUP BY p.id,p.stockMinimo HAVING SUM(s.cantidad)<=MAX(p.stockMinimo)) sub',
        [empresaId],
      ),

      this.dataSource.query(
        'SELECT COUNT(*) AS total FROM requisiciones WHERE empresaId=@0 AND estado=@1',
        [empresaId, 'PENDIENTE'],
      ),

      this.dataSource.query(
        'SELECT ISNULL(SUM(pc.montoPagado),0) AS total, COUNT(*) AS pagos ' +
          'FROM pagos_cobranza pc JOIN creditos_clientes cc ON cc.id=pc.creditoId ' +
          'WHERE cc.empresaId=@0 AND pc.fechaPago>=@1 AND pc.fechaPago<=@2',
        [empresaId, inicioHoy, finHoy],
      ),
    ]);

    const iva = ivaDeclaracion[0];
    const ivaAPagar = Math.max(
      0,
      Number(iva.ivaTraslado) - Number(iva.ivaAcreditable),
    );

    return {
      fecha: hoy.toISOString(),
      ventas: {
        hoy: {
          total: Number(ventasHoy[0]?.total ?? 0),
          cantidad: Number(ventasHoy[0]?.cantidad ?? 0),
        },
        semana: {
          total: Number(ventasSemana[0]?.total ?? 0),
          cantidad: Number(ventasSemana[0]?.cantidad ?? 0),
        },
        mes: {
          total: Number(ventasMes[0]?.total ?? 0),
          cantidad: Number(ventasMes[0]?.cantidad ?? 0),
        },
      },
      cobranzaHoy: {
        total: Number(cobranzaHoy[0]?.total ?? 0),
        pagos: Number(cobranzaHoy[0]?.pagos ?? 0),
      },
      cxc: {
        saldo: Number(saldoCxC[0]?.saldo ?? 0),
        creditos: Number(saldoCxC[0]?.creditos ?? 0),
      },
      cxp: {
        saldo: Number(saldoCxP[0]?.saldo ?? 0),
        ordenes: Number(saldoCxP[0]?.ordenes ?? 0),
      },
      inventario: { valor: Number(valorInventario[0]?.valor ?? 0) },
      iva: {
        traslado: Number(iva.ivaTraslado ?? 0),
        acreditable: Number(iva.ivaAcreditable ?? 0),
        aPagar: ivaAPagar,
      },
      alertas: {
        cuotasVencidas: {
          total: Number(alertasVencidas[0]?.total ?? 0),
          monto: Number(alertasVencidas[0]?.monto ?? 0),
        },
        stockBajo: { total: Number(alertasStockBajo[0]?.total ?? 0) },
        requisicionesPendientes: { total: Number(alertasReq[0]?.total ?? 0) },
      },
      graficaVentas: ventasDiarias.map((r: any) => ({
        dia: r.dia?.toISOString?.()?.split('T')[0] ?? String(r.dia),
        total: Number(r.total),
        cantidad: Number(r.cantidad),
      })),
      topProductos: topProductos.map((p: any) => ({
        nombre: p.nombre,
        sku: p.sku,
        unidades: Number(p.unidades),
        importe: Number(p.importe),
      })),
    };
  }
}
