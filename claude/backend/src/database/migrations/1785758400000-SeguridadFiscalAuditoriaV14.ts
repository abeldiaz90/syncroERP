import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Refuerzo no destructivo de seguridad, fiscalidad y rendimiento.
 * Todos los cambios son condicionales para soportar bases v13 parcialmente creadas.
 */
export class SeguridadFiscalAuditoriaV141785758400000
  implements MigrationInterface
{
  name = 'SeguridadFiscalAuditoriaV141785758400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      IF OBJECT_ID('dbo.Usuarios','U') IS NOT NULL
      BEGIN
        IF COL_LENGTH('dbo.Usuarios','esPropietario') IS NULL
          ALTER TABLE dbo.Usuarios ADD esPropietario bit NOT NULL
            CONSTRAINT DF_Usuarios_esPropietario DEFAULT(0);
        IF COL_LENGTH('dbo.Usuarios','tokenVersion') IS NULL
          ALTER TABLE dbo.Usuarios ADD tokenVersion int NOT NULL
            CONSTRAINT DF_Usuarios_tokenVersion DEFAULT(0);

        ;WITH candidatos AS (
          SELECT id, empresaId,
                 ROW_NUMBER() OVER (
                   PARTITION BY empresaId
                   ORDER BY CASE
                     WHEN UPPER(REPLACE(REPLACE(rol,'-','_'),' ', '_'))
                       IN ('ADMIN','ADMINISTRADOR','SUPER_ADMIN','SUPERADMIN') THEN 0
                     ELSE 1 END,
                     id
                 ) AS rn
            FROM dbo.Usuarios
        )
        UPDATE u SET esPropietario=1
          FROM dbo.Usuarios u
          JOIN candidatos c ON c.id=u.id AND c.rn=1
         WHERE NOT EXISTS (
           SELECT 1 FROM dbo.Usuarios propietario
            WHERE propietario.empresaId=u.empresaId
              AND propietario.esPropietario=1
         );
      END;
    `);

    await queryRunner.query(`
      IF OBJECT_ID('dbo.configuraciones_fiscales','U') IS NOT NULL
         AND COL_LENGTH('dbo.configuraciones_fiscales','facturamaPassword') IS NOT NULL
        ALTER TABLE dbo.configuraciones_fiscales
          ALTER COLUMN facturamaPassword varchar(1000) NULL;
    `);

    await queryRunner.query(`
      IF OBJECT_ID('dbo.ventas','U') IS NOT NULL
         AND COL_LENGTH('dbo.ventas','cambio') IS NULL
        ALTER TABLE dbo.ventas ADD cambio decimal(12,4) NOT NULL
          CONSTRAINT DF_ventas_cambio DEFAULT(0);
    `);

    await queryRunner.query(`
      IF OBJECT_ID('dbo.facturas','U') IS NOT NULL
      BEGIN
        IF COL_LENGTH('dbo.facturas','tipoComprobante') IS NULL
          ALTER TABLE dbo.facturas ADD tipoComprobante char(1) NOT NULL
            CONSTRAINT DF_facturas_tipoComprobante DEFAULT('I');
        IF COL_LENGTH('dbo.facturas','cfdiRelacionadoId') IS NULL
          ALTER TABLE dbo.facturas ADD cfdiRelacionadoId uniqueidentifier NULL;
        IF COL_LENGTH('dbo.facturas','tipoRelacion') IS NULL
          ALTER TABLE dbo.facturas ADD tipoRelacion varchar(2) NULL;

        IF NOT EXISTS (
          SELECT 1 FROM sys.foreign_keys
           WHERE name='FK_facturas_cfdiRelacionado'
             AND parent_object_id=OBJECT_ID('dbo.facturas')
        )
          ALTER TABLE dbo.facturas WITH CHECK ADD CONSTRAINT FK_facturas_cfdiRelacionado
            FOREIGN KEY(cfdiRelacionadoId) REFERENCES dbo.facturas(id);

        IF NOT EXISTS (
          SELECT 1 FROM sys.indexes
           WHERE name='IX_facturas_empresa_tipo_estado'
             AND object_id=OBJECT_ID('dbo.facturas')
        )
          CREATE INDEX IX_facturas_empresa_tipo_estado
            ON dbo.facturas(empresaId,tipoComprobante,estado,fechaCreacion);
      END;
    `);

    await queryRunner.query(`
      IF OBJECT_ID('dbo.pagos_cobranza','U') IS NOT NULL
      BEGIN
        IF COL_LENGTH('dbo.pagos_cobranza','complementoPagoId') IS NULL
          ALTER TABLE dbo.pagos_cobranza ADD complementoPagoId uniqueidentifier NULL;
        IF COL_LENGTH('dbo.pagos_cobranza','estadoFiscal') IS NULL
          ALTER TABLE dbo.pagos_cobranza ADD estadoFiscal varchar(30) NOT NULL
            CONSTRAINT DF_pagos_cobranza_estadoFiscal DEFAULT('NO_REQUERIDO');
        IF COL_LENGTH('dbo.pagos_cobranza','ultimoErrorFiscal') IS NULL
          ALTER TABLE dbo.pagos_cobranza ADD ultimoErrorFiscal nvarchar(2000) NULL;

        IF NOT EXISTS (
          SELECT 1 FROM sys.foreign_keys
           WHERE name='FK_pagos_cobranza_complementoPago'
             AND parent_object_id=OBJECT_ID('dbo.pagos_cobranza')
        )
          ALTER TABLE dbo.pagos_cobranza WITH CHECK
            ADD CONSTRAINT FK_pagos_cobranza_complementoPago
            FOREIGN KEY(complementoPagoId) REFERENCES dbo.facturas(id);

        IF NOT EXISTS (
          SELECT 1 FROM sys.indexes
           WHERE name='IX_pagos_cobranza_estadoFiscal'
             AND object_id=OBJECT_ID('dbo.pagos_cobranza')
        )
          CREATE INDEX IX_pagos_cobranza_estadoFiscal
            ON dbo.pagos_cobranza(empresaId,estadoFiscal,fechaPago);

        UPDATE pc
           SET estadoFiscal='PENDIENTE_REP', ultimoErrorFiscal=NULL
          FROM dbo.pagos_cobranza pc
          JOIN dbo.creditos_clientes cc
            ON cc.id=pc.creditoId AND cc.empresaId=pc.empresaId
          JOIN dbo.facturas f
            ON f.ventaId=cc.ventaId AND f.empresaId=pc.empresaId
           AND f.tipoComprobante='I' AND f.metodoPago='PPD'
         WHERE pc.complementoPagoId IS NULL
           AND pc.montoCapital>0
           AND pc.estadoFiscal='NO_REQUERIDO';
      END;
    `);

    await queryRunner.query(`
      IF OBJECT_ID('dbo.registros_auditoria','U') IS NOT NULL
      BEGIN
        IF COL_LENGTH('dbo.registros_auditoria','hashAnterior') IS NULL
          ALTER TABLE dbo.registros_auditoria ADD hashAnterior char(64) NULL;
        IF COL_LENGTH('dbo.registros_auditoria','hashRegistro') IS NULL
          ALTER TABLE dbo.registros_auditoria ADD hashRegistro char(64) NULL;
        IF NOT EXISTS (
          SELECT 1 FROM sys.indexes
           WHERE name='IX_registros_auditoria_hashRegistro'
             AND object_id=OBJECT_ID('dbo.registros_auditoria')
        )
          CREATE INDEX IX_registros_auditoria_hashRegistro
            ON dbo.registros_auditoria(hashRegistro)
            WHERE hashRegistro IS NOT NULL;
      END;
    `);

    await queryRunner.query(`
      IF OBJECT_ID('dbo.registros_auditoria','U') IS NOT NULL
        EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_registros_auditoria_append_only
          ON dbo.registros_auditoria
          INSTEAD OF UPDATE, DELETE
          AS
          BEGIN
            SET NOCOUNT ON;
            THROW 51001, ''La bitácora de auditoría es append-only: UPDATE y DELETE están prohibidos.'', 1;
          END;');
    `);

    const tablasEmpresa = [
      'Usuarios',
      'productos',
      'clientes',
      'proveedores',
      'categorias',
      'marcas',
      'impuestos',
      'listas_precio',
      'unidades_medida',
      'ordenes_compra',
      'requisiciones',
      'departamentos',
      'configuraciones_fiscales',
      'hoteles',
      'hoteleria_convenios_credito',
      'folios',
      'reservaciones',
      'tareas_housekeeping',
      'habitaciones',
      'tipos_habitacion',
      'dotaciones_tipo_habitacion',
    ];
    for (const tabla of tablasEmpresa) {
      const indice = `IX_${tabla}_empresaId`.replace(/[^a-zA-Z0-9_]/g, '_');
      await queryRunner.query(`
        IF OBJECT_ID('dbo.${tabla}','U') IS NOT NULL
           AND COL_LENGTH('dbo.${tabla}','empresaId') IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM sys.indexes
              WHERE name='${indice}' AND object_id=OBJECT_ID('dbo.${tabla}')
           )
          CREATE INDEX ${indice} ON dbo.${tabla}(empresaId);
      `);
    }

    /*
     * La columna se llama `endpoint_id` en la base, NO `endpointId`:
     *
     *   @Column({ name: 'endpoint_id', type: 'uuid' })
     *   endpointId: string;
     *
     * La versión anterior usaba el nombre de la propiedad de TypeScript y
     * fallaba con «Column name 'endpointId' does not exist», abortando TODA la
     * migración —y con ella las ocho siguientes, incluida la que normaliza las
     * líneas de crédito atrapadas en EN_REVISION—.
     *
     * Se añaden además las guardas por columna que sí usa el resto de este
     * archivo: comprobar que la tabla existe no basta si el esquema viene de
     * una versión anterior con otros nombres.
     */
    await queryRunner.query(`
      IF OBJECT_ID('dbo.rol_endpoint_permisos','U') IS NOT NULL
         AND COL_LENGTH('dbo.rol_endpoint_permisos','empresaId') IS NOT NULL
         AND COL_LENGTH('dbo.rol_endpoint_permisos','rol') IS NOT NULL
         AND COL_LENGTH('dbo.rol_endpoint_permisos','endpoint_id') IS NOT NULL
         AND COL_LENGTH('dbo.rol_endpoint_permisos','permitido') IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM sys.indexes
            WHERE name='IX_rol_endpoint_permisos_lookup'
              AND object_id=OBJECT_ID('dbo.rol_endpoint_permisos')
         )
        CREATE INDEX IX_rol_endpoint_permisos_lookup
          ON dbo.rol_endpoint_permisos(empresaId,rol,endpoint_id,permitido);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      IF OBJECT_ID('dbo.TR_registros_auditoria_append_only','TR') IS NOT NULL
        DROP TRIGGER dbo.TR_registros_auditoria_append_only;
    `);
    // No se eliminan columnas ni índices automáticamente: contienen evidencia
    // fiscal y de seguridad que no debe destruirse durante un rollback.
  }
}