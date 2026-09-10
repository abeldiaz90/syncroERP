-- ============================================================================
-- SyncroERP · Tablas del módulo de integración con registro financiero externo
-- ----------------------------------------------------------------------------
-- Se ejecuta a mano porque DB_SYNC está en false, que es lo correcto: dejar
-- que TypeORM sincronice el esquema contra una base con datos le permite
-- alterar y borrar columnas por su cuenta.
--
-- Es idempotente: se puede correr dos veces sin efecto.
--
--   docker exec -i syncroerp-postgres psql -U syncro_erp -d syncro_erp \
--     < backend/scripts/integracion-crear-tablas.sql
--
-- Los nombres van en minúsculas porque el ERP usa LowercaseNamingStrategy.
-- ============================================================================

BEGIN;

-- ── Traducción de identidades ERP ↔ registro externo ───────────────────────
CREATE TABLE IF NOT EXISTS integracion_vinculos (
  id                      uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresaid               uuid         NOT NULL,
  tipo                    varchar(30)  NOT NULL,
  entidadid               uuid         NOT NULL,
  idexterno               varchar(120),
  referenciaidempotencia  varchar(120) NOT NULL,
  proveedor               varchar(40),
  estadoremoto            varchar(40),
  fechacreacion           timestamp    NOT NULL DEFAULT now(),
  fechaactualizacion      timestamp    NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "UX_integracion_vinculo_entidad"
  ON integracion_vinculos (empresaid, tipo, entidadid);
CREATE UNIQUE INDEX IF NOT EXISTS "UX_integracion_vinculo_referencia"
  ON integracion_vinculos (tipo, referenciaidempotencia);

-- ── Outbox transaccional ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS integracion_eventos (
  id                  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresaid           uuid         NOT NULL,
  tipo                varchar(40)  NOT NULL,
  entidadid           uuid,
  claveidempotencia   varchar(140) NOT NULL,
  carga               jsonb        NOT NULL,
  estado              varchar(20)  NOT NULL DEFAULT 'PENDIENTE',
  intentos            integer      NOT NULL DEFAULT 0,
  proximointento      timestamptz,
  ultimoerror         varchar(2000),
  respuesta           jsonb,
  fechaenvio          timestamptz,
  fechacreacion       timestamp    NOT NULL DEFAULT now(),
  fechaactualizacion  timestamp    NOT NULL DEFAULT now()
);
-- Esta es la garantía de que un mismo hecho económico no se publica dos veces.
CREATE UNIQUE INDEX IF NOT EXISTS "UX_integracion_evento_idempotencia"
  ON integracion_eventos (empresaid, claveidempotencia);
CREATE INDEX IF NOT EXISTS "IX_integracion_evento_despacho"
  ON integracion_eventos (estado, proximointento);

-- ── Discrepancias de conciliación ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS integracion_discrepancias (
  id             uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  empresaid      uuid           NOT NULL,
  fechacorte     date           NOT NULL,
  concepto       varchar(40)    NOT NULL,
  entidadid      uuid,
  valorerp       numeric(18,4)  NOT NULL DEFAULT 0,
  valorexterno   numeric(18,4)  NOT NULL DEFAULT 0,
  diferencia     numeric(18,4)  NOT NULL DEFAULT 0,
  detalle        varchar(1000),
  resuelta       boolean        NOT NULL DEFAULT false,
  fechacreacion  timestamp      NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "IX_integracion_discrepancia_abierta"
  ON integracion_discrepancias (empresaid, resuelta, fechacorte);

-- ── Perfil de integración por empresa ──────────────────────────────────────
-- Sin fila, o con todo en APAGADO, la empresa opera exactamente como siempre.
CREATE TABLE IF NOT EXISTS integracion_configuracion_empresa (
  id                      uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresaid               uuid          NOT NULL,
  modo                    varchar(20)   NOT NULL DEFAULT 'APAGADO',
  modocontabilidad        varchar(20)   NOT NULL DEFAULT 'APAGADO',
  oficinacontableexterna  varchar(40),
  parametrosproveedor     jsonb         NOT NULL DEFAULT '{}'::jsonb,
  toleranciaconciliacion  numeric(10,2) NOT NULL DEFAULT 1,
  fechacreacion           timestamp     NOT NULL DEFAULT now(),
  fechaactualizacion      timestamp     NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "UX_integracion_config_empresa"
  ON integracion_configuracion_empresa (empresaid);

-- ── Mapeo del catálogo de cuentas ──────────────────────────────────────────
-- Una póliza cuya cuenta no esté aquí falla en firme al espejarse. Es
-- deliberado: mandar el asiento a una cuenta parecida produce un mayor que
-- cuadra y miente.
CREATE TABLE IF NOT EXISTS integracion_mapeo_cuentas (
  id                  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresaid           uuid         NOT NULL,
  cuentacontableid    uuid         NOT NULL,
  codigocuenta        varchar(40)  NOT NULL,
  idexterno           varchar(120) NOT NULL,
  codigoexterno       varchar(60),
  proveedor           varchar(40),
  activo              boolean      NOT NULL DEFAULT true,
  fechacreacion       timestamp    NOT NULL DEFAULT now(),
  fechaactualizacion  timestamp    NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "UX_integracion_mapeo_cuenta"
  ON integracion_mapeo_cuentas (empresaid, cuentacontableid);
CREATE INDEX IF NOT EXISTS "IX_integracion_mapeo_codigo"
  ON integracion_mapeo_cuentas (empresaid, codigocuenta);

COMMIT;
