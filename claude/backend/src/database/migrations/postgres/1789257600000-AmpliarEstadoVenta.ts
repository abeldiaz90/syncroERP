import { MigrationInterface, QueryRunner } from 'typeorm';

/** PARCIALMENTE_DEVUELTA tiene 21 caracteres. */
export class AmpliarEstadoVenta1789257600000 implements MigrationInterface {
  name = 'AmpliarEstadoVenta1789257600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE ventas ALTER COLUMN estado TYPE varchar(30)');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL rechaza la reducción si existen estados de más de 20
    // caracteres; no truncamos ni cambiamos estados de ventas existentes.
    await queryRunner.query('ALTER TABLE ventas ALTER COLUMN estado TYPE varchar(20)');
  }
}
