# SyncroERP backend v13

## Correcciones y maduración incluidas

- Panel Ejecutivo tolerante a fallos por indicador: cada consulta se aísla, registra advertencia y devuelve un valor seguro sin derribar el panel completo.
- Ruta real del Panel Ejecutivo normalizada a `GET /dashboard/ejecutivo` en permisos y navegación.
- Baja laboral transaccional: empleado, contratos vigentes y movimiento laboral se actualizan en una sola transacción.
- Endpoint de estimación de finiquito que no modifica datos.
- Contratos laborales con validación de fechas, traslapes, área activa, puesto activo, tabulador, plazas autorizadas y coherencia salarial.
- Permisos navegables completos para consultar/crear contratos, consultar historial y estimar/registrar bajas.
- Migraciones TypeORM habilitadas mediante `DB_MIGRATIONS_RUN=true`.
- Reconstrucción controlada de bases locales mediante `npm run db:rebuild:dev`; bloqueada en producción y protegida con confirmación explícita.
- Verificación de esquema ampliada a tablas y columnas; identifica específicamente la tabla `dbo.roles` requerida por IAM.
- Contratos de metadatos añadidos para `roles`, `rrhh_contratos_laborales` y `rrhh_movimientos_laborales`.
- Script no destructivo `scripts/VALIDAR-ESTRUCTURA-V13.sql` para revisar la base objetivo antes del despliegue.
- Panel Ejecutivo usa el saldo pendiente real de cuentas por pagar y protege cantidades devueltas nulas.

## Validaciones ejecutadas en este paquete

- Transpilación sintáctica conjunta del backend y frontend: 572 archivos TS/TSX, 0 errores.
- Resolución de imports relativos: 1,246 imports, 0 faltantes.
- Diccionarios de endpoints: 0 claves duplicadas.
- Pruebas directas de las reglas `DB_SYNC` y `DB_MIGRATIONS_RUN`.
- Archivos `package.json` validados como JSON.

## Validación que debe ejecutarse con dependencias y base disponibles

```bash
npm ci
npm run build
npm test -- --runInBand
npm run test:e2e
npm run db:schema:verify
```

Después, en SQL Server, ejecutar:

```sql
:r scripts/VALIDAR-ESTRUCTURA-V13.sql
```

La instalación de dependencias no pudo completarse dentro del entorno de revisión porque el registro interno devolvió 404 para paquetes válidos y la resolución DNS hacia el registro público estuvo bloqueada. Tampoco se proporcionó una conexión SQL Server para ejecutar la comparación contra una base real.
