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

## Prueba automática adicional y revisión del frontend — 18:59 UTC

- `probar-outbox-automatico.cjs` creó un cliente sintético sin crédito ni saldo y publicó dos veces el mismo hecho dentro de una transacción; se comprobó que solo persistió un evento.
- El script deshabilita sus propios cron y nunca llama al despachador. El backend ya en ejecución procesó el evento y quedó ENVIADO. El cliente externo resultante es 5; se conserva la trazabilidad en ambos sistemas.
- La conciliación real por servicio revisó dos clientes vinculados y devolvió cero discrepancias. Esto prueba alta y conciliación de clientes sin cartera; no demuestra el ciclo automático de préstamos, cobros y devoluciones.
- Se navegó con sesión humana por dashboard, crédito, verificación, POS y asistentes. El POS muestra Crédito deshabilitado porque todos los productos están en BORRADOR y además avisa que no existe lista de precios. La cartera no contiene créditos. El asistente de crédito tiene pendiente definir políticas; no se confirmó manualmente ese paso.
- El centro de preparación indica 17% general. Faltan catálogos y configuración comercial para una venta completa por interfaz. No se introdujeron datos fiscales ficticios ni se activaron productos para venta.

Repetir desde backend (conservar cada evidencia en un archivo nuevo):

```powershell
node scripts/probar-outbox-automatico.cjs --aplicar-prueba-local --resultado=C:/ruta/nueva/outbox.json
```

Este script deja un cliente sintético sin crédito en ERP y Fineract. Requiere PostgreSQL y Fineract locales y un backend ejecutándose con su despacho automático habilitado. Espera hasta 90 segundos. La creación del cliente es preparación técnica del escenario, no una prueba del formulario ni de aprobación de líneas.

## Diagnóstico contable y cobertura del catálogo — 12 de septiembre, hora local

Se corrigió verificarConfiguracion para consultar también los productos de integracion_vinculos de la empresa y proveedor Fineract. Antes sólo consultaba los parámetros históricos, vacíos en esta instalación, y por tanto omitía los cinco productos del catálogo actual. Se deduplican IDs compartidos con los parámetros anteriores.

Validación: cuatro regresiones pasaron (producto vinculado con contabilidad automática, deduplicación, compatibilidad histórica y fallo de lectura); TypeScript noEmit pasó; git diff --check pasó. Una nueva ejecución real del servicio contra Fineract local devolvió cero avisos.

La simulación de aprovisionamiento completo devolvió 1.030 cuentas candidatas y 53 problemas correspondientes a cuentas de ORDEN sin equivalencia automática. Cero pendientes usadas no significa catálogo completo mapeado. No se aprovisionaron cuentas ni se activó ESPEJO. Las cuentas de orden requieren una definición contable explícita si llegan a usarse en el espejo.

Pendientes principales: preparar catálogo/precios del POS para probar venta y devolución por interfaz; ejecutar el ciclo automático completo de créditos/pagos/devoluciones; validar un asiento espejo y su reversa; luego continuar Platform y SUMA. No dar por terminada la integración por tener una verificación sin avisos.
