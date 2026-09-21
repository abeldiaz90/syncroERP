import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ============================================================================
 * Fecha de nacimiento y género del cliente
 * ----------------------------------------------------------------------------
 * Dos columnas que el registro externo modela desde siempre y el ERP no tenía,
 * de modo que el expediente no podía ser el mismo de los dos lados aunque la
 * replicación funcionara: faltaba el cajón, no el transporte.
 *
 * Además de la simetría, cada una se gana su lugar: la fecha de nacimiento es
 * el segundo dato que coteja cualquier verificación de identidad después del
 * nombre, y el género alimenta los reportes de inclusión financiera que a una
 * institución de este giro terminan pidiéndole.
 *
 * `date` y no `timestamp`: una fecha de nacimiento no tiene hora, y guardarla
 * con huso horario la mueve un día para quien captura de noche al oeste del
 * meridiano —que en México es el país entero—.
 *
 * Aditiva y nullable: ningún expediente existente se invalida, y un dato
 * personal que nadie capturó vale más vacío que inventado.
 * ============================================================================
 */
export class IdentidadClienteFineract1789900000000 implements MigrationInterface {
  name = 'IdentidadClienteFineract1789900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE clientes ADD COLUMN IF NOT EXISTS fechanacimiento date`,
    );
    await queryRunner.query(
      `ALTER TABLE clientes ADD COLUMN IF NOT EXISTS genero varchar(20)`,
    );
    /*
     * El género se restringe en la base y no sólo en el DTO: una fila con un
     * valor inventado no se detectaría hasta que alguien corriera el reporte
     * que lo agrupa, y ahí ya sería un dato que hay que depurar a mano.
     */
    await queryRunner.query(
      `ALTER TABLE clientes DROP CONSTRAINT IF EXISTS "CK_clientes_genero"`,
    );
    await queryRunner.query(
      `ALTER TABLE clientes ADD CONSTRAINT "CK_clientes_genero"
         CHECK (genero IS NULL OR genero IN ('FEMENINO','MASCULINO','NO_ESPECIFICADO'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE clientes DROP CONSTRAINT IF EXISTS "CK_clientes_genero"`,
    );
    await queryRunner.query(`ALTER TABLE clientes DROP COLUMN IF EXISTS genero`);
    await queryRunner.query(`ALTER TABLE clientes DROP COLUMN IF EXISTS fechanacimiento`);
  }
}
