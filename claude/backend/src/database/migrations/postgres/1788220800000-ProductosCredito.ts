import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Catálogo de productos de crédito por empresa.
 *
 * Sustituye al `enum TipoCredito` del código. El enum obligaba a compilar para
 * agregar un plazo y forzaba a todas las empresas del servidor a vender lo
 * mismo; peor, no tenía dónde guardar la correspondencia con el registro
 * externo, así que los ids de producto de Fineract se estaban capturando a mano
 * en un JSON de parámetros.
 *
 * La siembra deja a cada empresa EXISTENTE con los cinco productos que hoy
 * puede vender, ya activos y con el enum viejo anotado en
 * `tipocreditoheredado`. Es lo que permite que esta migración no cambie el
 * comportamiento de nadie: quien vendía a 30 días sigue vendiendo a 30 días, y
 * los créditos ya emitidos siguen apuntando a su `tipocredito` de siempre.
 *
 * El id del producto en el registro externo NO se guarda aquí: va en
 * `integracion_vinculos` con tipo PRODUCTO_CREDITO, igual que el de clientes y
 * créditos.
 */
export class ProductosCredito1788220800000 implements MigrationInterface {
  name = 'ProductosCredito1788220800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS productos_credito (
        id                     uuid         NOT NULL DEFAULT gen_random_uuid(),
        empresaid              uuid         NOT NULL,
        codigo                 varchar(30)  NOT NULL,
        nombre                 varchar(120) NOT NULL,
        descripcion            varchar(500),
        unidadplazo            varchar(10)  NOT NULL DEFAULT 'MESES',
        cadacuantos            int          NOT NULL DEFAULT 1,
        cuotasminimas          int          NOT NULL DEFAULT 1,
        cuotasmaximas          int          NOT NULL DEFAULT 1,
        sininteres             boolean      NOT NULL DEFAULT true,
        tasainteresmensual     decimal(8,4) NOT NULL DEFAULT 0,
        tasaeditable           boolean      NOT NULL DEFAULT false,
        montominimo            decimal(18,4) NOT NULL DEFAULT 0,
        montomaximo            decimal(18,4) NOT NULL DEFAULT 0,
        moneda                 varchar(10)  NOT NULL DEFAULT 'MXN',
        estado                 varchar(20)  NOT NULL DEFAULT 'BORRADOR',
        origen                 varchar(10)  NOT NULL DEFAULT 'ERP',
        orden                  int          NOT NULL DEFAULT 100,
        verificadoen           timestamptz,
        resultadoverificacion  jsonb,
        flujovalidacionid      uuid,
        tipocreditoheredado    varchar(30),
        fechacreacion          timestamptz  NOT NULL DEFAULT now(),
        fechaactualizacion     timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT pk_productos_credito PRIMARY KEY (id),
        CONSTRAINT ck_producto_credito_estado
          CHECK (estado IN ('BORRADOR', 'ACTIVO', 'SUSPENDIDO')),
        CONSTRAINT ck_producto_credito_unidad
          CHECK (unidadplazo IN ('DIAS', 'MESES')),
        CONSTRAINT ck_producto_credito_origen
          CHECK (origen IN ('ERP', 'EXTERNO')),
        CONSTRAINT ck_producto_credito_cuotas
          CHECK (cuotasminimas >= 1 AND cuotasmaximas >= cuotasminimas),
        -- Sin interés y con tasa es una tabla de amortización que miente. Se
        -- impide en la base porque el catálogo lo van a editar personas y
        -- también procesos de importación desde el externo.
        CONSTRAINT ck_producto_credito_tasa
          CHECK ((sininteres AND tasainteresmensual = 0) OR
                 (NOT sininteres AND tasainteresmensual > 0))
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_producto_credito_codigo
        ON productos_credito (empresaid, codigo);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_producto_credito_vendibles
        ON productos_credito (empresaid, estado, orden);
    `);

    /*
     * Con qué producto se vendió cada crédito. Nulo en todo lo emitido hasta
     * hoy: esos créditos nacieron cuando el producto no era una entidad, y
     * rellenarlos por adivinanza pondría un dato inventado en un contrato
     * firmado. Se resuelven por `tipocredito`, que se conserva.
     */
    await queryRunner.query(`
      ALTER TABLE creditos_clientes
        ADD COLUMN IF NOT EXISTS productocreditoid uuid;
    `);

    // ── Siembra del catálogo actual para las empresas que ya operan ─────────
    await queryRunner.query(`
      INSERT INTO productos_credito (
        empresaid, codigo, nombre, unidadplazo, cadacuantos,
        cuotasminimas, cuotasmaximas, sininteres, tasainteresmensual,
        estado, origen, orden, tipocreditoheredado
      )
      SELECT e.id, p.codigo, p.nombre, p.unidadplazo, p.cadacuantos,
             p.cuotasminimas, p.cuotasmaximas, p.sininteres, p.tasainteresmensual,
             'ACTIVO', 'ERP', p.orden, p.heredado
        FROM empresas e
        CROSS JOIN (VALUES
          ('CRED-30D', 'Crédito simple a 30 días',  'DIAS',  30, 1,  1, true,  0.0,   10, 'CREDITO_30D'),
          ('CRED-60D', 'Crédito simple a 60 días',  'DIAS',  60, 1,  1, true,  0.0,   20, 'CREDITO_60D'),
          ('CRED-90D', 'Crédito simple a 90 días',  'DIAS',  90, 1,  1, true,  0.0,   30, 'CREDITO_90D'),
          ('MSI',      'Meses sin intereses',       'MESES',  1, 3, 24, true,  0.0,   40, 'MENSUALIDADES'),
          ('MENS-CI',  'Mensualidades con interés', 'MESES',  1, 3, 60, false, 2.5,   50, 'MENSUALIDADES')
        ) AS p(codigo, nombre, unidadplazo, cadacuantos, cuotasminimas,
               cuotasmaximas, sininteres, tasainteresmensual, orden, heredado)
       WHERE NOT EXISTS (
         SELECT 1 FROM productos_credito x
          WHERE x.empresaid = e.id AND x.codigo = p.codigo
       );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE creditos_clientes DROP COLUMN IF EXISTS productocreditoid;
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS ix_producto_credito_vendibles;`);
    await queryRunner.query(`DROP INDEX IF EXISTS ux_producto_credito_codigo;`);
    await queryRunner.query(`DROP TABLE IF EXISTS productos_credito;`);
  }
}
