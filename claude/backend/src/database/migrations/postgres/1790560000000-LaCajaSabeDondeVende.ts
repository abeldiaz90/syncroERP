import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ============================================================================
 * La caja sabe desde dónde vende
 * ----------------------------------------------------------------------------
 * QUÉ PASABA
 *
 * La cabecera del punto de venta ofrecía dos desplegables: el almacén del que
 * sale la mercancía y la lista de precios con la que se cobra. Los elegía
 * quien vendía.
 *
 * Eso permitía dos cosas que ningún ERP debe permitirle al mostrador:
 *
 *  · cambiar la lista de precios rebaja cualquier venta SIN que quede
 *    registrado un solo descuento;
 *  · cambiar de almacén descuadra el inventario de una bodega ajena.
 *
 * Las dos salen «bien» en el ticket. Por eso ninguna se descubre auditando
 * ventas: hay que mirar quién podía tocar qué.
 *
 * QUÉ HACE ESTA MIGRACIÓN
 *
 * Le da a cada cuenta de caja su almacén y su lista de precios. El punto de
 * venta ya obliga a elegir caja en todo cobro de contado, así que la caja es
 * el amarre natural: elegir dónde entra el dinero ya dice desde qué mostrador
 * se vende.
 *
 * Dos columnas NULAS. No cambia el comportamiento de ninguna instalación por
 * sí sola: una caja sin configurar sigue vendiendo con el almacén y la lista
 * predeterminados, que es exactamente lo que ya hacía. Configurarla es una
 * mejora, no un requisito para cobrar.
 *
 * `ON DELETE SET NULL`: si mañana se da de baja un almacén o una lista, la
 * caja no se rompe ni arrastra un identificador que ya no apunta a nada; se
 * queda sin configurar y vuelve al predeterminado, que es el comportamiento
 * seguro. Un `CASCADE` aquí borraría cuentas de dinero al borrar una bodega.
 *
 * `to_regclass` en las tres tablas: las migraciones construyen el esquema por
 * etapas y una tabla que todavía no existe no es un fallo de ésta.
 * ============================================================================
 */
export class LaCajaSabeDondeVende1790560000000 implements MigrationInterface {
  name = 'LaCajaSabeDondeVende1790560000000';

  private async existe(q: QueryRunner, tabla: string): Promise<boolean> {
    const [fila] = await q.query(`SELECT to_regclass($1) AS tabla`, [tabla]);
    return Boolean(fila?.tabla);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.existe(queryRunner, 'cuentas_bancarias'))) return;

    await queryRunner.query(
      `ALTER TABLE cuentas_bancarias ADD COLUMN IF NOT EXISTS almacenid uuid NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE cuentas_bancarias ADD COLUMN IF NOT EXISTS listaprecioid uuid NULL`,
    );

    if (await this.existe(queryRunner, 'almacenes')) {
      await queryRunner.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'FK_cuentas_bancarias_almacen'
          ) THEN
            ALTER TABLE cuentas_bancarias
              ADD CONSTRAINT "FK_cuentas_bancarias_almacen"
              FOREIGN KEY (almacenid) REFERENCES almacenes(id) ON DELETE SET NULL;
          END IF;
        END $$;
      `);
    }

    if (await this.existe(queryRunner, 'listas_precio')) {
      await queryRunner.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'FK_cuentas_bancarias_lista_precio'
          ) THEN
            ALTER TABLE cuentas_bancarias
              ADD CONSTRAINT "FK_cuentas_bancarias_lista_precio"
              FOREIGN KEY (listaprecioid) REFERENCES listas_precio(id) ON DELETE SET NULL;
          END IF;
        END $$;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.existe(queryRunner, 'cuentas_bancarias'))) return;

    await queryRunner.query(
      `ALTER TABLE cuentas_bancarias DROP CONSTRAINT IF EXISTS "FK_cuentas_bancarias_lista_precio"`,
    );
    await queryRunner.query(
      `ALTER TABLE cuentas_bancarias DROP CONSTRAINT IF EXISTS "FK_cuentas_bancarias_almacen"`,
    );
    await queryRunner.query(
      `ALTER TABLE cuentas_bancarias DROP COLUMN IF EXISTS listaprecioid`,
    );
    await queryRunner.query(
      `ALTER TABLE cuentas_bancarias DROP COLUMN IF EXISTS almacenid`,
    );
  }
}
