import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ============================================================================
 * Devoluciones a proveedor
 * ----------------------------------------------------------------------------
 * El circuito que faltaba. Hasta el 26-sep-2026 el sistema no sabía devolver
 * mercancía, y el mensaje que impedía cancelar una orden ya recibida mandaba a
 * «registrar la devolución al proveedor», que no existía en ninguna parte.
 *
 * Dos tablas: el documento y sus partidas. El documento apunta a la orden de
 * compra —es de ahí de donde sale el tope de lo devolvible y el costo pactado—
 * y al almacén del que sale la mercancía.
 *
 * Los nombres de columna van en minúsculas porque `LowercaseNamingStrategy`
 * pasa todo a minúsculas: escribirlos en camelCase aquí crearía columnas que
 * TypeORM después no encuentra.
 * ============================================================================
 */
export class DevolucionesAProveedor1790460000000 implements MigrationInterface {
  name = 'DevolucionesAProveedor1790460000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS devoluciones_proveedor (
        id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresaid             varchar(36) NOT NULL,
        folio                 varchar(20) NOT NULL,
        ordencompraid         uuid NOT NULL,
        proveedorid           uuid NOT NULL,
        almacenid             uuid NOT NULL,
        fecha                 date NOT NULL,
        motivo                varchar(500) NOT NULL,
        estado                varchar(20) NOT NULL DEFAULT 'REGISTRADA',
        subtotal              numeric(18,2) NOT NULL DEFAULT 0,
        impuestos             numeric(18,2) NOT NULL DEFAULT 0,
        total                 numeric(18,2) NOT NULL DEFAULT 0,
        notacreditoproveedor  varchar(60),
        usuarioid             uuid,
        polizaid              uuid,
        fechacreacion         timestamptz NOT NULL DEFAULT now()
      )
    `);

    /*
     * El folio identifica el documento ante el proveedor y ante el auditor:
     * dos devoluciones con el mismo número no son dos documentos, son un
     * documento y un error. Que lo garantice la base, no sólo el código.
     */
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS UQ_devolucion_proveedor_folio
        ON devoluciones_proveedor (empresaid, folio)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IX_devolucion_proveedor_fecha
        ON devoluciones_proveedor (empresaid, fecha)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IX_devolucion_proveedor_orden
        ON devoluciones_proveedor (empresaid, ordencompraid)
    `);
    await queryRunner.query(`
      ALTER TABLE devoluciones_proveedor
        ADD CONSTRAINT CK_devolucion_proveedor_estado
          CHECK (estado IN ('REGISTRADA','CANCELADA'))
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS devoluciones_proveedor_detalle (
        id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresaid        varchar(36) NOT NULL,
        devolucionid     uuid NOT NULL REFERENCES devoluciones_proveedor(id) ON DELETE CASCADE,
        detalleordenid   uuid NOT NULL,
        productoid       uuid NOT NULL,
        cantidad         numeric(18,4) NOT NULL,
        costounitario    numeric(18,4) NOT NULL,
        tasaiva          numeric(7,4) NOT NULL DEFAULT 0,
        subtotal         numeric(18,2) NOT NULL DEFAULT 0,
        impuesto         numeric(18,2) NOT NULL DEFAULT 0
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IX_devolucion_proveedor_detalle
        ON devoluciones_proveedor_detalle (devolucionid)
    `);
    /* Por aquí se calcula cuánto queda por devolver de cada partida. */
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IX_devolucion_proveedor_detalle_orden
        ON devoluciones_proveedor_detalle (empresaid, detalleordenid)
    `);
    await queryRunner.query(`
      ALTER TABLE devoluciones_proveedor_detalle
        ADD CONSTRAINT CK_devolucion_proveedor_cantidad CHECK (cantidad > 0)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS devoluciones_proveedor_detalle');
    await queryRunner.query('DROP TABLE IF EXISTS devoluciones_proveedor');
  }
}
