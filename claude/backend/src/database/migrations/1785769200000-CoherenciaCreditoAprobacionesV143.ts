import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Completa la persistencia necesaria para que Crédito de cliente y Convenio
 * hotelero utilicen una sola línea maestra, ciclos versionados y una auditoría
 * semántica de aprobación/rechazo/suspensión.
 */
export class CoherenciaCreditoAprobacionesV1431785769200000
  implements MigrationInterface
{
  name = 'CoherenciaCreditoAprobacionesV1431785769200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      IF OBJECT_ID('clientes','U') IS NOT NULL
      BEGIN
        IF COL_LENGTH('clientes','versionCredito') IS NULL
          ALTER TABLE clientes ADD versionCredito int NOT NULL
            CONSTRAINT DF_clientes_versionCredito DEFAULT 1;

        IF COL_LENGTH('clientes','creditoSolicitadoPorId') IS NULL
          ALTER TABLE clientes ADD creditoSolicitadoPorId uniqueidentifier NULL;

        IF COL_LENGTH('clientes','fechaSolicitudCredito') IS NULL
          ALTER TABLE clientes ADD fechaSolicitudCredito datetime2 NULL;

        IF COL_LENGTH('clientes','clasificacionHotelera') IS NULL
          ALTER TABLE clientes ADD clasificacionHotelera varchar(20) NULL;

        -- Sólo se infiere cuando todos los convenios históricos del cliente
        -- coinciden en un único tipo. Los casos ambiguos quedan para revisión.
        IF OBJECT_ID('hoteleria_convenios_credito','U') IS NOT NULL
          UPDATE c
             SET clasificacionHotelera=x.tipo
            FROM clientes c
            INNER JOIN (
              SELECT empresaId,clienteId,MIN(tipo) tipo
                FROM hoteleria_convenios_credito
               GROUP BY empresaId,clienteId
              HAVING MIN(tipo)=MAX(tipo)
            ) x ON x.empresaId=c.empresaId AND x.clienteId=c.id
           WHERE c.clasificacionHotelera IS NULL;

        UPDATE clientes SET versionCredito=1
         WHERE versionCredito IS NULL OR versionCredito < 1;

        IF NOT EXISTS (
          SELECT 1 FROM sys.check_constraints
           WHERE parent_object_id=OBJECT_ID('clientes')
             AND name='CK_clientes_clasificacion_hotelera_v143'
        )
          ALTER TABLE clientes WITH NOCHECK
            ADD CONSTRAINT CK_clientes_clasificacion_hotelera_v143
            CHECK (clasificacionHotelera IS NULL OR clasificacionHotelera IN ('EMPRESA','AGENCIA'));

        IF NOT EXISTS (
          SELECT 1 FROM sys.indexes
           WHERE object_id=OBJECT_ID('clientes')
             AND name='IX_clientes_empresa_credito_activo'
        )
          CREATE INDEX IX_clientes_empresa_credito_activo
            ON clientes(empresaId,estadoCredito,activo)
            INCLUDE(limiteCredito,diasCredito,versionCredito);
      END

      IF OBJECT_ID('aprobaciones_documentos','U') IS NOT NULL
      BEGIN
        IF COL_LENGTH('aprobaciones_documentos','documentoVersion') IS NULL
          ALTER TABLE aprobaciones_documentos ADD documentoVersion int NOT NULL
            CONSTRAINT DF_aprobaciones_documentos_documentoVersion DEFAULT 1;

        IF COL_LENGTH('aprobaciones_documentos','datosSolicitud') IS NULL
          ALTER TABLE aprobaciones_documentos ADD datosSolicitud nvarchar(max) NULL;

        UPDATE aprobaciones_documentos SET documentoVersion=1
         WHERE documentoVersion IS NULL OR documentoVersion < 1;
      END

      IF OBJECT_ID('hoteleria_convenios_credito','U') IS NOT NULL
      BEGIN
        IF COL_LENGTH('hoteleria_convenios_credito','versionCreditoCliente') IS NULL
          ALTER TABLE hoteleria_convenios_credito ADD versionCreditoCliente int NOT NULL
            CONSTRAINT DF_hotel_convenio_versionCreditoCliente DEFAULT 1;

        IF COL_LENGTH('hoteleria_convenios_credito','rechazadoPorId') IS NULL
          ALTER TABLE hoteleria_convenios_credito ADD rechazadoPorId uniqueidentifier NULL;
        IF COL_LENGTH('hoteleria_convenios_credito','fechaRechazo') IS NULL
          ALTER TABLE hoteleria_convenios_credito ADD fechaRechazo datetime2 NULL;
        IF COL_LENGTH('hoteleria_convenios_credito','canceladoPorId') IS NULL
          ALTER TABLE hoteleria_convenios_credito ADD canceladoPorId uniqueidentifier NULL;
        IF COL_LENGTH('hoteleria_convenios_credito','fechaCancelacion') IS NULL
          ALTER TABLE hoteleria_convenios_credito ADD fechaCancelacion datetime2 NULL;

        UPDATE hoteleria_convenios_credito SET versionCreditoCliente=1
         WHERE versionCreditoCliente IS NULL OR versionCreditoCliente < 1;

        IF NOT EXISTS (
          SELECT 1 FROM sys.indexes
           WHERE object_id=OBJECT_ID('hoteleria_convenios_credito')
             AND name='IX_hotel_convenio_cliente_estado'
        )
          CREATE INDEX IX_hotel_convenio_cliente_estado
            ON hoteleria_convenios_credito(empresaId,clienteId,estado,activo)
            INCLUDE(hotelId,versionCreditoCliente,vigenciaDesde,vigenciaHasta);

        IF NOT EXISTS (
          SELECT 1 FROM sys.check_constraints
           WHERE parent_object_id=OBJECT_ID('hoteleria_convenios_credito')
             AND name='CK_hotel_convenio_estado_v143'
        )
          ALTER TABLE hoteleria_convenios_credito WITH NOCHECK
            ADD CONSTRAINT CK_hotel_convenio_estado_v143
            CHECK (estado IN ('PENDIENTE','APROBADO','RECHAZADO','SUSPENDIDO','VENCIDO','CANCELADO'));
      END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      IF OBJECT_ID('hoteleria_convenios_credito','U') IS NOT NULL
      BEGIN
        IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID('hoteleria_convenios_credito') AND name='CK_hotel_convenio_estado_v143')
          ALTER TABLE hoteleria_convenios_credito DROP CONSTRAINT CK_hotel_convenio_estado_v143;
        IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('hoteleria_convenios_credito') AND name='IX_hotel_convenio_cliente_estado')
          DROP INDEX IX_hotel_convenio_cliente_estado ON hoteleria_convenios_credito;
      END
      IF OBJECT_ID('clientes','U') IS NOT NULL
      BEGIN
        IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID('clientes') AND name='CK_clientes_clasificacion_hotelera_v143')
          ALTER TABLE clientes DROP CONSTRAINT CK_clientes_clasificacion_hotelera_v143;
        IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('clientes') AND name='IX_clientes_empresa_credito_activo')
          DROP INDEX IX_clientes_empresa_credito_activo ON clientes;
      END
      -- No se eliminan columnas de auditoría en down para no destruir historia.
    `);
  }
}
