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

## Devolución comercial transaccional — fallo reproducido y corregido

La prueba real de DevolucionesVentasService contra PostgreSQL reprodujo un error al guardar PARCIALMENTE_DEVUELTA (21 caracteres) en ventas.estado varchar(20). La transacción se revertía y no se podía completar una devolución parcial.

Se amplió la entidad a varchar(30) y se añadió/aplicó localmente la migración PostgreSQL AmpliarEstadoVenta1789257600000. El down no trunca datos: PostgreSQL rechaza reducir el tamaño si ya hay estados de más de 20 caracteres.

Tras la corrección pasó probar-devolucion-transaccional.cjs: venta sintética de servicio por 1200, crédito MSI, devolución parcial de 600, reintento con mismo ID sin duplicado, devolución restante, crédito LIQUIDADO con saldo cero, venta DEVUELTA, dos eventos de devolución y rechazo de una devolución adicional. Se comprobó rollback de cliente, producto y venta sintéticos. TypeScript noEmit y git diff --check correctos.

La venta inicial se prepara mediante entidades y el crédito mediante CreditosService. La devolución llama al método público crear del servicio real. La generación inmediata de póliza está diferida; el evento contable se registra realmente dentro de la transacción. No hay CFDI, inventario físico, reembolso bancario ni petición a Fineract en esta prueba. No equivale todavía a venta/devolución por POS ni a merchantIssuedRefund confirmado en el core.

Repetición desde backend en PostgreSQL local de pruebas:

```powershell
node scripts/probar-devolucion-transaccional.cjs --aplicar-prueba-local
```

Aplicar la migración mediante el flujo de migraciones de cada instalación antes de probar. La ampliación local de esquema permanece; los datos comerciales sintéticos se revierten.

## Devolución ERP–Fineract comprobada — 12 de septiembre, hora local

Se ejecutó probar-devolucion-fineract.cjs con PostgreSQL y Fineract locales: el servicio real del ERP procesó devolución parcial y total de una venta sintética de servicio de 1200, y el adaptador real registró ambas en Fineract. El saldo se comparó en 1200, 600 y 0. La repetición de la devolución parcial devolvió el mismo ID externo.

Evidencia del core: cliente sintético 6, préstamo 4 LIQUIDADO, transacciones de devolución 14 y 16. La consulta de la transacción parcial confirmó tipo 21, merchantIssuedRefund=true y repayment=false. No se necesitó compensación. Cliente, venta, producto y crédito del ERP se revirtieron; Fineract conserva historial sintético sin saldo activo.

El escenario llama a servicios y adaptador, no al frontend ni al despachador automático. La prueba no cubre devolución de inventario físico, devolución con intereses, exceso ya pagado, transferencia bancaria ni timbrado. Siguen pendientes el recorrido POS, ciclo completo por outbox y asiento ESPEJO con reversa.

Desde backend, con un archivo nuevo para preservar evidencia y fecha válida para el core:

```powershell
node scripts/probar-devolucion-fineract.cjs --aplicar-prueba-local --fecha=2026-09-13 --resultado=C:/ruta/nueva/devolucion.json
```

Si falla, el script intenta dejar sin saldo únicamente el préstamo sintético de su propia ejecución y registra cualquier limpieza pendiente. La evidencia debe revisarse incluso si la prueba falla.

## Saldo por cliente y ciclo automático corregidos — 13 de septiembre

La primera prueba de crédito por outbox detectó SALDO_CLIENTE: ERP 1200, externo 0, aunque el préstamo externo sí tenía 1200. /clients/:id/accounts no incluye el bloque summary que el adaptador estaba sumando. Se corrigió resumenCliente para consultar el detalle de cada préstamo activo y obtener saldo y vencido desde summary. Las peticiones comparten el presupuesto de timeout. Un detalle sin saldo válido o una petición fallida ya no se convierte en saldo cero.

Validación: cinco regresiones pasaron (saldos desde detalle, respuesta incompleta, fallo de lectura, cierre concurrente y presupuesto de tiempo), TypeScript noEmit pasó y git diff --check pasó.

Prueba real posterior: cliente externo 8, préstamo 6 de 1200. Alta, originación y cancelación procesadas por el cron del backend; el script no invoca el despachador ni escribe al adaptador. Conciliación con crédito activo: cinco registros, cero diferencias. Tras cancelación: cuatro registros, cero diferencias. Estado remoto final withdrawn.by.client, saldo cero y no activo. La primera corrida también dejó cancelado su préstamo sintético 5.

El alta es preparación técnica y la originación usa CreditosService. La cancelación se prepara como hecho sintético mediante estado ERP y publicador para probar el consumidor; no equivale a anular una venta por la interfaz. El historial sintético persiste en ambos sistemas, sin línea de crédito vigente. El script restaura el estado previo del producto dentro de la misma transacción. Al retomar, los productos ya estaban ACTIVO; esta prueba no decidió activarlos permanentemente.

```powershell
node scripts/probar-outbox-credito.cjs --aplicar-prueba-local --resultado=C:/ruta/nueva/outbox-credito.json
```

Pendiente: pagos y devoluciones por el cron en un mismo recorrido comercial, POS completo, mora real y ESPEJO contable. La ausencia de diferencias nuevas no resuelve automáticamente hallazgos anteriores; se revisan conservando una nota de auditoría.

## Pago y devolución automáticos completos — 13 de septiembre

Prueba real con servicios ERP sin sustituciones: alta de cliente, creación de crédito, pago parcial y devolución. Todos los eventos fueron procesados por el cron del backend; el script no invoca el despachador ni escribe al adaptador Fineract. La venta, cliente, producto y cuenta bancaria se preparan como datos sintéticos; no se usa POS.

Resultado: cliente externo 9, préstamo 7. Saldos comparados en ERP y core: 1200, 600 tras pago y 0 tras devolución. Pago ERP 03b31d6f-b28a-4376-990e-efa32846fffd; devolución ERP 84930a55-a41c-4ecb-b1fb-6264a2be6aff, transacción externa 21 merchantIssuedRefund. Repetir las peticiones a los servicios retornó los mismos IDs y dejó un solo evento para cada hecho. Esto valida reintentos del productor, no un fallo de red después de aplicar una transacción externa. Conciliación final: cinco registros, cero diferencias. Préstamo closed.obligations.met, no activo.

El producto sintético inicialmente carecía de categoría contable. La devolución comercial y su evento se confirmaron, mientras el asiento quedó pendiente con un error explícito de cuenta de devoluciones. Se creó exclusivamente para ese producto una categoría sintética con la cuenta existente 402.01 y se reintentó el asiento específico. Ambos asientos quedaron GENERADO: cobranza y devolución, cada póliza con cargos600 y abonos600. No se activó ESPEJO; son pólizas internas del ERP, no journal entries externos.

La prueba preserva historial sintético en ERP y Fineract, incluida tesorería de prueba por600; no transfiere dinero real. Cliente sin línea vigente, producto y cuenta sintéticos desactivados. La venta queda parcialmente devuelta porque una unidad se pagó y la otra se devolvió. No representa prueba fiscal, inventario físico ni contabilidad completa de una venta, ya que su encabezado se preparó técnicamente.

El script portable incluye desde el inicio la categoría contable y las comprobaciones de ambas pólizas. La ejecución real validó esa configuración mediante reintento focalizado; se comprobó la sintaxis del script final sin repetir otra corrida persistente.

```powershell
node scripts/probar-outbox-cobro-devolucion.cjs --aplicar-prueba-local --resultado=C:/ruta/nueva/cobro-devolucion.json
```

Ante un fallo, revisar el archivo de evidencia y recuperar exclusivamente esa corrida; no ejecutarlo de nuevo a ciegas. Pendientes principales: recorrido comercial POS y ESPEJO contable con reversa, además de mora y casos con intereses.
