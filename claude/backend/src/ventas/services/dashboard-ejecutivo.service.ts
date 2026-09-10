import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  fechaCalendarioNegocio,
  fechaLocalNegocioAUtc,
  rangoDiaNegocio,
  rangoUltimosDiasNegocio,
} from '../../common/utils/business-time.util';

@Injectable()
export class DashboardEjecutivoService {
  private readonly logger = new Logger(DashboardEjecutivoService.name);

  constructor(private readonly dataSource: DataSource) {}

  private async consultarSeguro<T extends Record<string, unknown>>(
    indicador: string,
    sql: string,
    parametros: unknown[],
    advertencias: string[],
  ): Promise<T[]> {
    try {
      return (await this.dataSource.query(sql, parametros)) as T[];
    } catch (error) {
      advertencias.push(indicador);
      this.logger.warn(
        `Indicador ejecutivo no disponible (${indicador}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }

  async obtenerResumen(empresaId: string) {
    const hoy = new Date();
    const advertencias: string[] = [];
    const { inicio: inicioHoy, finExclusivo: finHoy } = rangoDiaNegocio();
    const { inicio: inicio7d } = rangoUltimosDiasNegocio(7);
    const { inicio: inicio30d } = rangoUltimosDiasNegocio(30);
    const fechaNegocio = fechaCalendarioNegocio(hoy);
    const inicioMes = fechaLocalNegocioAUtc(
      `${fechaNegocio.slice(0, 7)}-01T00:00:00`,
    );

    const q = <T extends Record<string, unknown>>(
      indicador: string,
      sql: string,
      parametros: unknown[],
    ) => this.consultarSeguro<T>(indicador, sql, parametros, advertencias);

    const [
      ventasHoy,
      ventasSemana,
      ventasMes,
      ventasPorHora,
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
      q<{ cantidad: number; total: number }>(
        'ventas de hoy',
        'SELECT COUNT(*) AS cantidad, COALESCE(SUM(total-totalDevuelto),0) AS total FROM ventas ' +
          'WHERE empresaId=$1 AND estado!=$2 AND fechaVenta>=$3 AND fechaVenta<$4',
        [empresaId, 'ANULADA', inicioHoy, finHoy],
      ),
      q<{ cantidad: number; total: number }>(
        'ventas de la semana',
        'SELECT COALESCE(SUM(total-totalDevuelto),0) AS total, COUNT(*) AS cantidad FROM ventas ' +
          'WHERE empresaId=$1 AND estado!=$2 AND fechaVenta>=$3 AND fechaVenta<$4',
        [empresaId, 'ANULADA', inicio7d, finHoy],
      ),
      q<{ cantidad: number; total: number }>(
        'ventas del mes',
        'SELECT COALESCE(SUM(total-totalDevuelto),0) AS total, COUNT(*) AS cantidad FROM ventas ' +
          'WHERE empresaId=$1 AND estado!=$2 AND fechaVenta>=$3 AND fechaVenta<$4',
        [empresaId, 'ANULADA', inicioMes, finHoy],
      ),
      q<{ hora: Date | string; total: number; cantidad: number }>(
        'gráfica de ventas',
        "SELECT date_trunc('hour', fechaVenta) AS hora, " +
          'COALESCE(SUM(total-totalDevuelto),0) AS total, COUNT(*) AS cantidad ' +
          'FROM ventas WHERE empresaId=$1 AND estado!=$2 AND fechaVenta>=$3 AND fechaVenta<$4 ' +
          "GROUP BY date_trunc('hour', fechaVenta) ORDER BY hora ASC",
        [empresaId, 'ANULADA', inicio30d, finHoy],
      ),
      q<{ nombre: string; sku: string; unidades: number; importe: number }>(
        'productos destacados',
        'SELECT p.nombre, p.sku, SUM(dv.cantidad-COALESCE(dv.cantidadDevuelta,0)) AS unidades, ' +
          'SUM(CASE WHEN dv.cantidad=0 THEN 0 ELSE dv.subtotal*(dv.cantidad-COALESCE(dv.cantidadDevuelta,0))/dv.cantidad END) AS importe ' +
          'FROM detalles_venta dv JOIN productos p ON p.id=dv.productoId ' +
          'JOIN ventas v ON v.id=dv.ventaId ' +
          'WHERE v.empresaId=$1 AND v.estado!=$2 AND v.fechaVenta>=$3 AND v.fechaVenta<$4 ' +
          'GROUP BY p.nombre,p.sku ORDER BY importe DESC LIMIT 5',
        [empresaId, 'ANULADA', inicioMes, finHoy],
      ),
      q<{ saldo: number; creditos: number }>(
        'cuentas por cobrar',
        'SELECT COALESCE(SUM(saldoPendiente),0) AS saldo, COUNT(*) AS creditos ' +
          'FROM creditos_clientes WHERE empresaId=$1 AND estado IN ($2,$3)',
        [empresaId, 'ACTIVO', 'VENCIDO'],
      ),
      q<{ saldo: number; ordenes: number }>(
        'cuentas por pagar',
        'SELECT COALESCE(SUM(saldoPendiente),0) AS saldo, COUNT(*) AS ordenes ' +
          'FROM ordenes_compra WHERE empresaId=$1 AND estado IN ($2,$3) AND saldoPendiente>0',
        [empresaId, 'RECIBIDA', 'CON_INCIDENCIAS'],
      ),
      q<{ valor: number }>(
        'valor de inventario',
        'SELECT COALESCE(SUM(s.cantidad * p.precioCompra),0) AS valor ' +
          'FROM stock_por_almacen s JOIN productos p ON p.id=s.productoId ' +
          'WHERE s.empresaId=$1',
        [empresaId],
      ),
      q<{ ivaTraslado: number; ivaAcreditable: number }>(
        'declaración de IVA',
        'SELECT ' +
          'COALESCE((SELECT SUM(pp.abono) FROM partidas_poliza pp ' +
          ' JOIN cuentas_contables cc ON cc.id=pp.cuentaContableId ' +
          ' JOIN polizas pol ON pol.id=pp.polizaId ' +
          ' WHERE pol.empresaId=$1 AND cc.numeroCuenta LIKE $2 AND pol.mes=$3 AND pol.anio=$4),0) AS "ivaTraslado",' +
          'COALESCE((SELECT SUM(pp.cargo) FROM partidas_poliza pp ' +
          ' JOIN cuentas_contables cc ON cc.id=pp.cuentaContableId ' +
          ' JOIN polizas pol ON pol.id=pp.polizaId ' +
          ' WHERE pol.empresaId=$1 AND cc.numeroCuenta LIKE $5 AND pol.mes=$3 AND pol.anio=$4),0) AS "ivaAcreditable"',
        [
          empresaId,
          '208%',
          Number(fechaNegocio.slice(5, 7)),
          Number(fechaNegocio.slice(0, 4)),
          '116%',
        ],
      ),
      q<{ total: number; monto: number }>(
        'cuotas vencidas',
        'SELECT COUNT(*) AS total, COALESCE(SUM(montoCuota-montoPagado),0) AS monto ' +
          'FROM amortizacion_cuotas ac JOIN creditos_clientes cc ON cc.id=ac.creditoId ' +
          'WHERE cc.empresaId=$1 AND ac.estado IN ($2,$3) AND ac.fechaVencimiento<CURRENT_TIMESTAMP',
        [empresaId, 'VENCIDA', 'PENDIENTE'],
      ),
      q<{ total: number }>(
        'stock bajo',
        'SELECT COUNT(*) AS total FROM (' +
          ' SELECT p.id FROM productos p JOIN stock_por_almacen s ON s.productoId=p.id ' +
          ' WHERE s.empresaId=$1 AND p.stockMinimo>0 ' +
          ' GROUP BY p.id,p.stockMinimo HAVING SUM(s.cantidad)<=MAX(p.stockMinimo)) sub',
        [empresaId],
      ),
      q<{ total: number }>(
        'requisiciones pendientes',
        'SELECT COUNT(*) AS total FROM requisiciones WHERE empresaId=$1 AND estado=$2',
        [empresaId, 'PENDIENTE'],
      ),
      q<{ total: number; pagos: number }>(
        'cobranza de hoy',
        'SELECT COALESCE(SUM(pc.montoPagado),0) AS total, COUNT(*) AS pagos ' +
          'FROM pagos_cobranza pc JOIN creditos_clientes cc ON cc.id=pc.creditoId ' +
          'WHERE cc.empresaId=$1 AND pc.fechaPago>=$2 AND pc.fechaPago<$3',
        [empresaId, inicioHoy, finHoy],
      ),
    ]);

    const iva = ivaDeclaracion[0] ?? { ivaTraslado: 0, ivaAcreditable: 0 };
    const ivaAPagar = Math.max(
      0,
      Number(iva.ivaTraslado ?? 0) - Number(iva.ivaAcreditable ?? 0),
    );

    const ventasDiarias = new Map<string, { total: number; cantidad: number }>();
    for (const fila of ventasPorHora) {
      const fecha = new Date(fila.hora);
      if (Number.isNaN(fecha.getTime())) continue;
      const dia = fechaCalendarioNegocio(fecha);
      const actual = ventasDiarias.get(dia) ?? { total: 0, cantidad: 0 };
      actual.total += Number(fila.total ?? 0);
      actual.cantidad += Number(fila.cantidad ?? 0);
      ventasDiarias.set(dia, actual);
    }

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
      graficaVentas: [...ventasDiarias.entries()].map(([dia, valor]) => ({
        dia,
        total: valor.total,
        cantidad: valor.cantidad,
      })),
      topProductos: topProductos.map((producto) => ({
        nombre: String(producto.nombre ?? ''),
        sku: String(producto.sku ?? ''),
        unidades: Number(producto.unidades ?? 0),
        importe: Number(producto.importe ?? 0),
      })),
      advertencias: [...new Set(advertencias)],
    };
  }
}
