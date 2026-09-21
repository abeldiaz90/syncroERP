import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ============================================================================
 * Identificaciones del cliente
 * ----------------------------------------------------------------------------
 * Tabla nueva, nada que convertir. `rfc` y `curp` se quedan donde están: son
 * claves de identidad fiscal que medio sistema lee —CFDI, validación, búsqueda—
 * y hay una sola por persona. Esta tabla es para lo que sí es un documento:
 * tiene folio, puede vencer, y una persona puede tener varios.
 *
 * El índice único sobre (empresa, cliente, tipo, folio) impide capturar dos
 * veces la misma credencial. Sin él, un doble clic en ventanilla deja el
 * expediente con dos INE idénticas y el operador no sabe cuál borrar.
 * ============================================================================
 */
export class ClienteIdentificaciones1789900100000 implements MigrationInterface {
  name = 'ClienteIdentificaciones1789900100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS cliente_identificaciones (
        id                 uuid NOT NULL DEFAULT gen_random_uuid(),
        empresaid          uuid NOT NULL,
        clienteid          uuid NOT NULL,
        tipo               varchar(40)  NOT NULL,
        folio              varchar(100) NOT NULL,
        vigenciadesde      date,
        vigenciahasta      date,
        emisor             varchar(150),
        notas              varchar(300),
        activo             boolean NOT NULL DEFAULT true,
        fechacreacion      timestamptz NOT NULL DEFAULT now(),
        fechaactualizacion timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cliente_identificaciones" PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IX_cliente_identificaciones_cliente"
        ON cliente_identificaciones (empresaid, clienteid)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UX_cliente_identificaciones_folio"
        ON cliente_identificaciones (empresaid, clienteid, tipo, folio)
    `);

    await queryRunner.query(`
      ALTER TABLE cliente_identificaciones
        DROP CONSTRAINT IF EXISTS "CK_cliente_identificaciones_tipo"
    `);
    await queryRunner.query(`
      ALTER TABLE cliente_identificaciones
        ADD CONSTRAINT "CK_cliente_identificaciones_tipo"
        CHECK (tipo IN ('INE','PASAPORTE','CEDULA_PROFESIONAL','LICENCIA_CONDUCIR',
                        'COMPROBANTE_DOMICILIO','ACTA_CONSTITUTIVA','PODER_NOTARIAL','OTRO'))
    `);

    /*
     * Una vigencia que termina antes de empezar es un dedazo, y se detiene en la
     * base porque el expediente lo va a leer un proceso de cobranza que no tiene
     * forma de saber cuál de las dos fechas está mal.
     */
    await queryRunner.query(`
      ALTER TABLE cliente_identificaciones
        DROP CONSTRAINT IF EXISTS "CK_cliente_identificaciones_vigencia"
    `);
    await queryRunner.query(`
      ALTER TABLE cliente_identificaciones
        ADD CONSTRAINT "CK_cliente_identificaciones_vigencia"
        CHECK (vigenciadesde IS NULL OR vigenciahasta IS NULL OR vigenciahasta >= vigenciadesde)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS cliente_identificaciones`);
  }
}
