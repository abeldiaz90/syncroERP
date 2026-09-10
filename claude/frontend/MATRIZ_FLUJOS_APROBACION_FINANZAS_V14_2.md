# Matriz de flujos — Aprobaciones y Finanzas v14.2

| Proceso | Fuente de verdad | Inicio | Aprobación y estados | Efecto financiero/contable | Reversión o recuperación | Evidencia |
|---|---|---|---|---|---|---|
| Solicitud o cambio de crédito | Cliente: línea vigente + propuesta separada | Alta/edición de límite, plazo, riesgo, clasificación o política de vencidos | `NINGUNA/RECHAZADA/CANCELADA → PENDIENTE → APROBADA/RECHAZADA`; ciclo central `CREDITO_CLIENTE` | La autorización no genera póliza; habilita consumo posterior de línea global | Rechazo conserva línea vigente; cambio aprobado incrementa versión e invalida convenios anteriores | Snapshot de propuesta, versión, solicitante, niveles, resolutores y comentarios |
| Suspensión/reenvío de crédito | Estado operativo del cliente | Acción explícita de Finanzas/Gerencia/Dirección | Suspensión operativa separada; reenvío crea ciclo nuevo | Bloquea operaciones nuevas; no cancela deuda ni pólizas existentes | Suspensión cancela ciclos pendientes y suspende/cancela convenios; reenvío usa propuesta conservada | Responsable, fecha, motivo y nuevo ciclo |
| Solicitud/renovación de convenio | Cliente autorizado + hotel + vigencia | Crear o reenviar convenio | `PENDIENTE → APROBADO/RECHAZADO`; ciclo central `HOTEL_CONVENIO` | La aprobación no genera póliza; habilita checkout a crédito | Renovación crea versión/ciclo nuevo; nunca modifica cuentas históricas | Snapshot de línea, plazo, clasificación, versiones y vigencia |
| Suspensión/cancelación de convenio | Convenio | Acción operativa autorizada | `APROBADO → SUSPENDIDO`; cualquier no cancelado → `CANCELADO` bajo reglas del servicio | Bloquea cargos nuevos; conserva cartera y cobranza histórica | Convenio suspendido, rechazado, vencido o cancelado puede reenviarse con línea estable | Campos distintos de aprobado/rechazado/suspendido/cancelado, fechas y motivo |
| Checkout hotelero a crédito | Línea maestra + convenio aprobado y vigente | Cierre de folio con `CREDITO_EMPRESA/AGENCIA` | No requiere segunda aprobación si ya existe autorización vigente | Reserva línea global; crea cuenta City Ledger y evento contable `HOSPEDAJE` | Idempotencia por folio; error contable posterior queda en outbox | Cuenta con versión/número/tipo de convenio y condiciones aplicadas |
| Cobro City Ledger | Cuenta por cobrar hotelera | Registro de pago | No es aprobación; valida saldo, método, cuenta financiera e idempotencia | Reduce cartera, registra Tesorería, Caja cuando es efectivo y evento `COBRANZA`; reclasifica IVA proporcional | No permite sobrepago; evento contable se reintenta sin revertir cobro confirmado | Cobro, movimiento tesorería/caja, asiento pendiente y póliza |
| Desactivación de cliente | Cliente | Acción de catálogo | Cancela propuesta pendiente y suspende línea/convenios | Bloquea nuevas operaciones; conserva deuda, cobros y documentos | Reactivación no autoriza automáticamente la línea; requiere regularización/reenvío | Auditoría de estado, responsable y motivo |

## Reglas transversales

1. `empresaId` se valida en todas las consultas y transacciones del flujo.
2. El solicitante no puede aprobar.
3. Una persona no puede resolver más de un nivel del mismo ciclo.
4. La ruta se materializa con personas concretas al iniciar el ciclo.
5. Los niveles se atienden en orden y cada SLA inicia al liberarse el nivel.
6. La línea del cliente se consulta en el momento de la operación; el convenio no puede ampliarla.
7. Ventas y hotelería comparten el candado de crédito global.
8. Una aprobación autoriza; una operación económica contabiliza.
9. Cambios de versión no reescriben documentos ni cuentas históricas.
10. Deuda y trazabilidad no se eliminan por suspensión, cancelación o desactivación.
