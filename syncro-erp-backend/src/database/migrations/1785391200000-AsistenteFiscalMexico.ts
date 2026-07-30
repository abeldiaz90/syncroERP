import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Datos mínimos para el asistente fiscal mexicano y clasificación correcta
 * de IVA tasa cero, exento y no objeto. No asigna un régimen automáticamente.
 */
export class AsistenteFiscalMexico1785391200000
  implements MigrationInterface
{
  name = 'AsistenteFiscalMexico1785391200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      IF COL_LENGTH('Empresas', 'tipoPersonaFiscal') IS NULL
        ALTER TABLE Empresas ADD tipoPersonaFiscal varchar(10) NULL;
      IF COL_LENGTH('Empresas', 'perfilImpuestos') IS NULL
        ALTER TABLE Empresas ADD perfilImpuestos varchar(20) NULL;

      IF COL_LENGTH('impuestos', 'claveImpuestoSAT') IS NULL
        ALTER TABLE impuestos
          ADD claveImpuestoSAT varchar(3) NOT NULL
          CONSTRAINT DF_impuestos_claveImpuestoSAT DEFAULT '002';
      IF COL_LENGTH('impuestos', 'tipoFactor') IS NULL
        ALTER TABLE impuestos
          ADD tipoFactor varchar(12) NOT NULL
          CONSTRAINT DF_impuestos_tipoFactor DEFAULT 'TASA';
      IF COL_LENGTH('impuestos', 'objetoImpuesto') IS NULL
        ALTER TABLE impuestos
          ADD objetoImpuesto varchar(2) NOT NULL
          CONSTRAINT DF_impuestos_objetoImpuesto DEFAULT '02';

      UPDATE impuestos
      SET claveImpuestoSAT = '002',
          tipoFactor = CASE
            WHEN LOWER(nombre) LIKE '%no objeto%' THEN 'NO_OBJETO'
            WHEN LOWER(nombre) LIKE '%exento%' THEN 'EXENTO'
            ELSE 'TASA'
          END,
          objetoImpuesto = CASE
            WHEN LOWER(nombre) LIKE '%no objeto%' THEN '01'
            ELSE '02'
          END
      WHERE LOWER(nombre) LIKE '%iva%'
         OR LOWER(nombre) LIKE '%exento%'
         OR LOWER(nombre) LIKE '%no objeto%';

      IF COL_LENGTH('configuraciones_fiscales', 'facturamaUser') IS NOT NULL
        ALTER TABLE configuraciones_fiscales
          ALTER COLUMN facturamaUser varchar(100) NULL;
      IF COL_LENGTH('configuraciones_fiscales', 'facturamaPassword') IS NOT NULL
        ALTER TABLE configuraciones_fiscales
          ALTER COLUMN facturamaPassword varchar(200) NULL;
    `);
  }

  public async down(): Promise<void> {
    // Intencionalmente no destructiva: estos campos pueden contener
    // configuración fiscal capturada después de aplicar la migración.
  }
}
