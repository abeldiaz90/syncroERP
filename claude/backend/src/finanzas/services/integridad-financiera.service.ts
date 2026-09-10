import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export type SeveridadIntegridad = 'CRITICA' | 'ALTA' | 'MEDIA' | 'INFO';

export interface HallazgoIntegridad {
  codigo: string;
  modulo: string;
  severidad: SeveridadIntegridad;
  cantidad: number;
  descripcion: string;
  accion: string;
}

@Injectable()
export class IntegridadFinancieraService {
  constructor(private readonly dataSource: DataSource) {}

  private async contar(sql: string, empresaId: string): Promise<number> {
    const rows = await this.dataSource.query(sql, [empresaId]);
    return Number(rows?.[0]?.cantidad ?? 0);
  }

  async diagnosticar(empresaId: string) {
    const definiciones: Array<{
      codigo: string;
      modulo: string;
      severidad: SeveridadIntegridad;
      descripcion: string;
      accion: string;
      sql: string;
    }> = [
      {
        codigo: 'ASIENTOS_PENDIENTES',
        modulo: 'Finanzas',
        severidad: 'CRITICA',
        descripcion:
          'Operaciones económicas sin póliza definitiva o con reintentos agotados.',
        accion:
          'Corregir el mapeo contable y reintentar desde Asientos pendientes.',
        sql: `SELECT COUNT(1) cantidad FROM asientos_pendientes
               WHERE empresaId=$1 AND estado IN ('PENDIENTE','REINTENTANDO','FALLIDO')`,
      },
      {
        codigo: 'FOLIOS_HOTEL_SIN_CONTABILIZAR',
        modulo: 'Hotelería',
        severidad: 'CRITICA',
        descripcion:
          'Folios cerrados o pendientes de pago sin asiento contable generado.',
        accion:
          'Resolver cuentas de ingreso/impuestos y reprocesar el asiento hotelero.',
        sql: `SELECT COUNT(1) cantidad FROM folios
               WHERE empresaId=$1 AND estado IN ('CERRADO','PENDIENTE_PAGO')
                 AND estadoContable NOT IN ('GENERADO','REVERTIDO')`,
      },
      {
        codigo: 'FOLIOS_HOTEL_DESCUADRADOS',
        modulo: 'Hotelería',
        severidad: 'CRITICA',
        descripcion:
          'Folios con saldo o aplicaciones que no coinciden con el total.',
        accion:
          'Revisar cargos, cobros y crédito antes de avanzar la auditoría nocturna.',
        sql: `SELECT COUNT(1) cantidad FROM folios
               WHERE empresaId=$1 AND (saldoPendiente<0 OR totalAplicado<0 OR totalCobrado<0
                  OR ABS(total-(totalAplicado+saldoPendiente))>0.02)`,
      },
      {
        codigo: 'CREDITO_HOTEL_SIN_CITY_LEDGER',
        modulo: 'Hotelería/City Ledger',
        severidad: 'CRITICA',
        descripcion:
          'Folios cerrados a crédito sin una cuenta por cobrar enlazada.',
        accion:
          'Bloquear nuevos créditos y conciliar folio, póliza y convenio antes de reclasificar.',
        sql: `SELECT COUNT(DISTINCT f.id) cantidad
                FROM folios f
                INNER JOIN pagos_folio_hotel p ON p.folioId=f.id AND p.empresaId=f.empresaId
                LEFT JOIN hoteleria_city_ledger_cuentas c ON c.folioId=f.id AND c.empresaId=f.empresaId
               WHERE f.empresaId=$1 AND f.estado='CERRADO'
                 AND p.metodoPago IN ('CREDITO_EMPRESA','CREDITO_AGENCIA')
                 AND c.id IS NULL`,
      },
      {
        codigo: 'CITY_LEDGER_SALDO_INCONSISTENTE',
        modulo: 'Hotelería/City Ledger',
        severidad: 'CRITICA',
        descripcion:
          'Cuentas por cobrar cuyo saldo no coincide con el importe original menos sus cobros.',
        accion:
          'Conciliar aplicaciones e idempotencia antes de aceptar nuevos cobros.',
        sql: `SELECT COUNT(1) cantidad
                FROM hoteleria_city_ledger_cuentas c
                LEFT JOIN LATERAL (SELECT COALESCE(SUM(p.importe),0) cobrado
                  FROM hoteleria_city_ledger_cobros p
                 WHERE p.empresaId=c.empresaId AND p.cuentaCobrarId=c.id) x ON true
               WHERE c.empresaId=$1
                 AND ABS(c.importeOriginal-x.cobrado-c.saldoPendiente)>0.02`,
      },
      {
        codigo: 'COBROS_CITY_LEDGER_SIN_CONTABILIZAR',
        modulo: 'Hotelería/City Ledger',
        severidad: 'CRITICA',
        descripcion:
          'Cobros del City Ledger aplicados a cartera sin póliza contable definitiva.',
        accion:
          'Reintentar el asiento y conciliar Tesorería, Clientes CxC e IVA.',
        sql: `SELECT COUNT(1) cantidad
                FROM hoteleria_city_ledger_cobros
               WHERE empresaId=$1 AND estadoContable NOT IN ('GENERADO','REVERTIDO')`,
      },
      {
        codigo: 'COBRANZA_SIN_CONTABILIZAR',
        modulo: 'Crédito y cobranza',
        severidad: 'CRITICA',
        descripcion:
          'Cobros aplicados al crédito sin póliza contable definitiva.',
        accion:
          'Reintentar el asiento de cobranza y conciliar tesorería contra cartera.',
        sql: `SELECT COUNT(1) cantidad FROM pagos_cobranza
               WHERE empresaId=$1 AND estadoContable NOT IN ('GENERADO','REVERTIDO')`,
      },
      {
        codigo: 'CFDI_PENDIENTES_O_ERROR',
        modulo: 'CFDI',
        severidad: 'ALTA',
        descripcion:
          'CFDI pendientes, con error de timbrado o cancelación inconclusa.',
        accion:
          'Revisar credenciales PAC, payload y reintentar de forma idempotente.',
        sql: `SELECT COUNT(1) cantidad FROM facturas
               WHERE empresaId=$1 AND estado IN ('PENDIENTE_TIMBRADO','ERROR_TIMBRADO','CANCELACION_PENDIENTE','ERROR_CANCELACION')`,
      },
      {
        codigo: 'STOCK_RESERVADO_INCONSISTENTE',
        modulo: 'Inventario/WMS',
        severidad: 'CRITICA',
        descripcion:
          'Stock con reservado/comprometido negativo o superior a la existencia utilizable.',
        accion:
          'Ejecutar diagnóstico WMS y reconciliar reservas antes de vender o transferir.',
        sql: `SELECT COUNT(1) cantidad FROM stock_por_almacen
               WHERE empresaId=$1 AND (cantidad<0 OR reservado<0 OR bloqueado<0 OR comprometido<>0
                  OR reservado+bloqueado>cantidad+0.0001)`,
      },
      {
        codigo: 'RESERVAS_VENCIDAS_ACTIVAS',
        modulo: 'Inventario/WMS',
        severidad: 'ALTA',
        descripcion:
          'Reservas vencidas que continúan reduciendo la disponibilidad.',
        accion:
          'Ejecutar el liberador de reservas vencidas y verificar el cron de WMS.',
        sql: `SELECT COUNT(1) cantidad FROM reservas_inventario
               WHERE empresaId=$1 AND estado IN ('ACTIVA','PARCIALMENTE_CONSUMIDA')
                 AND expiraEn IS NOT NULL AND expiraEn<CURRENT_TIMESTAMP`,
      },
      {
        codigo: 'NOMINA_DEFINITIVA_SIN_POLIZA',
        modulo: 'RR. HH./Nómina',
        severidad: 'CRITICA',
        descripcion:
          'Periodos pagados, contabilizados o cerrados sin póliza vinculada.',
        accion:
          'Bloquear el cierre y generar la póliza de devengo/pago antes de continuar.',
        sql: `SELECT COUNT(1) cantidad FROM rrhh_periodos_nomina
               WHERE empresaId=$1 AND estado IN ('PAGADO','CONTABILIZADO','CERRADO') AND polizaId IS NULL`,
      },
      {
        codigo: 'NOMINA_SIN_SNAPSHOT',
        modulo: 'RR. HH./Nómina',
        severidad: 'ALTA',
        descripcion:
          'Periodos calculados o posteriores sin hash/snapshot de cálculo.',
        accion:
          'Recalcular en ambiente controlado antes de aprobar y congelar la versión.',
        sql: `SELECT COUNT(1) cantidad FROM rrhh_periodos_nomina
               WHERE empresaId=$1 AND estado<>'ABIERTO' AND (hashCalculo IS NULL OR versionCalculo<=0)`,
      },
    ];

    const hallazgos = await Promise.all(
      definiciones.map(
        async (d): Promise<HallazgoIntegridad> => ({
          codigo: d.codigo,
          modulo: d.modulo,
          severidad: d.severidad,
          cantidad: await this.contar(d.sql, empresaId),
          descripcion: d.descripcion,
          accion: d.accion,
        }),
      ),
    );
    const activos = hallazgos.filter((h) => h.cantidad > 0);
    const criticos = activos
      .filter((h) => h.severidad === 'CRITICA')
      .reduce((s, h) => s + h.cantidad, 0);
    const altos = activos
      .filter((h) => h.severidad === 'ALTA')
      .reduce((s, h) => s + h.cantidad, 0);
    return {
      generadoEn: new Date().toISOString(),
      estado:
        criticos > 0 ? 'BLOQUEADO' : altos > 0 ? 'CON_ALERTAS' : 'SALUDABLE',
      resumen: { criticos, altos, hallazgosActivos: activos.length },
      hallazgos: activos,
      comprobaciones: hallazgos.length,
    };
  }
}
