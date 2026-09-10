# Endurecimiento contable

Esta versión protege el motor contable frente a solicitudes concurrentes y
elimina la selección ambigua de cuentas por número.

## Instalación sobre una base existente

1. Detén temporalmente el backend para que no se generen pólizas durante el
   cambio.
2. Realiza un respaldo de SQL Server.
3. Ejecuta:

   `scripts/endurecer-contabilidad-concurrencia.sql`

4. Confirma que el resultado final sea `OK`.
5. Instala/actualiza dependencias y compila:

   ```bash
   npm install
   npm run build
   npm test -- --runInBand
   ```

6. Levanta nuevamente el backend.

También existe la migración TypeORM equivalente:

```bash
npm run migration:run
```

No ejecutes el script manual y la migración al mismo tiempo. Ambos son
idempotentes, pero debe utilizarse un solo mecanismo de despliegue.

## Garantías incorporadas

- Una `origenClave` sólo puede existir una vez por empresa.
- Un folio contable sólo puede existir una vez por empresa.
- La asignación de folios se serializa por empresa, tipo y año mediante
  `sp_getapplock`.
- Dos usuarios no pueden ejecutar simultáneamente el mismo reintento.
- Una operación sólo conserva una fila de recuperación contable.
- Los errores resueltos dejan de aparecer como fallos activos.
- Las cuentas globales se seleccionan por `rolSistema`.

## Validación posterior

```sql
SELECT empresaId, origenClave, COUNT(*) AS repeticiones
FROM polizas
WHERE origenClave IS NOT NULL
GROUP BY empresaId, origenClave
HAVING COUNT(*) > 1;

SELECT empresaId, folio, COUNT(*) AS repeticiones
FROM polizas
GROUP BY empresaId, folio
HAVING COUNT(*) > 1;

SELECT empresaId, tipo, documentoId, COUNT(*) AS repeticiones
FROM asientos_pendientes
WHERE documentoId IS NOT NULL
GROUP BY empresaId, tipo, documentoId
HAVING COUNT(*) > 1;

SELECT
  numeroCuenta,
  nombre,
  rolSistema,
  esAfectable,
  activo
FROM cuentas_contables
WHERE rolSistema IS NOT NULL
ORDER BY rolSistema;
```

Las tres primeras consultas deben regresar cero filas. La cuarta debe mostrar
una sola cuenta activa y afectable para cada función global.
