# Migraciones de SyncroERP

Las migraciones TypeORM están habilitadas. La fase v14 añade la migración no destructiva:

`1785758400000-SeguridadFiscalAuditoriaV14.ts`

Incluye columnas de revocación de sesión, cifrado PAC, trazabilidad fiscal de CFDI/REP, cambio de venta, cadena hash de auditoría e índices multiempresa.

## Base existente

1. Respalda la base.
2. Configura `DB_SYNC=false`.
3. Configura `CFDI_ENCRYPTION_KEY` antes de arrancar la aplicación.
4. Ejecuta:

```bash
npm run db:migration:show
npm run db:migration:run
npm run db:schema:verify
```

5. Arranca una vez la API para que `CfdiService` cifre las contraseñas PAC heredadas que todavía estén en texto plano.
6. Verifica la configuración fiscal de una empresa sandbox y prueba timbrado/cancelación/REP con el PAC de pruebas.

No se incluye una migración inicial destructiva generada a ciegas porque debe compararse contra el esquema SQL real. `db:rebuild:dev` sólo reconstruye bases locales cuyo nombre contenga `dev`, `local`, `test` o `sandbox`, y exige `DB_REBUILD_CONFIRM=RECREAR_BD_DESARROLLO`.
