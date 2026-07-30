import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  BANCOS_ANEXO_24_2026,
  SAT_ANEXO_24_2026,
} from '../../finanzas/data/catalogos-sat-2026';
import { PLAN_CUENTAS_ESTANDAR } from '../../finanzas/data/plan-cuentas-estandar';

/**
 * Hace persistentes los catálogos operativos que antes sólo existían como
 * referencia: 1,080 agrupadores convertidos a plan jerárquico por empresa y
 * 94 instituciones en el catálogo normal de bancos.
 */
export class PlanContableMexicanoInicial1785488400000 implements MigrationInterface {
  name = 'PlanContableMexicanoInicial1785488400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      IF OBJECT_ID('bancos', 'U') IS NOT NULL
      BEGIN
        IF COL_LENGTH('bancos', 'clave') IS NULL
          ALTER TABLE bancos ADD clave varchar(3) NULL;
        IF COL_LENGTH('bancos', 'esOficial') IS NULL
          ALTER TABLE bancos ADD esOficial bit NOT NULL
            CONSTRAINT DF_bancos_esOficial DEFAULT 0;
        IF COL_LENGTH('bancos', 'versionCatalogo') IS NULL
          ALTER TABLE bancos ADD versionCatalogo varchar(80) NULL;
        IF NOT EXISTS (
          SELECT 1 FROM sys.indexes
          WHERE object_id = OBJECT_ID('bancos')
            AND name = 'UX_bancos_clave_oficial'
        )
          CREATE UNIQUE INDEX UX_bancos_clave_oficial
            ON bancos(clave) WHERE clave IS NOT NULL;
      END;
    `);

    if (await queryRunner.hasTable('bancos')) {
      await queryRunner.query(`
        CREATE TABLE #BancosSat (
          clave varchar(3) NOT NULL,
          nombre varchar(100) NOT NULL
        );
      `);
      await this.insertarBancos(queryRunner);
      await queryRunner.query(
        `
          UPDATE b
          SET b.nombre = s.nombre,
              b.activo = 1,
              b.esOficial = 1,
              b.versionCatalogo = @0
          FROM bancos b
          INNER JOIN #BancosSat s ON s.clave = b.clave;

          INSERT INTO bancos (
            id, nombre, clave, activo, esOficial, versionCatalogo
          )
          SELECT NEWID(), s.nombre, s.clave, 1, 1, @0
          FROM #BancosSat s
          WHERE NOT EXISTS (
            SELECT 1 FROM bancos b WHERE b.clave = s.clave
          );

          DROP TABLE #BancosSat;
        `,
        [SAT_ANEXO_24_2026.clave],
      );
    }

    if (
      (await queryRunner.hasTable('Empresas')) &&
      (await queryRunner.hasTable('cuentas_contables'))
    ) {
      await queryRunner.query(`
        CREATE TABLE #PlanCuentasMx (
          numeroCuenta varchar(50) NOT NULL,
          nombre nvarchar(1000) NOT NULL,
          tipo varchar(30) NOT NULL,
          naturaleza varchar(20) NOT NULL,
          esAfectable bit NOT NULL,
          codigoAgrupadorSAT varchar(20) NULL,
          cuentaPadreNumero varchar(50) NULL,
          rolSistema varchar(40) NULL
        );
      `);
      await this.insertarPlan(queryRunner);
      await queryRunner.query(`
        INSERT INTO cuentas_contables (
          id, empresaId, numeroCuenta, nombre, codigoAgrupadorSAT,
          naturaleza, tipo, cuentaPadreId, esAfectable, activo, rolSistema,
          fechaCreacion, fechaActualizacion
        )
        SELECT
          NEWID(), e.id, p.numeroCuenta, p.nombre, p.codigoAgrupadorSAT,
          p.naturaleza, p.tipo, NULL, p.esAfectable, 1,
          CASE
            WHEN p.rolSistema IS NOT NULL
             AND NOT EXISTS (
               SELECT 1 FROM cuentas_contables r
               WHERE r.empresaId = e.id AND r.rolSistema = p.rolSistema
             )
            THEN p.rolSistema
            ELSE NULL
          END,
          SYSUTCDATETIME(), SYSUTCDATETIME()
        FROM Empresas e
        CROSS JOIN #PlanCuentasMx p
        WHERE NOT EXISTS (
          SELECT 1 FROM cuentas_contables c
          WHERE c.empresaId = e.id AND c.numeroCuenta = p.numeroCuenta
        );

        UPDATE hija
        SET hija.cuentaPadreId = padre.id
        FROM cuentas_contables hija
        INNER JOIN #PlanCuentasMx planHija
          ON planHija.numeroCuenta = hija.numeroCuenta
        INNER JOIN cuentas_contables padre
          ON padre.empresaId = hija.empresaId
         AND padre.numeroCuenta = planHija.cuentaPadreNumero
        WHERE planHija.cuentaPadreNumero IS NOT NULL
          AND hija.cuentaPadreId IS NULL;
      `);

      if (
        (await queryRunner.hasTable('catalogos_fiscales_versiones')) &&
        (await queryRunner.hasTable('catalogos_sat_entradas')) &&
        (await queryRunner.hasTable('cuentas_contables_sat_mapeos'))
      ) {
        await queryRunner.query(
          `
            INSERT INTO cuentas_contables_sat_mapeos (
              id, empresaId, cuentaContableId, versionId, entradaId,
              vigenciaDesde, vigenciaHasta, activo, sugeridoPorSistema,
              confirmado, confirmadoPorId, fechaConfirmacion, fechaCreacion
            )
            SELECT
              NEWID(), c.empresaId, c.id, v.id, entrada.id,
              @1, NULL, 1, 1, 0, NULL, NULL, SYSUTCDATETIME()
            FROM cuentas_contables c
            INNER JOIN #PlanCuentasMx p
              ON p.numeroCuenta = c.numeroCuenta
             AND p.esAfectable = 1
             AND p.codigoAgrupadorSAT IS NOT NULL
            INNER JOIN catalogos_fiscales_versiones v
              ON v.clave = @0
            INNER JOIN catalogos_sat_entradas entrada
              ON entrada.versionId = v.id
             AND entrada.tipo = 'AGRUPADOR'
             AND entrada.clave = p.codigoAgrupadorSAT
             AND entrada.activo = 1
            WHERE NOT EXISTS (
              SELECT 1
              FROM cuentas_contables_sat_mapeos m
              WHERE m.empresaId = c.empresaId
                AND m.cuentaContableId = c.id
                AND m.activo = 1
            );
          `,
          [SAT_ANEXO_24_2026.clave, SAT_ANEXO_24_2026.vigenciaDesde],
        );
      }
      await queryRunner.query('DROP TABLE #PlanCuentasMx;');
    }
  }

  private async insertarBancos(queryRunner: QueryRunner) {
    for (let inicio = 0; inicio < BANCOS_ANEXO_24_2026.length; inicio += 100) {
      const lote = BANCOS_ANEXO_24_2026.slice(inicio, inicio + 100);
      const parametros: unknown[] = [];
      const values = lote
        .map((banco, indice) => {
          const base = indice * 2;
          parametros.push(banco.clave, banco.nombre);
          return `(@${base}, @${base + 1})`;
        })
        .join(', ');
      await queryRunner.query(
        `INSERT INTO #BancosSat (clave, nombre) VALUES ${values}`,
        parametros,
      );
    }
  }

  private async insertarPlan(queryRunner: QueryRunner) {
    for (let inicio = 0; inicio < PLAN_CUENTAS_ESTANDAR.length; inicio += 100) {
      const lote = PLAN_CUENTAS_ESTANDAR.slice(inicio, inicio + 100);
      const parametros: unknown[] = [];
      const values = lote
        .map((cuenta, indice) => {
          const base = indice * 8;
          parametros.push(
            cuenta.numeroCuenta,
            cuenta.nombre,
            cuenta.tipo,
            cuenta.naturaleza,
            cuenta.esAfectable,
            cuenta.codigoAgrupadorSAT ?? null,
            cuenta.cuentaPadreNumero ?? null,
            cuenta.rol ?? null,
          );
          return (
            `(@${base}, @${base + 1}, @${base + 2}, @${base + 3}, ` +
            `@${base + 4}, @${base + 5}, @${base + 6}, @${base + 7})`
          );
        })
        .join(', ');
      await queryRunner.query(
        `
          INSERT INTO #PlanCuentasMx (
            numeroCuenta, nombre, tipo, naturaleza, esAfectable,
            codigoAgrupadorSAT, cuentaPadreNumero, rolSistema
          ) VALUES ${values}
        `,
        parametros,
      );
    }
  }

  public async down(): Promise<void> {
    // No se borran cuentas ni bancos: podrían haber recibido referencias o
    // movimientos después de instalar esta versión.
  }
}
