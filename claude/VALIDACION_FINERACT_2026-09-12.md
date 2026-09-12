# Validación SyncroERP–Fineract — 12 de septiembre de 2026

## Resultado comprobado

- Los cinco productos (30, 60, 90 días, MSI y mensualidades con interés) coinciden en sus simulaciones ERP–Fineract.
- MSI y mensualidades con interés: originación, pago parcial, repetición idempotente y liquidación comparados contra Fineract local. Ambos préstamos terminaron con saldo cero e inactivos.
- En la primera corrida se reprodujo el rechazo de pago duplicado con HTTP 400. Tras corregir la reversa, ese préstamo sintético quedó cancelado.
- El cliente, cuenta bancaria, créditos, pagos y eventos de prueba del ERP se ejecutaron en una transacción revertida. En Fineract queda trazabilidad sintética: préstamo 1 cancelado, préstamos 2 y 3 liquidados; clientes sintéticos 3 y 4. No se borró historial financiero.
- El cobro real entre sistemas se invocó mediante los servicios y el adaptador; no se validó el despacho automático completo del outbox. El registro del outbox sí se comprobó dentro de la transacción.
- Contabilización diferida y timbrado excluidos del ciclo transaccional. Contabilidad externa permanece APAGADO.

## Correcciones

- Los rechazos HTTP 400, 403 y 409 solo se recuperan como duplicado cuando la consulta por referencia confirma importe, fecha y ausencia de reversa. Se conserva el ID externo recuperado.
- La reversa usa el ajuste de transacción con transactionAmount=0, contrato de la versión local de Fineract.
- El simulador de pólizas reconoce consultas PostgreSQL en lugar de SQL Server.

## Validación

- TypeScript: sin errores con `--noEmit --incremental false`.
- 23 escenarios del adaptador: duplicados confirmados, rechazos, diferencias y contrato de reversa.
- 17 pruebas de pólizas correctas tras actualizar el simulador.
- Las otras cuatro suites seleccionadas de modos, outbox, vínculos y plazos pasaron (21 pruebas).

## Repetición controlada

Desde backend:

```powershell
node scripts/probar-idempotencia.cjs
node scripts/probar-ciclo-transaccional.cjs
node scripts/probar-ciclo-fineract.cjs --aplicar-prueba-local --fecha=2026-09-12 --resultado=C:/ruta/nueva/evidencia.json
```

La prueba Fineract exige destino localhost y un archivo de evidencia nuevo. Crea registros sintéticos en Fineract; la parte ERP se revierte. Elegir una fecha válida para el día operativo de la instalación. La protección local no sustituye usar una instalación de pruebas. No ejecutar en producción.

## Pendiente

- Devolución comercial completa aplicada desde el ERP y comparada con Fineract.
- Despacho automático y conciliación persistente de un flujo de prueba completo.
- Configurar cuentas y probar pólizas ESPEJO, incluyendo su reversa e idempotencia. No se ha activado ESPEJO ni AUTORIDAD.
