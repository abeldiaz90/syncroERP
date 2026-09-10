-- ============================================================================
-- SyncroERP · Tablas de los flujos de validación previos al crédito
-- ----------------------------------------------------------------------------
-- Idempotente. Se aplica igual que el otro:
--
--   Get-Content backend\scripts\validacion-crear-tablas.sql | `
--     docker exec -i syncroerp-postgres psql -U syncro_erp -d syncro_erp
-- ============================================================================

BEGIN;

-- ── El flujo que diseñó el administrador ───────────────────────────────────
-- Se versiona y no se reescribe: una ejecución guarda con qué versión corrió,
-- para que las decisiones de ayer sigan siendo explicables con la política de
-- ayer. Es lo primero que pide una auditoría de crédito.
CREATE TABLE IF NOT EXISTS validacion_flujos (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresaid           uuid          NOT NULL,
  nombre              varchar(120)  NOT NULL,
  descripcion         varchar(500),
  proposito           varchar(40)   NOT NULL DEFAULT 'ORIGINACION_CREDITO',
  activo              boolean       NOT NULL DEFAULT false,
  version             integer       NOT NULL DEFAULT 1,
  topeautomatico      numeric(18,2) NOT NULL DEFAULT 0,
  puntajeminimo       integer       NOT NULL DEFAULT 60,
  creadoporid         uuid,
  fechacreacion       timestamp     NOT NULL DEFAULT now(),
  fechaactualizacion  timestamp     NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "IX_validacion_flujo_empresa"
  ON validacion_flujos (empresaid, proposito, activo);

-- ── Los pasos, en orden ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS validacion_pasos (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  flujoid        uuid         NOT NULL REFERENCES validacion_flujos(id) ON DELETE CASCADE,
  orden          integer      NOT NULL,
  tipo           varchar(40)  NOT NULL,
  etiqueta       varchar(120) NOT NULL,
  politica       varchar(30)  NOT NULL DEFAULT 'BLOQUEANTE',
  peso           integer      NOT NULL DEFAULT 0,
  umbralminimo   integer,
  parametros     jsonb        NOT NULL DEFAULT '{}'::jsonb,
  activo         boolean      NOT NULL DEFAULT true,
  fechacreacion  timestamp    NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "IX_validacion_paso_flujo"
  ON validacion_pasos (flujoid, orden);

-- ── El expediente de cada corrida ──────────────────────────────────────────
-- Sin esto, "por qué le negamos el crédito a este señor" no tiene respuesta a
-- los seis meses.
CREATE TABLE IF NOT EXISTS validacion_ejecuciones (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresaid         uuid          NOT NULL,
  clienteid         uuid          NOT NULL,
  flujoid           uuid          NOT NULL,
  flujoversion      integer       NOT NULL,
  flujonombre       varchar(120)  NOT NULL,
  limitesolicitado  numeric(18,2) NOT NULL DEFAULT 0,
  limitesugerido    numeric(18,2) NOT NULL DEFAULT 0,
  puntaje           integer       NOT NULL DEFAULT 0,
  estado            varchar(30)   NOT NULL DEFAULT 'EN_PROCESO',
  motivos           jsonb         NOT NULL DEFAULT '[]'::jsonb,
  simulacion        boolean       NOT NULL DEFAULT false,
  usuarioid         uuid,
  fechafin          timestamptz,
  fechacreacion     timestamp     NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "IX_validacion_ejecucion_cliente"
  ON validacion_ejecuciones (empresaid, clienteid, fechacreacion);

-- ── Lo que contestó cada paso ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS validacion_resultados_paso (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  ejecucionid      uuid          NOT NULL REFERENCES validacion_ejecuciones(id) ON DELETE CASCADE,
  pasoid           uuid,
  orden            integer       NOT NULL,
  tipo             varchar(40)   NOT NULL,
  etiqueta         varchar(120)  NOT NULL,
  resultado        varchar(20)   NOT NULL,
  puntaje          integer,
  puntosaportados  integer       NOT NULL DEFAULT 0,
  proveedor        varchar(40),
  detalle          varchar(1000),
  evidencia        jsonb,
  fechacreacion    timestamp     NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "IX_validacion_resultado_ejecucion"
  ON validacion_resultados_paso (ejecucionid, orden);

COMMIT;
