import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cambios mínimos de esquema exigidos por la estabilización financiera.
 * Es deliberadamente idempotente para instalaciones que usaron synchronize.
 */
export class EstabilizacionCritica1785300000000 implements MigrationInterface {
  name = 'EstabilizacionCritica1785300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      IF COL_LENGTH('ordenes_compra', 'totalPagado') IS NULL
        ALTER TABLE ordenes_compra ADD totalPagado decimal(18,4) NOT NULL
          CONSTRAINT DF_ordenes_compra_totalPagado DEFAULT 0;
      IF COL_LENGTH('ordenes_compra', 'saldoPendiente') IS NULL
      BEGIN
        ALTER TABLE ordenes_compra ADD saldoPendiente decimal(18,4) NULL;
        UPDATE ordenes_compra SET saldoPendiente = total - ISNULL(totalPagado, 0);
        ALTER TABLE ordenes_compra ALTER COLUMN saldoPendiente decimal(18,4) NOT NULL;
        ALTER TABLE ordenes_compra ADD CONSTRAINT DF_ordenes_compra_saldoPendiente
          DEFAULT 0 FOR saldoPendiente;
      END;

      IF OBJECT_ID('pagos_proveedor', 'U') IS NULL
      BEGIN
        CREATE TABLE pagos_proveedor (
          id uniqueidentifier NOT NULL CONSTRAINT DF_pagos_proveedor_id DEFAULT NEWSEQUENTIALID(),
          empresaId uniqueidentifier NOT NULL,
          ordenCompraId uniqueidentifier NOT NULL,
          monto decimal(18,4) NOT NULL,
          cuentaBancariaId uniqueidentifier NULL,
          referencia varchar(120) NULL,
          fechaPago date NOT NULL,
          registradoPorId uniqueidentifier NULL,
          fechaCreacion datetime2 NOT NULL CONSTRAINT DF_pagos_proveedor_fecha DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_pagos_proveedor PRIMARY KEY (id),
          CONSTRAINT FK_pagos_proveedor_oc FOREIGN KEY (ordenCompraId)
            REFERENCES ordenes_compra(id)
        );
        CREATE INDEX IX_pagos_proveedor_empresa_oc
          ON pagos_proveedor(empresaId, ordenCompraId);
      END;

      IF OBJECT_ID('recepciones_compra', 'U') IS NULL
      BEGIN
        CREATE TABLE recepciones_compra (
          id uniqueidentifier NOT NULL CONSTRAINT DF_recepciones_compra_id DEFAULT NEWSEQUENTIALID(),
          empresaId uniqueidentifier NOT NULL,
          ordenCompraId uniqueidentifier NOT NULL,
          almacenId uniqueidentifier NOT NULL,
          detalleJson nvarchar(max) NOT NULL,
          recibidoPorId uniqueidentifier NULL,
          fechaRecepcion datetime2 NOT NULL CONSTRAINT DF_recepciones_compra_fecha DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_recepciones_compra PRIMARY KEY (id),
          CONSTRAINT FK_recepciones_compra_oc FOREIGN KEY (ordenCompraId)
            REFERENCES ordenes_compra(id)
        );
        CREATE INDEX IX_recepciones_compra_empresa_oc
          ON recepciones_compra(empresaId, ordenCompraId);
      END;

      IF COL_LENGTH('polizas', 'origenClave') IS NULL
        ALTER TABLE polizas ADD origenClave varchar(120) NULL;
      IF COL_LENGTH('polizas', 'origenTipo') IS NULL
        ALTER TABLE polizas ADD origenTipo varchar(40) NULL;
      IF COL_LENGTH('polizas', 'origenId') IS NULL
        ALTER TABLE polizas ADD origenId uniqueidentifier NULL;

      IF COL_LENGTH('cargos_folio', 'claveIdempotencia') IS NULL
        ALTER TABLE cargos_folio ADD claveIdempotencia varchar(180) NULL;

      IF EXISTS (
        SELECT 1 FROM productos_precios
        GROUP BY productoId, listaPrecioId HAVING COUNT(*) > 1
      ) THROW 51000, 'Hay precios duplicados por producto/lista. Corrígelos antes de migrar.', 1;

      IF EXISTS (
        SELECT 1 FROM listas_precio WHERE esPorDefecto = 1
        GROUP BY empresaId HAVING COUNT(*) > 1
      ) THROW 51000, 'Hay más de una lista de precio por defecto en una empresa.', 1;

      IF EXISTS (
        SELECT 1 FROM ventas GROUP BY empresaId, folio HAVING COUNT(*) > 1
      ) THROW 51000, 'Hay folios de venta duplicados por empresa.', 1;

      IF EXISTS (
        SELECT 1 FROM creditos_clientes
        GROUP BY empresaId, folio HAVING COUNT(*) > 1
      ) THROW 51000, 'Hay folios de crédito duplicados por empresa.', 1;

      IF EXISTS (
        SELECT 1 FROM creditos_clientes WHERE ventaId IS NOT NULL
        GROUP BY empresaId, ventaId HAVING COUNT(*) > 1
      ) THROW 51000, 'Una venta tiene más de un crédito asociado.', 1;

      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_polizas_empresa_origen')
        CREATE UNIQUE INDEX UX_polizas_empresa_origen
          ON polizas(empresaId, origenClave) WHERE origenClave IS NOT NULL;
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_cargos_folio_idempotencia')
        CREATE UNIQUE INDEX UX_cargos_folio_idempotencia
          ON cargos_folio(empresaId, claveIdempotencia)
          WHERE claveIdempotencia IS NOT NULL;
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_productos_precios_producto_lista')
        CREATE UNIQUE INDEX UX_productos_precios_producto_lista
          ON productos_precios(productoId, listaPrecioId);
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_listas_precio_empresa_default')
        CREATE UNIQUE INDEX UX_listas_precio_empresa_default
          ON listas_precio(empresaId) WHERE esPorDefecto = 1;
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_ventas_empresa_folio')
        CREATE UNIQUE INDEX UX_ventas_empresa_folio ON ventas(empresaId, folio);
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_creditos_empresa_folio')
        CREATE UNIQUE INDEX UX_creditos_empresa_folio
          ON creditos_clientes(empresaId, folio);
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_creditos_empresa_venta')
        CREATE UNIQUE INDEX UX_creditos_empresa_venta
          ON creditos_clientes(empresaId, ventaId) WHERE ventaId IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS UX_creditos_empresa_venta ON creditos_clientes;
      DROP INDEX IF EXISTS UX_creditos_empresa_folio ON creditos_clientes;
      DROP INDEX IF EXISTS UX_ventas_empresa_folio ON ventas;
      DROP INDEX IF EXISTS UX_listas_precio_empresa_default ON listas_precio;
      DROP INDEX IF EXISTS UX_productos_precios_producto_lista ON productos_precios;
      DROP INDEX IF EXISTS UX_cargos_folio_idempotencia ON cargos_folio;
      DROP INDEX IF EXISTS UX_polizas_empresa_origen ON polizas;
    `);
    // No se eliminan tablas/columnas: pueden contener operaciones reales.
  }
}
