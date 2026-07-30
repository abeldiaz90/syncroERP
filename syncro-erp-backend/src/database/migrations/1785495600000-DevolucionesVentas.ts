import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Devoluciones parciales/totales con trazabilidad de lote, resolución
 * financiera, saldo a favor y vínculo fiscal. Es idempotente para convivir
 * temporalmente con DB_SYNC=true durante desarrollo.
 */
export class DevolucionesVentas1785495600000 implements MigrationInterface {
  name = 'DevolucionesVentas1785495600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      IF OBJECT_ID('ventas', 'U') IS NOT NULL
      BEGIN
        IF COL_LENGTH('ventas', 'cuentaBancariaId') IS NULL
          ALTER TABLE ventas ADD cuentaBancariaId uniqueidentifier NULL;
        IF COL_LENGTH('ventas', 'subtotalDevuelto') IS NULL
          ALTER TABLE ventas ADD subtotalDevuelto decimal(18,4) NOT NULL
            CONSTRAINT DF_ventas_subtotalDevuelto DEFAULT 0;
        IF COL_LENGTH('ventas', 'impuestoDevuelto') IS NULL
          ALTER TABLE ventas ADD impuestoDevuelto decimal(18,4) NOT NULL
            CONSTRAINT DF_ventas_impuestoDevuelto DEFAULT 0;
        IF COL_LENGTH('ventas', 'totalDevuelto') IS NULL
          ALTER TABLE ventas ADD totalDevuelto decimal(18,4) NOT NULL
            CONSTRAINT DF_ventas_totalDevuelto DEFAULT 0;
        IF COL_LENGTH('ventas', 'fechaUltimaDevolucion') IS NULL
          ALTER TABLE ventas ADD fechaUltimaDevolucion datetime2 NULL;
      END;

      IF OBJECT_ID('detalles_venta', 'U') IS NOT NULL
        AND COL_LENGTH('detalles_venta', 'cantidadDevuelta') IS NULL
        ALTER TABLE detalles_venta ADD cantidadDevuelta decimal(18,4) NOT NULL
          CONSTRAINT DF_detalles_venta_cantidadDevuelta DEFAULT 0;

      IF OBJECT_ID('creditos_clientes', 'U') IS NOT NULL
        AND COL_LENGTH('creditos_clientes', 'montoAjustesDevolucion') IS NULL
        ALTER TABLE creditos_clientes ADD montoAjustesDevolucion decimal(18,4)
          NOT NULL CONSTRAINT DF_creditos_ajustes_devolucion DEFAULT 0;

      IF OBJECT_ID('facturas', 'U') IS NOT NULL
      BEGIN
        IF COL_LENGTH('facturas', 'ventaId') IS NULL
          ALTER TABLE facturas ADD ventaId uniqueidentifier NULL;
        IF NOT EXISTS (
          SELECT 1 FROM sys.indexes
          WHERE object_id = OBJECT_ID('facturas')
            AND name = 'IX_facturas_empresa_venta'
        )
          CREATE INDEX IX_facturas_empresa_venta
            ON facturas(empresaId, ventaId) WHERE ventaId IS NOT NULL;
        IF OBJECT_ID('ventas', 'U') IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM sys.foreign_key_columns fkc
            INNER JOIN sys.columns pc
              ON pc.object_id = fkc.parent_object_id
             AND pc.column_id = fkc.parent_column_id
            WHERE fkc.parent_object_id = OBJECT_ID('facturas')
              AND fkc.referenced_object_id = OBJECT_ID('ventas')
              AND pc.name = 'ventaId'
          )
          ALTER TABLE facturas
            ADD CONSTRAINT FK_facturas_venta
            FOREIGN KEY (ventaId) REFERENCES ventas(id);
      END;

      IF OBJECT_ID('devoluciones_venta', 'U') IS NULL
      BEGIN
        CREATE TABLE devoluciones_venta (
          id uniqueidentifier NOT NULL
            CONSTRAINT DF_devoluciones_venta_id DEFAULT NEWSEQUENTIALID(),
          empresaId uniqueidentifier NOT NULL,
          ventaId uniqueidentifier NOT NULL,
          folio int NOT NULL,
          estado varchar(20) NOT NULL
            CONSTRAINT DF_devoluciones_estado DEFAULT 'PROCESADA',
          motivo varchar(500) NOT NULL,
          resolucion varchar(20) NOT NULL,
          subtotal decimal(18,4) NOT NULL,
          impuestoTotal decimal(18,4) NOT NULL,
          total decimal(18,4) NOT NULL,
          costoReintegrado decimal(18,4) NOT NULL
            CONSTRAINT DF_devoluciones_costo_reintegrado DEFAULT 0,
          costoDanado decimal(18,4) NOT NULL
            CONSTRAINT DF_devoluciones_costo_danado DEFAULT 0,
          ajusteCxC decimal(18,4) NOT NULL
            CONSTRAINT DF_devoluciones_ajuste_cxc DEFAULT 0,
          importeReembolso decimal(18,4) NOT NULL
            CONSTRAINT DF_devoluciones_reembolso DEFAULT 0,
          saldoFavorGenerado decimal(18,4) NOT NULL
            CONSTRAINT DF_devoluciones_saldo_favor DEFAULT 0,
          cuentaBancariaId uniqueidentifier NULL,
          metodoReembolso varchar(30) NULL,
          referenciaReembolso varchar(120) NULL,
          estadoFiscal varchar(35) NOT NULL
            CONSTRAINT DF_devoluciones_estado_fiscal DEFAULT 'NO_REQUERIDO',
          facturaOrigenId uniqueidentifier NULL,
          notaCreditoId uniqueidentifier NULL,
          claveIdempotencia varchar(100) NULL,
          usuarioId uniqueidentifier NULL,
          fechaDevolucion datetime2 NOT NULL
            CONSTRAINT DF_devoluciones_fecha DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_devoluciones_venta PRIMARY KEY (id),
          CONSTRAINT FK_devoluciones_venta_venta FOREIGN KEY (ventaId)
            REFERENCES ventas(id),
          CONSTRAINT FK_devoluciones_venta_cuenta FOREIGN KEY (cuentaBancariaId)
            REFERENCES cuentas_bancarias(id)
        );
        CREATE UNIQUE INDEX UX_devoluciones_empresa_folio
          ON devoluciones_venta(empresaId, folio);
        CREATE INDEX IX_devoluciones_empresa_venta
          ON devoluciones_venta(empresaId, ventaId);
        CREATE UNIQUE INDEX UX_devoluciones_empresa_idempotencia
          ON devoluciones_venta(empresaId, claveIdempotencia)
          WHERE claveIdempotencia IS NOT NULL;
      END;

      IF OBJECT_ID('detalles_devolucion_venta', 'U') IS NULL
      BEGIN
        CREATE TABLE detalles_devolucion_venta (
          id uniqueidentifier NOT NULL
            CONSTRAINT DF_detalles_devolucion_id DEFAULT NEWSEQUENTIALID(),
          devolucionId uniqueidentifier NOT NULL,
          detalleVentaId uniqueidentifier NOT NULL,
          productoId uniqueidentifier NOT NULL,
          cantidad decimal(18,4) NOT NULL,
          condicion varchar(25) NOT NULL,
          subtotal decimal(18,4) NOT NULL,
          impuestoMonto decimal(18,4) NOT NULL
            CONSTRAINT DF_det_dev_impuesto DEFAULT 0,
          costoTotal decimal(18,4) NOT NULL
            CONSTRAINT DF_det_dev_costo DEFAULT 0,
          CONSTRAINT PK_detalles_devolucion PRIMARY KEY (id),
          CONSTRAINT FK_det_dev_devolucion FOREIGN KEY (devolucionId)
            REFERENCES devoluciones_venta(id) ON DELETE CASCADE,
          CONSTRAINT FK_det_dev_detalle_venta FOREIGN KEY (detalleVentaId)
            REFERENCES detalles_venta(id),
          CONSTRAINT FK_det_dev_producto FOREIGN KEY (productoId)
            REFERENCES productos(id)
        );
        CREATE INDEX IX_det_dev_devolucion
          ON detalles_devolucion_venta(devolucionId);
      END;

      IF OBJECT_ID('aplicaciones_lote_devolucion', 'U') IS NULL
      BEGIN
        CREATE TABLE aplicaciones_lote_devolucion (
          id uniqueidentifier NOT NULL
            CONSTRAINT DF_aplicaciones_devolucion_id DEFAULT NEWSEQUENTIALID(),
          detalleDevolucionId uniqueidentifier NOT NULL,
          movimientoSalidaId uniqueidentifier NOT NULL,
          loteId uniqueidentifier NULL,
          almacenId uniqueidentifier NOT NULL,
          cantidad decimal(18,4) NOT NULL,
          costoUnitario decimal(18,4) NOT NULL,
          costoTotal decimal(18,4) NOT NULL,
          CONSTRAINT PK_aplicaciones_lote_devolucion PRIMARY KEY (id),
          CONSTRAINT FK_apl_dev_detalle FOREIGN KEY (detalleDevolucionId)
            REFERENCES detalles_devolucion_venta(id) ON DELETE CASCADE,
          CONSTRAINT FK_apl_dev_movimiento FOREIGN KEY (movimientoSalidaId)
            REFERENCES movimientos_inventario(id),
          CONSTRAINT FK_apl_dev_lote FOREIGN KEY (loteId)
            REFERENCES lotes_inventario(id)
        );
        CREATE INDEX IX_apl_dev_movimiento
          ON aplicaciones_lote_devolucion(movimientoSalidaId);
      END;

      IF OBJECT_ID('saldos_favor_clientes_movimientos', 'U') IS NULL
      BEGIN
        CREATE TABLE saldos_favor_clientes_movimientos (
          id uniqueidentifier NOT NULL
            CONSTRAINT DF_saldos_favor_id DEFAULT NEWSEQUENTIALID(),
          empresaId uniqueidentifier NOT NULL,
          clienteId uniqueidentifier NOT NULL,
          devolucionId uniqueidentifier NULL,
          tipo varchar(10) NOT NULL,
          importe decimal(18,4) NOT NULL,
          saldoPosterior decimal(18,4) NOT NULL,
          concepto varchar(250) NOT NULL,
          usuarioId uniqueidentifier NULL,
          fecha datetime2 NOT NULL
            CONSTRAINT DF_saldos_favor_fecha DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_saldos_favor_clientes PRIMARY KEY (id),
          CONSTRAINT FK_saldos_favor_cliente FOREIGN KEY (clienteId)
            REFERENCES clientes(id),
          CONSTRAINT FK_saldos_favor_devolucion FOREIGN KEY (devolucionId)
            REFERENCES devoluciones_venta(id)
        );
        CREATE INDEX IX_saldos_favor_cliente_fecha
          ON saldos_favor_clientes_movimientos(empresaId, clienteId, fecha);
        CREATE UNIQUE INDEX UX_saldos_favor_devolucion
          ON saldos_favor_clientes_movimientos(empresaId, devolucionId)
          WHERE devolucionId IS NOT NULL;
      END;

      IF OBJECT_ID('cuentas_contables', 'U') IS NOT NULL
        AND COL_LENGTH('cuentas_contables', 'rolSistema') IS NOT NULL
      BEGIN
        UPDATE cuentas_contables
          SET rolSistema = 'SALDOS_FAVOR_CLIENTES'
        WHERE numeroCuenta = '206.01'
          AND (rolSistema IS NULL OR rolSistema = 'SALDOS_FAVOR_CLIENTES');
      END;

      IF OBJECT_ID('categorias', 'U') IS NOT NULL
        AND COL_LENGTH('categorias', 'cuentaDevolucionesId') IS NOT NULL
      BEGIN
        UPDATE c
          SET cuentaDevolucionesId = devoluciones.id
        FROM categorias c
        INNER JOIN cuentas_contables devoluciones
          ON devoluciones.empresaId = c.empresaId
         AND devoluciones.numeroCuenta = '402.01'
        WHERE c.cuentaDevolucionesId IS NULL
           OR c.cuentaDevolucionesId = c.cuentaVentasId;
      END;
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No se eliminan devoluciones, saldos o trazabilidad fiscal por seguridad.
  }
}
