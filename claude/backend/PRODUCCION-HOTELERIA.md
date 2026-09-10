# Puesta en producción: crédito hotelero y City Ledger

Esta versión impide cerrar un folio a `CREDITO_EMPRESA` o
`CREDITO_AGENCIA` si no existe una cuenta por cobrar válida. El cierre a
contado no cambia.

## Condiciones obligatorias

1. Materializar el esquema en una copia de la base mediante `DB_SYNC=true` y
   `NODE_ENV=development`. El sistema no usa migraciones y nunca sincroniza el
   esquema con `NODE_ENV=production`.
2. Respaldar la base productiva y probar restauración antes de desplegar.
3. Ejecutar **Hotelería → City Ledger → Auditoría histórica**. La verificación
   de producción debe indicar `listo: true`.
4. Confirmar cuentas afectables con estos roles:
   - `CLIENTES_CXC`
   - `IVA_TRASLADADO_NO_COBRADO`
   - `IVA_TRASLADADO_COBRADO`
   - `INGRESOS_HOSPEDAJE`
   - `IMPUESTO_HOSPEDAJE_POR_PAGAR`
5. Restringir el permiso de resolución de convenios a responsables de crédito
   o finanzas. El solicitante no puede aprobar su propio convenio.
6. Probar en staging los escenarios de la matriz siguiente con una copia
   anonimizada de datos reales.

## Matriz mínima de aceptación

| Escenario | Resultado obligatorio |
|---|---|
| Contado | Movimiento de Tesorería y cargo a caja/banco |
| Crédito sin convenio | Check-out rechazado, estancia y folio permanecen abiertos |
| Convenio pendiente o suspendido | Check-out rechazado |
| Convenio vencido | Check-out rechazado |
| Límite insuficiente | Check-out rechazado |
| Cartera vencida con bloqueo | Check-out rechazado |
| Crédito autorizado | Sin movimiento de Tesorería; crea City Ledger y carga Clientes CxC |
| Cobro parcial | Reduce saldo y reclasifica IVA proporcional |
| Cobro final | Saldo cero, cuenta liquidada y absorción del residuo de redondeo de IVA |
| Reintento con misma clave | No duplica cobro, Tesorería ni póliza |
| Falla contable | Negocio confirmado y asiento visible en operaciones pendientes |

## Históricos

El diagnóstico histórico es deliberadamente de sólo lectura. No debe
reclasificarse una póliza masivamente sin conciliar antes folio, pago, póliza,
cuenta bancaria y cobranza posterior. La corrección histórica debe aprobarla
Contabilidad y conservar póliza de reclasificación; nunca se elimina la póliza
original.

## Alcance de la validación automatizada

Las pruebas incluidas verifican reglas, redondeo, límites, bloqueo por vencido,
clasificación contable, IVA pendiente/cobrado, compilación y contratos DTO. La
autorización final de salida requiere pruebas E2E contra SQL Server y el PAC,
cuentas y permisos reales de la empresa.
