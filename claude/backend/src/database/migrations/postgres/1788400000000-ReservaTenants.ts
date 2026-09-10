import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reserva de inquilinos del registro externo.
 *
 * Fineract sólo crea el esquema de un inquilino nuevo AL ARRANCAR
 * (`TenantDatabaseUpgradeService.afterPropertiesSet`). Atar el alta de una
 * empresa a eso significaría reiniciar el core cada vez que entra un cliente
 * —con diez empresas operando, impensable—.
 *
 * La reserva rompe esa atadura: se crean inquilinos vacíos por lote, en una
 * ventana de mantenimiento, y el alta toma uno ya listo. Un inquilino sin usar
 * es una base vacía: no cuesta nada hasta que alguien opera en ella.
 *
 * Sólo la consumen las empresas que contratan el registro externo. Las que van
 * únicamente con el ERP no tocan esta tabla.
 */
export class ReservaTenants1788400000000 implements MigrationInterface {
  name = 'ReservaTenants1788400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS integracion_tenants_reserva (
        id                 uuid        NOT NULL DEFAULT gen_random_uuid(),
        proveedor          varchar(40) NOT NULL DEFAULT 'fineract',
        identificador      varchar(60) NOT NULL,
        estado             varchar(20) NOT NULL DEFAULT 'DISPONIBLE',
        empresaid          uuid,
        asignadoen         timestamptz,
        asignadopor        uuid,
        -- Por qué se retiró de la reserva, cuando aplica. Un inquilino que
        -- falló al crearse no debe volver a ofrecerse en silencio.
        nota               varchar(500),
        fechacreacion      timestamptz NOT NULL DEFAULT now(),
        fechaactualizacion timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_tenants_reserva PRIMARY KEY (id),
        CONSTRAINT ck_tenant_reserva_estado
          CHECK (estado IN ('DISPONIBLE', 'ASIGNADO', 'RETIRADO')),
        /*
         * Un inquilino asignado SIEMPRE tiene empresa, y uno disponible nunca.
         * Es la regla que impide el peor error posible aquí: entregar a dos
         * empresas el mismo inquilino, que las dejaría viendo la cartera de la
         * otra sin que nada fallara.
         */
        CONSTRAINT ck_tenant_reserva_coherencia
          CHECK ((estado = 'ASIGNADO' AND empresaid IS NOT NULL)
              OR (estado <> 'ASIGNADO' AND empresaid IS NULL))
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_tenant_reserva_identificador
        ON integracion_tenants_reserva (proveedor, identificador);
    `);

    /*
     * Una empresa no puede tener dos inquilinos, y un inquilino no puede
     * servir a dos empresas. El índice parcial lo garantiza en la base, no en
     * el código: es la única forma de que una carrera entre dos altas
     * simultáneas no produzca un cruce.
     */
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_tenant_reserva_empresa
        ON integracion_tenants_reserva (proveedor, empresaid)
        WHERE empresaid IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS ux_tenant_reserva_empresa;`);
    await queryRunner.query(`DROP INDEX IF EXISTS ux_tenant_reserva_identificador;`);
    await queryRunner.query(`DROP TABLE IF EXISTS integracion_tenants_reserva;`);
  }
}
