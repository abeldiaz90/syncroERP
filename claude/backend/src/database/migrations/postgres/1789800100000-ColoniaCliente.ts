import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * La colonia del cliente, como columna propia.
 *
 * Hasta ahora el domicilio iba en `direccion` (calle y número), `ciudad`,
 * `estado` y `codigopostal`. La colonia no tenía dónde ir, así que quien la
 * necesitaba la escribía dentro de `direccion`. Eso funciona para imprimir una
 * etiqueta y para nada más: el domicilio fiscal de un CFDI la pide por
 * separado, y ningún proceso puede extraerla de un campo de texto libre.
 *
 * Aditiva y nullable: los clientes existentes quedan con la colonia vacía y
 * todo lo que hoy funciona sigue funcionando.
 */
export class ColoniaCliente1789800100000 implements MigrationInterface {
  name = 'ColoniaCliente1789800100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE clientes ADD COLUMN IF NOT EXISTS colonia varchar(150)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE clientes DROP COLUMN IF EXISTS colonia`,
    );
  }
}
