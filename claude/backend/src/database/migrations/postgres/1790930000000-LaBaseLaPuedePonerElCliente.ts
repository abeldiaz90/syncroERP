import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ============================================================================
 * La base del core la puede poner el cliente
 * ----------------------------------------------------------------------------
 * Hasta hoy había una sola respuesta a «dónde viven los datos bancarios de esta
 * empresa»: en la base que SUMA aprovisiona. El inquilino se creaba por
 * adelantado y el alta entregaba uno de la reserva.
 *
 * Hay clientes que no lo aceptan —una SOFOM con su propio reglamento de datos
 * quiere su base en su sala— y pagan distinto por ello. Esta tabla guarda esa
 * decisión por empresa, junto con la conexión cuando la pone el cliente.
 *
 * ADITIVA: una empresa sin fila aquí es una empresa de la nube de SUMA, igual
 * que todas las de hoy. Ningún camino existente pregunta por esta tabla.
 *
 * El ERP no cambia: sigue siendo multiempresa dentro de la suite, con una sola
 * base y los inquilinos separados por `empresaid`. Lo que se mueve es de dónde
 * lee y escribe FINERACT para esa empresa.
 * ============================================================================
 */
export class LaBaseLaPuedePonerElCliente1790930000000 implements MigrationInterface {
  name = 'LaBaseLaPuedePonerElCliente1790930000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS integracion_origen_core (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        empresaid uuid NOT NULL,
        origen varchar(20) NOT NULL DEFAULT 'SUMA',
        inquilino varchar(60) NULL,
        servidor varchar(200) NULL,
        puerto integer NULL,
        basedatos varchar(120) NULL,
        usuario varchar(120) NULL,
        secretocifrado text NULL,
        parametros varchar(500) NULL,
        estado varchar(30) NOT NULL DEFAULT 'DECLARADO',
        verificadoen timestamptz NULL,
        ultimoerror varchar(500) NULL,
        registradopor varchar(200) NULL,
        fechacreacion TIMESTAMP NOT NULL DEFAULT now(),
        fechaactualizacion TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT PK_integracion_origen_core PRIMARY KEY (id)
      )
    `);

    /*
     * Una empresa tiene UN origen. Dos filas significaría que el core podría
     * leer de dos sitios para el mismo cliente, que es la forma de que dos
     * empresas acaben viendo la cartera de la otra.
     */
    await q.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UX_origen_core_empresa"
        ON integracion_origen_core (empresaid)
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "UX_origen_core_empresa"`);
    await q.query(`DROP TABLE IF EXISTS integracion_origen_core`);
  }
}
