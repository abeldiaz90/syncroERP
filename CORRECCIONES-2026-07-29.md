# Correcciones de estabilización — 29/07/2026

Esta entrega corrige los bloqueantes de mayor riesgo detectados durante la
auditoría. No pretende cerrar todavía toda la deuda técnica del ERP.

## Corregido

- Se retiraron `RegisterController` y `RegisterService` del módulo IAM para
  eliminar rutas duplicadas y el onboarding público accidental.
- La configuración JWT ya no usa un secreto temporal y respeta
  `JWT_EXPIRATION`.
- La estrategia JWT valida que usuario, correo y empresa continúen activos.
- El usuario autenticado expone de forma consistente `id` y `sub`.
- Se eliminaron bypass globales de permisos de crédito, cobranza, cuentas
  bancarias, pólizas, cuentas contables, RPA y dashboard ejecutivo.
- Los identificadores de traza de errores ahora se generan con criptografía
  segura.
- La anulación avanzada de ventas quedó registrada y conectada al endpoint.
- El frontend exige y envía el motivo de anulación.
- La venta recalcula en backend cantidades, descuentos, impuestos y totales.
- El folio de venta se obtiene dentro de la transacción con bloqueo.
- La salida de inventario queda ligada a la venta mediante `documentoId`.
- La validación y el descuento real de existencias ocurren dentro de la misma
  transacción, usando los bloqueos de lotes del servicio de inventario.
- Los filtros de ventas por estado y cliente ya se aplican.
- La paginación de ventas queda limitada a 100 registros por petición.
- Se registraron el controlador y servicio de asientos contables pendientes.
- Se corrigió la ruta frontend de permisos y la navegación ahora falla cerrada
  si no puede validar accesos.

## Pendiente para la siguiente entrega

- Precio autoritativo por lista de precios en ventas. Esta entrega recalcula
  toda la aritmética, pero el precio unitario aún llega del cliente porque el
  modelo actual no define una lista aplicable inequívoca por venta.
- Transacciones completas en recepción de órdenes y requisiciones.
- Idempotencia general de ventas, compras, cobranza, CFDI y auditoría nocturna.
- Cifrado o externalización de credenciales Facturama.
- Migraciones versionadas para índices únicos de folios y documentos origen.
- Sustitución gradual de todos los `fetch` directos por `lib/api.ts`.
- Migración del JWT de `localStorage` a cookie HttpOnly.
- Cobertura E2E de los flujos monetarios y aislamiento multiempresa.

## Validación

- Backend: compilación correcta.
- Backend: 7 suites y 57 pruebas aprobadas.
- Frontend: `tsc --noEmit` correcto.
- Frontend: build productivo de Next.js correcto.
- Frontend: ESLint todavía reporta deuda heredada (262 errores y 186
  advertencias), principalmente `any`, reglas estrictas de efectos de React y
  dependencias de hooks. No bloquea la compilación, pero permanece como trabajo
  de saneamiento.

Para repetir la validación localmente:

```bash
cd syncro-erp-backend
npm ci
npm run build
npm test

cd ../syncro-erp-frontend
npm ci
npm run typecheck
npm run lint
npm run build
```

No habilites `DB_SYNC=true` en producción.
