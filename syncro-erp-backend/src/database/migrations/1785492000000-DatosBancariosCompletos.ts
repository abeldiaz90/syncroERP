import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Separa la institución financiera de la cuenta bancaria real:
 * - bancos.clave: prefijo institucional de tres dígitos;
 * - cuentas_bancarias.clabe: CLABE completa de 18 dígitos.
 */
export class DatosBancariosCompletos1785492000000
  implements MigrationInterface
{
  name = 'DatosBancariosCompletos1785492000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      IF OBJECT_ID('cuentas_bancarias', 'U') IS NOT NULL
      BEGIN
        IF COL_LENGTH('cuentas_bancarias', 'bancoId') IS NULL
          ALTER TABLE cuentas_bancarias ADD bancoId uniqueidentifier NULL;

        IF COL_LENGTH('cuentas_bancarias', 'clabe') IS NULL
          ALTER TABLE cuentas_bancarias ADD clabe varchar(18) NULL;

        IF NOT EXISTS (
          SELECT 1 FROM sys.indexes
          WHERE object_id = OBJECT_ID('cuentas_bancarias')
            AND name = 'UX_cuentas_bancarias_empresa_clabe'
        )
          CREATE UNIQUE INDEX UX_cuentas_bancarias_empresa_clabe
            ON cuentas_bancarias(empresaId, clabe)
            WHERE clabe IS NOT NULL;

        IF OBJECT_ID('bancos', 'U') IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM sys.foreign_key_columns fkc
            INNER JOIN sys.columns pc
              ON pc.object_id = fkc.parent_object_id
              AND pc.column_id = fkc.parent_column_id
            WHERE fkc.parent_object_id = OBJECT_ID('cuentas_bancarias')
              AND fkc.referenced_object_id = OBJECT_ID('bancos')
              AND pc.name = 'bancoId'
          )
          ALTER TABLE cuentas_bancarias
            ADD CONSTRAINT FK_cuentas_bancarias_banco
            FOREIGN KEY (bancoId) REFERENCES bancos(id);
      END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Migración deliberadamente conservadora: no elimina datos bancarios.
    await queryRunner.query(`
      IF OBJECT_ID('cuentas_bancarias', 'U') IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM sys.indexes
          WHERE object_id = OBJECT_ID('cuentas_bancarias')
            AND name = 'UX_cuentas_bancarias_empresa_clabe'
        )
        DROP INDEX UX_cuentas_bancarias_empresa_clabe
          ON cuentas_bancarias;
    `);
  }
}
