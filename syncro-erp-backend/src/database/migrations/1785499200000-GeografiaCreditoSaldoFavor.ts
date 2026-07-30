import { MigrationInterface, QueryRunner } from 'typeorm';

export class GeografiaCreditoSaldoFavor1785499200000
  implements MigrationInterface
{
  name = 'GeografiaCreditoSaldoFavor1785499200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      IF COL_LENGTH('paises','codigoIso2') IS NULL
        ALTER TABLE paises ADD codigoIso2 varchar(2) NULL;
      IF COL_LENGTH('paises','codigoIso3') IS NULL
        ALTER TABLE paises ADD codigoIso3 varchar(3) NULL;
      IF COL_LENGTH('paises','lada') IS NULL
        ALTER TABLE paises ADD lada varchar(10) NULL;
      IF COL_LENGTH('paises','moneda') IS NULL
        ALTER TABLE paises ADD moneda varchar(3) NULL;
      IF COL_LENGTH('paises','esOficial') IS NULL
        ALTER TABLE paises ADD esOficial bit NOT NULL
          CONSTRAINT DF_paises_esOficial DEFAULT 0;
      IF NOT EXISTS (SELECT 1 FROM sys.indexes
        WHERE object_id=OBJECT_ID('paises') AND name='UX_paises_codigoIso2')
        CREATE UNIQUE INDEX UX_paises_codigoIso2 ON paises(codigoIso2)
          WHERE codigoIso2 IS NOT NULL;

      IF COL_LENGTH('estados','codigo') IS NULL
        ALTER TABLE estados ADD codigo varchar(10) NULL;
      IF COL_LENGTH('estados','tipo') IS NULL
        ALTER TABLE estados ADD tipo varchar(50) NULL;
      IF COL_LENGTH('estados','esOficial') IS NULL
        ALTER TABLE estados ADD esOficial bit NOT NULL
          CONSTRAINT DF_estados_esOficial DEFAULT 0;
      IF NOT EXISTS (SELECT 1 FROM sys.indexes
        WHERE object_id=OBJECT_ID('estados') AND name='UX_estados_pais_codigo')
        CREATE UNIQUE INDEX UX_estados_pais_codigo ON estados(paisId,codigo)
          WHERE paisId IS NOT NULL AND codigo IS NOT NULL;

      IF COL_LENGTH('clientes','paisId') IS NULL
        ALTER TABLE clientes ADD paisId uniqueidentifier NULL;
      IF COL_LENGTH('clientes','estadoId') IS NULL
        ALTER TABLE clientes ADD estadoId uniqueidentifier NULL;
      IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys
        WHERE name='FK_clientes_pais')
        ALTER TABLE clientes ADD CONSTRAINT FK_clientes_pais
          FOREIGN KEY(paisId) REFERENCES paises(id);
      IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys
        WHERE name='FK_clientes_estado')
        ALTER TABLE clientes ADD CONSTRAINT FK_clientes_estado
          FOREIGN KEY(estadoId) REFERENCES estados(id);

      IF COL_LENGTH('ventas','saldoFavorAplicado') IS NULL
        ALTER TABLE ventas ADD saldoFavorAplicado decimal(18,4) NOT NULL
          CONSTRAINT DF_ventas_saldoFavorAplicado DEFAULT 0;
      IF COL_LENGTH('ventas','saldoFavorRestituido') IS NULL
        ALTER TABLE ventas ADD saldoFavorRestituido decimal(18,4) NOT NULL
          CONSTRAINT DF_ventas_saldoFavorRestituido DEFAULT 0;
      IF COL_LENGTH('saldos_favor_clientes_movimientos','ventaId') IS NULL
        ALTER TABLE saldos_favor_clientes_movimientos
          ADD ventaId uniqueidentifier NULL;
      IF NOT EXISTS (SELECT 1 FROM sys.indexes
        WHERE object_id=OBJECT_ID('saldos_favor_clientes_movimientos')
          AND name='UX_saldo_favor_venta_cargo')
        CREATE UNIQUE INDEX UX_saldo_favor_venta_cargo
          ON saldos_favor_clientes_movimientos(empresaId,ventaId)
          WHERE ventaId IS NOT NULL AND tipo='CARGO';
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      IF EXISTS (SELECT 1 FROM sys.indexes WHERE
        object_id=OBJECT_ID('saldos_favor_clientes_movimientos')
        AND name='UX_saldo_favor_venta_cargo')
        DROP INDEX UX_saldo_favor_venta_cargo
          ON saldos_favor_clientes_movimientos;
      IF COL_LENGTH('saldos_favor_clientes_movimientos','ventaId') IS NOT NULL
        ALTER TABLE saldos_favor_clientes_movimientos DROP COLUMN ventaId;
      IF COL_LENGTH('ventas','saldoFavorRestituido') IS NOT NULL
        ALTER TABLE ventas DROP CONSTRAINT DF_ventas_saldoFavorRestituido,
          COLUMN saldoFavorRestituido;
      IF COL_LENGTH('ventas','saldoFavorAplicado') IS NOT NULL
        ALTER TABLE ventas DROP CONSTRAINT DF_ventas_saldoFavorAplicado,
          COLUMN saldoFavorAplicado;
    `);
  }
}
