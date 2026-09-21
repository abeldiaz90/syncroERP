import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ============================================================================
 * El precio de venta puede calcularse desde el costo
 * ----------------------------------------------------------------------------
 * El precio se tecleaba artículo por artículo y lista por lista, y después
 * nadie lo volvía a tocar. El proveedor subía el costo, la compra siguiente
 * entraba más cara, y el precio de venta seguía siendo el de hace dos años. La
 * empresa vendía por debajo del costo sin que ninguna pantalla lo dijera,
 * porque ninguna pantalla comparaba las dos cifras.
 *
 * Se añaden tres columnas a la lista de precios para poder declarar la regla en
 * vez de repetir el resultado:
 *
 *   modo             MANUAL (como hasta ahora) o MARGEN
 *   margenporcentaje porcentaje sobre el costo de reposición
 *   redondeo         múltiplo al que se sube el precio calculado
 *
 * Las listas que ya existen quedan en MANUAL, así que nada cambia de
 * comportamiento hasta que alguien decida usar la fórmula.
 * ============================================================================
 */
export class ListaPrecioDerivadaDelCosto1790000200000
  implements MigrationInterface
{
  name = 'ListaPrecioDerivadaDelCosto1790000200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE listas_precio
        ADD COLUMN IF NOT EXISTS modo             varchar(10) NOT NULL DEFAULT 'MANUAL',
        ADD COLUMN IF NOT EXISTS margenporcentaje decimal(9,4) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS redondeo         decimal(9,4) NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      ALTER TABLE listas_precio
        ADD CONSTRAINT CK_lista_precio_modo CHECK (modo IN ('MANUAL','MARGEN'))
    `);

    /*
     * Un margen negativo sería vender por debajo del costo por regla, no por
     * descuido. Si alguien lo quiere, que lo teclee artículo por artículo y
     * quede su nombre en la bitácora.
     */
    await queryRunner.query(`
      ALTER TABLE listas_precio
        ADD CONSTRAINT CK_lista_precio_margen   CHECK (margenporcentaje >= 0),
        ADD CONSTRAINT CK_lista_precio_redondeo CHECK (redondeo >= 0)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE listas_precio
        DROP CONSTRAINT IF EXISTS CK_lista_precio_modo,
        DROP CONSTRAINT IF EXISTS CK_lista_precio_margen,
        DROP CONSTRAINT IF EXISTS CK_lista_precio_redondeo
    `);
    await queryRunner.query(`
      ALTER TABLE listas_precio
        DROP COLUMN IF EXISTS modo,
        DROP COLUMN IF EXISTS margenporcentaje,
        DROP COLUMN IF EXISTS redondeo
    `);
  }
}
