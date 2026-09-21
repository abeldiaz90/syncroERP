import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ============================================================================
 * La identidad de cada empresa, como dato
 * ----------------------------------------------------------------------------
 * Tabla nueva, nada que convertir: es aditiva a propósito. Una instalación sin
 * filas aquí se comporta exactamente como antes, leyendo la identidad de las
 * variables de entorno. La primera fila aparece cuando la consola de SUMA
 * aprovisiona una empresa con su propio realm.
 *
 * Los dos índices únicos no son adorno:
 *
 *  · `empresaId` único: una empresa, una identidad. Dos filas para la misma
 *    empresa dejarían el resultado a merced de cuál devuelva la base primero.
 *  · `emisor` único: dos empresas con el mismo emisor significaría que los
 *    tokens de una valen para la otra. Es justo el agujero que esta tabla
 *    existe para cerrar, y la base lo impide en vez de confiar en que el código
 *    se acuerde.
 *
 * Los secretos van en `text` porque lo que se guarda es el sobre cifrado
 * `v1:iv:etiqueta:cifrado`, no el secreto. Ver `SecretosService`.
 * ============================================================================
 */
export class EmpresaIdentidad1789700000000 implements MigrationInterface {
  name = 'EmpresaIdentidad1789700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS empresa_identidad (
        id                       uuid NOT NULL DEFAULT gen_random_uuid(),
        "empresaId"              uuid NOT NULL,
        emisor                   varchar(300) NOT NULL,
        realm                    varchar(100) NOT NULL,
        "clientIdPublico"        varchar(100) NOT NULL,
        "clientIdServicio"       varchar(100),
        "secretoServicio"        text,
        "clientIdProvisionador"  varchar(100),
        "secretoProvisionador"   text,
        "dominiosPermitidos"     varchar(300),
        estado                   varchar(20) NOT NULL DEFAULT 'APROVISIONANDO',
        "aprovisionadoPor"       varchar(150),
        "fechaCreacion"          timestamptz NOT NULL DEFAULT now(),
        "fechaActualizacion"     timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_empresa_identidad" PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_empresa_identidad_empresa"
        ON empresa_identidad ("empresaId")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_empresa_identidad_emisor"
        ON empresa_identidad (emisor)
    `);

    /*
     * El estado se restringe en la base y no solo en el código: una fila con un
     * estado inventado se trataría como «no activa» y la empresa quedaría en
     * silencio con la identidad del entorno, que es el tipo de fallo que no se
     * nota hasta que alguien no puede entrar.
     */
    await queryRunner.query(`
      ALTER TABLE empresa_identidad
        ADD CONSTRAINT "CK_empresa_identidad_estado"
        CHECK (estado IN ('APROVISIONANDO', 'ACTIVA', 'SUSPENDIDA'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS empresa_identidad`);
  }
}
