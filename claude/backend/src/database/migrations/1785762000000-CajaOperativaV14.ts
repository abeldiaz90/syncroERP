import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crea la operación formal de caja: apertura, turno, movimientos, corte y
 * arqueo. La migración es aditiva y no elimina información al revertirse.
 */
export class CajaOperativaV141785762000000 implements MigrationInterface {
  name = 'CajaOperativaV141785762000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      IF OBJECT_ID('dbo.caja_turnos','U') IS NULL
      BEGIN
        CREATE TABLE dbo.caja_turnos (
          id uniqueidentifier NOT NULL
            CONSTRAINT DF_caja_turnos_id DEFAULT NEWSEQUENTIALID(),
          empresaId uniqueidentifier NOT NULL,
          cuentaCajaId uniqueidentifier NOT NULL,
          usuarioAperturaId uniqueidentifier NOT NULL,
          usuarioCierreId uniqueidentifier NULL,
          estado varchar(20) NOT NULL
            CONSTRAINT DF_caja_turnos_estado DEFAULT('ABIERTO'),
          fondoInicial decimal(18,2) NOT NULL
            CONSTRAINT DF_caja_turnos_fondo DEFAULT(0),
          totalEntradas decimal(18,2) NOT NULL
            CONSTRAINT DF_caja_turnos_entradas DEFAULT(0),
          totalSalidas decimal(18,2) NOT NULL
            CONSTRAINT DF_caja_turnos_salidas DEFAULT(0),
          efectivoEsperado decimal(18,2) NOT NULL
            CONSTRAINT DF_caja_turnos_esperado DEFAULT(0),
          efectivoContado decimal(18,2) NULL,
          diferencia decimal(18,2) NULL,
          observacionesApertura nvarchar(500) NULL,
          observacionesCierre nvarchar(500) NULL,
          fechaApertura datetime2 NOT NULL
            CONSTRAINT DF_caja_turnos_apertura DEFAULT SYSUTCDATETIME(),
          fechaCierre datetime2 NULL,
          CONSTRAINT PK_caja_turnos PRIMARY KEY (id),
          CONSTRAINT CK_caja_turnos_estado
            CHECK (estado IN ('ABIERTO','CERRADO')),
          CONSTRAINT CK_caja_turnos_importes
            CHECK (
              fondoInicial >= 0 AND totalEntradas >= 0 AND totalSalidas >= 0
              AND efectivoEsperado >= 0
            )
        );
      END;

      IF OBJECT_ID('dbo.cuentas_bancarias','U') IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM sys.foreign_keys
            WHERE name='FK_caja_turnos_cuenta'
              AND parent_object_id=OBJECT_ID('dbo.caja_turnos')
         )
        ALTER TABLE dbo.caja_turnos WITH CHECK
          ADD CONSTRAINT FK_caja_turnos_cuenta
          FOREIGN KEY(cuentaCajaId) REFERENCES dbo.cuentas_bancarias(id);

      IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
         WHERE name='IX_caja_turnos_empresa_estado'
           AND object_id=OBJECT_ID('dbo.caja_turnos')
      )
        CREATE INDEX IX_caja_turnos_empresa_estado
          ON dbo.caja_turnos(empresaId,estado,fechaApertura);

      IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
         WHERE name='UX_caja_turnos_cuenta_abierta'
           AND object_id=OBJECT_ID('dbo.caja_turnos')
      )
        CREATE UNIQUE INDEX UX_caja_turnos_cuenta_abierta
          ON dbo.caja_turnos(empresaId,cuentaCajaId)
          WHERE estado='ABIERTO';
    `);

    await queryRunner.query(`
      IF OBJECT_ID('dbo.caja_movimientos','U') IS NULL
      BEGIN
        CREATE TABLE dbo.caja_movimientos (
          id uniqueidentifier NOT NULL
            CONSTRAINT DF_caja_movimientos_id DEFAULT NEWSEQUENTIALID(),
          empresaId uniqueidentifier NOT NULL,
          turnoCajaId uniqueidentifier NOT NULL,
          cuentaCajaId uniqueidentifier NOT NULL,
          naturaleza varchar(20) NOT NULL,
          tipo varchar(30) NOT NULL,
          importe decimal(18,2) NOT NULL,
          concepto nvarchar(300) NOT NULL,
          referencia nvarchar(120) NULL,
          documentoId uniqueidentifier NULL,
          tipoDocumento varchar(40) NULL,
          usuarioId uniqueidentifier NULL,
          fechaCreacion datetime2 NOT NULL
            CONSTRAINT DF_caja_movimientos_fecha DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_caja_movimientos PRIMARY KEY (id),
          CONSTRAINT FK_caja_movimientos_turno
            FOREIGN KEY(turnoCajaId) REFERENCES dbo.caja_turnos(id),
          CONSTRAINT CK_caja_movimientos_naturaleza
            CHECK (naturaleza IN ('ENTRADA','SALIDA')),
          CONSTRAINT CK_caja_movimientos_importe CHECK (importe > 0)
        );
      END;

      IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
         WHERE name='IX_caja_movimientos_turno_fecha'
           AND object_id=OBJECT_ID('dbo.caja_movimientos')
      )
        CREATE INDEX IX_caja_movimientos_turno_fecha
          ON dbo.caja_movimientos(turnoCajaId,fechaCreacion);

      IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
         WHERE name='IX_caja_movimientos_empresa_documento'
           AND object_id=OBJECT_ID('dbo.caja_movimientos')
      )
        CREATE INDEX IX_caja_movimientos_empresa_documento
          ON dbo.caja_movimientos(empresaId,documentoId);

      IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
         WHERE name='UX_caja_movimientos_turno_tipo_documento'
           AND object_id=OBJECT_ID('dbo.caja_movimientos')
      )
        CREATE UNIQUE INDEX UX_caja_movimientos_turno_tipo_documento
          ON dbo.caja_movimientos(turnoCajaId,tipo,documentoId)
          WHERE documentoId IS NOT NULL;
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No se elimina información de caja automáticamente: es evidencia
    // financiera y de arqueo que debe conservarse aun ante rollback.
  }
}
