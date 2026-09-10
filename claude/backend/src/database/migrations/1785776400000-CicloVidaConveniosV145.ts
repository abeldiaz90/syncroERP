import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cierra el ciclo de vida de los convenios hoteleros sin crear una segunda
 * línea de crédito. Las fechas son coherentes y la tolerancia legada deja de
 * poder ampliar la exposición autorizada del cliente.
 */
export class CicloVidaConveniosV1451785776400000
  implements MigrationInterface
{
  name = 'CicloVidaConveniosV1451785776400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      IF OBJECT_ID('hoteleria_convenios_credito','U') IS NOT NULL
      BEGIN
        UPDATE hoteleria_convenios_credito
           SET tolerancia=0,
               fechaActualizacion=SYSUTCDATETIME()
         WHERE ABS(COALESCE(tolerancia,0))>0.009;

        UPDATE hoteleria_convenios_credito
           SET estado='VENCIDO',
               fechaActualizacion=SYSUTCDATETIME()
         WHERE estado='APROBADO'
           AND vigenciaHasta IS NOT NULL
           AND vigenciaHasta<CONVERT(date,SYSUTCDATETIME());

        IF EXISTS (
          SELECT 1
            FROM hoteleria_convenios_credito
           WHERE vigenciaHasta IS NOT NULL
             AND vigenciaHasta<vigenciaDesde
        )
          THROW 51045, 'Existen convenios con vigencia final anterior a la inicial. Corrige esos registros antes de aplicar v14.5.', 1;

        IF NOT EXISTS (
          SELECT 1 FROM sys.check_constraints
           WHERE parent_object_id=OBJECT_ID('hoteleria_convenios_credito')
             AND name='CK_hotel_convenio_vigencia_v145'
        )
          ALTER TABLE hoteleria_convenios_credito WITH CHECK
            ADD CONSTRAINT CK_hotel_convenio_vigencia_v145
            CHECK (vigenciaHasta IS NULL OR vigenciaHasta>=vigenciaDesde);

        ALTER TABLE hoteleria_convenios_credito WITH CHECK
          CHECK CONSTRAINT CK_hotel_convenio_vigencia_v145;

        IF NOT EXISTS (
          SELECT 1 FROM sys.check_constraints
           WHERE parent_object_id=OBJECT_ID('hoteleria_convenios_credito')
             AND name='CK_hotel_convenio_tolerancia_v145'
        )
          ALTER TABLE hoteleria_convenios_credito WITH CHECK
            ADD CONSTRAINT CK_hotel_convenio_tolerancia_v145
            CHECK (ABS(COALESCE(tolerancia,0))<=0.009);

        ALTER TABLE hoteleria_convenios_credito WITH CHECK
          CHECK CONSTRAINT CK_hotel_convenio_tolerancia_v145;
      END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      IF OBJECT_ID('hoteleria_convenios_credito','U') IS NOT NULL
      BEGIN
        IF EXISTS (
          SELECT 1 FROM sys.check_constraints
           WHERE parent_object_id=OBJECT_ID('hoteleria_convenios_credito')
             AND name='CK_hotel_convenio_tolerancia_v145'
        )
          ALTER TABLE hoteleria_convenios_credito
            DROP CONSTRAINT CK_hotel_convenio_tolerancia_v145;

        IF EXISTS (
          SELECT 1 FROM sys.check_constraints
           WHERE parent_object_id=OBJECT_ID('hoteleria_convenios_credito')
             AND name='CK_hotel_convenio_vigencia_v145'
        )
          ALTER TABLE hoteleria_convenios_credito
            DROP CONSTRAINT CK_hotel_convenio_vigencia_v145;
      END
    `);
  }
}
