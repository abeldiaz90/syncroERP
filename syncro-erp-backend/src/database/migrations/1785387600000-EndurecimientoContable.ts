import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Garantías contables que deben vivir en SQL Server, no sólo en TypeScript.
 *
 * - Una operación no puede producir dos pólizas con la misma clave.
 * - Dos solicitudes concurrentes no pueden compartir folio.
 * - Una operación sólo puede tener una fila de recuperación contable.
 * - Las cuentas globales se resuelven por rol, no por numeración.
 */
export class EndurecimientoContable1785387600000 implements MigrationInterface {
  name = 'EndurecimientoContable1785387600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      IF COL_LENGTH('cuentas_contables', 'rolSistema') IS NULL
        ALTER TABLE cuentas_contables ADD rolSistema varchar(40) NULL;

      UPDATE cuentas_contables SET rolSistema = 'CAJA'
        WHERE numeroCuenta = '110-01' AND rolSistema IS NULL;
      UPDATE cuentas_contables SET rolSistema = 'IVA_ACREDITABLE'
        WHERE numeroCuenta = '116-01' AND rolSistema IS NULL;
      UPDATE cuentas_contables SET rolSistema = 'INVENTARIO'
        WHERE numeroCuenta = '130-01' AND rolSistema IS NULL;
      UPDATE cuentas_contables SET rolSistema = 'CLIENTES_CXC'
        WHERE numeroCuenta = '140-01' AND rolSistema IS NULL;
      UPDATE cuentas_contables SET rolSistema = 'IVA_TRASLADADO'
        WHERE numeroCuenta = '208-01' AND rolSistema IS NULL;
      UPDATE cuentas_contables SET rolSistema = 'PROVEEDORES'
        WHERE numeroCuenta = '210-01' AND rolSistema IS NULL;
      UPDATE cuentas_contables SET rolSistema = 'SALDOS_INICIALES'
        WHERE numeroCuenta = '399-01' AND rolSistema IS NULL;
      UPDATE cuentas_contables SET rolSistema = 'VENTAS'
        WHERE numeroCuenta = '401-01' AND rolSistema IS NULL;
      UPDATE cuentas_contables SET rolSistema = 'INTERESES'
        WHERE numeroCuenta = '402-01' AND rolSistema IS NULL;
      UPDATE cuentas_contables SET rolSistema = 'COSTO_VENTAS'
        WHERE numeroCuenta = '501-01' AND rolSistema IS NULL;
      UPDATE cuentas_contables SET rolSistema = 'MERMAS'
        WHERE numeroCuenta = '601-01' AND rolSistema IS NULL;

      IF EXISTS (
        SELECT 1 FROM polizas
        WHERE origenClave IS NOT NULL
        GROUP BY empresaId, origenClave HAVING COUNT(*) > 1
      )
        THROW 51010, 'Hay pólizas duplicadas por origenClave. Deben conciliarse antes de crear el índice único.', 1;

      IF EXISTS (
        SELECT 1 FROM polizas
        GROUP BY empresaId, folio HAVING COUNT(*) > 1
      )
        THROW 51011, 'Hay folios contables duplicados. Deben corregirse antes de crear el índice único.', 1;

      IF EXISTS (
        SELECT 1 FROM asientos_pendientes
        WHERE documentoId IS NOT NULL
        GROUP BY empresaId, tipo, documentoId HAVING COUNT(*) > 1
      )
        THROW 51012, 'Hay asientos pendientes duplicados para la misma operación.', 1;

      IF EXISTS (
        SELECT 1 FROM cuentas_contables
        WHERE rolSistema IS NOT NULL
        GROUP BY empresaId, rolSistema HAVING COUNT(*) > 1
      )
        THROW 51013, 'Hay más de una cuenta asignada al mismo rol contable.', 1;

      IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE object_id = OBJECT_ID('polizas')
          AND name = 'UX_polizas_empresa_origen'
      )
        CREATE UNIQUE INDEX UX_polizas_empresa_origen
          ON polizas(empresaId, origenClave)
          WHERE origenClave IS NOT NULL;

      IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE object_id = OBJECT_ID('polizas')
          AND name = 'UX_polizas_empresa_folio'
      )
        CREATE UNIQUE INDEX UX_polizas_empresa_folio
          ON polizas(empresaId, folio);

      IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE object_id = OBJECT_ID('asientos_pendientes')
          AND name = 'UX_asientos_pendientes_empresa_tipo_documento'
      )
        CREATE UNIQUE INDEX UX_asientos_pendientes_empresa_tipo_documento
          ON asientos_pendientes(empresaId, tipo, documentoId)
          WHERE documentoId IS NOT NULL;

      IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE object_id = OBJECT_ID('cuentas_contables')
          AND name = 'UX_cuentas_contables_empresa_rol'
      )
        CREATE UNIQUE INDEX UX_cuentas_contables_empresa_rol
          ON cuentas_contables(empresaId, rolSistema)
          WHERE rolSistema IS NOT NULL;

      UPDATE asientos_pendientes
      SET
        notaResolucion = LEFT(
          CONCAT(
            COALESCE(NULLIF(notaResolucion, ''), 'Resuelto antes de la migración.'),
            CASE
              WHEN ultimoError IS NULL THEN ''
              ELSE CONCAT(' Error previo: ', ultimoError)
            END
          ),
          500
        ),
        ultimoError = NULL,
        proximoIntento = NULL
      WHERE estado = 'GENERADO'
        AND (ultimoError IS NOT NULL OR proximoIntento IS NOT NULL);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS UX_cuentas_contables_empresa_rol
        ON cuentas_contables;
      DROP INDEX IF EXISTS UX_asientos_pendientes_empresa_tipo_documento
        ON asientos_pendientes;
      DROP INDEX IF EXISTS UX_polizas_empresa_folio ON polizas;
      -- No se elimina rolSistema ni los índices previos: pueden contener
      -- configuración y proteger operaciones reales.
    `);
  }
}
