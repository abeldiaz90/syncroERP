-- ============================================================================
-- SyncroERP · Mapeo de roles del ERP a roles del registro externo
-- ----------------------------------------------------------------------------
-- Idempotente.
--   Get-Content backend\scripts\roles-crear-tabla.sql | `
--     docker exec -i syncroerp-postgres psql -U syncro_erp -d syncro_erp
-- ============================================================================

BEGIN;

-- Sin mapeo, un usuario se da de alta sin roles: entra y no puede hacer nada.
-- Es lo correcto. Otorgar permisos por omision en un core bancario es el error
-- que nadie quiere firmar.
CREATE TABLE IF NOT EXISTS integracion_mapeo_roles (
  id                   uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresaid            uuid         NOT NULL,
  rolerp               varchar(60)  NOT NULL,
  rolesexternos        jsonb        NOT NULL DEFAULT '[]'::jsonb,
  descripcionexterna   varchar(300),
  proveedor            varchar(40),
  activo               boolean      NOT NULL DEFAULT true,
  fechacreacion        timestamp    NOT NULL DEFAULT now(),
  fechaactualizacion   timestamp    NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "UX_integracion_mapeo_rol"
  ON integracion_mapeo_roles (empresaid, rolerp);

COMMIT;
