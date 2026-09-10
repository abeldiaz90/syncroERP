import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Refuerza el gobierno de Crédito de cliente y Convenios hoteleros:
 * - la política de vencidos vive en el cliente;
 * - la clasificación hotelera sólo pertenece a personas morales;
 * - los flujos financieros son globales, obligatorios y sin autoaprobación;
 * - una empresa no puede tener dos niveles activos con el mismo orden.
 *
 * Las restricciones se crean WITH NOCHECK para no reescribir historia de forma
 * silenciosa. El verificador V14.2 identifica registros heredados que deben
 * corregirse antes de habilitar crédito en producción.
 */
export class GobiernoCreditoFinanzasV1441785772800000
  implements MigrationInterface
{
  name = 'GobiernoCreditoFinanzasV1441785772800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      IF OBJECT_ID('clientes','U') IS NOT NULL
      BEGIN
        IF COL_LENGTH('clientes','bloquearCreditoConSaldoVencido') IS NULL
          ALTER TABLE clientes ADD bloquearCreditoConSaldoVencido bit NOT NULL
            CONSTRAINT DF_clientes_bloquearCreditoVencido DEFAULT 1;

        UPDATE clientes SET bloquearCreditoConSaldoVencido=1
         WHERE bloquearCreditoConSaldoVencido IS NULL;

        IF NOT EXISTS (
          SELECT 1 FROM sys.check_constraints
           WHERE parent_object_id=OBJECT_ID('clientes')
             AND name='CK_clientes_clasificacion_moral_v144'
        )
          ALTER TABLE clientes WITH NOCHECK
            ADD CONSTRAINT CK_clientes_clasificacion_moral_v144
            CHECK (
              clasificacionHotelera IS NULL OR
              (tipoPersona='MORAL' AND clasificacionHotelera IN ('EMPRESA','AGENCIA'))
            );
      END

      IF OBJECT_ID('hoteleria_convenios_credito','U') IS NOT NULL
         AND OBJECT_ID('clientes','U') IS NOT NULL
      BEGIN
        UPDATE h
           SET h.bloquearConSaldoVencido=c.bloquearCreditoConSaldoVencido,
               h.tipo=COALESCE(c.clasificacionHotelera,h.tipo),
               h.fechaActualizacion=SYSUTCDATETIME()
          FROM hoteleria_convenios_credito h
          INNER JOIN clientes c
             ON c.empresaId=h.empresaId AND c.id=h.clienteId
         WHERE h.estado IN ('PENDIENTE','APROBADO','SUSPENDIDO');
      END

      IF OBJECT_ID('configuraciones_aprobacion','U') IS NOT NULL
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM sys.check_constraints
           WHERE parent_object_id=OBJECT_ID('configuraciones_aprobacion')
             AND name='CK_config_aprobacion_financiera_global_v144'
        )
          ALTER TABLE configuraciones_aprobacion WITH NOCHECK
            ADD CONSTRAINT CK_config_aprobacion_financiera_global_v144
            CHECK (
              proceso NOT IN ('CREDITO_CLIENTE','HOTEL_CONVENIO') OR
              departamentoId IS NULL
            );

        IF NOT EXISTS (
          SELECT 1 FROM sys.check_constraints
           WHERE parent_object_id=OBJECT_ID('configuraciones_aprobacion')
             AND name='CK_config_aprobacion_financiera_control_v144'
        )
          ALTER TABLE configuraciones_aprobacion WITH NOCHECK
            ADD CONSTRAINT CK_config_aprobacion_financiera_control_v144
            CHECK (
              proceso NOT IN ('CREDITO_CLIENTE','HOTEL_CONVENIO') OR
              (obligatorio=1 AND permiteAutoaprobacion=0)
            );

        IF NOT EXISTS (
          SELECT 1 FROM sys.check_constraints
           WHERE parent_object_id=OBJECT_ID('configuraciones_aprobacion')
             AND name='CK_config_aprobacion_financiera_responsable_v144'
        )
          ALTER TABLE configuraciones_aprobacion WITH NOCHECK
            ADD CONSTRAINT CK_config_aprobacion_financiera_responsable_v144
            CHECK (
              proceso NOT IN ('CREDITO_CLIENTE','HOTEL_CONVENIO') OR
              ((usuarioId IS NOT NULL AND rolAprobador IS NULL) OR
               (usuarioId IS NULL AND rolAprobador IS NOT NULL))
            );

        /*
         * El predicado de un índice filtrado NO admite OR: la gramática de SQL
         * Server sólo permite condiciones simples unidas por AND. La versión
         * anterior usaba (proceso='A' OR proceso='B') y fallaba con «Incorrect
         * syntax near the keyword 'OR'», abortando esta migración y las cuatro
         * siguientes.
         *
         * IN sí está permitido y es semánticamente idéntico. Los OR de las tres
         * restricciones CHECK de arriba son válidos: la limitación aplica solo
         * a índices filtrados.
         */
        IF NOT EXISTS (
          SELECT 1 FROM sys.indexes
           WHERE object_id=OBJECT_ID('configuraciones_aprobacion')
             AND name='UX_config_aprobacion_financiera_nivel_activo_v144'
        )
        AND NOT EXISTS (
          SELECT 1
            FROM configuraciones_aprobacion
           WHERE activo=1
             AND proceso IN ('CREDITO_CLIENTE','HOTEL_CONVENIO')
           GROUP BY empresaId,proceso,orden
          HAVING COUNT_BIG(*)>1
        )
          CREATE UNIQUE INDEX UX_config_aprobacion_financiera_nivel_activo_v144
            ON configuraciones_aprobacion(empresaId,proceso,orden)
           WHERE activo=1
             AND departamentoId IS NULL
             AND proceso IN ('CREDITO_CLIENTE','HOTEL_CONVENIO');
      END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      IF OBJECT_ID('configuraciones_aprobacion','U') IS NOT NULL
      BEGIN
        IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('configuraciones_aprobacion') AND name='UX_config_aprobacion_financiera_nivel_activo_v144')
          DROP INDEX UX_config_aprobacion_financiera_nivel_activo_v144 ON configuraciones_aprobacion;
        IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID('configuraciones_aprobacion') AND name='CK_config_aprobacion_financiera_responsable_v144')
          ALTER TABLE configuraciones_aprobacion DROP CONSTRAINT CK_config_aprobacion_financiera_responsable_v144;
        IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID('configuraciones_aprobacion') AND name='CK_config_aprobacion_financiera_control_v144')
          ALTER TABLE configuraciones_aprobacion DROP CONSTRAINT CK_config_aprobacion_financiera_control_v144;
        IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID('configuraciones_aprobacion') AND name='CK_config_aprobacion_financiera_global_v144')
          ALTER TABLE configuraciones_aprobacion DROP CONSTRAINT CK_config_aprobacion_financiera_global_v144;
      END
      IF OBJECT_ID('clientes','U') IS NOT NULL
         AND EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID('clientes') AND name='CK_clientes_clasificacion_moral_v144')
        ALTER TABLE clientes DROP CONSTRAINT CK_clientes_clasificacion_moral_v144;
      -- La política maestra no se elimina para no destruir decisiones ya auditadas.
    `);
  }
}