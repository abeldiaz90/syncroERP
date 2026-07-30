import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  BANCOS_ANEXO_24_2026,
  CODIGOS_AGRUPADORES_SAT_2026,
  METODOS_PAGO_ANEXO_24_2026,
  MONEDAS_ANEXO_24_2026,
  SAT_ANEXO_24_2026,
} from '../../finanzas/data/catalogos-sat-2026';

type Entrada = {
  tipo: string;
  clave: string;
  nombre: string;
  nivel?: number | null;
  clavePadre?: string | null;
};

export class CatalogosSatIvaFlujo1785484800000 implements MigrationInterface {
  name = 'CatalogosSatIvaFlujo1785484800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      IF COL_LENGTH('pagos_cobranza', 'ivaReclasificado') IS NULL
        ALTER TABLE pagos_cobranza ADD ivaReclasificado decimal(18,4) NOT NULL
          CONSTRAINT DF_pagos_cobranza_iva_reclasificado DEFAULT 0;

      IF COL_LENGTH('pagos_proveedor', 'ivaReclasificado') IS NULL
        ALTER TABLE pagos_proveedor ADD ivaReclasificado decimal(18,4) NOT NULL
          CONSTRAINT DF_pagos_proveedor_iva_reclasificado DEFAULT 0;

      IF OBJECT_ID('catalogos_fiscales_versiones', 'U') IS NULL
      BEGIN
        CREATE TABLE catalogos_fiscales_versiones (
          id uniqueidentifier NOT NULL
            CONSTRAINT PK_catalogos_fiscales_versiones PRIMARY KEY
            CONSTRAINT DF_catalogos_fiscales_versiones_id DEFAULT NEWID(),
          clave varchar(80) NOT NULL,
          jurisdiccion varchar(5) NOT NULL,
          autoridad varchar(30) NOT NULL,
          nombre varchar(160) NOT NULL,
          ejercicio int NOT NULL,
          fechaPublicacion date NOT NULL,
          vigenciaDesde date NOT NULL,
          vigenciaHasta date NULL,
          fuenteUrl varchar(500) NOT NULL,
          sha256 char(64) NOT NULL,
          estado varchar(20) NOT NULL
            CONSTRAINT DF_catalogos_fiscales_versiones_estado DEFAULT 'VIGENTE',
          fechaCreacion datetime2 NOT NULL
            CONSTRAINT DF_catalogos_fiscales_versiones_fecha DEFAULT SYSUTCDATETIME(),
          CONSTRAINT UX_catalogos_fiscales_versiones_clave UNIQUE (clave)
        );
      END;

      IF OBJECT_ID('catalogos_sat_entradas', 'U') IS NULL
      BEGIN
        CREATE TABLE catalogos_sat_entradas (
          id uniqueidentifier NOT NULL
            CONSTRAINT PK_catalogos_sat_entradas PRIMARY KEY
            CONSTRAINT DF_catalogos_sat_entradas_id DEFAULT NEWID(),
          versionId uniqueidentifier NOT NULL,
          tipo varchar(20) NOT NULL,
          clave varchar(20) NOT NULL,
          nombre nvarchar(1000) NOT NULL,
          nivel int NULL,
          clavePadre varchar(20) NULL,
          activo bit NOT NULL
            CONSTRAINT DF_catalogos_sat_entradas_activo DEFAULT 1,
          CONSTRAINT FK_catalogos_sat_entradas_version
            FOREIGN KEY (versionId) REFERENCES catalogos_fiscales_versiones(id),
          CONSTRAINT UX_catalogos_sat_entradas_clave
            UNIQUE (versionId, tipo, clave)
        );
        CREATE INDEX IX_catalogos_sat_entradas_busqueda
          ON catalogos_sat_entradas(versionId, tipo, activo);
      END;

      IF OBJECT_ID('cuentas_contables_sat_mapeos', 'U') IS NULL
      BEGIN
        CREATE TABLE cuentas_contables_sat_mapeos (
          id uniqueidentifier NOT NULL
            CONSTRAINT PK_cuentas_contables_sat_mapeos PRIMARY KEY
            CONSTRAINT DF_cuentas_contables_sat_mapeos_id DEFAULT NEWID(),
          empresaId uniqueidentifier NOT NULL,
          cuentaContableId uniqueidentifier NOT NULL,
          versionId uniqueidentifier NOT NULL,
          entradaId uniqueidentifier NOT NULL,
          vigenciaDesde date NOT NULL,
          vigenciaHasta date NULL,
          activo bit NOT NULL
            CONSTRAINT DF_cuentas_contables_sat_mapeos_activo DEFAULT 1,
          sugeridoPorSistema bit NOT NULL
            CONSTRAINT DF_cuentas_contables_sat_mapeos_sugerido DEFAULT 0,
          confirmado bit NOT NULL
            CONSTRAINT DF_cuentas_contables_sat_mapeos_confirmado DEFAULT 0,
          confirmadoPorId uniqueidentifier NULL,
          fechaConfirmacion datetime2 NULL,
          fechaCreacion datetime2 NOT NULL
            CONSTRAINT DF_cuentas_contables_sat_mapeos_fecha DEFAULT SYSUTCDATETIME(),
          CONSTRAINT FK_cuentas_sat_mapeo_cuenta
            FOREIGN KEY (cuentaContableId) REFERENCES cuentas_contables(id),
          CONSTRAINT FK_cuentas_sat_mapeo_version
            FOREIGN KEY (versionId) REFERENCES catalogos_fiscales_versiones(id),
          CONSTRAINT FK_cuentas_sat_mapeo_entrada
            FOREIGN KEY (entradaId) REFERENCES catalogos_sat_entradas(id)
        );
        CREATE INDEX IX_cuentas_sat_mapeo_empresa
          ON cuentas_contables_sat_mapeos(empresaId, cuentaContableId, activo);
        CREATE UNIQUE INDEX UX_cuentas_sat_mapeo_activo
          ON cuentas_contables_sat_mapeos(empresaId, cuentaContableId)
          WHERE activo = 1;
      END;
    `);

    await queryRunner.query(
      `
        IF NOT EXISTS (
          SELECT 1 FROM catalogos_fiscales_versiones WHERE clave = @0
        )
        INSERT INTO catalogos_fiscales_versiones (
          clave, jurisdiccion, autoridad, nombre, ejercicio,
          fechaPublicacion, vigenciaDesde, fuenteUrl, sha256, estado
        ) VALUES (@0, @1, @2, @3, @4, @5, @6, @7, @8, 'VIGENTE')
      `,
      [
        SAT_ANEXO_24_2026.clave,
        SAT_ANEXO_24_2026.jurisdiccion,
        SAT_ANEXO_24_2026.autoridad,
        'Anexo 24 de la Resolución Miscelánea Fiscal para 2026',
        SAT_ANEXO_24_2026.ejercicio,
        SAT_ANEXO_24_2026.fechaPublicacion,
        SAT_ANEXO_24_2026.vigenciaDesde,
        SAT_ANEXO_24_2026.fuenteUrl,
        SAT_ANEXO_24_2026.sha256,
      ],
    );

    const versionRows = (await queryRunner.query(
      `SELECT id FROM catalogos_fiscales_versiones WHERE clave = @0`,
      [SAT_ANEXO_24_2026.clave],
    )) as Array<{ id: string }>;
    const [version] = versionRows;
    const versionId = String(version.id);

    const entradas: Entrada[] = [
      ...CODIGOS_AGRUPADORES_SAT_2026.map((row) => ({
        tipo: 'AGRUPADOR',
        clave: row.codigo,
        nombre: row.nombre,
        nivel: row.nivel,
        clavePadre: row.codigoPadre ? String(row.codigoPadre) : null,
      })),
      ...MONEDAS_ANEXO_24_2026.map((row) => ({
        tipo: 'MONEDA',
        clave: row.clave,
        nombre: row.nombre,
      })),
      ...BANCOS_ANEXO_24_2026.map((row) => ({
        tipo: 'BANCO',
        clave: row.clave,
        nombre: row.nombre,
      })),
      ...METODOS_PAGO_ANEXO_24_2026.map((row) => ({
        tipo: 'METODO_PAGO',
        clave: row.clave,
        nombre: row.nombre,
      })),
    ];
    await this.insertarEntradas(queryRunner, versionId, entradas);

    // Corrige asignaciones estándar que no corresponden al Anexo 24.
    await queryRunner.query(`
      UPDATE cuentas_contables
      SET codigoAgrupadorSAT = '401.32'
      WHERE rolSistema = 'INTERESES'
        AND codigoAgrupadorSAT = '702.01';

      UPDATE cuentas_contables
      SET codigoAgrupadorSAT = NULL
      WHERE rolSistema = 'SALDOS_INICIALES'
        AND codigoAgrupadorSAT = '304.01';

      UPDATE cuentas_contables
      SET rolSistema = 'IVA_ACREDITABLE_PAGADO'
      WHERE rolSistema = 'IVA_ACREDITABLE';

      UPDATE cuentas_contables
      SET rolSistema = 'IVA_TRASLADADO_COBRADO'
      WHERE rolSistema = 'IVA_TRASLADADO';

      UPDATE cuentas_contables
      SET rolSistema = 'IVA_ACREDITABLE_PENDIENTE'
      WHERE numeroCuenta = '117-01'
        AND rolSistema IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM cuentas_contables otra
          WHERE otra.empresaId = cuentas_contables.empresaId
            AND otra.rolSistema = 'IVA_ACREDITABLE_PENDIENTE'
        );

      UPDATE cuentas_contables
      SET rolSistema = 'IVA_TRASLADADO_NO_COBRADO'
      WHERE numeroCuenta = '207-01'
        AND rolSistema IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM cuentas_contables otra
          WHERE otra.empresaId = cuentas_contables.empresaId
            AND otra.rolSistema = 'IVA_TRASLADADO_NO_COBRADO'
        );

      INSERT INTO cuentas_contables (
        id, empresaId, numeroCuenta, nombre, codigoAgrupadorSAT,
        naturaleza, tipo, cuentaPadreId, esAfectable, activo, rolSistema,
        fechaCreacion, fechaActualizacion
      )
      SELECT NEWID(), e.empresaId, '117-01', 'IVA Acreditable Pendiente de Pago',
        '119.01', 'DEUDORA', 'ACTIVO', NULL, 1, 1,
        'IVA_ACREDITABLE_PENDIENTE', SYSUTCDATETIME(), SYSUTCDATETIME()
      FROM (SELECT DISTINCT empresaId FROM cuentas_contables) e
      WHERE NOT EXISTS (
        SELECT 1 FROM cuentas_contables c
        WHERE c.empresaId = e.empresaId
          AND (c.rolSistema = 'IVA_ACREDITABLE_PENDIENTE'
            OR c.numeroCuenta = '117-01')
      );

      INSERT INTO cuentas_contables (
        id, empresaId, numeroCuenta, nombre, codigoAgrupadorSAT,
        naturaleza, tipo, cuentaPadreId, esAfectable, activo, rolSistema,
        fechaCreacion, fechaActualizacion
      )
      SELECT NEWID(), e.empresaId, '207-01', 'IVA Trasladado No Cobrado',
        '209.01', 'ACREEDORA', 'PASIVO', NULL, 1, 1,
        'IVA_TRASLADADO_NO_COBRADO', SYSUTCDATETIME(), SYSUTCDATETIME()
      FROM (SELECT DISTINCT empresaId FROM cuentas_contables) e
      WHERE NOT EXISTS (
        SELECT 1 FROM cuentas_contables c
        WHERE c.empresaId = e.empresaId
          AND (c.rolSistema = 'IVA_TRASLADADO_NO_COBRADO'
            OR c.numeroCuenta = '207-01')
      );
    `);

    // Conserva la columna anterior para compatibilidad, pero crea el historial
    // versionado y validado para todas las cuentas ya clasificadas.
    await queryRunner.query(
      `
        INSERT INTO cuentas_contables_sat_mapeos (
          empresaId, cuentaContableId, versionId, entradaId,
          vigenciaDesde, activo, sugeridoPorSistema, confirmado
        )
        SELECT c.empresaId, c.id, @0, e.id, @1, 1, 1, 0
        FROM cuentas_contables c
        INNER JOIN catalogos_sat_entradas e
          ON e.versionId = @0
         AND e.tipo = 'AGRUPADOR'
         AND e.clave = c.codigoAgrupadorSAT
        WHERE c.codigoAgrupadorSAT IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM cuentas_contables_sat_mapeos m
            WHERE m.empresaId = c.empresaId
              AND m.cuentaContableId = c.id
              AND m.activo = 1
          )
      `,
      [versionId, SAT_ANEXO_24_2026.vigenciaDesde],
    );
  }

  private async insertarEntradas(
    queryRunner: QueryRunner,
    versionId: string,
    entradas: Entrada[],
  ) {
    const escape = (value: string) => value.replace(/'/g, "''");
    for (let index = 0; index < entradas.length; index += 200) {
      const values = entradas.slice(index, index + 200).map((row) => {
        const nivel = row.nivel == null ? 'NULL' : String(row.nivel);
        const padre = row.clavePadre ? `'${escape(row.clavePadre)}'` : 'NULL';
        return `(
          NEWID(), '${escape(versionId)}', '${escape(row.tipo)}',
          '${escape(row.clave)}', N'${escape(row.nombre)}',
          ${nivel}, ${padre}, 1
        )`;
      });
      await queryRunner.query(`
        INSERT INTO catalogos_sat_entradas (
          id, versionId, tipo, clave, nombre, nivel, clavePadre, activo
        )
        SELECT v.id, v.versionId, v.tipo, v.clave, v.nombre,
          v.nivel, v.clavePadre, v.activo
        FROM (VALUES ${values.join(',')})
          v(id, versionId, tipo, clave, nombre, nivel, clavePadre, activo)
        WHERE NOT EXISTS (
          SELECT 1 FROM catalogos_sat_entradas e
          WHERE e.versionId = v.versionId
            AND e.tipo = v.tipo
            AND e.clave = v.clave
        );
      `);
    }
  }

  public async down(): Promise<void> {
    // No destructiva: las relaciones SAT y reclasificaciones pueden formar
    // parte de cierres o archivos electrónicos emitidos después de aplicarla.
  }
}
