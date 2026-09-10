import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Política de vencimientos por empresa: qué hace el ERP cuando una cuota cae
 * en día inhábil.
 *
 * La regla vive en el ERP y no en el registro externo porque hay empresas que
 * no lo usan, otras que sí y otras que usan los dos. Si viviera del lado del
 * proveedor, la fecha que firma el cliente dependería de la infraestructura
 * contratada —dos empresas con el mismo producto comercial darían tablas de
 * amortización distintas— y las empresas sin proveedor externo no tendrían la
 * regla en absoluto.
 *
 * Se crea apagada: materializar esta tabla no debe mover ni una fecha de las
 * empresas que ya están operando.
 *
 * Primera migración del directorio `postgres/`. El historial anterior es
 * T-SQL de la etapa SQL Server y queda fuera de este glob a propósito.
 */
export class PoliticaVencimientoEmpresa1788134400000
  implements MigrationInterface
{
  name = 'PoliticaVencimientoEmpresa1788134400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS politicas_vencimiento_empresa (
        id                 uuid        NOT NULL DEFAULT gen_random_uuid(),
        empresaid          uuid        NOT NULL,
        recorreradiahabil  boolean     NOT NULL DEFAULT false,
        sabadohabil        boolean     NOT NULL DEFAULT true,
        domingohabil       boolean     NOT NULL DEFAULT false,
        direccion          varchar(12) NOT NULL DEFAULT 'SIGUIENTE',
        fechacreacion      timestamptz NOT NULL DEFAULT now(),
        fechaactualizacion timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_politicas_vencimiento_empresa PRIMARY KEY (id),
        CONSTRAINT ck_politica_vencimiento_direccion
          CHECK (direccion IN ('SIGUIENTE', 'ANTERIOR'))
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_politica_vencimiento_empresa
        ON politicas_vencimiento_empresa (empresaid);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS uq_politica_vencimiento_empresa;`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS politicas_vencimiento_empresa;`,
    );
  }
}
