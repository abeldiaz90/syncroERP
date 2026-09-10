import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Conserva en cada cuenta City Ledger las condiciones exactas del convenio y
 * de la línea maestra con las que se originó el cargo. El convenio puede
 * renovarse y cambiar de versión sin alterar la evidencia de cargos previos.
 */
export class HistorialFinancieroConveniosV1481785787200000
  implements MigrationInterface
{
  name = 'HistorialFinancieroConveniosV1481785787200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      IF OBJECT_ID('hoteleria_city_ledger_cuentas','U') IS NOT NULL
      BEGIN
        IF COL_LENGTH('hoteleria_city_ledger_cuentas','convenioVersion') IS NULL
          ALTER TABLE hoteleria_city_ledger_cuentas ADD convenioVersion int NOT NULL
            CONSTRAINT DF_city_cuenta_convenio_version_v148 DEFAULT(1);
        IF COL_LENGTH('hoteleria_city_ledger_cuentas','numeroConvenioSnapshot') IS NULL
          ALTER TABLE hoteleria_city_ledger_cuentas ADD numeroConvenioSnapshot varchar(30) NULL;
        IF COL_LENGTH('hoteleria_city_ledger_cuentas','tipoConvenioSnapshot') IS NULL
          ALTER TABLE hoteleria_city_ledger_cuentas ADD tipoConvenioSnapshot varchar(20) NULL;
        IF COL_LENGTH('hoteleria_city_ledger_cuentas','limiteCreditoAplicado') IS NULL
          ALTER TABLE hoteleria_city_ledger_cuentas ADD limiteCreditoAplicado decimal(18,2) NOT NULL
            CONSTRAINT DF_city_cuenta_limite_aplicado_v148 DEFAULT(0);
        IF COL_LENGTH('hoteleria_city_ledger_cuentas','diasCreditoAplicados') IS NULL
          ALTER TABLE hoteleria_city_ledger_cuentas ADD diasCreditoAplicados int NOT NULL
            CONSTRAINT DF_city_cuenta_dias_aplicados_v148 DEFAULT(0);
        IF COL_LENGTH('hoteleria_city_ledger_cuentas','versionCreditoClienteAplicada') IS NULL
          ALTER TABLE hoteleria_city_ledger_cuentas ADD versionCreditoClienteAplicada int NOT NULL
            CONSTRAINT DF_city_cuenta_version_credito_v148 DEFAULT(1);

        IF OBJECT_ID('hoteleria_convenios_credito','U') IS NOT NULL
        BEGIN
          IF COL_LENGTH('hoteleria_convenios_credito','version') IS NULL
            ALTER TABLE hoteleria_convenios_credito ADD version int NOT NULL
              CONSTRAINT DF_hotel_convenio_version_v148 DEFAULT(1);

          UPDATE cuenta
             SET convenioVersion=COALESCE(convenio.version,1),
                 numeroConvenioSnapshot=COALESCE(cuenta.numeroConvenioSnapshot,convenio.numeroConvenio),
                 tipoConvenioSnapshot=COALESCE(cuenta.tipoConvenioSnapshot,convenio.tipo),
                 limiteCreditoAplicado=CASE
                   WHEN cuenta.limiteCreditoAplicado=0 THEN convenio.limiteCredito
                   ELSE cuenta.limiteCreditoAplicado END,
                 diasCreditoAplicados=CASE
                   WHEN cuenta.diasCreditoAplicados=0 THEN convenio.diasCredito
                   ELSE cuenta.diasCreditoAplicados END,
                 versionCreditoClienteAplicada=CASE
                   WHEN cuenta.versionCreditoClienteAplicada<=1
                     THEN COALESCE(convenio.versionCreditoCliente,1)
                   ELSE cuenta.versionCreditoClienteAplicada END
            FROM hoteleria_city_ledger_cuentas cuenta
            INNER JOIN hoteleria_convenios_credito convenio
              ON convenio.id=cuenta.convenioId
             AND convenio.empresaId=cuenta.empresaId;
        END

        IF NOT EXISTS (
          SELECT 1 FROM sys.indexes
           WHERE name='IX_city_cuenta_convenio_version_v148'
             AND object_id=OBJECT_ID('hoteleria_city_ledger_cuentas')
        )
          CREATE INDEX IX_city_cuenta_convenio_version_v148
            ON hoteleria_city_ledger_cuentas(empresaId,convenioId,convenioVersion);
      END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No se eliminan snapshots financieros para evitar pérdida de evidencia.
    await queryRunner.query(`
      IF EXISTS (
        SELECT 1 FROM sys.indexes
         WHERE name='IX_city_cuenta_convenio_version_v148'
           AND object_id=OBJECT_ID('hoteleria_city_ledger_cuentas')
      )
        DROP INDEX IX_city_cuenta_convenio_version_v148
          ON hoteleria_city_ledger_cuentas;
    `);
  }
}
