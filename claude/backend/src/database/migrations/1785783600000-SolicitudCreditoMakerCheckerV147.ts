import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Separa la línea de crédito vigente de la propuesta sometida a aprobación.
 * Una edición ya no reemplaza las condiciones autorizadas antes de que el
 * último nivel apruebe; así un rechazo no destruye la política vigente.
 */
export class SolicitudCreditoMakerCheckerV1471785783600000
  implements MigrationInterface
{
  name = 'SolicitudCreditoMakerCheckerV1471785783600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      IF OBJECT_ID('clientes','U') IS NOT NULL
      BEGIN
        IF COL_LENGTH('clientes','estadoSolicitudCredito') IS NULL
          ALTER TABLE clientes ADD estadoSolicitudCredito varchar(20) NOT NULL
            CONSTRAINT DF_clientes_estadoSolicitudCredito_v147 DEFAULT 'NINGUNA';

        IF COL_LENGTH('clientes','limiteCreditoSolicitado') IS NULL
          ALTER TABLE clientes ADD limiteCreditoSolicitado decimal(10,2) NULL;

        IF COL_LENGTH('clientes','diasCreditoSolicitados') IS NULL
          ALTER TABLE clientes ADD diasCreditoSolicitados int NULL;

        IF COL_LENGTH('clientes','nivelRiesgoSolicitado') IS NULL
          ALTER TABLE clientes ADD nivelRiesgoSolicitado varchar(20) NULL;

        IF COL_LENGTH('clientes','bloquearCreditoConSaldoVencidoSolicitado') IS NULL
          ALTER TABLE clientes ADD bloquearCreditoConSaldoVencidoSolicitado bit NULL;

        IF COL_LENGTH('clientes','clasificacionHoteleraSolicitada') IS NULL
          ALTER TABLE clientes ADD clasificacionHoteleraSolicitada varchar(20) NULL;

        IF COL_LENGTH('clientes','versionSolicitudCredito') IS NULL
          ALTER TABLE clientes ADD versionSolicitudCredito int NOT NULL
            CONSTRAINT DF_clientes_versionSolicitudCredito_v147 DEFAULT 0;

        -- Ciclos heredados: las condiciones que antes estaban sobre la línea
        -- maestra se conservan como propuesta para que puedan resolverse.
        UPDATE clientes
           SET estadoSolicitudCredito =
                 CASE WHEN estadoCredito='EN_REVISION' THEN 'PENDIENTE'
                      WHEN estadoCredito='RECHAZADO' THEN 'RECHAZADA'
                      ELSE estadoSolicitudCredito END,
               limiteCreditoSolicitado =
                 CASE WHEN estadoCredito IN ('EN_REVISION','RECHAZADO')
                      THEN limiteCredito ELSE limiteCreditoSolicitado END,
               diasCreditoSolicitados =
                 CASE WHEN estadoCredito IN ('EN_REVISION','RECHAZADO')
                      THEN diasCredito ELSE diasCreditoSolicitados END,
               nivelRiesgoSolicitado =
                 CASE WHEN estadoCredito IN ('EN_REVISION','RECHAZADO')
                      THEN nivelRiesgo ELSE nivelRiesgoSolicitado END,
               bloquearCreditoConSaldoVencidoSolicitado =
                 CASE WHEN estadoCredito IN ('EN_REVISION','RECHAZADO')
                      THEN bloquearCreditoConSaldoVencido
                      ELSE bloquearCreditoConSaldoVencidoSolicitado END,
               clasificacionHoteleraSolicitada =
                 CASE WHEN estadoCredito IN ('EN_REVISION','RECHAZADO')
                      THEN clasificacionHotelera
                      ELSE clasificacionHoteleraSolicitada END,
               versionSolicitudCredito =
                 CASE WHEN estadoCredito IN ('EN_REVISION','RECHAZADO')
                      THEN CASE WHEN versionCredito>0 THEN versionCredito ELSE 1 END
                      ELSE versionSolicitudCredito END
         WHERE estadoCredito IN ('EN_REVISION','RECHAZADO');

        IF NOT EXISTS (
          SELECT 1 FROM sys.check_constraints
           WHERE parent_object_id=OBJECT_ID('clientes')
             AND name='CK_clientes_estado_solicitud_credito_v147'
        )
          ALTER TABLE clientes WITH CHECK
            ADD CONSTRAINT CK_clientes_estado_solicitud_credito_v147
            CHECK (estadoSolicitudCredito IN ('NINGUNA','PENDIENTE','APROBADA','RECHAZADA','CANCELADA'));

        IF NOT EXISTS (
          SELECT 1 FROM sys.check_constraints
           WHERE parent_object_id=OBJECT_ID('clientes')
             AND name='CK_clientes_solicitud_credito_pareja_v147'
        )
          ALTER TABLE clientes WITH CHECK
            ADD CONSTRAINT CK_clientes_solicitud_credito_pareja_v147
            CHECK (
              estadoSolicitudCredito<>'PENDIENTE' OR
              (limiteCreditoSolicitado>0 AND diasCreditoSolicitados>0 AND versionSolicitudCredito>0)
            );

        IF NOT EXISTS (
          SELECT 1 FROM sys.check_constraints
           WHERE parent_object_id=OBJECT_ID('clientes')
             AND name='CK_clientes_clasificacion_solicitada_v147'
        )
          ALTER TABLE clientes WITH CHECK
            ADD CONSTRAINT CK_clientes_clasificacion_solicitada_v147
            CHECK (
              clasificacionHoteleraSolicitada IS NULL OR
              (tipoPersona='MORAL' AND clasificacionHoteleraSolicitada IN ('EMPRESA','AGENCIA'))
            );

        IF NOT EXISTS (
          SELECT 1 FROM sys.indexes
           WHERE object_id=OBJECT_ID('clientes')
             AND name='IX_clientes_empresa_solicitud_credito_v147'
        )
          CREATE INDEX IX_clientes_empresa_solicitud_credito_v147
            ON clientes(empresaId,estadoSolicitudCredito,activo)
            INCLUDE(versionSolicitudCredito,limiteCreditoSolicitado,diasCreditoSolicitados);
      END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      IF OBJECT_ID('clientes','U') IS NOT NULL
      BEGIN
        IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('clientes') AND name='IX_clientes_empresa_solicitud_credito_v147')
          DROP INDEX IX_clientes_empresa_solicitud_credito_v147 ON clientes;
        IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID('clientes') AND name='CK_clientes_clasificacion_solicitada_v147')
          ALTER TABLE clientes DROP CONSTRAINT CK_clientes_clasificacion_solicitada_v147;
        IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID('clientes') AND name='CK_clientes_solicitud_credito_pareja_v147')
          ALTER TABLE clientes DROP CONSTRAINT CK_clientes_solicitud_credito_pareja_v147;
        IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID('clientes') AND name='CK_clientes_estado_solicitud_credito_v147')
          ALTER TABLE clientes DROP CONSTRAINT CK_clientes_estado_solicitud_credito_v147;
        -- Las columnas no se eliminan para no perder propuestas ni trazabilidad.
      END
    `);
  }
}
