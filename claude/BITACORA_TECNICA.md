# Continuidad técnica compartida

Actualizado: 2026-09-14. Actualización registrada en esta sesión.
Estado: trabajo abierto; no declarar terminada la integración.

## Cómo retomar

1. Leer este archivo y `VALIDACION_FINERACT_2026-09-12.md` en el mismo directorio.
2. Revisar `git status -sb`, HEAD y cambios locales antes de editar. No asumir que la rama o el estado de la base siguen iguales.
3. Un agente modifica cada checkout a la vez. Antes de alternar, actualizar este archivo con resultados, pendientes, procesos activos y cambios sin commit.
4. Al volver, leer el avance del otro agente y comprobarlo; no repetir pruebas persistentes a ciegas ni revertir trabajo ajeno.
5. Publicar commits enfocados en la rama acordada y registrar el resultado real del push. No hacer merge a main ni force push por defecto.

## Rutas y permisos

Raíz del proyecto: `D:\SUMA\erpfineract`.

- ERP: `D:\SUMA\erpfineract\syncroERP\claude` (raíz Git: directorio padre syncroERP).
- Fineract: `D:\SUMA\erpfineract\fineract`.
- SUMA: `D:\SUMA\erpfineract\suma-consola`.
- Este documento versionado: `D:\SUMA\erpfineract\syncroERP\claude\BITACORA_TECNICA.md`.
- Entrada común: `D:\SUMA\erpfineract\LEER_PRIMERO.md`.

No usar clones antiguos D:\fineract o D:\syncroERP. No copiar secretos a documentación. Las credenciales están configuradas localmente: no imprimir .env, tokens o claves. Usar npm.cmd en PowerShell.

## Git confirmado al inicio de esta actualización

ERP: rama `codex/verificacion-productos-fecha-activacion`, remoto `https://github.com/abeldiaz90/syncroERP.git`. Último commit funcional publicado: `bb1bb3b`; árbol limpio antes de esta documentación. Usuario autorizó publicar avances en esta rama.

No se han revisado nuevamente los cambios ajenos de Fineract/SUMA en esta sesión. Fineract tenía cambios locales previos: no limpiar ni resetear. No se han creado usuarios ni ampliado permisos técnicos en estos últimos hitos.

## Estado validado (volver a consultar antes de modificar)

Empresa SUMA Local: `7dfc9526-986f-47e5-9503-f896646e347b`.
Cartera SOMBRA; contabilidad externa APAGADO. Oficina1. Cinco productos vinculados y verificados (30/60/90 días, MSI, MENS-CI), todos accountingRule NONE. Se encontraron ACTIVO en una sesión posterior; no confundir con antiguos informes BORRADOR.

Puertos usados: ERP frontend3000/backend4000, Fineract frontend3002/core8443, PostgreSQL ERP55432. No reiniciar procesos a ciegas. SUMA3010 y Platform3003 requieren revisión posterior.

## Completado y evidencia

- Fecha mínima de proyección respeta activación del cliente externo.
- Idempotencia de pago/devolución confirma transacción externa antes de aceptar errores400/403/409. Reversa mediante ajuste transactionAmount0.
- Verificación contable revisa productos vinculados, no sólo parámetros antiguos (be726c9).
- Migración PostgreSQL `1789257600000-AmpliarEstadoVenta` aplicada localmente: estado de venta varchar30 admite PARCIALMENTE_DEVUELTA (653e129).
- Devolución parcial/total por servicio ERP y adaptador real: merchantIssuedRefund confirmado (bf5f38a).
- ResumenCliente lee detalle de préstamos porque /clients/:id/accounts no trae summary; presupuesto de tiempo compartido. Cinco regresiones y TypeScript pasaron (76b9b65).
- Alta/originación/cancelación por cron real y conciliación con saldo activo y cerrado sin diferencias.
- Pago y devolución por servicios ERP completos y cron, sin forzar despachador: 1200→600→0. Reintentos del productor no duplicaron IDs/eventos. Préstamo7 del cliente externo9 liquidado, devolución externa21 merchantIssuedRefund; conciliación final5 registros0 diferencias (bb1bb3b).
- Dos pólizas internas ERP (cobranza/devolución) generadas y balanceadas600/600. La devolución inicialmente falló por categoría sintética sin cuenta: se completó con cuenta402.01 existente y reintentó sólo ese asiento. Esto NO es ESPEJO externo.

Scripts portables en `backend/scripts`: probar-fecha-verificacion.cjs, probar-idempotencia.cjs, probar-ciclo-transaccional.cjs, probar-ciclo-fineract.cjs, probar-devolucion-transaccional.cjs, probar-devolucion-fineract.cjs, probar-outbox-automatico.cjs, probar-outbox-credito.cjs y probar-outbox-cobro-devolucion.cjs. Leer argumentos y alcance antes de ejecutar.

Pruebas reales locales con datos sintéticos: no producción ni dinero real. Algunas hacen rollback ERP; otras preservan historial. Las pruebas por cron son persistentes. No describirlas como realizadas desde POS. La última venta se preparó por entidades, pago/devolución por servicios. El script final incorpora categoría desde el inicio, pero esa configuración se validó mediante reintento focalizado y no otra corrida completa.

Historial core sintético conservado: préstamos1/5/6 cancelados,2/3/4/7 liquidados. Último ciclo ERP conserva venta parcialmente devuelta y tesorería sintética600, banco/producto desactivados y cliente sin línea. No eliminar historial. Discrepancia sintética0915fd09-96f3-4701-b81a-6b893217dfdd se revisó con nota tras corregir saldo; entonces abiertas0.

## Pendiente prioritario / próximo paso

1. Completar recorrido desde POS: crear configuración comercial sintética mínima, vender por UI, pagar/devolver por UI y confirmar cron/core/conciliación. El usuario inició sesión; comprobar vigencia. El 13/09 el diagnóstico encontró cero almacenes, productos, categorías y bancos activos y ninguna lista de precios. El 14/09 se reabrió POS; aún no se confirmó una venta por pantalla.
2. Probar mayor ESPEJO: mapeo de cuentas necesario, asiento externo balanceado, consulta, reversa e idempotencia. No activar globalmente a ciegas. Simulación de catálogo completo:1030 candidatas y53 cuentas ORDEN sin equivalencia automática; no se aprovisionaron masivamente.
3. Mora real, casos con intereses, devolución de inventario/exceso pagado, fallos de red tras aplicación y escenarios fiscales permanecen fuera del cierre actual.
4. Tras cerrar integración crítica, revisar Platform/SUMA y smoke integrado. No volver a hacer bootstrap ni recrear empresa/cuenta técnica.

## Evidencia detallada local

La carpeta original de trabajo en OneDrive (`…\Documentos\…\SyncroERP-Fineract-SUMA`) conserva JSON de resultados y scripts diagnósticos. No hace falta dar permiso de escritura allí: las evidencias relevantes se copiarán a `D:\SUMA\erpfineract\evidencias` para lectura compartida. No ejecutar los builders o scripts one-off de esa carpeta; pueden repetir mutaciones.

## Registro de relevo

2026-09-14 · creado el protocolo de continuidad pedido por el usuario. Retomando POS. No se ejecutaron nuevas operaciones comerciales en esta actualización inicial. Antes de ceder, añadir estado final abajo y registrar cualquier nuevo fixture o pendiente.

### Cierre de actualización del 14/09 — preparación POS lista

Preparación completada y comprobada: un almacén, categoría, producto y banco activos; lista Mercancía general por defecto (antes no existían listas). Servicio SRV-001 a600; categoría con cuentas existentes401.01/402.01. Cliente CLIENTE SINTETICO PRUEBA POS con línea sintética1200, sólo para el escenario. Su alta se publicó; confirmar envío antes de vender. No se simuló una aprobación real: estos datos se prepararon técnicamente.

Evidencia exacta y todos los IDs: D:\SUMA\erpfineract\evidencias\preparacion-pos.json. No volver a ejecutar preparar-pos-local.cjs: el escenario ya existe. Reutilizarlo.

Próxima acción: acceder al ERP3000 con sesión humana, abrir /dashboard/ventas/pos, buscar SRV-001, agregar dos unidades, seleccionar CLIENTE SINTETICO PRUEBA POS y producto MSI a seis cuotas sin enganche. Revisar importes1200 y fecha válida antes de confirmar la venta sintética. Después comprobar crédito, cron, pago600 y devolución de una unidad por UI, y cerrar verificando ambos saldos0 y pólizas. Si cualquier pantalla falla, documentar URL, mensaje y estado persistido antes de reintentar.

Bloqueo de UI al cerrar esta preparación: sesión expirada, login Keycloak abierto y solicitado al usuario. No hubo venta por UI. No hay una prueba comercial ejecutándose en segundo plano. ESPEJO sigue pendiente y no se activó.

Al finalizar el escenario, desactivar únicamente los fixtures identificados en preparacion-pos.json y dejar cliente sin línea, conservando trazabilidad. Lista no tiene columna activo: revisar su uso antes de cambiarla, no borrar historial. Registrar en este archivo cualquier saldo o asiento que quede pendiente.

### Relevo 2026-09-14 — recorrido POS cerrado por pantalla

Motivo del relevo: se agotó la cuota de la sesión anterior a mitad del pago/devolución por UI.

Estado encontrado al entrar (verificado, no asumido): venta folio 2 `a624dc2f-1458-4c6f-b437-5f1f26b5664d` COMPLETADA por POS UI, total 1200, método MENSUALIDADES, cliente y almacén de `preparacion-pos.json`. Crédito `CRD-2026-0004` (`38d4b3be-ea43-4a93-8805-1ea936ecf9a7`) ACTIVO, 6 cuotas de 200 sin interés. El pago de 600 por UI (`acf30168`, EFECTIVO, ref PRUEBA UI SIN DINERO REAL) ya estaba aplicado: cuotas 1-3 PAGADAS, saldo 600. Outbox 15 ENVIADO, 0 pendientes. Conciliación previa: 7 revisados, 0 discrepancias.

Ejecutado sólo por pantalla: `/dashboard/ventas/devoluciones/nueva`, venta #2, 1 unidad de SRV-001, condición "Regresa a existencia", reembolso EFECTIVO sobre la caja sintética, motivo "PRUEBA UI SIN DINERO REAL". Importe estimado 600.00. POST `/ventas/:id/devoluciones` respondió 201. Devolución `0da34eb0-fa56-462e-8312-f23bad44871a`, folio DEV-2, PROCESADA.

Resultado final del ciclo completo POS -> crédito -> pago -> devolución:

- Venta folio 2: PARCIALMENTE_DEVUELTA, totalDevuelto 600.
- Crédito CRD-2026-0004: LIQUIDADO, saldoPendiente 0, montoAjustesDevolucion 600.
- Outbox: 16 ENVIADO, 0 pendientes, 0 fallidos, 0 reintentos. Secuencia CLIENTE_ALTA -> CREDITO_ORIGINADO -> PAGO_REGISTRADO -> AJUSTE_DEVOLUCION, todos despachados por el cron real sin forzar el despachador.
- Conciliación tras la devolución: 6 revisados, 0 discrepancias, 0 abiertas. El conteo bajó de 7 a 6 al cerrarse el préstamo 8 del core.
- Disponibilidad del cliente: límite 1200, utilizado 0, disponible 1200, vencido 0.
- Pólizas internas ERP, las tres VIGENTES y balanceadas: IN-2026-00002 venta 1200/1200 (105.01 cargo / 401.01 abono); IN-2026-00003 cobranza 600/600 (101.01 cargo / 105.01 abono); DI-2026-00002 devolución 600/600 (402.01 cargo / 105.01 abono). Neto de 105.01 Clientes nacionales: 0.

Evidencia con todos los IDs: `D:\SUMA\erpfineract\evidencias\pos-ciclo-ui.json`.

Limitación declarada: el saldo del préstamo 8 en Fineract se comprobó por la conciliación ERP-core (0 discrepancias) y por la baja de 7 a 6 registros revisados, no leyendo la UI de Fineract. Si se quiere evidencia directa del core, queda pendiente abrir 3002 y capturar el préstamo 8 cerrado.

No commiteado desde esta sesión: el checkout se leyó desde un montaje Linux y `git status` marca todo el árbol como modificado por fin de línea. Commitear desde ahí reescribiría cientos de archivos. El commit de este relevo debe hacerse desde Windows (rama `codex/verificacion-productos-fecha-activacion`). Cambios sin commit reales de esta sesión: este archivo y `evidencias/pos-ciclo-ui.json`.

No se tocó ESPEJO: contabilidad externa sigue APAGADO, 4 cuentas sin mapear, cartera en SOMBRA. No se desactivaron los fixtures de `preparacion-pos.json`; siguen activos y el cliente conserva su línea de 1200 ahora libre. Decidir si se desactivan al cerrar el escenario o se reutilizan para la prueba de ESPEJO.

Pendiente inmediato sin cambios respecto a lo anterior: 1) ESPEJO con mapeo de cuentas, asiento externo balanceado, consulta, reversa e idempotencia. 2) Mora, intereses, devolución de inventario, exceso pagado, fallos de red tras aplicar y escenarios fiscales. 3) Platform/SUMA y smoke integrado, incluidos los tres modos (ERP+Fineract, ERP solo, Fineract solo) desde consola.

### Relevo 2026-09-14 (2) — ESPEJO preparado y bloqueado por variable de entorno

Hecho en esta tanda, tras cerrar el POS:

1. `GET /integracion/cuentas/pendientes` devolvió exactamente 4 cuentas, todas las que tocan las pólizas de la prueba: 105.01 (5 usos), 101.01 (2), 402.01 (2), 401.01 (1). El mapeo estaba vacío.
2. `POST /integracion/cuentas/aprovisionar?simular=1`: 4 se crearían, 0 reutilizadas, 0 problemas. Se repitió sin `simular` con el alcance por omisión `soloUsadas=true`, **no** con `todas=1`. No se aprovisionó el catálogo completo, así que las 1030 candidatas y las 53 cuentas ORDEN del informe anterior siguen sin tocar.
3. Resultado real: 105.01 -> idExterno 1, 101.01 -> 2, 402.01 -> 3, 401.01 -> 4. Mapeo guardado con el mismo código en ambos lados, 0 problemas, `cuentasSinMapear` pasó de 4 a 0.
4. `PATCH /integracion/configuracion` con `modoContabilidad: ESPEJO`. Respuesta 200, `avisos: []`. `GET /integracion/verificacion` devuelve `[]`: el proveedor no va a asentar por su cuenta, los productos siguen en accountingRule NONE.

Estado de contabilidad ahora: modoGlobal APAGADO, modoEmpresa ESPEJO, **modoEfectivo APAGADO**. Cartera intacta en SOMBRA.

**El espejo NO está encendido y no se asentó nada en el mayor externo.** El techo global se lee de `CONTABILIDAD_EXTERNA_MODO` en `syncroERP/claude/backend/.env.local`, hoy `APAGADO`. `IntegracionModoService.combinarContabilidad()` devuelve APAGADO mientras ese techo esté apagado, sin importar lo que pida la empresa: el global es un techo, no un valor por omisión. Así que falta un paso que sólo se puede dar desde Windows.

Evidencia: `D:\SUMA\erpfineract\evidencias\espejo-preparacion.json`.

#### Para quien retome: siguiente paso exacto de ESPEJO

Precondición, desde Windows: editar `syncroERP\claude\backend\.env.local` línea 29, `CONTABILIDAD_EXTERNA_MODO=ESPEJO`, y reiniciar sólo el backend 4000. No tocar `CARTERA_MODO=SOMBRA`. Después comprobar con `GET /integracion/estado` que `contabilidad.modoEfectivo` sea ESPEJO y que `cuentasSinMapear` siga en 0.

Luego, sin preparar nada nuevo: los fixtures de `preparacion-pos.json` siguen activos y el cliente `5336e38d` tiene su línea de 1200 libre otra vez, así que se puede hacer una segunda venta sintética por POS y recorrer venta -> cobro -> devolución observando el mayor externo. Lo que hay que probar y aún no se ha probado nunca:

- Asiento externo balanceado: que cada póliza VIGENTE del ERP genere su contrapartida en Fineract con el mismo importe y contra las cuentas 1/2/3/4 ya mapeadas.
- Consulta: poder leer ese asiento desde el ERP y que coincida con el interno.
- Reversa: cancelar una póliza en el ERP y ver que el asiento externo se revierte, no que se borra.
- Idempotencia: reintentar el mismo evento y que no duplique el asiento, igual que ya se validó para pago y devolución.

Riesgo conocido a vigilar: duplicar cuentas por cobrar si el proveedor asienta por su cuenta. Por eso `verificacion` debe seguir devolviendo `[]` después de encender el techo; si devuelve avisos, apagar antes de operar.

Incidencia operativa de esta sesión, por si reaparece: la sesión Keycloak caducó a mitad del trabajo y devolvió 401 "Sesión Keycloak inválida". Recargar `/dashboard` refresca el token y se puede continuar; no hizo falta volver a entrar. El aprovisionamiento de cuentas había terminado antes del 401, no quedó a medias.

Sigue sin commitear desde esta sesión, por lo ya explicado del fin de línea. Archivos tocados en esta tanda: este documento y `evidencias/espejo-preparacion.json`.

### Relevo 2026-09-14 (3) — modo ERP solo probado, y un hallazgo que conviene decidir antes de seguir

Primero lo que no se pudo: **SUMA 3010 y Platform 3003 no responden**. Los tres modos no se conmutaron desde la consola. Se usó `PATCH /integracion/configuracion`, que es exactamente la maquinaria (`IntegracionModoService`) que la consola gobierna, así que la prueba del comportamiento vale; lo que queda sin probar es la pantalla de la consola.

**Modo ERP solo.** Cartera de la empresa a APAGADO (efectivo APAGADO, global sigue SOMBRA). Venta por POS UI: 1 unidad de SRV-001, 600, cliente sintético, producto "Crédito simple a 30 días", vence 14 oct 2026. POST `/ventas` 201. Resultado: venta folio 3 COMPLETADA método CREDITO_30D, crédito **CRD-2026-0005** (`23a70f35-026e-4653-aa53-fe06532f575b`) ACTIVO con saldo 600, disponibilidad servida por el ERP sin degradación, y **cero eventos nuevos en el outbox**: siguió clavado en 16 ENVIADO. El ERP opera solo, de verdad: vende a crédito, calcula plazos y contabiliza sin tocar el core.

**Regreso a ERP + Fineract.** Cartera de vuelta a SOMBRA, más de 80 segundos de espera al cron. **Cero eventos nuevos.** Conciliación: 7 revisados, **2 discrepancias**:

- `98a83d54` SIN_CONTRAPARTE, entidad `23a70f35` (CRD-2026-0005), ERP 600 / externo 0. "El crédito está vivo en el ERP y no tiene correspondencia en el registro externo."
- `a86ed3ac` SALDO_CLIENTE, cliente `5336e38d`, ERP 600 / externo 0, diferencia 600 sobre tolerancia 1.

#### El hallazgo: cambiar de modo no es retroactivo, no hay backfill

Los productores consultan el modo **efectivo** antes de encolar. Con el eje apagado no se escribe nada en el outbox, y al reencenderlo no hay nada que recupere lo ocurrido durante el apagón. Vale para los dos ejes: `ContabilidadPublicadorService.polizaRegistrada()` sale sin hacer nada si `modoContabilidadDe()` no es ESPEJO, y `empresaAceptaEvento()` del despachador filtra por eje.

Consecuencias que importan para el producto de tres modos:

1. Un inquilino que opere en **ERP solo** y luego contrate **ERP + Fineract** arranca con el core permanentemente atrasado. Todo lo vendido antes queda huérfano.
2. La conciliación **sí lo detecta**, que es la buena noticia: no se degrada en silencio.
3. Pero **bloquea la promoción a AUTORIDAD**: `establecerModoCartera` rechaza AUTORIDAD con discrepancias abiertas. Un inquilino que pasó por ERP solo no puede subir de modo hasta resolverlas a mano.
4. Lo mismo para ESPEJO contable: sólo cubrirá pólizas **posteriores** a su activación. Las tres del ciclo POS de hoy (IN-2026-00002, IN-2026-00003, DI-2026-00002) no se espejarán nunca aunque se encienda el techo global.

Falta, entonces, una migración o backfill al encender un eje, o como mínimo un aviso explícito en la consola SUMA de que el cambio de modo no es retroactivo. Es una decisión de producto, no un bug que se deba parchear por cuenta propia.

#### Estado que se deja, a propósito

**Quedan 2 discrepancias ABIERTAS.** No se resolvieron porque son verdaderas: CRD-2026-0005 existe de verdad en el ERP y no tiene préstamo en el core. Cerrarlas sin corregir el fondo sería maquillar el hallazgo. Tres formas de cerrarlas, a elegir:

- Anular la venta 3, lo que cancela CRD-2026-0005. Ojo: en SOMBRA eso emite CREDITO_CANCELADO sobre un préstamo que el core nunca tuvo, y puede dejar el evento en rojo tras sus 8 reintentos. Es, de hecho, otra prueba interesante.
- Dar de alta a mano el préstamo equivalente en el core y vincularlo.
- Resolver con nota, como el 13/09 con `0915fd09`, dejando constancia de que el origen fue esta prueba de modos.

Mientras sigan abiertas, **cualquier intento de subir a AUTORIDAD será rechazado**. Tenerlo presente para no diagnosticarlo como fallo.

Evidencia completa: `D:\SUMA\erpfineract\evidencias\modos-erp-solo.json`.

Estado final de configuración al cerrar: cartera global SOMBRA / empresa SOMBRA / efectivo SOMBRA. Contabilidad global APAGADO / empresa ESPEJO / efectivo APAGADO, 0 cuentas sin mapear. Outbox 16 ENVIADO, 0 pendientes, 0 fallidos.

Pendiente, en orden: 1) Decidir qué hacer con las 2 discrepancias y con el backfill entre modos. 2) Encender `CONTABILIDAD_EXTERNA_MODO=ESPEJO` desde Windows y probar asiento externo, consulta, reversa e idempotencia. 3) Levantar SUMA 3010 y Platform 3003 para probar los tres modos desde la consola, que es como el cliente los va a cambiar. 4) Fineract solo, mora, intereses, devolución de inventario, exceso pagado, fallos de red y fiscal.

### Relevo 2026-09-14 (4) — ESPEJO encendido, primer asiento externo e idempotencia aprobada

El usuario puso `CONTABILIDAD_EXTERNA_MODO=ESPEJO` y reinició el backend. Comprobado al entrar: contabilidad global ESPEJO / empresa ESPEJO / **efectivo ESPEJO**, enlace disponible, 0 cuentas sin mapear, `verificacion` devuelve `[]` — el proveedor no asienta por su cuenta, que es la comprobación que evita duplicar cuentas por cobrar. Cartera sigue en SOMBRA.

**Operación.** Venta por POS UI, **de contado**, folio 4, 600, TRANSFERENCIA contra la cuenta sintética. Se eligió contado a propósito: aísla el eje contable y no añade cartera huérfana a las 2 discrepancias que ya están abiertas.

**Póliza interna.** IN-2026-00005, VIGENTE, cuadrada: 101.01 cargo 600 / 401.01 abono 600.

**Espejo.** Se encoló `POLIZA_REGISTRADA` con clave `poliza:dcf0effa...`, el **cron real** lo despachó sin forzar nada, 0 reintentos, y Fineract devolvió el asiento externo **`a2bef5f612d7`**. Es el primer asiento espejado de esta integración.

**Idempotencia: APROBADA.** Se reencoló el mismo evento (`POST /integracion/outbox/{id}/reencolar`, 201) y tras el cron volvió a ENVIADO con **el mismo `asientoIdExterno`**, 0 reintentos, y el outbox no pasó de 17 eventos. No duplica: el corto circuito por vínculo funciona.

**Reversa: BLOQUEADA, y no por el espejo.** `POST /finanzas/polizas/{id}/cancelar` responde **409: "Debes completar el Asistente Maestro de Finanzas antes de modificar los libros contables."** El puerto de contabilidad externa no expone "reversar" a propósito: la reversa viaja como otra póliza con su propio evento. Para probarla hay que completar el Asistente Maestro de Finanzas de la empresa, que es una decisión contable del negocio, no un paso técnico que un agente deba dar solo.

**Consulta: NO EJECUTADA.** El puerto tiene `buscarAsientoPorReferencia` y `saldoCuenta`, pero **ningún endpoint del ERP los expone**. No se leyó de vuelta el contenido del asiento externo. Lo que está probado es que Fineract lo aceptó y lo identificó; **no** está probado que sus partidas sean 600/600 contra las cuentas 4 y 2 del core. Ese es el hueco real que queda en ESPEJO, y cerrarlo pide o un endpoint de consulta o mirar el asiento en el portal de Fineract.

**El hallazgo de no-backfill, confirmado por segunda vez.** La póliza IN-2026-00004, del ticket 3 creado con el eje apagado, no generó evento al encender ESPEJO. Tampoco las tres del ciclo POS del 14/09. Encender un eje no recupera nada del pasado, ni en cartera ni en contabilidad.

#### Incidencia abierta que hay que mirar

Tras el reinicio del backend, **la ruta `/dashboard/ventas/devoluciones/nueva` del frontend devuelve 404**, incluso entrando por el enlace "Nueva devolución" de la propia pantalla. Esa misma ruta funcionó horas antes en esta sesión y su `page.tsx` sigue en disco. Sospecha: el servidor de desarrollo de Next quedó en mal estado, no una regresión de código. Revisar la ventana "ERP Frontend 3000" por un error de compilación y reiniciar el frontend. Por esto no se pudo hacer la devolución por pantalla para espejar un segundo asiento con la cuenta contraria 402.01.

Evidencia: `D:\SUMA\erpfineract\evidencias\espejo-primer-asiento.json`.

Estado al cerrar: outbox 17 ENVIADO, 0 pendientes, 0 fallidos. Siguen abiertas las 2 discrepancias de cartera de la prueba de modos. Nada commiteado desde esta sesión.

Siguiente paso sugerido: 1) reiniciar el frontend y reintentar la devolución por pantalla, que espeja el segundo asiento. 2) Leer el asiento `a2bef5f612d7` en el portal de Fineract y confirmar que está cuadrado contra las cuentas mapeadas. 3) Decidir sobre el Asistente Maestro de Finanzas para poder probar la reversa. 4) Lo de siempre: consola SUMA 3010 y Platform 3003, Fineract solo, el sentido inverso core -> ERP, mora, intereses, inventario, fallos de red y fiscal.

#### Corrección al relevo (4): la consulta SÍ se hizo, y el asiento externo está cuadrado

Se leyó el asiento en el portal de Fineract (`localhost:3002` → Contabilidad → Pólizas y asientos manuales → buscar `a2bef5f612d7`). Resultado leído del core:

| Transacción | Fecha | Sucursal | Cuenta | Tipo | Importe | Estado |
|---|---|---|---|---|---|---|
| a2bef5f612d7 | 14/09/2026 | Head Office | 101.01 Caja y efectivo | DEBIT | 600.00 | Vigente |
| a2bef5f612d7 | 14/09/2026 | Head Office | 401.01 Ventas y/o servicios gravados a la tasa general | CREDIT | 600.00 | Vigente |

**El asiento externo está cuadrado y es espejo exacto de la póliza interna IN-2026-00005** (101.01 cargo 600 / 401.01 abono 600). Las cuentas usadas son las mapeadas.

Y un segundo dato que cierra la idempotencia por una vía independiente: el core reporta **exactamente 2 líneas GL** para esa transacción después del reencolado. No hubo duplicado, confirmado en el propio mayor externo y no sólo por lo que devolvió el ERP.

Catálogo externo verificado en el portal: 4 cuentas, las 4 de detalle, las 4 admiten póliza manual, todas activas: 101.01, 105.01, 401.01, 402.01. Ni una cuenta de más.

Con esto ESPEJO queda: asiento externo balanceado **APROBADO**, consulta **APROBADA**, idempotencia **APROBADA** por dos vías. Sólo falta la reversa, bloqueada por el Asistente Maestro de Finanzas.

Nota para quien siga: el portal ofrece un botón **Reversar** sobre la línea del asiento. Eso reversaría en el core **sin que el ERP se entere**, y es justo el sentido inverso core → ERP que sigue sin probarse. No se ejecutó: muta el core y puede abrir una divergencia que el ERP quizá no detecte. Es una prueba que vale la pena, pero con el usuario delante y decidiendo.

#### Prueba de reversa en el core: AUTORIZADA pero NO EJECUTADA (corte por límite de uso)

El usuario autorizó reversar el asiento `a2bef5f612d7` desde el portal de Fineract para medir el sentido inverso core → ERP. **No se llegó a pulsar el botón Reversar: el agente se quedó sin cuota antes.** El core está intacto y el estado es consistente. No hay nada a medias.

Estado exacto capturado justo antes del intento, para que quien retome compare:

- Póliza ERP IN-2026-00005: VIGENTE, `polizaReversaId` null.
- Asiento externo `a2bef5f612d7`: 2 líneas GL, 101.01 DEBIT 600 / 401.01 CREDIT 600, ambas Vigente.
- Outbox: 17 ENVIADO, 0 pendientes, 0 fallidos.
- Contabilidad: global ESPEJO / empresa ESPEJO / efectivo ESPEJO, 0 cuentas sin mapear.
- Cartera: SOMBRA en los tres niveles.
- Discrepancias de cartera abiertas: 2 (las de la prueba de modos, `98a83d54` y `a86ed3ac`).

**Cómo ejecutarla cuando se retome:** portal `localhost:3002` → Contabilidad → Pólizas y asientos manuales → buscar `a2bef5f612d7` → botón **Reversar** en la línea de 101.01.

**Qué observar después, en este orden:**

1. ¿El core crea un asiento de reversa nuevo o marca el original como reversado? Anotar el id de la transacción de reversa.
2. ¿El ERP se entera por sí solo? Revisar `GET /integracion/estado` (outbox), la póliza IN-2026-00005 (debería seguir VIGENTE, porque nadie le avisó) y si aparece alguna discrepancia nueva.
3. **La sospecha fuerte, que es el punto de la prueba:** el endpoint `/integracion/conciliacion` concilia **cartera**, no contabilidad. Si es así, una reversa hecha en el core queda **invisible** para el ERP: el mayor externo y el interno divergen 600 y nadie lo detecta. Eso sería un hueco real del espejo, no un fallo de configuración.
4. Si se confirma, la corrección no es un parche rápido: hace falta una conciliación contable que compare saldos por cuenta mapeada usando `saldoCuenta` del puerto, que ya existe y **no tiene ningún endpoint que lo exponga**. Ése es el trabajo a proponer.

No ejecutar la reversa sin dejar apuntado el id de la transacción de reversa que devuelva el core, o se pierde la trazabilidad de la prueba.

### Relevo 2026-09-14 (5) — reversa core observada y saldo externo corregido

Leídos y preservados todos los avances de la sesión anterior. No se repitió la venta ni la devolución del ticket 2. Estado inicial por PostgreSQL y portal: póliza IN-2026-00005 VIGENTE, vínculo a2bef5f612d7, outbox17 ENVIADO y las mismas2 discrepancias de cartera.

La revisión automática impidió al agente confirmar la reversa por considerarla transacción financiera persistente. El usuario pulsó la confirmación y escribió «ya pulse». El portal confirmó la reversa: original a2bef5f612d7 marcado Reversado; nueva transacción a2bf0fcd569d, 101.01 CREDIT600 y401.01 DEBIT600, ambas vigentes. No se hizo una segunda reversa ni se restauró el asiento.

Después, el ERP conserva IN-2026-00005 VIGENTE, polizaReversaId null y vínculo original; outbox17 ENVIADO, sin nuevos eventos, mismas2 discrepancias. Revisión del código: /integracion/conciliacion usa CarteraConciliacionService; no se encontró conciliación del mayor. La divergencia contable de esta prueba sigue ABIERTA y no fue maquillada. La reversa ERP -> core continúa pendiente del asistente de Finanzas.

Corrección encontrada en esta revisión: saldoCuenta leía un booleano debit inexistente. La API real devuelve entryType.id (DEBIT2/CREDIT1). El adaptador ahora aplica el signo correcto y rechaza tipo/importe ilegible. Conserva tanto original como contrapartida para neutralizar reversas. Validación: 9 pruebas en2 suites aprobadas; consulta real por el adaptador devuelve caja0 y ventas0 después de la reversa. Esto corrige la lectura, NO agrega conciliación automática ni sincronización inversa.

Evidencias compartidas: resultado-reversa-core-antes.json, resultado-reversa-core-despues.json, resultado-mayor-core.json y saldo-contable-reversa-codex.json en D:\SUMA\erpfineract\evidencias. La evidencia del mayor contiene las partidas originales marcadas reversed=true; el ID nuevo y sus partidas se comprobaron en el portal. Los JSON de evidencia se conservaron.

Próximo trabajo: implementar conciliación contable con alcance explícito. No comparar indiscriminadamente todo el histórico ERP contra el core: las pólizas anteriores a ESPEJO no se enviaron. Comparar primero pólizas vinculadas/partidas y detectar reversas externas; definir corte y saldos de apertura para la conciliación agregada. Revisar también paginación de saldoCuenta (limit=-1 heredado) antes de usarlo sobre un mayor grande. Mantener abiertas las2 discrepancias de cartera del ticket3 hasta corregir su causa; no promover AUTORIDAD. Fixtures siguen activos para continuar pruebas, con su historial sintético intacto.

Operación: consultas elevadas confirmaron servicios3000,3002,3010,4000,8443 y55432 activos; no se reiniciaron. La sesión de Fineract se recuperó por SSO. No se volvió a probar aún la ruta de devolución que se reportó404 ni Platform3003.

### 2026-09-14 — ESPECIFICACIÓN del usuario sobre los tres modos (texto normativo, no interpretación)

El usuario fijó el criterio de aceptación. A partir de aquí, esto manda sobre cualquier supuesto anterior:

> Se debe cumplir de manera **bidireccional** cuando el cliente tiene contratado ERP **y** Fineract. Cuando es sólo ERP, Fineract no se debe enterar. Cuando es sólo Fineract, el ERP no se debe enterar. Pero todo lo que se le mueva a uno se debe reflejar en el otro, **en ambos sentidos**, cuando el cliente los tiene contratados juntos.

#### Verificación de la reversa externa (revisada a fondo, no dada por buena de palabra)

Comprobado en el repo y en ejecución real:

- El código **sí aterrizó en el repo**, no se quedó en la carpeta de trabajo anterior: `integracion/controllers/contabilidad-conciliacion.controller.ts`, `integracion/services/contabilidad-conciliacion.service.ts` y sus specs.
- `GET /integracion/contabilidad/conciliacion` devuelve, en vivo: alcance `POLIZAS_VINCULADAS`, 1 revisado, **1 discrepancia**, hallazgo `REVERSA_EXTERNA` sobre la póliza IN-2026-00005 / asiento `a2bef5f612d7`. Correcto y exacto.
- El alcance limitado a pólizas con vínculo es la decisión correcta: no marca como error lo anterior a ESPEJO.
- Tiene cron propio cada 10 minutos y **filtra por modo contable efectivo ESPEJO**, así que respeta el aislamiento. Bien resuelto.
- El bug del filtro de avisos huérfanos **sí quedó corregido**: `listarHuerfanos` usa `IsNull()` en vez de `null`, con spec de regresión (`avisos-huerfanos.spec.ts`). En vivo: 1 aviso con empresa, 0 huérfanos. Ya no se duplica.
- Efecto en el ERP: la póliza IN-2026-00005 sigue **VIGENTE** con `polizaReversaId` null. Es lo esperado: la conciliación avisa, no toca los libros.

Nota operativa: la sesión del portal de Fineract (3002) caducó durante la revisión. La reversa en el core quedó confirmada igualmente, y por una vía mejor: el propio ERP consultó el mayor externo y detectó que el asiento estaba reversado.

#### Dónde estamos contra la especificación

| Cuadrante | Estado | Evidencia |
|---|---|---|
| ERP → Fineract, ambos contratados | **CUMPLE** | Cartera y contabilidad probadas end-to-end, idempotencia aprobada por dos vías |
| Fineract → ERP, ambos contratados | **NO CUMPLE (detecta, no refleja)** | Conciliación contable levanta aviso `REVERSA_EXTERNA`; nadie actualiza el ERP |
| Sólo ERP | **CUMPLE** | Venta folio 3 en modo APAGADO: cero eventos al core |
| Sólo Fineract | **SIN PROBAR** | Nunca se ha tocado |
| Cambio de contratación | **NO CUMPLE** | No hay backfill: lo anterior al alta del segundo producto nunca se sincroniza |

La distancia real que falta está en un solo cuadrante y en el backfill. Y ojo con la palabra: hoy Fineract → ERP **detecta**, que no es lo mismo que **refleja**. Para contabilidad puede ser lo correcto a propósito (que el core no escriba en los libros fiscales del ERP es defendible). Para cartera no: si alguien registra un pago en el core, el ERP debería enterarse y reflejarlo, no sólo levantar un aviso para que una persona lo teclee otra vez.

Decisión pendiente del usuario, y es la que ordena el trabajo que queda: **qué entidades son de ida y vuelta de verdad y cuáles sólo se avisan**. Recomendación: repartir por tipo de entidad en vez de intentar sincronía bidireccional total —pagos y transacciones de cartera se reflejan de verdad; asientos contables se detectan y se resuelven con una operación del ERP, nunca escribiendo directo en los libros. La sincronía bidireccional sin dueño declarado por entidad obliga a resolver conflictos, y eso es una fuente de errores que no compensa aquí.

### 2026-09-14 — diseño de la sincronización bidireccional, aprobado por el usuario

El usuario aprobó el reparto por entidad de la tabla anterior y añadió dos condiciones: **automático de punta a punta, sin que nada espere a una persona**, y **sin quitar poder a los roles**.

Diseño completo en `syncroERP/claude/DISENO-BIDIRECCIONAL.md`. Lo esencial, para no tener que abrirlo:

- **Principio rector:** el reflejo hacia el ERP nunca escribe filas directas; entra por los servicios del ERP (cobranza, devoluciones, pólizas) con sus validaciones y reglas de rol intactas, disparado por una cuenta de servicio. Se automatiza quién teclea, no qué se permite. Escribir directo en tablas dejaría al core meter en el ERP estados que el ERP considera imposibles, y sin trazabilidad de quién hizo qué.
- **Discriminador exacto, sin heurística:** el ERP ya pone `externalId` propio en cada transacción que origina y guarda el vínculo. Toda transacción del core sin vínculo conocido nació fuera. Regla a no romper: cualquier camino nuevo que escriba en el core debe seguir poniendo su `externalId` y registrando el vínculo.
- **Cartera:** reflejo real en ambos sentidos (pago, devolución, cancelación, reversa de pago).
- **Contabilidad:** también automático, pero la corrección se aplica generando la operación del ERP que corresponde, no escribiendo en los libros. El caso `REVERSA_EXTERNA` ya detectado debe cerrarse cancelando la póliza vinculada. **Bloqueado por el Asistente Maestro de Finanzas (409).**
- **Mecanismo:** sondeo como vía principal, no webhooks. Sobrevive a cortes, no exige exponer el ERP a conexiones entrantes, y el conciliador de respaldo hay que construirlo igual: mejor que sea el camino principal y no un segundo mecanismo que se prueba poco y falla callado. El webhook, si se añade, sólo reduce latencia.
- **Ingesta:** `inbox`, espejo del outbox, reutilizando sus patrones ya probados (EN_VUELO, reintentos, circuito). Idempotencia por identificador de transacción del core.
- **Backfill:** paso explícito con informe previo, no automático al cambiar de modo. Mientras no exista, la consola debe avisar de que el cambio no es retroactivo.
- **Aislamiento:** filtrar por modo **efectivo** y no consultar siquiera al core para empresas en sólo ERP. La conciliación contable ya lo hace bien: copiar ese patrón.

**Orden de trabajo acordado:** 1) método de puerto para listar transacciones de un préstamo con su identificador externo —es la pieza que hoy no existe y de la que depende todo el sentido core → ERP—; 2) inbox y aplicador de cartera empezando por el pago externo; 3) cierre automático de `REVERSA_EXTERNA`; 4) sincronización inicial y aviso en consola; 5) altas nacidas en el core; 6) modo sólo Fineract.

Para repartir trabajo sin pisarnos: los puntos 1 y 2 son una sola cadena y conviene que los lleve un solo agente. El 4 y el 6 son independientes y se pueden tomar en paralelo.

### 2026-09-14 — implementado el paso 1 y medio paso 2 del sentido externo → ERP

Trabajo de código, no de pruebas. Todo compila (`tsc --noEmit` limpio), y **las pruebas no se pudieron ejecutar desde el entorno remoto**: jest no resuelve sus módulos sobre el montaje de archivos (falla con «Module ts-jest in the transform option was not found» aunque node sí lo resuelve). Es limitación del entorno, no del código. **Hay que correr `npm.cmd test` desde Windows antes de dar esto por bueno.**

#### Lo que se añadió

**1. `transaccionesCredito(idExterno)` en el puerto de cartera y en el adaptador de Fineract.**

Era la pieza que faltaba y de la que depende todo el sentido externo → ERP: hasta ahora sólo se podía leer el saldo resultante, que dice que algo cambió pero no qué, y con eso no se puede reflejar nada. Usa `GET /v1/loans/{id}?associations=transactions` y devuelve `{ idExterno, referenciaErp, tipo, monto, fecha, reversada }`. Devuelve null si el préstamo no existe allá, con el mismo criterio que `saldoCredito`. Fichero nuevo de pruebas: `fineract-transacciones-credito.spec.ts`.

**2. Defecto encontrado y corregido: la rama 404 de `saldoCredito` era código muerto.**

Comprobaba `error.estado` y `error.status`, y `ErrorFineract` expone el código en **`estadoHttp`**. Ninguno de los dos campos existe, así que la condición nunca se cumplía: un crédito borrado en el core se propagaba como avería de comunicación y la conciliación registraba **CONSULTA_FALLIDA en vez de DESAPARECIDO**. La rama `DESAPARECIDO` era inalcanzable.

Importa más de lo que parece por cómo se leen: CONSULTA_FALLIDA se interpreta como «el enlace va regular, ya se arreglará», y DESAPARECIDO significa «alguien borró un préstamo que aquí seguimos cobrando». El fallo degradaba en silencio un hallazgo grave a ruido ignorable. Corregido con un helper `esNoEncontrado()` compartido, y con prueba de regresión que cubre 404, 500, 503 y estado nulo.

**3. Detección de transacciones nacidas fuera, dentro del conciliador de cartera existente.**

No se creó un servicio nuevo: se añadió una pasada al `CarteraConciliacionService`, que ya tiene el filtrado por modo, el cron y el registro de discrepancias. Conceptos nuevos:

- `TRANSACCION_EXTERNA` — movimiento registrado directamente en el core y no reflejado en el ERP.
- `TRANSACCION_REVERSADA_FUERA` — el ERP la aplicó y alguien la reversó allá. El ERP la sigue dando por válida.
- `TIPO_EXTERNO_DESCONOCIDO` — tipo que esta versión no sabe clasificar. **No se ignora en silencio**: puede ser dinero real, y decidir que no lo es sin mirarlo es la clase de silencio que descuadra una cartera.

El discriminador es exacto y no usa importes ni fechas: el ERP escribe `syncro:<tipo>:<id>` como `externalId` en todo lo que origina (`referenciaDe()`), así que una transacción sin ese prefijo nació fuera.

**Dos listas, y las dos hacen falta.** `TIPOS_REFLEJABLES` (repayment, merchantIssuedRefund, payoutRefund, goodwillCredit, recoveryRepayment, downPayment) y `TIPOS_PROPIOS_DEL_CORE` (disbursement, accrual, accrualActivity, accrualAdjustment, incomePosting, reAge, reAmortize). La segunda no es un adorno: el **desembolso de cada préstamo lo genera el core y no lleva referencia del ERP**, así que sin enumerarlo cada crédito produciría un hallazgo falso y la conciliación quedaría enterrada desde el primer día. Se detectó antes de probar, al razonar el caso.

#### Lo que la prueba en vivo prueba, y lo que no

Se ejecutó `/integracion/conciliacion/ejecutar` con el código cargado: 7 revisados, **2 discrepancias, las mismas de antes**. Ningún falso positivo nuevo.

Pero hay que ser exacto: **eso no demuestra que el camino nuevo se ejecutara**. El bucle de créditos sólo recorre los ACTIVO/VENCIDO, y hoy el único ACTIVO es CRD-2026-0005, que no tiene vínculo y sale antes por `SIN_CONTRAPARTE`. Los demás están LIQUIDADOS. Así que la pasada nueva no tuvo ni un crédito que recorrer.

**Limitación heredada que conviene decidir:** al ignorar los créditos liquidados, una transacción externa sobre un préstamo ya saldado no se detectaría nunca. Es justo donde un cobro indebido pasa más desapercibido.

**Cómo probarlo de verdad:** hace falta un préstamo vivo en el core. Una venta a crédito en modo SOMBRA crea uno; después, registrar un pago directamente en el portal de Fineract y correr la conciliación. Debe aparecer `TRANSACCION_EXTERNA`.

#### Ficheros tocados

- `integracion/ports/cartera-externa.port.ts` — tipo `TransaccionCreditoExterna`, método en la interfaz y en el fallback.
- `integracion/adaptadores/fineract/fineract-cartera.adapter.ts` — implementación, helper `esNoEncontrado`, corrección del 404.
- `integracion/adaptadores/fineract/fineract-transacciones-credito.spec.ts` — nuevo.
- `integracion/services/cartera-conciliacion.service.ts` — pasada de transacciones externas.
- `integracion/services/cartera-transacciones-externas.spec.ts` — nuevo.

Ojo al editar: **el repo mezcla finales de línea**. `cartera-externa.port.ts` y `cartera-conciliacion.service.ts` son CRLF; el adaptador y los servicios de contabilidad son LF. Respetar el de cada fichero o el diff se vuelve ilegible.

Sigue sin commitear desde la sesión remota, por lo ya explicado.

### 2026-09-14 — el sentido externo → ERP detecta un pago nacido en el core. Probado de verdad.

Lo que faltaba del relevo anterior: demostrar que el camino nuevo se ejecuta y acierta. Hecho, con datos sintéticos y sin dinero real.

**Preparación.** Venta por POS UI a crédito simple a 30 días, 600, cliente sintético → **CRD-2026-0006** (`780c2e4e`), ACTIVO, saldo 600. El cron originó el **préstamo 9** en el core y espejó su póliza (`a2bf2b42b8eb`), sin forzar nada.

**Línea base antes de tocar el core: 8 revisados, 2 discrepancias, las dos de siempre.** Esto importa más de lo que parece: CRD-2026-0006 ya tenía vínculo y estaba ACTIVO, así que la pasada nueva **sí lo recorrió** y sólo encontró el desembolso, que calló correctamente. Es la prueba de que no hay falsos positivos justo donde más riesgo había.

**Pago nacido en el core.** Portal de Fineract → crédito 9 → Registrar pago, 600, nota identificándolo como prueba. El portal respondió *«operación aplicada correctamente en Fineract»* y el préstamo quedó **Cerrada (liquidada)**, pagado 600. El ERP siguió con CRD-2026-0006 ACTIVO y saldo 600: no se enteró, que es exactamente el escenario a cazar.

**Resultado: 8 revisados, 5 discrepancias.** La nueva:

> `TRANSACCION_EXTERNA` · crédito `780c2e4e` · ERP 0 / externo 600
> «La transacción 26 de tipo repayment, 600.00 el 2026-09-14, se registró directamente en el externo y no está reflejada en el ERP.»

También dispararon `ESTADO_DIVERGENTE` y `SALDO_CREDITO`, que ya existían. Y aquí está la diferencia que justifica el trabajo: **esos dos dicen que hay una diferencia de 600; el nuevo dice qué transacción la causó**, con id, tipo, importe y fecha. Esa es exactamente la distancia entre poder avisar y poder reflejar automáticamente. Sin el id de la transacción no hay forma de aplicar el pago equivalente en el ERP sin adivinar.

**Idempotencia:** segunda ejecución sin cambiar nada → mismas 5, `TRANSACCION_EXTERNA` sigue apareciendo una sola vez. Aprobada.

**Falsos positivos:** ninguno. Ni el desembolso ni las transacciones originadas por el ERP se denunciaron.

Evidencia completa: `evidencias\deteccion-transaccion-externa.json`.

#### Estado que se deja

**5 discrepancias abiertas, todas verdaderas.** Tres son de CRD-2026-0006 por el pago externo que sigue sin reflejarse —porque el aplicador todavía no existe—, y dos son las anteriores de la prueba de modos. CRD-2026-0006 está ACTIVO en el ERP con saldo 600 mientras el préstamo 9 está cerrado en el core.

No se resolvieron a propósito: son el material de prueba del siguiente paso. Cuando exista el aplicador, la señal de que funciona es que estas tres se cierren solas.

#### Lo que sigue, con el camino ya despejado

1. **El aplicador.** Tomar `TRANSACCION_EXTERNA` y aplicar la cobranza equivalente **por el servicio de cobranza del ERP**, nunca escribiendo saldos. Idempotente por id de transacción del core. Es la pieza que convierte detección en reflejo.
2. `TRANSACCION_REVERSADA_FUERA` implementado pero **sin probar en vivo**: hace falta reversar en el core un pago que haya originado el ERP.
3. La limitación de los créditos liquidados sigue ahí, y es donde un cobro indebido pasa más desapercibido.
4. Correr `npm.cmd test` desde Windows: las pruebas unitarias nuevas siguen sin ejecutarse nunca, porque jest no funciona sobre el montaje remoto.

### 2026-09-14 — el aplicador. Un pago nacido en el core ya se refleja solo en el ERP.

Esto cierra el cuadrante que faltaba de la especificación. **Probado de punta a punta, sin intervención de nadie.**

#### El recorrido completo, verificado

Pago registrado directamente en el portal de Fineract sobre el préstamo 9 → la conciliación lo detecta (`TRANSACCION_EXTERNA`, transacción 26) → el aplicador lo refleja llamando al **servicio de cobranza del ERP** → CRD-2026-0006 pasa a **LIQUIDADO con saldo 0** → la conciliación cierra sus propias diferencias. De 5 discrepancias abiertas a 2, y las 2 que quedan son verdaderas (el crédito huérfano de la prueba de modos).

#### Las tres cosas que había que resolver bien, y cómo quedaron

**1. El eco.** `registrarPago` publica siempre `PAGO_REGISTRADO` al outbox. Reflejar un pago externo lo habría mandado de vuelta al core creando **una segunda transacción por el mismo dinero**. Es el fallo clásico de una integración bidireccional y habría sido invisible hasta el descuadre.

Se corta en el origen: `registrarPago` acepta ahora `opciones.idTransaccionExterna` y, cuando viene, no publica. **No está en el DTO a propósito y no debe estarlo**: si un cliente HTTP pudiera activarlo, podría registrar cobranza que nunca se replica y descuadrar las dos carteras sin dejar rastro. Sólo lo pone código del servidor.

Verificado: tras aplicar, no se emitió `PAGO_REGISTRADO`. El único evento nuevo fue `POLIZA_REGISTRADA` de la póliza contable de la cobranza, que sí debe espejarse.

**2. Dónde entró el dinero.** El servicio de cobranza exige cuenta de caja o banco, y el ERP no tiene forma de saber dónde entró un dinero que recibió otro sistema. Se añadió `parametrosProveedor.cuentaCobranzaExternaId`. **Sin configurar, el aplicador encuentra la transacción y se niega a aplicarla**, diciendo exactamente por qué. Probado. Un asiento de cobranza contra una caja elegida al azar es peor que no tener el asiento: descuadra la tesorería y nadie lo nota hasta el arqueo.

**3. Idempotencia a prueba de caídas.** La clave se deriva del id de la transacción externa (`ext:fineract:26`). Si el proceso muere entre aplicar el pago y guardar el vínculo, la siguiente pasada reintenta y **la propia cobranza reconoce la clave y devuelve el pago existente**, en vez de cobrar dos veces. Segunda pasada: 0 revisados, 0 aplicados.

#### El cierre automático de diferencias, y dos bugs que destapó

Tu requisito de que nada espere a una persona obligaba a algo más: las diferencias que se arreglan solas tienen que cerrarse solas. Si no, se acumulan para siempre, **bloquean el paso a AUTORIDAD**, y un tablero que nunca se vacía deja de leerse.

La conciliación cierra ahora las que ya no encuentra, **pero sólo de entidades que esa misma pasada revisó**. No mirar algo no es lo mismo que comprobar que está bien.

Con esa regla aparecieron dos problemas de fondo, los dos corregidos:

- **No se cerraban nunca.** El crédito, ya liquidado, salía del universo revisado justo cuando había que comprobar si se había arreglado. Se amplió: se revisan los créditos vivos **más cualquiera con diferencia abierta**. Lo que ya está señalado se sigue mirando hasta que deje de estarlo.
- **`ESTADO_DIVERGENTE` era un falso positivo latente.** Comprobaba sólo que el externo no estuviera activo, sin comprobar que el crédito siguiera vivo en el ERP. Marcaba como divergentes dos sistemas que coincidían, y esa diferencia falsa **no se podía cerrar nunca** porque reaparecía en cada corrida. Ahora exige las dos mitades: vivo aquí y cerrado allá, que es lo que el comentario original decía que quería comprobar.

#### Ficheros tocados

`integracion-vinculos.service.ts` (búsqueda inversa `porIdExterno`), `integracion.constants.ts` (clasificación de tipos compartida, para que detector y aplicador no se separen nunca), `cartera-conciliacion.service.ts`, `configurar-integracion.dto.ts` e `integracion.controller.ts`, `cobranza.service.ts`, **`credito/services/cartera-reflejo.service.ts` (nuevo)**, `cobranza.controller.ts` (`POST credito/cobranza/reflejar-externas`), `credito.module.ts`.

El aplicador vive en el módulo de crédito y no en el de integración a propósito: necesita al servicio de cobranza, y del otro lado formaría un ciclo entre módulos. El de integración ya reexporta el puerto y los vínculos justo para permitir esto.

Evidencia: `evidencias\reflejo-externo-aplicador.json`.

#### Lo que sigue sin hacerse

- **Las pruebas unitarias nuevas no se han ejecutado nunca.** Jest no funciona sobre el montaje remoto. `npm.cmd test` desde Windows, y es lo primero.
- El reflejo cubre **pagos**. Faltan devolución externa, cancelación externa y reversa de un pago propio (`TRANSACCION_REVERSADA_FUERA` se detecta pero no se refleja).
- Altas nacidas en el core: ni se detectan.
- Backfill al contratar el segundo producto.
- Fineract solo, consola SUMA, aislamiento entre empresas, mora, intereses, fiscal.
- Nada commiteado desde la sesión remota.

### 2026-09-14 — corregido un fallo propio en el aplicador antes de que llegara a nada real

Al revisar mi propio código de hace un rato encontré un error serio y lo arreglé. Lo dejo escrito porque es justo la clase de fallo que no da la cara hasta el arqueo.

**Qué estaba mal.** La lista `TIPOS_TRANSACCION_REFLEJABLES` metía en el mismo saco `repayment` y `merchantIssuedRefund`, `payoutRefund` y `goodwillCredit`. El aplicador llamaba a `registrarPago` con **todos** ellos.

Pero esos tres últimos no son cobros: son **movimientos que bajan el saldo sin que entre un peso** —una devolución al cliente, una bonificación de cortesía—. Reflejarlos como cobranza habría hecho que el ERP registrara un cobro, moviera tesorería y cargara la caja por dinero que nunca recibió. El asiento diría que la caja recibió algo que no recibió, y nadie lo notaría hasta cuadrar el arqueo.

**Cómo quedó.** La clasificación se partió en dos:

- `TIPOS_COBRANZA_DEL_CLIENTE` = repayment, downPayment, recoveryRepayment. Lo único que el aplicador convierte en cobranza.
- `TIPOS_REDUCCION_SIN_COBRO` = merchantIssuedRefund, payoutRefund, goodwillCredit. Se **detectan y se reportan**, y el aplicador los omite diciendo por qué. Su reflejo correcto es una devolución del ERP, que necesita la venta de origen, y esa pieza todavía no existe.

La conciliación sigue denunciando ambos grupos: son movimientos externos reales y deben verse. Lo que cambia es que el aplicador ya no confunde una devolución con un cobro.

**Pruebas.** `credito/services/cartera-reflejo.spec.ts` (nuevo), 12 casos. El más importante fija precisamente esto: los tres tipos de reducción sin cobro NO deben llamar a `registrarPago`. También cubre el corte del eco, la clave de idempotencia derivada del id externo, el rechazo a inventar la caja, el aislamiento en modo APAGADO, y que un rechazo del ERP o una caída de enlace se recojan como omisión en vez de forzarse o tomarse por «no hay nada».

Comprobado en vivo tras el cambio: reflejo 0/0/0, conciliación 7 revisados y 2 discrepancias, las dos verdaderas de la prueba de modos. Sin regresión.

Recordatorio que ya va siendo urgente: **ninguna de las pruebas unitarias escritas hoy se ha ejecutado**. Jest no funciona sobre el montaje remoto. `npm.cmd test` desde Windows.

### 2026-09-14 — paro el reflejo de devoluciones y reversas. Falta una decisión de negocio, no código.

Fui a implementar las dos piezas que quedaban del reflejo externo → ERP y me encontré con que **ninguna de las dos operaciones existe en el ERP**. No es que estén mal hechas: no existen. Construirlas es una decisión contable y fiscal, y no la voy a tomar solo.

#### 1. Devolución nacida en el core

La devolución del ERP (`ventas/services/devoluciones-ventas.service.ts`) hace el ajuste al crédito **dentro del flujo de la venta**: recorre los renglones devueltos, mueve inventario por almacén, calcula costo y merma según la condición, genera lo fiscal, y sólo entonces baja el saldo del crédito y publica `ajusteDevolucion`. No hay operación suelta que ajuste un crédito.

El problema de fondo: **el core no sabe qué se devolvió**. Un `merchantIssuedRefund` es un importe sobre un préstamo. La devolución del ERP necesita producto, cantidad, almacén y condición. Esa información no existe del otro lado, y no se puede deducir de un importe.

Sólo hay dos salidas, y las dos son decisión del negocio:

- **(a)** Crear una operación nueva: «ajuste de crédito por origen externo», que baje el saldo sin tocar venta, inventario ni fiscal. Es honesta —refleja la verdad financiera: el cliente debe menos— pero deja ajustes **sin respaldo comercial ni nota de crédito**. En México una devolución normalmente pide su CFDI, y esto lo esquivaría.
- **(b)** Aceptar que una devolución no se origina en el core. Se detecta, se reporta y se resuelve haciendo la devolución en el ERP, que es donde está la mercancía.

Mi opinión, que no es una decisión: **(b) para el caso comercial y (a) sólo si se confirma que alguien va a operar devoluciones directamente en Fineract**. Si nadie lo hace, (a) añade una vía de ajuste sin respaldo que tarde o temprano se usa para cuadrar cosas a mano, y eso es exactamente lo que no se quiere en una cartera.

#### 2. Reversa en el core de un pago que originó el ERP

Aquí el hallazgo es más gordo, y va más allá de la integración: **el ERP no sabe deshacer una cobranza**. No hay `cancelarPago`, `reversarPago` ni nada equivalente, y `PagoCobranza` **no tiene estado de cancelado**. Lo único parecido es `EstadoContableCobranza.REVERTIDO`, que es el estado del asiento, no el del pago.

Es decir: hoy, un pago mal capturado en el ERP —por la integración o por una persona— no se puede deshacer por ningún camino previsto. Eso no es una carencia de la sincronización; es una carencia del ERP que la sincronización acaba de sacar a la luz.

Mientras no exista, `TRANSACCION_REVERSADA_FUERA` sólo puede detectarse y reportarse, que es lo que hace hoy. Y está bien que así sea: inventar la reversa escribiendo en tablas sería peor que el problema.

#### Qué hace falta decidir

1. ¿Alguien va a operar devoluciones directamente en Fineract, o el core es sólo espejo para eso?
2. ¿Se construye la cancelación de cobranza en el ERP? Es una operación con efecto contable, de tesorería y posiblemente fiscal (REP). Necesita criterio de un contador, no de un agente.

Hasta que eso se responda, el reflejo automático cubre **pagos**, que es el caso frecuente, y lo demás queda detectado y visible. Lo cual es honesto: mejor un tablero que dice la verdad que un reflejo que inventa.

### 2026-09-14 — sincronización inicial (backfill). El tablero quedó en cero.

Implementado y probado contra el caso real que dejó la prueba de modos de esta mañana.

**El problema.** Encender un eje no es retroactivo —comprobado dos veces hoy—, así que un cliente que contrata Fineract después de llevar meses vendiendo a crédito arrancaría con el core permanentemente atrasado, y además **no podría promoverse nunca a AUTORIDAD**, porque esa promoción se rechaza con discrepancias abiertas.

**Cómo quedó.** `POST /integracion/sincronizacion-inicial`, con `?simular=1`. Decisiones de diseño que importan:

- **Paso explícito, no efecto secundario de cambiar el modo.** En un cliente real esto puede mover miles de eventos, y eso no debe ocurrir porque alguien tocó un selector en una pantalla.
- **Orden: clientes → créditos → pagos por fecha.** Un préstamo no se origina sobre un cliente que el externo no conoce, y un pago no viaja antes que su crédito. El despachador procesa por `fechaCreacion ASC`, así que el orden de emisión se respeta.
- **Los pagos se reemiten.** Sin ellos el préstamo externo nacería por el importe original y el saldo no coincidiría: la conciliación abriría una discrepancia por cada crédito recién sincronizado, que es peor que no haber sincronizado.
- **Los créditos con ajustes por devolución se EXCLUYEN y se reportan.** Originarlos crearía el préstamo por el importe completo sin el ajuste que lo bajó: nacería descuadrado. Más vale dejarlo fuera y decirlo que crear una contraparte que nunca va a cuadrar.
- Con modo de cartera APAGADO devuelve informe vacío sin tocar nada.

**La prueba.** Caso: CRD-2026-0005 (`23a70f35`), el crédito huérfano de la prueba del modo ERP solo, que causaba las 2 discrepancias abiertas.

- Simulación: 1 crédito, 0 clientes, 0 pagos, 0 excluidos, **outbox sin cambios**.
- Aplicación: emitió `CREDITO_ORIGINADO`, el cron lo despachó con 0 reintentos, préstamo **10** creado en el core.
- Conciliación después: **7 revisados, 0 discrepancias, 0 abiertas.**
- Segunda ejecución: 0/0/0, outbox sin cambios. Idempotente.

**El tablero de discrepancias quedó en cero por primera vez en toda la sesión**, y con eso la empresa ya podría promoverse a AUTORIDAD si se decidiera probarlo.

Evidencia: `evidencias\sincronizacion-inicial.json`.

**Lo que no cubre:** créditos con ajustes por devolución (excluidos y reportados) y el eje contable —las pólizas anteriores a ESPEJO siguen sin espejarse, y eso es otra decisión: espejarlas retroactivamente significa meter asientos con fecha pasada en el mayor externo.

Ficheros: `integracion/services/sincronizacion-inicial.service.ts` (nuevo), `integracion.controller.ts`, `integracion.module.ts`.

### 2026-09-14 — flujo de validación previo al crédito, simulado. El motor existe; lo que falta es que obligue.

Requisito nuevo del usuario: antes de otorgar un crédito debe correr un flujo de aprobación configurable por empresa, y sólo si aprueba se da de alta el crédito en el ERP y en Fineract. Detalle completo en **`DISENO-BIDIRECCIONAL.md`, anexo «Flujo de validación previo al crédito»**.

Lo esencial:

- **El motor ya está construido y es bueno** (`integracion/validacion/`): 7 tipos de paso, 3 políticas, pesos, umbrales, puntaje y tope automático, con pantalla de diseño en `/dashboard/creditos/verificacion` y plantilla sugerida.
- **Simulado con 5 escenarios.** Identidad rechazada → RECHAZADA. Buró rechazado → REVISION_MANUAL con 75 puntos. Todo aprobado → REVISION_MANUAL, porque `topeAutomatico` 0 significa que nada aprueba solo. Sin proveedores → REVISION_MANUAL: **falla en cerrado, no aprueba**. Correcto en los cinco.
- **El hueco: nada llama al motor fuera de su propio controlador.** El POS vende a crédito y el crédito se replica a Fineract sin que el flujo opine. La propia pantalla lo admite: «produce un veredicto y un expediente; no otorga el crédito». Hoy es un asesor, no una puerta.
- **Decisión de producto pendiente**, y es la de verdad: qué pasa con REVISION_MANUAL en el punto de venta. O la venta se detiene y queda solicitud pendiente, o no se vende a crédito ahí. Las dos son defendibles; dejar que pase no lo es.
- **Orden obligatorio cuando se enganche:** veredicto → alta en el ERP → evento a Fineract. Nunca al revés: un préstamo creado en el core para un crédito que luego se rechaza es justo la basura que la conciliación tendría que limpiar después.
- **Sobre llevarlo a la consola SUMA:** partir en dos. La consola define **qué capacidades de validación tiene contratadas** cada empresa (buró, círculo, identidad) y los topes duros de SUMA —eso encaja igual que los modos—. El ERP sigue definiendo **cómo** se ordenan en un flujo. El LEEME de la consola prohíbe explícitamente que ahí viva operación, y decidir a quién le presta un cliente es operación suya, no contratación de SUMA.

Estado dejado: flujo `fbd60ae4` **ACTIVO** en la empresa de pruebas, a propósito, para que se vea que hay flujo y aun así el POS no lo consulta. 8 expedientes de simulación. Todo sintético y desechable.

### 2026-09-14 — la validación ya es puerta, y va en el otorgamiento de la línea

El usuario corrigió el modelo: la validación **no** se ejecuta en cada venta, sino al **otorgar la línea de crédito**. Cuando el cliente llega al mostrador ya trae línea o no la trae. Eso disuelve la duda que yo había dejado abierta sobre REVISION_MANUAL en el POS.

**El punto de enganche ya existía:** `aprobaciones-documentos.service.ts`, proceso `CREDITO_CLIENTE`. Maker-checker: uno solicita, otro resuelve; al aprobar pone `estadoCredito = AUTORIZADO` y publica `lineaAutorizada` al outbox en la misma transacción. El recorrido que pide el usuario ya estaba construido; sólo faltaba que el motor de validación tuviera voz en él.

**Implementado** `exigirValidacionFavorable()`, justo antes de autorizar:

- Sin flujo activo no exige nada: quien no configuró verificación sigue igual.
- Con flujo activo y sin expediente, bloquea.
- Expediente RECHAZADA, bloquea citando motivos.
- REVISION_MANUAL y APROBADA_CON_AJUSTE dejan pasar **a propósito**: significan «que lo mire una persona», y quien aprueba aquí es una persona. Bloquearlas convertiría el veredicto más frecuente del motor —el que sale mientras no haya proveedores— en un candado imposible.
- El expediente debe cubrir el importe: uno por 5.000 no justifica una línea de 500.000.
- Los expedientes de **simulación no valen**: si valieran, cualquiera autorizaría forzando respuestas a APROBADO desde la pantalla de diseño.

Ficheros: `aprobaciones/services/aprobaciones-documentos.service.ts`, `aprobaciones-validacion.spec.ts` (nuevo, 9 casos), y el spec existente actualizado por el nuevo argumento del constructor. Typecheck limpio y el backend arrancó con la dependencia nueva.

Detalle completo en `DISENO-BIDIRECCIONAL.md`, sección A5.

**Queda de esta pieza:** que la solicitud dispare el flujo sola (hoy el expediente hay que crearlo a mano), mostrar el expediente en la pantalla de aprobación, y los proveedores reales —mientras no existan, todos los pasos devuelven NO_DISPONIBLE y ninguna línea se aprobará sola—.

### 2026-09-15 — el ERP ya sabe deshacer una cobranza

De los tres puntos que pidió el usuario, **hecho el segundo**: la cancelación de cobranza, que es la que yo había llamado «carencia del ERP, no de la integración». Los otros dos siguen pendientes y lo digo al final.

**Qué no existía.** Ni `cancelarPago`, ni estado de cancelado en `PagoCobranza`. Lo único parecido era `EstadoContableCobranza.REVERTIDO`, que es el estado del asiento, no el del pago. Un cobro mal capturado —duplicado, mal tecleado, devuelto por el banco— se quedaba para siempre.

**Migración** `1789430000000-CancelacionCobranza.ts`: añade `cancelado`, `fechacancelacion`, `motivocancelacion`, `canceladoporid` y `origenexterno` a `pagos_cobranza`, más un índice parcial de vigentes. Aditiva, con su `down`.

> **Aviso para quien trabaje aquí:** las migraciones **no corren solas** (`DB_MIGRATIONS_RUN=false`). Entre cambiar la entidad y correr la migración, la consulta de pagos devuelve 500. Me pasó; lo detecté y avisé de inmediato, y el usuario corrió `npm.cmd run db:migration:run`. Si tocas una entidad, corre la migración en el mismo movimiento.

**Qué hace.** Deshace el reparto entre cuotas de la última hacia atrás, devuelve el saldo al crédito, reabre el estado (ACTIVO o VENCIDO según haya cuotas vencidas), marca el pago **sin borrarlo**, encola la póliza de reversa, cancela el movimiento de tesorería y publica `PAGO_REVERTIDO` al outbox.

**Cinco candados, que son decisiones y no detalles:**

- Se niega si ya se timbró el complemento de pago: cancelar dejaría un **CFDI vivo respaldando un cobro inexistente**. La cancelación fiscal va primero y por su camino.
- **Sólo el último pago vigente** del crédito. El pago no guarda cómo se repartió entre cuotas, así que deshacerlo exige rehacer el reparto hacia atrás, y eso sólo es exacto sin pagos posteriores.
- Si el movimiento de tesorería ya está **conciliado con el banco**, tesorería se niega. Y con razón: eso ya no es error de captura, es dinero que el banco vio entrar.
- Exige motivo.
- El pago se marca, no se borra.

**La reversa contable va como póliza propia; la original no se toca.** Nuevo `TipoAsiento.CANCELACION_COBRANZA` y `generarAsientoDeCancelacionCobranza` en el motor contable: el mismo asiento con cargo y abono invertidos, reconstruido desde los datos del pago y no leyendo la póliza —si el catálogo cambió, la reversa usa las cuentas vigentes, que es lo correcto—.

**Probado en vivo.** Pago de 200 sobre CRD-2026-0005 (saldo 600 → 400, cuota 1 parcial) y cancelación: saldo **de vuelta a 600**, cuota **PENDIENTE con 0 pagado**, pago **cancelado con motivo** y `estadoContable REVERTIDO`, y póliza **DI-2026-00003** espejo exacto de la IN-2026-00008 original —105.01 cargo / 101.01 abono contra 101.01 cargo / 105.01 abono—, las dos VIGENTES y cuadradas. `PAGO_REVERTIDO` enviado a Fineract sin errores.

**Dos bugs míos que sólo aparecieron en la prueba en vivo, no en el typecheck:**

1. **Ninguna cancelación era posible**: el pago se contaba a sí mismo como posterior, porque `fechaCreacion` llega truncada a milisegundos en la entidad y en Postgres tiene microsegundos. Corregido excluyendo por id con `Not(pago.id)`.
2. El asiento de reversa fallaba con «data.fecha.getMonth is not a function»: el payload viaja serializado en la bandeja, así que la fecha vuelve como texto. Sólo aparecía al reintentar, no al encolar. Corregido reconstruyendo la fecha en el generador.

**Además quedó conectado el reflejo que faltaba:** si alguien reversa en Fineract un pago originado por el ERP, el aplicador llama a `cancelarPago` con `idTransaccionExterna`, que evita republicar la reversa al core.

Evidencia: `evidencias\cancelacion-cobranza.json`.

**De los tres puntos pedidos siguen pendientes dos:** el reflejo de la devolución externa —que necesita su propia operación, no es lo mismo que cancelar un pago— y el reparto consola/ERP de las capacidades de validación. Y el asiento de reversa se generó por reintento manual tras corregir el bug de la fecha; en una corrida limpia debería generarse solo, conviene comprobarlo.

### 2026-09-15 — los tres puntos pedidos, hechos. Resumen para quien siga.

El usuario pidió arreglar tres cosas que yo había declarado bloqueadas. Las tres están hechas. Evidencia con detalle: `evidencias\tres-piezas-claude-15sep.json`.

#### 1. Cancelación de cobranza — probada en vivo

Cubierta en el relevo anterior. Migración `1789430000000-CancelacionCobranza.ts` **ya aplicada por el usuario**. Probado: saldo restaurado, cuota devuelta a PENDIENTE, pago marcado (no borrado), póliza de reversa `DI-2026-00003` espejo exacto de la original, y `PAGO_REVERTIDO` enviado a Fineract.

#### 2. Reparto consola / ERP de las capacidades de validación — probado en vivo

**El principio:** la consola dice **qué** capacidades puede usar cada empresa; el ERP dice **cómo** las ordena en su flujo. Meter el diseño del flujo en la consola convertiría a SUMA en el comité de crédito de sus clientes, y el LEEME de la consola prohíbe explícitamente que ahí viva operación.

- **Contratables** (consumen proveedor externo): IDENTIDAD_INE, BURO_CREDITO, CIRCULO_CREDITO, LISTA_BLOQUEO.
- **No contratables**: HISTORIAL_INTERNO, POLITICA_INTERNA, REVISION_MANUAL. Son datos y criterio de la propia empresa; no hay nada que contratar para usarlos.
- **Ausencia de declaración = sin restricción**, a propósito. Hoy ninguna consola escribe esta lista, y tratar la ausencia como «ninguna contratada» dejaría a todas las empresas sin poder activar un flujo por una decisión que nadie ha tomado. Cuando la consola empiece a escribirla, la restricción entra sola.
- **Se comprueba al ACTIVAR, no al diseñar.** Diseñar un flujo con un paso aún no contratado es legítimo —sirve para ver qué faltaría—; lo que no puede es entrar en vigor y prometer un control que nadie va a ejecutar.

Probado: sin declarar → `sinRestriccion: true`. Declarando sólo IDENTIDAD_INE y LISTA_BLOQUEO, activar el flujo de 5 pasos devuelve **400: «El flujo usa capacidades que esta empresa no tiene contratadas: BURO_CREDITO»**, y **no se queja** de HISTORIAL_INTERNO ni POLITICA_INTERNA. Estado restaurado después.

Nuevo `GET /integracion/validacion/capacidades` para que el diseñador no ofrezca lo que luego no podrá activarse. `capacidadesValidacion` se acepta por ahora en `PATCH /integracion/configuracion` para poder probarlo; **cuando exista la consola, debe escribirla ella**.

#### 3. Reflejo de devolución externa — implementado, sin probar en vivo

**Lo que NO hace, y es deliberado:** no es una devolución de venta. La del ERP mueve inventario, calcula costo y merma por condición y emite lo fiscal; para eso necesita saber **qué** se devolvió, y el externo sólo sabe un importe sobre un préstamo. Inventar los renglones sería peor que no reflejar nada.

**Lo que sí refleja:** el efecto financiero, que es cierto —el cliente debe menos—. Baja `saldoPendiente`, suma `montoAjustesDevolucion`, reduce las últimas cuotas y genera su propia póliza con `PENDIENTE DE NOTA DE CRÉDITO` en el concepto. **El CFDI sigue haciendo falta y esto no lo sustituye**; queda anunciado donde lo verá quien revise la póliza.

**La cuenta no se adivina:** `cuentaDevolucionExternaId` en `parametrosProveedor`. No hay rol de sistema para devoluciones, y elegir una por parecido de código metería el importe en una cuenta de ingresos equivocada — de los errores más difíciles de encontrar meses después. Sin configurar, detecta y reporta.

**El excedente tampoco se inventa:** si la devolución externa supera el saldo vivo, se aplica hasta el saldo y el resto se reporta como saldo a favor del cliente, que es otra operación con su propio tratamiento.

#### Un falso positivo que destapó el propio ciclo

Tras cancelar un pago, la conciliación abría `TRANSACCION_REVERSADA_FUERA` sobre ese mismo pago. Era **el eco de nuestra propia cancelación**: el ERP canceló, publicó la reversa, el externo la aplicó, y volvía con pinta de reversa ajena. Corregido: si el pago ya está cancelado en el ERP, los dos lados coinciden y no hay nada que denunciar. Verificado: **7 revisados, 0 discrepancias, 0 abiertas**.

#### Lo que hay que saber antes de tocar esto

- **Las migraciones no corren solas** (`DB_MIGRATIONS_RUN=false`). Si tocas una entidad, corre `npm.cmd run db:migration:run` en el mismo movimiento o dejas la API en 500.
- **ninguna de las pruebas unitarias nuevas se ha ejecutado nunca.** Ya son seis ficheros. Jest no funciona sobre el montaje remoto; `npm.cmd test` desde Windows sigue siendo lo más barato y lo más urgente.
- **El ajuste por devolución externa no se ha probado en vivo.** Hace falta un `merchantIssuedRefund` registrado directamente en Fineract sobre un crédito vinculado, y configurar antes `cuentaDevolucionExternaId`.
- El asiento de reversa de cobranza se generó por reintento manual tras corregir el bug de la fecha; en una corrida limpia debería generarse solo. Conviene confirmarlo.
- **Nada está commiteado.** El repo mezcla finales de línea: `cartera-externa.port.ts`, `cartera-conciliacion.service.ts`, `cobranza.service.ts` y el motor contable son CRLF; el adaptador de Fineract y los servicios de contabilidad son LF. Respetar el de cada fichero.

### 2026-09-15 — cierre de sesión y entrega del turno

#### Lo último que se probó

**AUTORIDAD, por primera vez.** El tablero en cero lo desbloqueó. `PATCH /integracion/configuracion { modo: AUTORIDAD }` devolvió **200**: la regla que rechaza la promoción con discrepancias abiertas dejó pasar porque no hay ninguna. Estado resultante: global SOMBRA / empresa **AUTORIDAD** / **efectivo SOMBRA**.

Y ahí está el dato que conviene no olvidar: **el modo efectivo no sube porque el techo global manda**, igual que pasó con ESPEJO. Para que AUTORIDAD sea efectivo hay que poner `CARTERA_MODO=AUTORIDAD` en `backend\.env.local` y reiniciar. Es la misma trampa de ayer: se cambia la empresa, no pasa nada, y parece que está roto.

Se restauró SOMBRA. **Estado final: 0 discrepancias abiertas, outbox 25 ENVIADO sin pendientes ni fallidos.**

**Lo que NO se pudo probar:** el ajuste por devolución externa. El portal de Fineract no ofrece devolución comercial (`merchantIssuedRefund`) entre sus acciones —sólo pago, foreclosure, castigo y reversión de desembolso—, así que no hay forma de provocar el caso desde la UI disponible. La cuenta ya quedó configurada (`cuentaDevolucionExternaId` → 402.01), así que en cuanto se pueda registrar un refund en el core, el aplicador debería tomarlo.

#### Configuración que quedó en la empresa de pruebas

- `cuentaCobranzaExternaId` → `608176b7` (PRUEBA POS SIN DINERO REAL)
- `cuentaDevolucionExternaId` → `66f83aed` (402.01 Devoluciones sobre ventas)
- `capacidadesValidacion` → IDENTIDAD_INE, LISTA_BLOQUEO, BURO_CREDITO, CIRCULO_CREDITO
- Flujo de validación `fbd60ae4` **ACTIVO**, 5 pasos
- Cartera SOMBRA / Contabilidad ESPEJO, ambos efectivos

#### Lo que hay que hacer, por orden de valor

1. **Correr `npm.cmd test` desde Windows.** Seis ficheros de pruebas escritos hoy y **ninguno ejecutado nunca**. Es lo más barato y lo más urgente. Si algo falla, hay que arreglarlo antes de seguir.
2. **Commitear.** Nada de hoy está en Git y se tocaron muchos ficheros. Ojo con los finales de línea mezclados.
3. **Probar el ajuste por devolución externa** si encuentra la forma de registrar un `merchantIssuedRefund` en el core.
4. **Comprobar que el asiento de cancelación de cobranza se genera solo** en una corrida limpia. El de la prueba se generó por reintento manual tras corregir un bug de fecha.
5. Los pendientes de siempre: Fineract solo, los tres modos desde la consola, **aislamiento entre dos empresas** —el que más preocupa, porque todo se ha probado con una sola y el riesgo no es que falle la sincronía, es que una empresa vea datos de otra—, mora, intereses, fallos de red tras aplicar y escenarios fiscales.

#### Trampas del entorno, para no perder tiempo

- **Las migraciones no corren solas** (`DB_MIGRATIONS_RUN=false`). Tocar una entidad sin correr la migración deja la API en 500.
- **Los techos globales mandan sobre el modo de la empresa**, y viven en `.env.local`: `CARTERA_MODO` y `CONTABILIDAD_EXTERNA_MODO`. Un cambio de modo de empresa que «no hace nada» casi siempre es esto.
- La sesión de Keycloak del ERP **caduca cada pocos minutos**; recargar `/dashboard` la refresca sin volver a entrar.
- El repo **mezcla CRLF y LF** entre ficheros. Respetar el de cada uno.

### 2026-09-15 — LAS PRUEBAS YA SE EJECUTARON. Resultado.

Llevaba toda la sesión diciendo que jest no funciona sobre el montaje y pidiendo que alguien las corriera. Las corrí yo: empaqueté el código fuente (sin `node_modules`) en un tar, lo subí al contenedor, instalé dependencias ahí y ejecuté la suite. **Ya no hay excusa pendiente.**

#### Resultado de la suite completa

**64 suites: 58 pasan, 6 fallan. 353 pruebas: 331 pasan, 22 fallan.**

**Las 6 suites que fallan son ANTERIORES a mi trabajo. Ninguna es mía.** Comprobado, no supuesto:

- `common/coherencia.spec.ts` — los infractores que señala son `configuracion-integracion-empresa.entity.ts`, `ejecucion-validacion.entity.ts`, `flujo-validacion.entity.ts` y tres DTOs de `integracion/validacion`. Ficheros que yo no creé ni toqué. `pago-cobranza.entity.ts`, que sí toqué, **no aparece**: las columnas que añadí no son decimales y no infringen la regla.
- `finanzas/services/motor-contable.service.spec.ts` — 12 de 17 fallan con «No fue posible reservar el siguiente folio contable». Lo verifiqué a conciencia: **quité mis dos métodos nuevos de una copia y la suite sigue fallando igual, 12 de 17**. Es un problema de mocks/entorno preexistente en `crearPoliza`, no de mis añadidos.
- `auditoria`, `conciliacion-financiera`, `politica-credito`, `iam/auth.controller` — ninguno toca código que yo haya escrito.

#### Mis pruebas

**Las cuatro suites que escribí pasan enteras**, 49 pruebas en total tras la corrección:

| Suite | Pruebas |
|---|---|
| `fineract-transacciones-credito.spec.ts` | pasa |
| `cartera-reflejo.spec.ts` | pasa |
| `aprobaciones-validacion.spec.ts` | pasa |
| `cartera-transacciones-externas.spec.ts` | **13 pasan tras corregirla** |

#### Lo que encontró correr las pruebas

`cartera-transacciones-externas.spec.ts` fallaba en 10 de sus casos, y **el error era del spec, no del código**: lo escribí antes de añadir a `revisarTransacciones` el parámetro `vigentes` y la consulta `porIdExterno`, y nunca lo actualicé. El mock de vínculos no existía y el objeto de datos se había desplazado del índice 2 al 3.

Es exactamente la clase de desfase que sólo aparece ejecutando, y que mientras tanto daba una falsa sensación de cobertura: el fichero existía, se veía bien, y no probaba nada. **Corregido en la máquina del usuario**, con un caso nuevo añadido: que una transacción ya reflejada por el aplicador no se vuelva a denunciar.

#### Cómo repetirlo

En la máquina del usuario basta `npm.cmd test`. Desde el contenedor: empaquetar `src`, `package.json` y `tsconfig.json` en un tar dentro de una carpeta montada, subirlo, extraer, `npm install` (unos 568 MB) y `npx jest`. Tarda unos minutos pero funciona, y es preferible a dejar pruebas sin ejecutar.

Queda un tar de trabajo en `_backups-local\tests-src.tgz`, de 716 KB. Se puede borrar.

### 2026-09-15 — créditos CON INTERÉS, probados por pantalla. Primera vez.

Todo lo validado hasta hoy era con interés 0. Este es el primer crédito con interés real de toda la integración.

**Venta por POS**, producto «Mensualidades con interés» al 2.5% mensual sobre saldos insolutos, 3 cuotas. Venta folio 6, **CRD-2026-0007**.

**Lo que calculó el ERP:** capital 550, intereses 27.73, total 577.73, cuota 192.58.

**Lo que calculó Fineract para el préstamo 11:** principal 550, interés cargado 27.73, repago esperado 577.73.

**Y cuota por cuota, los dos idénticos al centavo:**

| # | Vencimiento | Capital | Interés | Cuota |
|---|---|---|---|---|
| 1 | 14/10/2026 | 178.83 | 13.75 | 192.58 |
| 2 | 14/11/2026 | 183.30 | 9.28 | 192.58 |
| 3 | 14/12/2026 | 187.87 | 4.70 | 192.57 |

Incluido el ajuste de un centavo en la última cuota, que es justo donde dos implementaciones de amortización suelen separarse. **Conciliación: 8 revisados, 0 discrepancias.**

**La póliza de la venta es 550/550 contra 401.01 y 105.01, sin cuenta de intereses**, y está bien: el interés no se reconoce al originar sino al cobrarse. Queda pendiente comprobar la póliza de una cobranza CON interés, que es la que debe llevar la cuenta 402 de intereses y la reclasificación de IVA.

#### Hallazgo de UX, real y molesto

El POS anuncia **«Crédito disponible: $600.00»**, deja armar un plan por exactamente 600, y al confirmar el backend responde:

> `409 — Crédito global insuficiente. Disponible: 600.00; solicitado: 630.24.`

Es decir: **la línea de crédito se consume con el total CON intereses**, no con el capital financiado. La regla puede ser la correcta —la exposición del cliente incluye el interés— pero **la pantalla no lo dice y deja llegar hasta el final**. Un cajero se topará con esto cada vez que el cliente quiera usar su línea completa, y el mensaje sólo aparece después de armar todo.

Dos arreglos posibles, decisión de producto: que el POS descuente el interés estimado del disponible al mostrar el plan, o que la línea limite capital y no total. Lo que no puede quedarse es como está.

Para poder seguir la prueba apliqué un descuento de 50 en la línea, bajando el capital a 550.

**Estado dejado:** CRD-2026-0007 ACTIVO con 577.73, préstamo 11 en el core, cliente con 22.27 de línea disponible. Conciliación en 0.

#### Cobro de una cuota CON interés — y un hallazgo importante de ESPEJO

Abono de 192.58 por la pantalla de cobranza sobre CRD-2026-0007. **El ERP desglosó solo: 178.83 de capital + 13.75 de interés**, exactamente los números de la cuota 1 de la tabla. Cuota 1 PAGADA, saldo 385.15.

**La póliza de cobranza sí lleva la cuenta de intereses**, que era lo que faltaba comprobar:

| Cuenta | Cargo | Abono |
|---|---|---|
| 101.01 Caja y efectivo | 192.58 | |
| 105.01 Clientes nacionales | | 178.83 |
| **401.32 Ingresos por intereses** | | **13.75** |

Cuadrada, y con la distinción correcta: a clientes sólo va el capital; el interés se reconoce como ingreso al cobrarse.

**El hallazgo: el espejo de esa póliza FALLÓ, y falló bien.**

> `POLIZA_REGISTRADA · FALLIDO · Falta mapear al mayor externo la(s) cuenta(s): 401.32.`

La cuenta de intereses nunca se había mapeado, porque el aprovisionamiento del 14/09 sólo cubrió las cuatro cuentas que tocaban las pólizas de entonces —todas con interés 0—. En cuanto apareció el primer interés, entró una cuenta nueva al juego y el espejo **se negó a asentar en vez de mandar un asiento incompleto**, diciendo exactamente qué cuenta faltaba y dejando el evento en rojo a la vista.

Es el modo de fallo correcto, pero deja una lección operativa que conviene no olvidar: **el mapeo de cuentas no es una tarea de puesta en marcha, crece con la operación.** Cada tipo de operación nuevo —intereses hoy, mora mañana, un impuesto pasado— puede meter una cuenta que nadie mapeó. Convendría que la conciliación contable avise de cuentas usadas y no mapeadas ANTES de que una póliza falle, en vez de enterarse por el evento en rojo.

**Recuperación, probada:** `pendientes` señaló la 401.32, el aprovisionamiento la creó en el core con id externo 5, se reencoló el evento y salió **ENVIADO** con su asiento `a2bf99c0f2bf`. Outbox otra vez en 29 ENVIADO, **0 pendientes y 0 fallidos**. Conciliación en 0 discrepancias.

### 2026-09-15 — MORA. Probada, y con un agujero encontrado y tapado.

Para provocar mora hubo que atrasar una cuota: hoy es 15/09/2026 y todo vencía en octubre o después. No hay forma de hacerlo desde el POS ni por API, así que el usuario corrió un UPDATE sobre la cuota 2 de **CRD-2026-0007**, moviéndola a 2026-08-15.

#### Lo que funciona bien en el ERP

- `actualizar-vencidos` marcó 1 cuota. Crédito a **VENCIDO**, cuota 2 a **VENCIDA**.
- **La disponibilidad detecta la mora por fecha, en tiempo real, sin esperar al cron**: antes de ejecutarlo ya reportaba `vencido: 192.58` y `puedeOperar: false`. El cron sólo persiste el estado. Bien resuelto.
- Razón de bloqueo clara: «El cliente tiene saldos vencidos en su exposición global».
- **El POS bloquea de verdad**: muestra el aviso y el botón «Registrar Crédito» queda `disabled`. Se pulsó dos veces y no se emitió ni una petición. No es que el clic se perdiera: el botón está deshabilitado.

**Detalle de UX menor pero real:** el botón deshabilitado **no se ve deshabilitado** —sus clases no incluyen ningún estilo para ese estado—, y los cinco productos de crédito se siguen ofreciendo. Un cajero pulsa, no pasa nada, y tiene que buscar el aviso arriba para entender por qué.

#### El agujero: la conciliación era ciega a la mora

Con el ERP dando el crédito por VENCIDO y Fineract por corriente, la conciliación devolvía **0 discrepancias**. Y era coherente con su diseño: **compara importes**, y los importes cuadraban al centavo (385.15 en los dos lados).

Eso significa que dos sistemas pueden coincidir en el saldo y estar en desacuerdo sobre la mora sin que nadie se entere. No es un detalle: la morosidad cambia provisiones, lo que se reporta a buró y a quién se le vuelve a prestar. Es una divergencia tan real como una de saldo.

**Tapado.** Nuevo concepto **`MORA_DIVERGENTE`** en la conciliación de cartera. El puerto ya devolvía `saldoVencido` del externo y nadie lo comparaba; ahora se contrasta contra la suma de cuotas vencidas no pagadas del ERP, con la misma tolerancia que el resto.

Verificado en vivo: la conciliación pasó de 0 a 1 discrepancia con el detalle exacto —

> `MORA_DIVERGENTE · CRD-2026-0007 · ERP 192.58 / externo 0.00`
> «Los saldos pueden cuadrar y aun así estar en desacuerdo sobre la mora.»

**Pruebas:** las cuatro suites nuevas siguen pasando enteras, **47 de 47**, ejecutadas de verdad en el contenedor tras este cambio.

#### Estado dejado, y cómo limpiarlo

Queda **1 discrepancia abierta**, `MORA_DIVERGENTE` sobre CRD-2026-0007. Es verdadera: los dos sistemas discrepan ahora mismo. Pero nace de una limitación del montaje, no de un fallo: la cuota se atrasó **sólo en el ERP**, y Fineract sigue viendo su vencimiento en 14/11. **La coincidencia de morosidad entre los dos sistemas sigue sin probarse**, y para probarla haría falta mover también la fecha de negocio de Fineract.

Para restaurar y volver a 0 discrepancias:

```
docker exec -i syncroerp-postgres psql -U syncroerp -d syncroerp -c "UPDATE amortizacion_cuotas SET fechavencimiento = '2026-11-14', estado = 'PENDIENTE' WHERE id = '788d8d91-1ee7-4dab-89cd-6ff3da160cd4';"
```

Después, `POST /credito/cobranza/actualizar-vencidos` y una corrida de conciliación, que cerrará sola la discrepancia por el mecanismo de cierre automático.

### 2026-09-15 — DEVOLUCIÓN DE INVENTARIO. Dos hallazgos, uno de ellos gordo.

**Antes que nada, una advertencia operativa.** Estuve un rato leyendo `syncroERP\syncro-erp-backend` creyendo que era el backend vivo. No lo es: es la foto vieja en SQL Server, sin módulo `integracion` y sin nada de lo que llevamos hecho. **El que corre es `syncroERP\claude\backend`.** Lo dice el comentario de cabecera de `INICIAR_TODO.bat`; yo no lo leí y saqué conclusiones de código muerto. Una de ellas era falsa —afirmé que el asiento de merma era fire-and-forget— y en el árbol vivo está bien resuelto, encolado dentro de la transacción. Si vas a leer código, empieza por comprobar que el archivo tiene `cancelarPago` o `MORA_DIVERGENTE`; si no los tiene, estás en el árbol equivocado.

#### Montaje

Primer producto **físico** del sistema: `INV-001` TERMO ACERO 1L, 10 piezas, costo 120, precio 200, categoría Mercancía general, almacén único. Venta por POS a crédito al cliente sintético: **ticket #7**, **CRD-2026-0008** por 200, y el outbox mandó `CREDITO_ORIGINADO` → **préstamo 12 en Fineract**. Inventario 10 → 9, movimiento SALIDA con costo unitario 120. Hasta ahí, correcto.

#### Hallazgo 1 — mercancía que entra al almacén pero no a la contabilidad

El asiento de la venta cayó a la bandeja de pendientes en FALLIDO:

> `VENTA-7 · faltan las cuentas de inventario o costo de ventas.`

Es el mismo modo de fallo correcto que vimos con la 401.32 de intereses: se niega a asentar incompleto y nombra lo que falta. `POST /catalogo/categorias/auto-configurar` resolvió las cinco cuentas (401.01, 501.01, 115.01, 402.01, 601.84), se reintentó y quedaron las dos pólizas cuadradas:

| Póliza | Cuenta | Cargo | Abono |
|---|---|---|---|
| Ingresos — Ticket #7 | 105.01 Clientes | 200 | |
| | 401.01 Ventas | | 200 |
| Costo de ventas — Ticket #7 | 501.01 Costo de venta | 120 | |
| | 115.01 Inventario | | 120 |

**Pero 115.01 quedó con saldo acreedor de −120** con 9 piezas por 1,080 en el almacén. Motivo: `catalogo/services/inventario.service.ts → registrarCompra` (líneas 125-305) **no encola ningún asiento**, y es la puerta que usan el alta de producto y la API para el stock inicial. En cambio `importacion-stock-inicial-masiva.service.ts:373` sí encola `INVENTARIO_INICIAL`. Dos puertas al inventario, sólo una pasa por contabilidad. Una cuenta deudora en saldo acreedor salta a la vista en cualquier balance, y no hay forma de explicarla en el cierre.

#### Hallazgo 2 — las fechas del sistema están seis horas adelantadas

La devolución se rechazó con:

> «La fecha de la venta es posterior al día de negocio actual. Revisa la zona horaria y el reloj del servidor.»

No es el reloj. La venta se hizo a las **20:33 hora de México** y quedó guardada como **`2026-09-15T08:33:01.497Z`**. La prueba está dentro de **un solo renglón del outbox**: `fechaEnvio`, que pone el código con `new Date()`, marca `02:35Z` y es correcta; `fechaCreacion`, que es `@CreateDateColumn`, marca `08:34Z`. Misma fila, dos columnas, seis horas.

Es el patrón conocido de `timestamp without time zone`: Postgres escribe el instante en UTC sin etiqueta y el driver lo reconstruye interpretándolo como hora local de México (UTC−6). **De 206 `@CreateDateColumn` del backend, sólo 7 declaran `timestamptz`** —las de caja y finanzas, ya corregidas por alguien que se detuvo ahí—. `venta.fechaVenta` es una de las 199 restantes.

Lo que rompe, en concreto:

- **Ninguna venta hecha después de las 18:00 se puede devolver esa misma noche.** El guardia de `devoluciones-ventas.service.ts:355` compara días de negocio y da −1.
- La ventana de `DEVOLUCIONES_DIAS_MAXIMOS` y el chequeo de periodo cerrado se miden con fechas corridas un día.
- Toda la traza de auditoría de esas 199 columnas está seis horas adelantada, y con ella cualquier corte por día.

**Mitigación aplicada:** se agregó `$env:TZ='UTC';` a la línea que levanta el backend en `INICIAR_TODO.bat` (original guardado como `INICIAR_TODO.bat.bak`). Alinea el proceso Node con la base sin tocar esquema y corrige las 199 columnas de golpe. Requiere reiniciar con `/reiniciar`. **El arreglo de fondo sigue pendiente: migrar las 199 columnas a `timestamptz`.**

#### Detalles menores, pero reales

- **El asistente de devolución pide el UUID de la venta a mano.** No hay búsqueda por folio de ticket ni por cliente. Ningún cajero se sabe un UUID.
- `categorias.service.ts → autoConfigurarCuentas` resuelve las cuentas **por prefijo de número** (`porPrefijo('4')`, `porPrefijo('5')`, `porPrefijo('13')`) e **ignora `rolSistema`**, que ya etiqueta de forma inequívoca INVENTARIO y COSTO_VENTAS. Aquí acertó porque existen 115.01 y 501.01 exactas, pero con otro catálogo el fallback de un solo dígito toma la primera cuenta que encuentre, sin orden definido.
- **Un crédito que deja de tener cuotas vencidas no vuelve a ACTIVO.** `cobranza.service.ts → actualizarVencidos` sólo escala: marca VENCIDO y nunca desmarca. El único camino de vuelta es `registrarPago`, que sí recalcula bien. Tras restaurar la cuota de CRD-2026-0007, el crédito quedó en VENCIDO con `vencido: 0`. La disponibilidad no se deja engañar —calcula la mora por fecha en tiempo real y devolvió `puedeComprarCredito: true`—, así que el POS no bloquea; pero el estado que ven las pantallas, la cartera vencida y las provisiones dice otra cosa.

#### Estado dejado

- Producto `INV-001` con 9 piezas, 115.01 en −120.
- Venta #7 COMPLETADA, CRD-2026-0008 ACTIVO con saldo 200, préstamo 12 en Fineract.
- La devolución de esa pieza **quedó sin procesar**, esperando el reinicio con `TZ=UTC`.
- CRD-2026-0007 restaurado a cuotas al corriente, pero con estado VENCIDO por lo dicho arriba.

#### Continuación: la devolución, ya con las fechas arregladas

Con `TZ=UTC` el guardia dejó de disparar y la venta #7 pasó a leerse `02:33:01.497Z`, el instante correcto. Mismos bytes en la base, lectura buena.

**DEV-3, devolución reintegrable de 1 pieza.** Todo cuadra:

| Efecto | Resultado |
|---|---|
| Inventario | 9 → 10, ENTRADA **al costo original de 120**, no al precio de lista |
| Crédito CRD-2026-0008 | LIQUIDADO, saldo 0 |
| Póliza de devolución | 402.01 Devoluciones 200 cargo / 105.01 Clientes 200 abono |
| Póliza de costo | 115.01 Inventario 120 cargo / 501.01 Costo de venta 120 abono |
| Fineract | préstamo 12 → **Closed (obligations met)**, outstanding 0 |

El movimiento hacia Fineract va como **`merchantIssuedRefund`, no como pago**, y el adaptador explica por qué en un comentario que vale la pena respetar: un pago cuenta como cumplimiento y una devolución no, y esa diferencia se ve en el historial del cliente. Es exactamente la distinción que del lado de entrada separa `TIPOS_COBRANZA_DEL_CLIENTE` de `TIPOS_REDUCCION_SIN_COBRO`. Los dos lados coinciden.

**DEV-4, devolución dañada con merma.** Los tres movimientos de inventario son los correctos y en el orden correcto:

1. SALIDA 10 → 9 (venta #8)
2. ENTRADA 9 → 10 (la pieza vuelve físicamente con DEV-4)
3. SALIDA 10 → 9 (merma por devolución dañada)

Es decir: la pieza no desaparece sin rastro, entra y sale con motivo. Y el costo no regresa a inventario sino que se reclasifica: **601.84 Merma 120 cargo / 501.01 Costo de venta 120 abono**. Correcto.

#### El `TZ` del lanzador no sobrevive al `--watch`

Al guardar un archivo, `nest start --watch` reinicia el proceso y **se pierde el `$env:TZ` del shell**. Se comprobó en vivo: la venta #8 volvió a guardarse seis horas adelantada. Por eso la corrección definitiva quedó **en `main.ts`**, en la primera línea del archivo, antes de cualquier import:

```ts
process.env.TZ = process.env.TZ || 'UTC';
```

Verificado: sobrevive al reinicio del watch y las ventas #7 y #8 se leen ambas bien. La línea del `.bat` se deja como cinturón y tirantes. **Sigue pendiente el arreglo de fondo: migrar las 199 columnas a `timestamptz`.**

#### Efecto lateral del TZ, encontrado y tapado

Poner el proceso en UTC arregló el almacenamiento pero movió otra cosa: `diaCalendario()` rinde con los captadores locales, así que el día que se le mandaba a Fineract pasó a ser el día **UTC**, no el día de negocio. Se vio con los ojos: la devolución DEV-3 llegó a Fineract fechada **2026-9-15** cuando el día de negocio en México era el **14**.

Corregido en `cartera-publicador.service.ts`: el helper `dia()` ahora baja los instantes con `fechaCalendarioNegocio()` —que respeta `BUSINESS_TIMEZONE`— y deja pasar tal cual las cadenas `yyyy-mm-dd`, que ya son días de calendario. **No se tocó `fecha-calendario.util.ts`**: ese par está bien pensado y su comentario advierte justo de la trampa contraria.

La prueba del arreglo está en los dos préstamos, uno antes y otro después:

| Préstamo | Desembolso | Devolución |
|---|---|---|
| 12 (DEV-3, antes) | 2026-9-14 | **2026-9-15** ← corrido |
| 13 (DEV-4, después) | 2026-9-14 | **2026-9-14** ← correcto |

No es cosmético: un día de diferencia mueve devengo de intereses y cálculo de mora entre los dos sistemas, que es la misma familia de desacuerdo que destapó `MORA_DIVERGENTE`.

#### El mapeo de cuentas al mayor externo, cuarta vez

`POLIZA_REGISTRADA` volvió a fallar dos veces más, primero por `115.01, 501.01` y después por `601.84`. Ya van cuatro operaciones nuevas —intereses, costo de ventas, inventario, merma— y en las cuatro apareció una cuenta que nadie había mapeado. El modo de fallo sigue siendo el correcto y el aprovisionamiento las resolvió todas, pero **esto confirma la recomendación anterior**: la conciliación contable debería avisar de cuentas usadas y sin mapear ANTES de que una póliza falle.

#### Estado final

- Outbox: **41 ENVIADO, 0 pendientes, 0 fallidos**.
- Conciliación de cartera: 8 revisados, **0 discrepancias**.
- Asientos pendientes: todos GENERADO, ninguno FALLIDO.
- Conciliación contable: 1 `REVERSA_EXTERNA` sobre `IN-2026-00005`, **anterior a estas pruebas**.
- Producto `INV-001`: 9 piezas. **115.01 en −120, que es exactamente el hallazgo 1**: nunca se asentaron las 1,200 de la entrada inicial.
- Préstamos 12 y 13 cerrados en Fineract; CRD-2026-0008 y CRD-2026-0009 LIQUIDADOS.

**Queda pendiente del orden acordado: el modo Fineract solo (#4), sin ninguna cobertura todavía.** Y sigue abierto el aislamiento multi-empresa, que es el riesgo más alto y necesita una segunda empresa.

### cierre de conciliación contable, 15 septiembre 2026

Leer VALIDACION_CONCILIACION_CONTABLE.md: implementación, pruebas21/21, consulta real final15 pólizas/1 reversa, aviso deduplicado y limitaciones. las 47 pruebas nuevas también pasan. Su relevo reciente se leyó, pero su bloque financiero aún requiere revisión: sincronización inicial incluye pagos cancelados; ajuste externo guarda ID numérico en UUID y no es atómico con su vínculo; revisar atomicidad de cancelarPago/tesorería. No se publicará ese bloque como validado sólo porque pasen sus pruebas. Se conserva todo sin borrar ni resetear. Próximo paso: corregir esas rutas antes de nuevas pruebas AUTORIDAD/reflejo.

### 2026-09-15 — MODO ERP SOLO, probado de verdad. Y el camino de alta posterior.

#### ERP solo: Fineract no se entera. Verificado con una venta real.

Con `{"modo":"APAGADO","modoContabilidad":"APAGADO"}` se hizo una venta a crédito completa por el POS: **ticket #9, CRD-2026-0010 por 200**.

| Qué se midió | Antes | Después |
|---|---|---|
| Eventos en el outbox | 41 | **41** |
| Créditos en el ERP | 9 | 10 |
| Préstamos en Fineract | hasta el 13 | **hasta el 13** (el 14 daba 404) |

**Ni un solo evento encolado.** Y mientras tanto el ERP hizo su trabajo entero y sin enterarse de nada: crédito ACTIVO y **las dos pólizas** —`Ingresos — Ticket #9` y `Costo de ventas — Ticket #9`— generadas con normalidad.

El corte está en **un solo sitio**, que es lo que hace que esto sea creíble y no una coincidencia: `cartera-publicador.service.ts` → `emitir()` consulta `activoPara(empresaId)` antes de encolar, y todos los hechos pasan por ahí. Un único punto que acertar en vez de un `if` repartido por todo el dominio.

#### El camino de alta posterior: contratar Fineract cuando ya llevas operando

Es el caso real de un cliente que empieza con ERP solo y luego contrata la integración, y salió limpio:

1. Se restauró `SOMBRA`/`ESPEJO`.
2. `POST /integracion/sincronizacion-inicial?simular=1` → **`{clientes: 0, creditos: 1, pagos: 0, excluidos: []}`**. Exactamente el crédito que nació a oscuras, ni uno más: el cliente ya estaba replicado y no lo volvió a mandar.
3. Corrida real → `CREDITO_ORIGINADO` ENVIADO con **`creditoIdExterno: 14`**.
4. Conciliación: **9 revisados, 0 discrepancias**.

Es decir, el backfill no duplica lo que ya existe y recupera justo el hueco. Vale la pena que quede dicho porque es la operación que más miedo da en una migración.

#### El techo global funciona, y por eso AUTORIDAD sigue sin probarse

Al poner la empresa en `AUTORIDAD`, el estado quedó así:

> `modoGlobal: SOMBRA · modoEmpresa: AUTORIDAD · modoEfectivo: SOMBRA`

El techo global de `.env.local` bajó la petición de la empresa, que es exactamente lo que promete el diseño: **una empresa puede bajar su modo, nunca subirlo por encima del global.** La protección contra encender por accidente a todos los inquilinos está y se comporta.

Para probar AUTORIDAD de verdad hay que subir el techo:

```
CARTERA_MODO=AUTORIDAD     # en claude\backend\.env.local
```

Ya está puesto, con el valor original comentado encima y copia en `.env.local.bak`. **Pero requiere reinicio completo del backend**: se comprobó que el `--watch` NO relee `.env.local` —dotenv no pisa variables ya presentes en el entorno del proceso padre, y ese entorno sobrevive al reinicio del watch—. Tocar un `.ts` no basta; hay que cerrar la ventana y volver a lanzar.

**Al terminar la prueba de AUTORIDAD hay que devolver `CARTERA_MODO=SOMBRA`.**

#### Un susto que no era

`disponibilidad` devolvió `consultadoEn: 2026-09-15T14:59Z` y parecía doce horas en el futuro. No lo era: ya es la mañana del 15 en México, 08:59 locales. Lo anoto porque estuve a punto de reportarlo como defecto; conviene comprobar la hora real antes de gritar.

### 2026-09-15 — AUTORIDAD. El modo funciona, pero nadie lo consulta.

Con `CARTERA_MODO=AUTORIDAD` en el techo global y la empresa en AUTORIDAD, el estado quedó en `modoEfectivo: AUTORIDAD` y la disponibilidad empezó a responder **`origen: "EXTERNO"`**. Hasta ahí, lo prometido.

#### La prueba: un pago nacido en Fineract

Se registró un pago de **100 directamente en el portal de Fineract** sobre el préstamo 14 (CRD-2026-0010, saldo 200). Nada tocó el ERP.

*Nota de camino:* el portal rechaza `POST /api/loans/14/transactions?command=repayment` con «Transacción de crédito no permitida». No es un bloqueo de negocio: espera el comando en el cuerpo, como `{command, payload}`, no en la query. Con el formato correcto entró sin problema.

**Inmediatamente después**, los dos lados discrepaban a propósito:

| | utilizado | disponible |
|---|---|---|
| Fineract (la autoridad) | 1085.15 | **114.85** |
| Tablas del ERP | 1185.15 | **14.85** |

Y el POS mostró **$14.85**. Es decir: en el modo donde Fineract manda, **la caja decidió con el número del ERP**.

#### Dónde está el corte

`GET /integracion/disponibilidad/:clienteId` es el único consumidor de `DisponibilidadCreditoService`, el servicio que respeta AUTORIDAD y que además trae `origen` y `degradado` para cuando el enlace se cae. Se revisó el árbol entero:

- En el backend, **nadie más lo usa**. No lo consulta la creación de créditos ni ningún otro decisor.
- En el frontend, **nadie llama a ese endpoint**. El POS pide `/credito/creditos/cliente/:id/politica` (`pos/page.tsx:208`) y decide con `politicaCredito.disponible` y `puedeComprarCredito` (`:370`, `:471-473`), que se calculan de las tablas del ERP.

O sea: el servicio que implementa la autoridad existe, funciona y está bien hecho —incluido el modo degradado—, y **no está cableado a nadie que decida**.

#### Pero la historia no acaba ahí, y el final es bueno

Unos minutos después se volvió a mirar y el ERP **ya se había enterado solo**:

- CRD-2026-0010 con saldo **100**.
- Política del ERP: disponible **114.85**, igual que Fineract.
- POS mostrando **$114.85**.
- Conciliación: **9 revisados, 0 discrepancias**.

El `cartera-reflejo.service.ts` levantó la transacción 37 de Fineract y la aplicó en el ERP sin que interviniera una persona. **La promesa bidireccional se cumple**: lo que se movió en Fineract se vio en el ERP, hasta la caja.

Y la comprobación que más importaba: **no hubo eco**. En el outbox hay cuatro `PAGO_REGISTRADO` y **todos son anteriores** —el más reciente de las 02:05—; ninguno de las 15:1x, cuando el reflejo aplicó el pago externo. En Fineract el préstamo 14 tiene exactamente **dos** movimientos: desembolso 36 y pago 37. No se duplicó. La supresión por `idTransaccionExterna` funciona en vivo, no sólo en las pruebas unitarias.

Lo que sí se encoló a las 15:15 fue un `POLIZA_REGISTRADA`, que es lo correcto: la **contabilidad** del cobro debe estar en los dos libros; el **movimiento del préstamo** no debe duplicarse. La distinción está bien hecha.

#### Conclusión, con la precisión que merece

No es cierto que AUTORIDAD «no haga nada»: la disponibilidad sí cambia de origen. Lo que pasa es que **ningún decisor la consulta**, y en la práctica el sistema converge igual porque el reflejo arrastra las tablas del ERP hacia Fineract.

**El riesgo real es la ventana.** Entre que alguien paga en Fineract y que corre el reflejo (cron cada 5 minutos) el POS decide con números viejos. En SOMBRA eso es aceptable —el ERP es la autoridad por diseño—. **En AUTORIDAD no debería existir esa ventana: es exactamente lo que el modo promete eliminar.** Un cliente que acaba de pagar en sucursal y entra a la tienda se queda sin comprar hasta cinco minutos.

**Arreglo propuesto:** que el POS pida `/integracion/disponibilidad/:clienteId` cuando el modo efectivo sea AUTORIDAD, y caiga a `politica` cuando la respuesta venga `degradado: true`. El campo ya existe para eso y hoy no lo lee nadie.

#### Restauración

- `CARTERA_MODO=SOMBRA` devuelto en `.env.local` (copia en `.env.local.bak`). **Surte efecto al próximo reinicio completo**; mientras tanto la empresa está en SOMBRA, así que el modo efectivo ya es el correcto.
- Empresa en `SOMBRA` / `ESPEJO`.

#### Corrección de una nota anterior

En el relevo de la mora escribí que el botón «Registrar Crédito» deshabilitado **no se veía deshabilitado**. Hoy sus clases sí incluyen `disabled:opacity-50 disabled:cursor-not-allowed`. O me equivoqué al leerlo entonces, o el código cambió desde. **Que nadie actúe sobre esa nota sin reproducirla primero.**

### 2026-09-15 — pruebas verdes tras los cambios de hoy, y la puerta de aprovisionamiento

**Suites ejecutadas de verdad**, con el código de hoy ya dentro (el `dia()` del publicador y el `TZ` de `main.ts`):

- Las cuatro suites propias: **47 de 47**.
- **Todo el módulo `integracion`: 14 suites, 85 pruebas, todas pasando.** El cambio del publicador no rompió nada.

#### La puerta de aprovisionamiento no es alcanzable desde un navegador, y es a propósito

Para montar la segunda empresa hay que entrar por `POST /api/aprovisionamiento/empresas` con la cabecera `x-aprovisionamiento`. Desde la consola del navegador **falla siempre**, y no por un bug: `main.ts:133` lista las cabeceras permitidas por CORS y `x-aprovisionamiento` no está entre ellas. Es exactamente lo que promete el comentario del controlador —«una credencial de servicio no aparece en un navegador»— y está **impuesto por CORS, no sólo por convención**. Vale la pena anotarlo como acierto: la puerta que crea inquilinos no se puede tocar desde una sesión de usuario, ni siquiera teniendo la clave.

Consecuencia práctica: **la prueba multi-empresa hay que correrla desde PowerShell en la máquina**, no desde el navegador ni desde el contenedor (el proxy de egreso devuelve 403 a cualquier host no permitido).

#### Dos propiedades de aislamiento que conviene probar en ese orden

1. **El candado de correo único.** `alta-empresas.service.ts:265-278` comprueba, **antes de crear nada**, que el correo del administrador no pertenezca ya a otra empresa: «una persona pertenece a una sola empresa: es lo que impide que vea la cartera de las dos». Un alta con un correo existente debe dar **409 sin crear la empresa**. Es una prueba sin efectos secundarios y conviene hacerla primero.
2. **El techo no es un valor por omisión.** Una empresa recién creada debe quedar en `APAGADO` aunque el techo global esté encendido. Es la protección contra arrastrar a todos los inquilinos, y el comentario de `integracion-modo.service.ts:56-64` dice que ya se corrigió una versión que fallaba justo en eso.

Al crear la segunda empresa conviene pasar **`usaFineract: false`**: el alta con Fineract consume un inquilino de la reserva, y según el propio código eso es irreversible («un inquilino de la reserva consumido para siempre»).

#### Cabo suelto de limpieza

`_backups-local\jest.config.js.borrar` y `_backups-local\src-hoy.tgz` son míos y se pueden borrar. No pude borrarlos yo: desde este entorno no tengo permiso de borrado sobre la carpeta.

### 2026-09-15 — aislamiento multi-empresa, primeros resultados

Corrido desde PowerShell en la máquina, porque la puerta de aprovisionamiento no es alcanzable ni desde el navegador (CORS) ni desde el contenedor (proxy de egreso).

#### Lo que pasa

**El candado de nombre único.** Alta repetida → `409 · Ya existe una empresa llamada «EMPRESA B PRUEBA AISLAMIENTO»`. Limpio y sin dejar basura.

**El candado de correo único, que es el que importa.** Con un correo que ya administra otra empresa:

> `409 · el-correo-... ya administra «EMPRESA B PRUEBA AISLAMIENTO». Una persona pertenece a una sola empresa: es lo que impide que vea la cartera de las dos. Usa un correo distinto para el administrador de ésta.`

Funciona, normaliza a minúsculas antes de comparar, y el mensaje **explica la regla, no sólo la infracción**. Es la barrera de la que cuelga todo el aislamiento: si una persona pudiera pertenecer a dos empresas, el resto de las comprobaciones por `empresaId` no servirían de nada.

**La reserva de inquilinos se niega bien.** `disponibles: 0`, `suficiente: false`, y el motivo entero:

> «Falta FINERACT_TENANTS_DB_URL: sin acceso al registro de inquilinos del core no se puede comprobar que un inquilino exista, y aceptar cualquiera produce empresas que se ven correctas y comparten cartera.»

Es el fallo exacto que uno querría que el sistema se negara a cometer, y se niega explicando por qué.

#### Hallazgo: la puerta no valida el formato del correo del administrador

Se aceptó `EL-CORREO-CON-EL-QUE-ENTRAS-AL-ERP` como correo de administrador. **No tiene arroba.** La misma puerta que crea inquitos y les da acceso no valida el formato, y ese correo es justamente lo que el ERP usa para resolver a qué empresa pertenece una persona. Un dedazo ahí crea un administrador que no podrá entrar nunca y, peor, **ocupa el candado de unicidad con una cadena que no es un correo**.

Arreglo: validar formato en el DTO del alta, al lado de la comprobación de unicidad que ya existe en `alta-empresas.service.ts:265`.

#### Duda abierta sobre la empresa existente

`SUMA Local` figura en el listado con **`usaFineract: true` y `tenant: null`**, que es justo la situación que describe el mensaje de la reserva. Conviene entender por qué la única empresa que sí usa Fineract no tiene inquilino asignado, y si eso es un pendiente de configuración o una inconsistencia real.

#### Pendiente inmediato

Falta ver **en qué modo quedó la empresa recién creada**. Si sale `APAGADO` con el techo global encendido, queda probado que el global es un techo y no un valor por omisión (`integracion-modo.service.ts:56-64` dice que ya hubo una versión que fallaba en eso).

#### Basura de prueba que quedó

- **`EMPRESA B PRUEBA AISLAMIENTO`**, creada por error con el administrador `el-correo-con-el-que-entras-al-erp` (un marcador de posición que se pegó literal). Inerte —`usaFineract: false`— pero conviene borrarla, y con ella su usuario.
- `_backups-local\jest.config.js.borrar` y `_backups-local\src-hoy.tgz`.

#### El techo NO es un valor por omisión — probado

`EMPRESA B PRUEBA AISLAMIENTO` quedó en **`modo: APAGADO`** teniendo el proceso el techo global en **AUTORIDAD**. Una empresa nueva no hereda el techo: hay que pedir el modo explícitamente. La protección contra encender la integración a todos los inquilinos de golpe está y se comporta.

#### Sobre el `tenant: null` de SUMA Local: no es un hallazgo nuevo

Fui a perseguirlo y **ya estaba documentado**, con mediciones, en `HALLAZGO-AISLAMIENTO-CORE.md` (10/09) y repetido en la cabecera de `alta-empresas.service.ts:34-40`:

> «en esta instalación el core NO elige el inquilino por la cabecera de la petición, sino por el emisor del token. Mientras el ERP se autentique con un solo cliente de servicio, todas las empresas caen en el mismo inquilino por mucho que la reserva diga otra cosa. (…) **hasta que cada empresa tenga su realm, sólo UNA empresa puede operar con el core.**»

Confirmado en el código vivo: el adaptador manda siempre `this.cfg.tenant`, que sale de `FINERACT_TENANT` (global, por omisión `default`). Nadie pasa un inquilino por empresa, porque de nada serviría.

**Esto cambia el registro de riesgos y conviene que quede dicho sin rodeos:**

El «aislamiento multi-empresa» son en realidad **dos problemas distintos**, y sólo uno está abierto.

| | Estado |
|---|---|
| **Aislamiento del lado del ERP** | Probado hoy en sus piezas clave: nombre único, **una persona una empresa**, y el techo que no es valor por omisión. |
| **Aislamiento del lado del core** | **No se puede probar hoy, por diseño conocido.** Requiere un realm de Keycloak por empresa. Hasta entonces, sólo una empresa puede operar contra Fineract. |

Es decir: el `tenant: null` de SUMA Local es **coherente** con ese estado, no una inconsistencia. Y la reserva de inquilinos, que existe y funciona, **hoy no compra el aislamiento que parece comprar** — lo dice su propia documentación.

Lo que queda abierto no es «probar el aislamiento multi-empresa», es **decidir si se hacen los realms por empresa**. Es una decisión de arquitectura y de producto, no una prueba pendiente.

### 2026-09-15 — FINERACT CAÍDO en modo SOMBRA. Pasa, y pasa bien.

Se mató el proceso Java del 8443 con `Stop-Process -Force` —caída dura, no apagado ordenado— y se operó el ERP con el enlace muerto. Nota de montaje: **Fineract no corre en Docker**, sólo su base (`fineract-db-1`). Tirar la base sería un fallo distinto y más sucio; hay que matar el proceso.

Se probó SOMBRA antes que AUTORIDAD a propósito: es el modo con el que se entra a producción, así que un fallo aquí es bloqueante de lanzamiento.

#### El ERP siguió operando entero

Con Fineract muerto: cobro de 100 sobre CRD-2026-0010 (liquidado), venta a crédito completa por el POS —**ticket #10, CRD-2026-0011**—, inventario de 8 a 7, y **las dos pólizas generadas**. Cero asientos fallidos. La caja no se enteró.

**La disponibilidad ni preguntó.** Respondió en **54 ms** con `origen: ERP`, `degradado: false`. En SOMBRA el ERP es la autoridad, así que un externo muerto es irrelevante para la decisión y el código no gasta una llamada en averiguarlo. Es la respuesta correcta, no una casualidad.

#### El circuito se abrió a tiempo

Los cinco hechos generados quedaron encolados, y el detalle del error cuenta la historia:

| Evento | Último error |
|---|---|
| PAGO_REGISTRADO | `Fineract no respondió: ECONNREFUSED` |
| POLIZA_REGISTRADA | `ECONNREFUSED` |
| CREDITO_ORIGINADO | `ECONNREFUSED` |
| POLIZA_REGISTRADA | `ECONNREFUSED` |
| POLIZA_REGISTRADA | **`Circuito abierto hacia Fineract.`** |

El circuito se abrió **a mitad del lote** y el quinto ya no lo intentó. El despacho forzado posterior tardó **41 ms** y procesó cero: no gastó un solo timeout. Es la diferencia entre una caída que deja la caja lenta y una que no se nota.

**Y los cinco quedaron en `REINTENTABLE`, ninguno en `FALLIDO`**, con `intentos: 1` y `proximoIntento` agendado. Es el estado correcto —«esto no salió, pero va a salir»—; un `FALLIDO` habría exigido que alguien se acordara de reencolarlo.

#### La recuperación: sola, sin tocar nada

Al levantar Fineract, el circuito **se cerró solo** y el cron drenó la cola **sin intervención**. Cuando fui a despachar a mano ya no quedaba nada: **48 ENVIADO, 0 pendientes, 0 fallidos**.

Y la parte que decide si esto es sólido — qué quedó del otro lado:

| Préstamo | Estado | Movimientos |
|---|---|---|
| **14** (CRD-2026-0010) | Closed (obligations met), saldo 0 | Desembolso 200 (id 36) · Pago 100 (**id 37, nacido en Fineract**) · Pago 100 (**id 38, nacido en el ERP durante la caída**) |
| **15** (CRD-2026-0011) | Active, 200 | Desembolso 200 (id 39) |
| 16 | 404 | nada espurio |

**Exactamente tres movimientos en el 14, ni uno de más.** El pago que se encoló durante la caída aterrizó una sola vez, y convive con el que había nacido en Fineract sin pisarlo. El crédito que nació con el enlace muerto existe. La idempotencia aguanta un corte real.

Cierre: conciliación de cartera **9 revisados, 0 discrepancias**; contable 19 revisados con **1 `REVERSA_EXTERNA` anterior** a estas pruebas; 0 cuentas sin mapear; 0 asientos fallidos.

#### Lo que esto permite decir, y lo que no

**Permite decir** que en SOMBRA una caída de Fineract no detiene la operación, no pierde hechos, no duplica nada y no requiere que nadie haga nada al volver. Para el modo con el que van a entrar a producción, eso es lo que había que demostrar.

**No permite decir** nada sobre AUTORIDAD. Ahí la pregunta es la opuesta y más incómoda: si la autoridad no contesta, ¿se bloquea la venta o se deja pasar a ciegas? El campo `degradado` existe para eso y **sigue sin verse en `true`**. Falta esa prueba, y requiere `CARTERA_MODO=AUTORIDAD` más reinicio completo.

### 2026-09-15 — el flujo de verificación, ya con pantallas

El usuario corrigió dos cosas y ambas eran justas: **los tres modos van a convivir en producción**, así que ninguno se puede dar por menos probado; y el flujo de verificación se había pedido antes y sólo se había construido el candado del backend, sin correrlo nunca por pantalla.

Decisión de producto que quedó fijada: **en ERP+Fineract el ERP decide y todo lo demás es automático.** Si la verificación sale favorable se da de alta el crédito en el ERP con su monto y se da de alta en Fineract ya aprobado. No hay doble decisión ni aprobación del lado del core. En los otros modos cada plataforma sigue su flujo. Esto es lo que el adaptador ya hacía —`approve` + `disburse` en el mismo despacho—, así que **no hubo que tocarlo**.

#### Lo que faltaba no era motor, era cara

El motor estaba completo: siete evaluadores, expedientes, `POST ejecutar`, `POST simular`, `GET expedientes`. **Ninguna de las tres rutas tenía un solo consumidor.** Es el mismo patrón que `DisponibilidadCreditoService`: construido, correcto, y no cableado a nadie.

**Nueva pantalla: `app/dashboard/creditos/verificacion/ejecutar/page.tsx`** (CRLF), enlazada desde la de diseño del flujo. Corre el flujo sobre un cliente, en real o forzando cada paso, y muestra veredicto, puntaje contra el mínimo, límite sugerido, motivos y el desglose paso a paso con su política.

#### Los dos caminos, probados en la pantalla

| Camino | Resultado |
|---|---|
| Happy path, todo aprobado, $8,000 | **APROBADA** · puntaje 100 de mínimo 60 · sugerido $8,000 |
| No happy, identidad rechazada | **RECHAZADA** · puntaje 0 · el flujo se detuvo en el paso 1 |

#### Tres cosas que aprendí construyéndolo, y que quedaron dentro de la pantalla

**1. El puntaje no manda solo.** El happy path con 100 puntos seguía dando REVISION_MANUAL porque el flujo tenía `topeAutomatico: 0` — «El flujo no autoriza montos de forma automática». Hubo que crear un flujo con tope $10,000. **Ésa es la configuración de la empresa** de la que depende que el alta sea automática. La pantalla lo dice arriba en lugar de dejar que se descubra.

**2. Una simulación no habilita nada.** El candado busca a propósito el expediente **no simulado** (`.find(e => !e.simulacion)`). Sin avisarlo, alguien simula un camino perfecto y luego no entiende por qué la aprobación lo rechaza. Se avisa dos veces: antes de simular y en el resultado.

**3. «No hay proveedor» no es «el proveedor dijo no».** Corrida real sin proveedores: el motor **no rechaza**, manda a REVISION_MANUAL con «no pudo resolverse y es un paso bloqueante» + «No hay proveedor configurado». La distinción está bien hecha y ahora se ve: gris lo que no se pudo averiguar, rojo lo que salió mal. Confundirlos sería negar crédito por un contrato que la empresa no ha firmado.

**Nota de diseño:** los flujos **no se editan, se versionan**. No hay ruta para cambiarle el tope a uno existente; hay que crear otro, y activarlo desactiva el anterior solo. Parece deliberado —cambiar lo que se le exige a un solicitante es cambiar a quién se le presta— pero conviene saberlo.

#### La pantalla de clientes ya guía en vez de fallar al final

Antes se teclaba el límite, se mandaba a aprobación, y el candado soltaba un 409 tres pantallas después. Ahora la sección «Condiciones de Crédito» refleja el candado **donde se teclea el importe**, con cuatro estados y **sin pintar nada si la empresa no tiene flujo activo**, para no meter ruido:

| Situación | Qué se ve |
|---|---|
| Cliente nuevo, sin guardar | Gris: podrás verificar en cuanto se guarde |
| Sin expediente | Ámbar: la autorización se va a negar hasta que se verifique · **Verificar ahora** |
| Expediente RECHAZADA | Rojo, con los motivos |
| Propuesta > lo verificado | Ámbar **en vivo mientras se teclea**: «se hizo por $1,200 y estás proponiendo $5,000» |
| Propuesta dentro de lo verificado | Verde, con estado, importe, puntaje y fecha |

Los cuatro estados se probaron en pantalla. El aviso de importe reacciona al teclear, que es el que evita el viaje en balde.

Archivos: `app/dashboard/clientes/page.tsx` (respaldo en `page.tsx.bak`).

#### Estado dejado

- Flujo activo: **«Originación con aprobación automática»**, tope $10,000, puntaje mínimo 60. El anterior quedó inactivo.
- CLIENTE SINTETICO tiene un expediente real en REVISION_MANUAL por $1,200.
- Expedientes simulados del cliente de prueba de Fineract: uno APROBADA y uno RECHAZADA.

#### Sigue pendiente

- **La consola SUMA.** Tiene una pantalla que se autodiagnostica y dice ítem por ítem qué falta: variables, **realm `suma-consola` en Keycloak**, grupo `/operadores`, provisionador de identidades y enlace con el ERP. Lo de Keycloak es del usuario —son cuentas y seguridad—; lo demás se puede llenar.
- El modo degradado en AUTORIDAD (`degradado` nunca visto en `true`).
- Cablear la disponibilidad externa al POS (defecto 3.8).

### 2026-09-15 — la pantalla de clientes, rediseñada. Y la validación como servicio transversal.

El usuario señaló el orden invertido: **la verificación sólo se podía hacer cuando el cliente ya existía**, y el límite de crédito era la «sección 4» del alta, invitando a teclear una cifra antes de haber validado nada. Y añadió la restricción que faltaba: **no todo cliente pide crédito** —muchos compran de contado y no tienen por qué pasar por identidad ni por buró—, así que registrar a alguien no puede ser un trámite de crédito.

#### Lo que se cambió

**El crédito salió del alta.** El panel de línea de crédito sólo aparece al **editar** un cliente que ya existe. Dar de alta captura identidad, contacto y domicilio, y nada más. Abrir una línea es un acto aparte: primero existe la persona, después —si lo pide— se le verifica, y sólo entonces se propone un importe.

**El panel muestra el ciclo**, con el paso alcanzado en verde y el que falta en gris:

> Solicitud › Verificación › Propuesta › Autorizada

y va rotulado **«Opcional · sólo si la solicita»**, para que quede claro que un cliente de contado no pasa por aquí.

**La lista dice la verdad sobre la etapa.** Antes la columna «Ciclo / riesgo» pintaba el campo `etapaComercial`, que **nadie mantiene**: decía PROSPECTO incluso para un cliente con línea autorizada de $1,200 vigente. Ahora la columna «Etapa» deriva la relación de los hechos —Cliente con línea, Línea suspendida, Crédito rechazado, En aprobación, Sin crédito— y el riesgo baja a una línea secundaria. Y **«Solicitud NINGUNA» se dejó de pintar**: un estado vacío repetido en cada renglón no informa, tapa.

**Queda un defecto para el backend:** `etapaComercial` sigue sin que nadie lo mueva. La pantalla dejó de mostrarlo porque mostrarlo era mentir, pero el campo debería mantenerse al autorizar una línea o al primer movimiento del cliente. Está anotado en el comentario de la columna.

Archivos: `app/dashboard/clientes/page.tsx` (respaldo `page.tsx.bak`).

#### Lo importante que queda abierto: la validación tiene que ser transversal

El usuario lo planteó así, y tiene razón de fondo: **para las empresas que sólo usan Fineract, la verificación también se tiene que hacer antes de otorgar el préstamo, desde el front de Fineract.** Hoy el motor de validación vive dentro del backend del ERP (`integracion/validacion`) y sólo lo consume el front del ERP.

**No es un problema de reubicar código, y hay evidencia de que no hace falta mover nada:**

- La consola de SUMA da de alta a **toda** empresa en el ERP, use Fineract o no. Se ve en el listado de aprovisionamiento: `EMPRESA B` existe con `usaFineract: false`, y el propio diagnóstico de la consola exige `ERP_BASE_URL` «la misma cadena que el ERP tiene en APROVISIONAMIENTO_TOKEN».
- `integracion.constants.ts:78-82` ya declara la frontera: **la consola decide qué capacidades de validación contrató cada empresa; el ERP decide cómo las ordena en su flujo.** Es decir, la validación ya está pensada como capacidad de plataforma, no como función del ERP.

Por eso **el motor puede quedarse donde está** y el front de Fineract (3002) consumirlo. Lo que hay que resolver, y es una decisión, no una pantalla:

1. **Con qué credencial llama el portal al ERP.** El portal es un BFF con sesión de persona; para llamar a `/integracion/validacion/*` necesita o el token del operador, o una credencial de servicio como la de aprovisionamiento. La segunda es más limpia y ya hay precedente en el repo.
2. **Dónde se engancha en el portal.** Lo natural es antes de crear el préstamo, en el alta de crédito de `fineract/frontend`, con el mismo veredicto y expediente.
3. **Qué pasa si el veredicto no es favorable en modo Fineract solo.** En el ERP el candado vive en `aprobaciones-documentos.service.ts`. En Fineract solo no hay flujo de aprobaciones del ERP, así que el candado tendría que aplicarlo el portal al aprobar el préstamo — y eso sí es lógica nueva.

**Recomendación:** no construir la pantalla del portal hasta decidir el punto 1, porque construirla contra la puerta equivocada es tirarla.

### 2026-09-15 — fuera RENAPO del alta, y el expediente único del cliente

#### Fuera la verificación de RENAPO

El usuario pidió quitarla del alta: esa integración se hará aparte más adelante. Se eliminó el componente `CurpVerificador` entero, el handler `handleCurpVerificado` que rellenaba el formulario con la respuesta, y la llamada a `POST /rpa/curp/consultar`. **La CURP sigue capturándose, pero como dato que se teclea, no como uno que se comprueba**: dejarle un botón de «Verificar» prometía una comprobación que ya no ocurre. La identidad se valida donde corresponde, en el flujo de verificación de crédito.

#### El expediente único: `app/dashboard/clientes/[id]/expediente/page.tsx` (nueva, CRLF)

Cada corrida del flujo deja un expediente con sus pasos, y eso vivía en la base sin verse en ninguna parte. La pregunta más normal del negocio —«¿qué sabemos de este cliente y desde cuándo?»— no tenía respuesta.

Tres decisiones de diseño, las tres por cómo se usa esto de verdad:

**1. Arriba el estado, abajo la historia.** Lo que alguien necesita en tres segundos es qué está comprobado HOY, no en qué orden se comprobó. Primero una rejilla con los siete controles y la última respuesta de cada uno; la cronología va después.

**2. La última respuesta de cada control puede venir de corridas distintas.** La identidad se pudo verificar en marzo y el buró en agosto, así que la rejilla se arma recorriendo **todas** las corridas reales y quedándose con la más reciente de cada tipo, no con la última corrida entera. Se traen los pasos de hasta 15 corridas para poder hacerlo sin encadenar cincuenta peticiones.

**3. Las simulaciones se ven, marcadas, y no cuentan.** Esconderlas haría pensar que no se hicieron; mezclarlas haría creer que valen. Van con borde punteado y no alimentan la rejilla de estado.

Cada corrida se despliega en sus pasos, con resultado, proveedor, detalle y puntos aportados.

**Lo que la pantalla destapó en el primer cliente que se abrió:** CLIENTE SINTETICO tiene una **línea autorizada de $1,200 vigente** y su rejilla dice **«Identidad: sin proveedor»** y los otros seis controles **«Nunca se ha corrido»**. Es decir, una línea viva que no se apoya en nada comprobado. No es un defecto del código —la línea se autorizó antes de que existiera el flujo— pero es exactamente el tipo de cosa que esta pantalla existe para hacer visible.

Enlazada desde dos sitios: un botón en la columna de acciones de la lista **para todos los clientes** —saber que NO se ha comprobado nada es tan útil como ver lo comprobado— y un «Ver expediente completo» en el panel de línea de crédito.

#### Estado de las pantallas de clientes, resumido

| Pantalla | Qué hace ahora |
|---|---|
| Alta de cliente | Identidad, contacto y domicilio. Sin crédito y sin RENAPO. |
| Edición | Lo anterior más el panel de línea de crédito, con su ciclo y el estado del expediente. |
| Lista | Columna «Etapa» derivada de los hechos; acceso al expediente de cada cliente. |
| Expediente único | Estado por control, cronología completa, detalle paso a paso. |
| Verificar a un cliente | Corre el flujo, real o simulado, y produce el veredicto. |

### 2026-09-15 — la cartera de clientes deja de ser una tabla

El usuario lo dijo claro: «no quiero que clientes se vea sólo como una pantalla con un grid o tabla, sino una pantalla con un verdadero expediente del cliente». Tenía razón en el fondo, no en el estilo: **una rejilla con un popup encima dice que el cliente es un renglón**, y no lo es. Es un expediente —identidad, línea, verificaciones, historia— y la pantalla tiene que enseñarlo sin abrir nada.

#### La forma nueva

- **Resumen de cartera** arriba, cuatro números que se leen de un tirón: clientes, con línea vigente, en aprobación, sin crédito (los que compran de contado, que son mayoría y antes no se contaban).
- **Lista a la izquierda** (340px, pegada al hacer scroll) sólo para elegir: nombre, RFC o correo, y el importe de su línea. Nada más; la lista no es el sitio donde se consulta.
- **Expediente a la derecha**: ficha de identidad y estado en cuatro columnas —tipo, línea, estado, propuesta—, y debajo la rejilla de controles y la historia de verificaciones.
- **Al cargar se abre el primer cliente**, para que nadie llegue a un panel vacío sin saber qué hacer.
- **El formulario de alta y edición sigue siendo modal**, y es deliberado: es captura, no consulta. Se abre, se llena y se cierra. Lo que ya no vive en un popup es la *información* del cliente.

#### El expediente salió a un componente compartido

`components/clientes/expediente-cliente.tsx` (nuevo, CRLF). Lo usan el panel derecho de la cartera (`limiteHistoria={4}`) y la pantalla propia `clientes/[id]/expediente` (historia completa). Estaba duplicado en los dos sitios y eso garantizaba que un día dijeran cosas distintas. Exporta además `useExpedienteVigente`, `EST`, `RES`, `dinero` y `fechaLarga`.

Verificado con `npx tsc --noEmit`: sin errores en ninguno de los archivos tocados.

#### Archivos

| Archivo | Qué |
|---|---|
| `app/dashboard/clientes/page.tsx` | Panel de dos columnas; respaldo en `page.tsx.bak` |
| `components/clientes/expediente-cliente.tsx` | **Nuevo**, componente compartido |
| `app/dashboard/clientes/[id]/expediente/page.tsx` | Reescrita para consumir el componente |

### 2026-09-15 — revisión de usuarios y roles, ERP ↔ Keycloak ↔ Fineract

#### Cómo está hoy, y la parte que está bien

**Keycloak autentica, el ERP autoriza.** `jwt.strategy.ts` resuelve al usuario por `keycloakSubject` o por correo, y **el rol sale de la columna `usuario.rol` del ERP, no de los claims del token**. Identidad federada, permisos locales. Es la separación correcta y conviene no romperla.

**La autorización real es una tabla por empresa.** `PermisoEndpointGuard` → `PermisosDinamicosService.verificarPermiso(empresaId, rol, método, ruta)` contra `rol_endpoint_permiso`, sembrada desde las 12 plantillas de `iam/data/plantillas-permisos.ts`. `esRolAdministrador()` es el único atajo, y normaliza `admin`/`administrador`/`super_admin` al mismo sitio.

**La correspondencia con Fineract ya está modelada.** Existe `MapeoRolExterno` (`integracion_mapeo_roles`, único por empresa+rolErp), `RolesExternosService` con diagnóstico por usuario y estados `NINGUNA / MAPEAR_ROL / DAR_DE_ALTA / CORREGIR_ROLES`, y seis rutas bajo `/integracion/roles/*`. El comentario de cabecera fija bien el criterio: **no aprovisiona solo**, porque «dar de alta operadores en un core bancario es una decisión de una persona con responsabilidad, no un efecto secundario de que alguien entre al ERP».

#### Cuatro problemas, medidos en vivo

**1. 🔴 Fineract no tiene roles operativos.** `GET /integracion/roles/catalogos` devuelve **tres**: `Super user`, `Self Service User` y `SYNCRO ERP Service` (la cuenta técnica). Hoy mapear cualquier rol del ERP significa mapearlo a **Super user**, que es tanto como no mapear: un cajero acabaría con permisos para cerrar el periodo. **Hasta que existan roles espejo en Fineract, el mapeo no puede significar nada.**

**2. 🔴 El ERP tiene tres vocabularios de roles y no coinciden.**

| Fuente | Valores |
|---|---|
| `plantillas-permisos.ts` (12) | EMPLEADO, ALMACENISTA, FINANZAS, CREDITO, COBRANZA, HOTELERIA, GERENCIA, DIRECCION, TESORERIA, CONTADOR, RRHH, COMPRADOR |
| DTO de alta/edición de usuario (7) | admin, gerencia, rrhh, finanzas, empleado, comprador, almacenista |
| `@Roles()` en controladores (5) | direccion, administrador, gerencia, contador, cobranza |

El DTO **no deja asignar** `credito`, `cobranza`, `hoteleria`, `tesoreria`, `contador` ni `direccion`, que sí tienen plantilla de permisos. Y el único usuario real tiene **`rolErp: ADMIN`**, que no está en las 12: el diagnóstico pide `MAPEAR_ROL` sobre un rol que la pantalla de mapeo nunca va a ofrecer.

**3. 🟡 `@Roles()` no autoriza nada.** 96 decoraciones —`direccion` 41, `administrador` 41, `gerencia` 10, `contador` 10, `cobranza` 4— que **parecen** control de acceso. `ROLES_KEY` se define en `roles.decorator.ts` y **no lo lee nadie**: no hay ningún `RolesGuard` registrado. Quien autoriza es la tabla. No es un agujero —la tabla sí protege— pero es una trampa: alguien lee `@Roles('direccion')` y da por protegido un endpoint por rol cuando el rol ahí es decorativo.

**4. 🟡 No hay pantalla para el mapeo.** Mismo patrón que la disponibilidad externa y el motor de validación: construido, correcto, sin cara. `GET /integracion/roles/mapeo` devuelve `[]`.

#### Estado medido del único usuario

```
abel.diaz@sumamexico.com · rolErp ADMIN · mapeado false
existeEnExterno true · rolesExternos ["1" = Super user] · idExterno null
accion MAPEAR_ROL
```

Existe en los dos lados y opera en Fineract como **Super user**.

#### Recomendación: una identidad, dos autorizaciones

- **Identidad:** Keycloak manda. La llave de unión es el **correo**, que ya es único en todo el ERP y es justamente lo que impide que una persona pertenezca a dos empresas (`alta-empresas.service.ts:265`).
- **Autorización:** cada sistema conserva la suya, porque protegen cosas distintas. El ERP protege sus endpoints; Fineract protege permisos bancarios. Una sola tabla gobernando ambos es como se acaba con un cajero que puede cerrar el periodo contable.
- **La correspondencia es un mapa declarativo por empresa**, rol ERP → rol(es) Fineract. Ya está modelado; lo que falta es que ambos extremos tengan vocabulario.

Orden propuesto: unificar el vocabulario del ERP → crear los roles espejo en Fineract con permisos mínimos → sembrar el mapeo por omisión → la pantalla. Lo de `@Roles()` es decisión aparte y **no se toca sin decidirlo**: quitarlo y activarlo son acciones opuestas y activar un guard puede dejar gente fuera.

#### Hecho: vocabulario unificado y la pantalla que faltaba

**Un solo catálogo de roles.** Nuevo `iam/utils/roles-catalogo.ts`: `ROL_ADMINISTRADOR` + `ROLES_CON_PLANTILLA` (derivado de las plantillas) = `ROLES_ASIGNABLES`. Los DTO de alta y edición de usuario ahora validan contra esa lista en vez de contra la suya de siete. **Quien agregue un rol escribe su plantilla y aparece solo; no hay que tocar los DTO.**

`RolesExternosService.rolesErp()` también incluye ya a ADMIN, que se quedaba fuera: el diagnóstico pedía mapear el rol del único usuario real y la pantalla nunca lo iba a ofrecer. Verificado en vivo: el catálogo pasó de **12 a 13** roles, con ADMIN primero.

**Nueva pantalla `app/dashboard/permisos/correspondencia/page.tsx`** (CRLF). Es la cara que le faltaba a `/integracion/roles/*`:

- **El aviso que importa, arriba del todo**: si el externo tiene tres roles o menos, se dice que mapear ahí significa mapear a Super user y que **hay que crear los roles allá antes de que el mapa signifique algo**. Sin ese aviso, la pantalla invitaría a hacer un mapeo que parece trabajo y es un riesgo.
- Tres números: roles del ERP, sin correspondencia, usuarios con pendiente.
- **El mapa**, rol por rol, con los roles del externo como botones que se encienden. Un rol puede corresponder a varios; **no puede corresponder a ninguno** —el backend lo rechaza a propósito y la pantalla lo explica en vez de mandar la petición.
- **El diagnóstico por usuario**, con los cuatro estados traducidos a lo que significan, y el botón de aprovisionar sólo donde aplica.

Estado medido al abrirla: **13 roles del ERP, 13 sin correspondencia, 1 usuario con pendiente**.

`npx tsc --noEmit` limpio en backend y frontend.

#### Lo que NO se tocó, por decisión del usuario

Las 96 decoraciones `@Roles()` se quedan como están, documentadas. No es un agujero —la tabla de permisos sí protege— pero **sigue siendo una trampa**: quien lea `@Roles('direccion')` creerá que el endpoint está protegido por rol. Activar un guard ahora podría dejar gente fuera sin aviso; quitarlas pierde el rastro de la intención. Queda para decidir con calma.

#### Lo siguiente en esta línea

1. **Crear en Fineract los roles espejo** con permisos mínimos. El puerto `PuertoUsuariosExternos` sabe listar roles, buscar y crear usuarios y asignar roles, pero **no sabe crear roles**: haría falta `crearRol()` en el puerto y en el adaptador (`POST /v1/roles` + `PUT /v1/roles/{id}/permissions`). Con un criterio: el ERP propone la **correspondencia**, no los **permisos** — qué puede hacer alguien dentro del core lo decide quien conoce el core, igual que hoy no se aprovisionan operadores solos.
2. Sembrar un mapeo por omisión una vez existan esos roles.

### 2026-09-16 — P0 cerrado y avance en el P1

#### P0 · El trabajo, salvado y subido

Commit **`11ae550`** con **44 archivos**, subido a `origin/codex/verificacion-productos-fecha-activacion`. Los **1,308 de finales de línea quedaron fuera** a propósito: merecen su propio commit de normalización con `.gitattributes`.

**El susto del día.** El `.gitignore` cubría `.env.local` pero **no sus copias**. El respaldo `.env.local.bak` que creé al probar AUTORIDAD aparecía como archivo nuevo, sin ignorar, con la contraseña de la base y el token de aprovisionamiento dentro. Con 1,300 archivos modificados en pantalla, `git add -A` es lo que cualquiera habría hecho.

Se sacó del repo (está en `_backups-local/respaldos/`) y se reforzó el `.gitignore` con `.env*.bak`, `.env*.bak-*` y `*.bak-*`, verificado creando un archivo de prueba. **El historial se revisó y está limpio**: el único `.env` que existió es un `.env.example` con `CAMBIAR_ESTA_PASSWORD`, y ni la contraseña ni el token reales aparecen en ningún commit.

Sólo `syncroERP` tenía algo que subir. `suma-consola` (21 archivos sin commitear) y `fineract` no tienen commits pendientes de push.

#### P1-3 · El stock inicial ya llega a contabilidad

**Y por poco lo arreglo mal.** El instinto era meter el asiento dentro de `registrarCompra`. **La usan nueve sitios** —órdenes de compra, transferencias WMS, conteos, recetas, el importador masivo, el alta de producto— y cada uno tiene su propio contraasiento. Ponerlo ahí habría marcado como «inventario inicial» hasta una compra a proveedor, que es peor que el bug original.

El arreglo va en `catalogo/services/productos.service.ts`, **el único camino que movía inventario sin contabilizar**: encola `TipoAsiento.INVENTARIO_INICIAL` dentro de la misma transacción del alta, con el costo real que devuelve `registrarCompra` (`costoUnitarioLote`), no con el precio de catálogo. Si el producto no llega a existir, su asiento tampoco.

Revisión de los otros ocho caminos: `ordenes-compra` y `wms` sí contabilizan. `consumo-recetas` no lo hace, **pero es una reversión por anulación de venta** y ese flujo asienta por su lado (`anulacion-ventas.service.ts:496`) — queda como duda a confirmar, no como hallazgo.

`npx tsc --noEmit` limpio. **Falta probarlo en vivo**: dar de alta un producto con existencias y comprobar que `115.01` deja de quedar en saldo acreedor. No se pudo porque el navegador dejó de responder.

#### P1-2 · Migración de fechas escrita, NO aplicada

`1789560000000-FechasConZonaHoraria.ts`. Recorre `information_schema` en vez de enumerar 199 columnas a mano, y convierte a `timestamptz` interpretando lo guardado como UTC.

**Lleva una advertencia dentro y conviene leerla antes de correrla.** La conversión es correcta para lo que escribió Postgres y para todo lo posterior al arreglo de `main.ts`. **No lo es para las filas anteriores que escribió la aplicación con `new Date()`**: el driver las mandaba con hora de pared de México, así que al convertirlas con `'UTC'` se desplazan seis horas. Los timestamps viejos son **una mezcla y no hay forma de distinguirlos columna por columna**.

En una base de pruebas da igual y hay que correrla. En una con historia real, qué hacer con lo anterior al arreglo **no lo decide una migración**.

#### P1-4 · Los roles espejo ya se pueden crear

`crearRol()` en `PuertoUsuariosExternos`, en el adaptador de Fineract (`POST /v1/roles`) y en la implementación inerte. Y `POST /integracion/roles/espejo` (con `?simular=1`), que crea un rol en el core por cada rol del ERP y **deja la correspondencia hecha en el mismo paso**. No pisa lo que ya existe: si allá ya hay un rol con ese nombre, lo reutiliza y sólo guarda el mapeo.

**Los roles nacen SIN permisos, y es deliberado.** El ERP sabe qué rol suyo equivale a cuál de allá —eso es la correspondencia— pero no puede saber qué permisos bancarios necesita un «Almacenista» dentro del core. Adivinarlos sería peor que dejarlo explícito: un permiso de más en un core bancario no se nota hasta que alguien lo usa. Un rol inerte es visible y auditable. Es el mismo criterio por el que aquí nunca se aprovisionan operadores solos.

La respuesta incluye el aviso: *«Los roles espejo nacen SIN permisos. Asígnaselos en el core antes de que alguien opere con ellos.»*

#### P2-8 · El crédito ya vuelve a ACTIVO

`actualizarVencidos` sólo escalaba. Ahora, al final de la misma corrida, regulariza: devuelve a ACTIVO **los créditos en VENCIDO que ya no tienen ninguna cuota vencida sin pagar**, y devuelve `regularizados` junto a `actualizadas`.

Dos cuidados que conviene no perder si alguien lo toca:

- **Se limita a los que están en VENCIDO.** El error fácil es regularizar por «no tiene cuotas vencidas» sin mirar el estado, y eso resucitaría créditos LIQUIDADO y CANCELADO, que son finales.
- Los nombres de columna del SQL en crudo (`amortizacion_cuotas`, `q.creditoid`, `q.fechavencimiento`) se verificaron **contra la consulta que ya corre** en `cartera-conciliacion.service.ts:147`, no de memoria.

Nueva suite `credito/services/cobranza-regularizacion.spec.ts`: seis casos sobre la regla, incluidos los dos estados finales.

#### Pruebas

**23 suites, 130 pruebas, todas pasando** en integración, crédito y catálogo, ejecutadas de verdad en contenedor con estos cambios dentro.

#### Sin verificar todavía

El navegador dejó de responder, así que quedan sin comprobar en vivo: el asiento del stock inicial, los roles espejo, y que la pantalla de correspondencia deje de decir «sólo 3 roles».

#### Verificado en vivo: los tres arreglos funcionan

**El inventario inicial ya contabiliza.** Alta de `INV-002` con 20 piezas a 50. El asiento `ALTA-INV-002` salió **GENERADO** sin error y produjo la póliza *«Carga de inventario inicial — 1 productos»*: **115.01 Inventario cargo 1,000 / 399-01 Carga de saldos iniciales abono 1,000**, que son los 20 × 50 exactos. La cuenta pasó de **−360 a +640**: dejó de estar en saldo acreedor.

Ojo: **no arregla lo anterior**. Los productos dados de alta antes de esto siguen sin su asiento de entrada, y ésa es la diferencia que queda entre el valor físico del almacén y el saldo contable. Si importa, hay que regularizarlos a mano.

**Los roles espejo, creados.** `POST /integracion/roles/espejo?simular=1` anunció 13 a crear, ninguno a reutilizar, sin problemas. La corrida real creó **13 roles en Fineract, cero problemas**, y dejó las 13 correspondencias hechas en el mismo paso. El core pasó de **3 roles a 16**.

En la pantalla, «Sin correspondencia» pasó de **13 a 0** y el aviso de «sólo 3 roles, ninguno operativo» desapareció solo.

Y el diagnóstico **avanzó un paso por su cuenta**: de `MAPEAR_ROL` a **`CORREGIR_ROLES`**. Ahora que existe el mapa, detecta que el usuario opera en el core como *Super user* cuando el mapa dice *Administrador*. Es el sistema diciendo la verdad, y queda un botón para corregirlo.

**Recordatorio que no conviene perder:** esos 13 roles **no tienen permisos**. Existen, se pueden mapear y son auditables, pero nadie puede operar con ellos hasta que alguien les asigne permisos en el core. Es deliberado.

#### P5-16 · `autoConfigurarCuentas` ya usa `rolSistema`

Resolvía sólo por número, y los respaldos de un dígito —`porPrefijo('4')`, `porPrefijo('5')`— toman la **primera** cuenta que empiece por ahí en el orden que devuelva la base, que no está garantizado. En un catálogo SAT de mil cuentas eso es una lotería: la de ventas podía acabar siendo «Devoluciones sobre ventas».

Ahora pregunta primero por `rolSistema`, que es inequívoco y tiene índice único por empresa y rol. El número se conserva como respaldo para catálogos donde nadie haya marcado los roles. **Devoluciones no tiene rol de sistema declarado**, así que ésa sigue por número: no se inventa un rol que el catálogo no tiene.

#### P5-15 · El aviso de cuentas sin mapear, ahora ANTES del fallo

`pendientes()` mira las partidas ya escritas, así que sólo ve una cuenta **después** de que una póliza la usó — y para entonces el espejo ya falló. Pasó cuatro veces seguidas, siempre igual.

Nuevo `previstas()` + `GET /integracion/cuentas/previstas`, y `cuentasPorMapear` en el estado. Mira lo **configurado**: las cuentas que las categorías tienen asignadas y las que declaran un `rolSistema`, con el motivo de cada una.

**Resultado en la primera corrida:** `cuentasSinMapear: 0` —nada ha fallado— y **`cuentasPorMapear: 10`**. Diez cuentas que se van a usar en cuanto alguien opere y que hoy harían fallar el espejo: Bancos nacionales, IVA acreditable pagado, IVA pendiente de pago, y siete más. Esa es exactamente la diferencia entre enterarse antes y enterarse por un evento en rojo.

---

## 2026-09-16 · `/dashboard/permisos`: la pantalla ahora se administra por rol, no por endpoint

Petición de Abel: *"hay una pestaña con roles y permisos, si es necesario simplifícalo a que un usuario tenga un rol o roles; es que ahora veo que es por endpoint... aparte vi que tú hiciste otra pestaña de roles"*.

### Lo que estaba mal, medido

1. **La pantalla ofrecía cuatro perfiles y el sistema tiene trece.** No venían de ninguna tabla: `PermisosDinamicosService.obtenerRolesDisponibles()` traía `['admin','empleado','comprador','almacenista','finanzas']` **escritos a mano** dentro del método. Era el **cuarto** vocabulario de roles del sistema, después de las plantillas, los DTO y los `@Roles()` decorativos. Consecuencia concreta: `credito`, `cobranza`, `hoteleria`, `tesoreria`, `contador`, `direccion`, `gerencia` y `rrhh` tenían plantilla de permisos escrita y funcionando, y **no se podían configurar desde la pantalla**.

2. **482 interruptores, uno por endpoint, y verbos sueltos.** Cada sección mostraba su ruta y una fila de verbos: *"Historial de ventas /dashboard/ventas/historial GET GET DELETE POST GET GET"*. Un verbo HTTP no le dice nada a quien reparte accesos.

3. **Dos pantallas de roles que no se conocían**: la matriz y la correspondencia con el externo que hice antes.

### Lo que cambió

**El motor no se tocó.** `rol_endpoint_permiso` sigue siendo la tabla que manda y `PermisoEndpointGuard` sigue preguntándole endpoint por endpoint. Cambió la unidad de **administración**, no la de **autorización**.

- `obtenerRolesDisponibles()` ahora parte de `ROLES_ASIGNABLES` (el catálogo único de `iam/utils/roles-catalogo.ts`, derivado de las plantillas). La pantalla ofrece los trece.
- **Deduplicación por rol normalizado.** La tabla de permisos guarda el rol en mayúsculas y la lista de usuarios como se escribió; un `Set` de cadenas devolvía `almacenista` y `ALMACENISTA` como dos roles distintos. Se vio en pantalla en cuanto se guardó el primer permiso. Gana la grafía del catálogo.
- **Nuevo `GET admin/permisos/resumen-roles`**: por rol, etiqueta, descripción, cuántos usuarios lo traen puesto y cuántas acciones tiene encendidas. `admin` sale con `accionesActivas: null` a propósito —no tiene filas porque `esRolAdministrador()` salta la tabla entera; poner 0 sería mentira.
- **La pantalla se entra por el rol.** Panel izquierdo con los roles y su gente; panel derecho con lo que ese rol puede hacer, sus tres cifras (módulos con acceso, acciones activas, usuarios) y el botón de accesos sugeridos.
- **Los verbos se traducen a acciones**: GET → Consultar, POST → Crear, PUT/PATCH → Modificar, DELETE → Eliminar. Cada chip es además el interruptor de esa acción en esa sección, y muestra `4/6` cuando está a medias.
- **El detalle por endpoint sigue ahí**, detrás de "detalle técnico", porque a veces es exactamente lo que se necesita — pero es la excepción, no la puerta de entrada.
- **Un solo encabezado con pestañas** (`app/dashboard/permisos/layout.tsx`): "Roles y accesos" y "Correspondencia con Fineract". Las rutas no cambiaron.

### Probado en el navegador

Los trece roles con su etiqueta buena; expandir Ventas muestra *"Historial de ventas · 6 acciones · Consultar / Crear / Eliminar"*; un clic en "Consultar" encendió las 4 GET de esa sección, el módulo pasó a "Acceso parcial" y el contador a `4/483`; guardado y releído desde `rol_endpoint_permiso`; revertido y vuelto a guardar para no dejar datos de prueba. `tsc --noEmit` limpio en backend y frontend. Sin errores de consola.

### Decisión que queda para Abel: ¿un rol o varios?

Lo de "un rol **o roles**" no se hizo, y no por olvido. Hoy `usuario.rol` es **una sola columna `varchar(20)`**, y de ese único valor dependen `jwt.strategy.ts`, `PermisoEndpointGuard` → `verificarPermiso(empresaId, rol, ...)`, `esRolAdministrador()` y el mapeo de roles hacia Fineract. Varios roles por usuario es cambio de esquema, migración, unión de permisos en el guard (¿gana el más permisivo?) y decidir con qué rol se corresponde el usuario en el core cuando tiene tres. Es una decisión de autorización, no un ajuste de pantalla; queda planteada y sin hacer a propósito.

**Alternativa barata mientras tanto:** la mayoría de los casos de "necesita dos roles" se resuelven creando un rol que combine los dos y cargándole las dos plantillas con el botón de accesos sugeridos en modo *agregar*, que ya funciona.

---

## 2026-09-16 (2) · Roles por módulo, una sola pantalla, y un defecto de autorización que llevaba tiempo escondido

Petición de Abel: *«que haya solo una pantalla de roles en el ERP; que la administración de los módulos sea por roles; que un rol pueda hacer todo lo que le corresponda a su módulo — un almacenista todo lo del almacén, RH todo lo de recursos humanos»*.

### 0. Lo que apareció al analizar: PATCH y DELETE estaban cruzados

`METHOD_MAP` traducía el enum `RequestMethod` de NestJS a verbo con **3 → PATCH y 4 → DELETE**. En NestJS es al revés: `DELETE = 3`, `PATCH = 4`.

Consecuencia: **todo handler `@Patch` quedó registrado en la tabla `endpoint` como DELETE, y todo `@Delete` como PATCH**. Y `verificarPermiso()` busca el endpoint por método + ruta y, cuando no lo encuentra, **niega**:

```ts
const endpoint = await this.endpointRepo.findOne({ where: { metodo: metodoLimpio, ruta: rutaLimpia } });
if (!endpoint) { /* cache negativo */ return false; }
```

Es decir: **97 de 486 acciones del ERP eran inejecutables para cualquier rol que no fuera admin**, por mucho que se les concediera el permiso en pantalla. Aprobar una cotización, recibir una orden de compra, cambiar el estado de una requisición, dar de baja un activo. No se había notado porque el único usuario real es `admin`, y `esRolAdministrador()` salta la tabla entera en la primera línea del guard.

Al corregir el mapa, la sincronización descubre las filas buenas y desactiva las malas. Dos rescates acompañan al arreglo:

- `migrarPermisosDeMetodosIntercambiados()` mueve los permisos concedidos de la fila vieja a la nueva, para que nadie pierda accesos ya configurados. Idempotente y silencioso cuando no hay nada que mover.
- El saneador de nombres: la fila `PATCH /catalogo/.../definiciones/:id` existía con el nombre «Eliminar Definición» porque la había creado el handler equivocado. Al reutilizarse para el handler bueno hay que devolverle su nombre, o la pantalla enseña «Eliminar» donde en realidad se actualiza. Comprobado: ahora `DELETE → Eliminar Definicion`, `PATCH → Actualizar Definicion`.

Verificado contra el servidor: antes `{DELETE: 92, PATCH: 5}`, después `{PATCH: 92, DELETE: 5}`.

### 1. Un módulo es un módulo, no un `@Controller`

El «módulo» de la pantalla de permisos era un accidente del código: se derivaba del primer segmento del path del controlador. Por eso `@Controller('admin/permisos')` producía el módulo `admin`, y junto con `usuarios`, `departamentos` y `configuraciones-aprobacion` salían **cuatro tarjetas llamadas todas «Administración»**, indistinguibles. Al revés pasaba lo mismo: `catalogo` era un solo cajón de 87 endpoints que mezclaba el almacén con las listas de precio y los impuestos.

Nuevo `iam/data/modulos-catalogo.ts`: **21 módulos de negocio definidos por prefijos de ruta**, ganando el prefijo más largo, de modo que `/catalogo/listas-precio` cae en Precios aunque `/catalogo` pertenezca a Inventario. Hay un módulo «Otros» de red de seguridad: si aparece, es que falta declarar una ruta. **Comprobado contra el servidor: 487 de 487 acciones clasificadas, «Otros» vacío.**

| | | | |
|---|---|---|---|
| Ventas 11 | Clientes 6 | Facturación 18 | Crédito 29 |
| Compras 22 | Proveedores 6 | Hotelería 46 | CRM 15 |
| Aprobaciones 8 | Inventario 77 | Precios 10 | Catálogos 17 |
| Recetas 11 | Contabilidad 40 | Tesorería 10 | Caja 8 |
| Activos 11 | RRHH 69 | Tablero 1 | Integración 42 |
| Administración 30 | | | |

Integración y Administración van marcados como **sensibles**: dan poder sobre el propio sistema. No se bloquean, se pintan distinto para que nadie los conceda de pasada.

### 2. El acceso se reparte por módulo, con tres estados

`rol_endpoint_permiso` **no cambia**: sigue siendo el motor, endpoint por endpoint, y el guard le sigue preguntando a ella. Lo que cambia es por dónde se administra.

- **Acceso completo** → ver, crear, modificar y eliminar dentro del módulo.
- **Solo consulta** → únicamente los GET.
- **Sin acceso** → nada.

Un cuarto estado se muestra pero no se elige: **«ajustado a mano»**, cuando alguien afinó acciones sueltas. No se pierde al guardar, porque sólo se reescriben los módulos que se tocaron: `asignarModulosARol` ignora los módulos que no vengan en la petición.

Endpoints nuevos: `GET admin/permisos/modulos`, `GET admin/permisos/rol/:rol/modulos`, `PUT admin/permisos/rol/:rol/modulos`, `GET admin/permisos/rol/:rol/modulo/:moduloId` (el ajuste fino).

### 3. Las plantillas dejan de ser prefijos y pasan a ser módulos

Antes, «el almacenista maneja el almacén» se escribía como nueve prefijos de ruta, y cada ruta nueva de ese árbol había que acordarse de agregarla a mano en cada rol. Nadie se acuerda; por eso había roles con plantilla escrita que en la práctica no cubrían pantallas enteras.

Ahora cada rol declara `modulos` (todo) y `modulosConsulta` (sólo lectura). La distinción no es un adorno: un vendedor necesita **ver** el catálogo de productos para vender, no necesita poder **borrarlo**.

Probado en pantalla: «Usar módulos sugeridos» sobre Almacenista → *«102 acciones activas en 2 módulos y consulta en 3 más»*. Inventario y almacén queda en **77 de 77**; Compras, Proveedores y Precios en solo consulta. Ese es literalmente «el almacenista puede hacer todo lo del almacén».

### 4. Una sola pantalla de roles

Había dos, y la segunda no se sabía segunda: `/dashboard/usuarios` tenía **su propia lista de siete `<option>` escritos a mano** — la cuarta lista de roles del sistema. `credito`, `cobranza`, `hoteleria`, `direccion`, `tesoreria` y `contador` tenían permisos configurables y **no se le podían asignar a nadie desde ahí**.

Ahora esa pantalla pide el catálogo al servidor y **sólo asigna**: muestra los 13 roles con su nombre bueno y remite a Roles y permisos para lo demás. Quien define qué puede hacer un rol es `/dashboard/permisos`, y nadie más. Comprobado en el navegador: el selector devuelve los 13, de Administrador a Tesorería.

### Estado y lo que queda

`tsc --noEmit` limpio en backend y frontend; sin errores de consola. **Dejé a `almacenista` con sus módulos sugeridos aplicados** (102 acciones) como dato de prueba vivo: si no lo quieres, se pone cada módulo en «Sin acceso» y se guarda.

Lo que **no** pude verificar de punta a punta: entrar al ERP con un usuario que no sea admin, porque el acceso pasa por Keycloak y yo no manejo contraseñas. La verificación llegó hasta el dato: las filas de `rol_endpoint_permiso` quedan escritas con el método correcto, que es justo lo que el guard consulta. Si creas un usuario `almacenista` de prueba y entras con él, eso cierra el círculo.

Y sigue en pie la decisión de siempre: **un rol o varios**. `usuario.rol` es una sola columna y de ese valor dependen la estrategia JWT, el guard y el mapeo hacia Fineract. Con el modelo por módulos, el caso «necesita dos roles» se resuelve casi siempre creando un rol nuevo y marcándole los módulos de ambos, que ahora es cuestión de tres clics.

---

## 2026-09-17 · Coherencia de identidad: Keycloak, ERP y el core

Petición de Abel: *«que haya coherencia en usuarios — deben existir en Keycloak, Fineract y ERP; que cada usuario pertenezca a su empresa; que roles y usuarios tengan coherencia entre sistemas y empresas»*.

### Lo que hay hoy, medido contra la base

```
 empresa                      | email                              | rol   | activo | vinculado | verificado
------------------------------+------------------------------------+-------+--------+-----------+-----------
 EMPRESA B PRUEBA AISLAMIENTO | el-correo-con-el-que-entras-al-erp  | admin | t      | f         | f
 SUMA Local                   | abel.diaz@sumamexico.com            | admin | t      | t         | t
```

- **Cero correos duplicados**, y el índice único `UQ_446adfc18b35418aac32ae0b7b5` sobre `usuarios(email)` existe de verdad en Postgres (también sobre `keycloaksubject`). El aislamiento por empresa del lado del ERP se sostiene: la empresa sale de la fila del ERP, nunca del token.
- La segunda fila es basura de una prueba: **`el-correo-con-el-que-entras-al-erp` no es un correo**, es el hueco de un instructivo que se pegó literal. Es un `admin` activo de una empresa activa con el que nadie puede entrar nunca, porque el directorio jamás va a emitir un token con ese correo.
- **`integracion_vinculos` no tenía ni un vínculo de tipo USUARIO** (48 de otros tipos). La correspondencia ERP↔core existía en la pantalla, no en la base.
- **EMPRESA B no tiene `oficinacontableexterna`.** Con el código anterior, sus operadores habrían caído en la oficina `1` —Head Office, la misma que SUMA Local— por un `?? '1'`.

### Lo que estaba roto, y qué se hizo

**1. La invitación no llevaba a ninguna parte.** `POST /usuarios` creaba la fila con `activo: false` y le pedía al invitado una contraseña para activarse; pero con `AUTH_MODE=keycloak` el login local está cerrado, así que esa contraseña no autentica nada y la cuenta quedaba inactiva para siempre. Ahora, en modo directorio, el alta hace lo único que el ERP puede hacer de verdad —declarar que esa persona pertenece a esta empresa y con qué rol—, el correo dice «entra con tu cuenta de SUMA», y `aceptarInvitacion` responde con una frase clara en vez de fingir. La respuesta del alta trae `requiereAltaEnDirectorio: true`: el ERP **no** crea identidades en Keycloak, y eso se dice donde se ve.

**2. El ERP no sabía nada del tercer sistema.** Sabía quién está en su tabla y podía preguntar al core; de Keycloak solo verificaba tokens, que es saber quién *entró*, no quién *existe*. Nuevo `iam/services/directorio-identidad.service.ts`: consulta de solo lectura al realm (`view-users`, no `manage-users` — crear identidades en el directorio corporativo no es un efecto secundario de llenar un formulario). Devuelve **tres estados**: existe, no existe, y *no se pudo preguntar*. La pantalla de correspondencia ahora pinta `ERP ✓ · SUMA ? · Core ✓` por persona. Sin configurar no estorba: dice `?`.

   Para encenderlo: `DIRECTORIO_CLIENT_ID` y `DIRECTORIO_CLIENT_SECRET` de un cliente del realm con cuenta de servicio y `view-users`. El realm y el host se derivan de `KEYCLOAK_ISSUER_URL`.

**3. Enganche por correo sin verificar — robo de cuenta.** `jwt.strategy` busca la fila por `keycloakSubject` y, si no hay, **por correo**, y sella el vínculo para siempre. Sin exigir que el directorio hubiera verificado ese correo, cualquiera que pudiera registrarse en el realm con el correo de un empleado se llevaba su fila del ERP —con su empresa y su rol— en el primer login, de forma irreversible. Ahora el enganche por correo exige `email_verified === true` y deja rastro en la bitácora.

**4. El listado de usuarios devolvía el hash y los tokens.** `crear()` se molestaba en quitarlos de su respuesta, pero `GET /usuarios` devolvía la entidad entera: `passwordHash`, `tokenVerificacion` (el token de invitación **en vivo**, con el que se activa una cuenta ajena) y `tokenRecuperacion`. Saneado en las tres salidas.

**5. La oficina por omisión mezclaba empresas.** `aprovisionar` hacía `cfg?.oficinaContableExterna ?? '1'`. En el core la oficina es lo que separa una cartera de otra; un valor por omisión que mezcla empresas no es un valor por omisión, es un error silencioso. Ahora se niega y lo explica. Además, si el operador ya existe allá pero en otra oficina, **no se toca**: sería el operador de otra empresa. Y no se acepta vincular un id externo que ya pertenece a otra empresa del ERP (`empresasConIdExterno`, la búsqueda que a propósito no filtra por empresa).

**6. «No pude preguntar» no es «no existe».** `diagnostico` tragaba el error del core y reportaba `existeEnExterno: false`, que en pantalla se traduce en un botón «Dar de alta allá» — es decir, ante un core que no responde, la sugerencia era duplicar al usuario. Ahora `existeEnExterno` es `boolean | null`, hay una acción `CORE_NO_DISPONIBLE`, y el botón desaparece mientras no se sepa.

**7. La validación de correo en la puerta de aprovisionamiento.** Un `includes('@')` no impide pegar el instructivo. Ahora hay un formato real, en el alta y en `asignarAdministrador`.

### La cicatriz: «Corregir roles» quitaba autoridad

Pulsé «Corregir roles» sobre el usuario de Abel para que quedara registrado el vínculo que faltaba. El vínculo quedó (`idExterno: 4`) y **desde ese momento el core contesta `403: User has no authority to READ roles`**.

La base lo explica sin ambigüedad:

```
 id |              username              | office_id | rol_id |        rol
  4 | abel.diaz@sumamexico.com           |         1 |      4 | Administrador   ← antes: 1, Super user
```

El PUT no se portó mal: **hizo exactamente lo que decía el mapa**. La correspondencia tenía ADMIN → «Administrador», que es uno de los **roles espejo** creados por `crearRolesEspejo`, y ésos nacen **sin un solo permiso, a propósito**. `asignarRoles` hace `PUT /v1/users/{id} {roles:[...]}`, que **reemplaza** la lista entera, así que el Super user se fue y quedó un rol inerte.

La lección no es sobre el PUT, es sobre el mapa: **se podía mapear contra un rol que no habilita nada, y nada lo advertía**. Ahora `rolesDisponibles()` marca los roles espejo (`creadoDesdeErp`, reconocidos por la descripción que les pone `crearRol`) y la pantalla les pone «sin permisos», más un aviso en la fila cuando *todo* lo mapeado de un rol es espejo.

Corregido en el sentido correcto: **«Corregir roles» ahora suma, no reemplaza**. Se leen los roles actuales, se hace la unión con los que promete el mapa, y si no falta ninguno no se manda nada. Después del PUT se relee y, si se perdió algo, queda en la bitácora con nombre y apellido. El motivo es el mismo por el que los roles espejo nacen sin permisos: el ERP no sabe qué autoridad bancaria necesita alguien dentro del core. Quitar un rol allá es una decisión de quien administra el core.

**Resuelto el mismo día.** Abel corrió el `insert`; el usuario 4 quedó con `Super user, Administrador` y el diagnóstico pasó a `NINGUNA` por primera vez: `ERP ✓ · SUMA ? · Core ✓`, oficina 1 = oficina 1, y el vínculo `idExterno: 4` registrado.

**Y el aviso nuevo destapó algo mayor: los 13 mapeos apuntan a roles vacíos.** Con la marca puesta, la pantalla lo dice en todas las filas — «todo lo que tiene mapeado este rol son roles espejo». Es decir: hoy **ninguna correspondencia habilita a nadie en el core**. Mientras el único usuario era un administrador con Super user no se notaba. Queda como decisión: darles permisos de verdad a los espejos, o mapear contra roles del core que ya funcionen.

~~**Pendiente de Abel:** restaurar el rol del usuario 4 en Fineract —
`insert into m_appuser_role (appuser_id, role_id) values (4, 1)` sobre `fineract_default` en el contenedor `fineract-db-1` (usuario de psql: `root`).~~

### Lo que sigue abierto

- **La basura de la prueba de aislamiento**: `EMPRESA B PRUEBA AISLAMIENTO` y su usuario imposible. No se borró nada: es dato de Abel y borrar no se hace de oficio.
- **Keycloak sigue sin poblarse desde el ERP.** Hoy la coherencia es *verificable* pero no *automática*: el ERP puede decir «esta persona no está en SUMA», no crearla. Crear identidades en el directorio necesita `manage-users`, política de contraseñas y segundo factor: es una decisión, no un parche.
- **El aislamiento del lado del core sigue siendo el de `HALLAZGO-AISLAMIENTO-CORE.md`**: el inquilino se deduce del emisor del token, no de la cabecera. Las correcciones de oficina de hoy mejoran la separación *dentro* de un inquilino; no sustituyen un realm y un tenant por empresa.

---

## 2026-09-17 (2) · Plan de pruebas, la caja en su ventana, y el expediente del cliente

### Plan de pruebas

`PLAN_PRUEBAS_E2E.md`, nuevo en la raíz. Ocho bloques (A arranque, B consola SUMA, C solo ERP, D ERP+Fineract, E solo Fineract, F identidad entre los tres, G aislamiento, H degradado), los tres modos que van a convivir, con camino feliz y no feliz. Lo que ya se sabe roto va con ⚠️ y lo que hoy no se puede probar con 🚫, para que nadie pierda una tarde redescubriéndolo. Las cinco cosas que faltan están listadas al final con su razón.

### El punto de venta se mudó a `/pos`

**Vivía dentro del área de trabajo.** Barra lateral con veinte módulos, migas de pan, pestañas y barra de acciones: un quinto de la pantalla gastado en navegación que un cajero no usa nunca, y veinte enlaces a sitios donde no debe estar mientras cobra.

Ahora cuelga de `app/pos`, fuera de `app/dashboard`, así que Next **no monta** el layout del área de trabajo — no hay menú que ocultar con CSS porque no existe. El guardia de sesión sí se reimplantó, porque vivía en ese layout.

- **Barra de caja** y nada más: quién atiende y dónde, la hora y el día (van al ticket y al corte), pantalla completa y cerrar. `window.close()` solo funciona si la ventana la abrió el ERP; si alguien tecleó la dirección, se vuelve al historial en lugar de dejar una pantalla muerta.
- **Teclas a la vista**: `F2` buscar, `F4` cobrar, `F8` cliente, `Esc` limpiar. Teclas de función a propósito, que no chocan con lo que se esté escribiendo. `Esc` cierra de lo más superficial a lo más profundo y **nunca vacía el carrito**. Un atajo que nadie ve es un atajo que nadie usa, así que se anuncian en la barra.
- **Se abre en ventana propia** (`lib/pos.ts`): `window.open` con lista de características, sin barra de direcciones ni pestañas. El nombre de la ventana es fijo —`syncro-pos`—, así el segundo clic trae al frente la caja abierta en vez de dejar dos carritos vivos. Si el navegador bloquea la emergente, cae a pestaña: cobrar importa más que la estética.
- **Fuera del menú.** El ítem queda `oculto: true` para que la dirección vieja siga resolviendo al módulo de Ventas; `/dashboard/ventas/pos` es ahora un lanzador que abre la caja y explica la mudanza, porque desaparecer sin decir a dónde es la peor forma de mover algo de sitio.
- `ModuleAction` estrena `ventana?: boolean`. Una acción de ventana se pinta como `<button>`, no como `<Link>`: si fuera enlace, el área de trabajo cargaría la caja dentro de sí misma, que es justo lo que se quería evitar.

### El expediente del cliente

Contaba quién es y qué se le verificó. Faltaba lo que un vendedor pregunta de verdad antes de dejar pasar una venta.

- **`ActividadCliente`** (nuevo componente) con dos bloques que fallan por separado —si crédito no contesta, la actividad se sigue viendo—: *Su crédito hoy* (disponible / utilizado / vencido, barra de uso con la mora en rojo dentro de la barra, plazo, créditos vigentes, próximo vencimiento y la razón de bloqueo cuando no puede comprar) y *Lo que ha comprado* (últimas cinco ventas con su método de pago y el saldo a favor).
- Todo sale de endpoints que ya existían y **que solo consultaba el punto de venta**: `/credito/creditos/cliente/:id/politica` es literalmente la misma pregunta que se hace la caja al elegir cliente. Que la respuesta viviera únicamente dentro del POS obligaba a abrir una venta para saber si alguien podía comprar a crédito.
- **Las cuatro cifras de arriba ahora filtran.** Contaban «1 con línea, 0 en aprobación, 5 de contado» y no se podía hacer clic en ninguna: informaban sin servir. Cada renglón de la lista estrena un punto de color —ámbar para «espera decisión», que es el único estado que pide que alguien haga algo— y, cuando hay solicitud pendiente, muestra el monto **solicitado** en vez del vigente.
- Comprobado con datos reales: disponible $14.85 de $1,200, 99% usado, 3 créditos vigentes, y las cinco últimas ventas con su método.

`tsc --noEmit` limpio en los dos lados; sin errores de consola.

---

## 2026-09-17 (3) · Todo lo del core, sujeto al plan contratado

Observación de Abel, y tenía razón: *«si el usuario no tiene ERP + Fineract, los usuarios y roles no deben tener correspondencia; tiene que ser todo dinámico de acuerdo al plan de contratación»*.

**Lo que estaba mal, y parte lo empeoré yo.** La correspondencia de roles no consultaba el modo de la empresa en ningún punto: `catalogos`, `mapeo`, `diagnostico`, `espejo`, `aprovisionar` y `cuenta-servicio` funcionaban igual para una empresa que solo usa el ERP. Y la pestaña «Correspondencia con Fineract» que agregué ese mismo día se pintaba para todas, así que a una empresa sin core le proponía mapear sus roles contra un registro que no tiene. El enlace a Fineract del menú lateral llevaba igual de largo sin contratación de por medio.

El predicado ya existía —`AccesoExternoService` lo tenía escrito a mano— pero solo lo usaba esa pantalla.

**Un solo predicado, y todo cuelga de él.** `IntegracionModoService.usaRegistroExterno(empresaId)`: verdadero cuando la cartera **o** la contabilidad espejo están encendidas. Ambos ejes apagados por omisión, y una empresa nunca hereda el techo global. `AccesoExternoService` dejó su copia y lo llama.

Cuelgan de él:

- **`RolesExternosService`**: `exigirContratado()` lanza 403 en `aprovisionar` y `crearRolesEspejo` —aprovisionar operadores en un core que no se contrató crearía usuarios en un registro ajeno—, y `diagnostico` devuelve lista vacía, que es la verdad y no un error.
- **`GET integracion/roles/catalogos`** devuelve `contratado: false` y **no llama al core**: preguntar por roles de un registro que no se contrató es, además de inútil, una llamada de red por visita.
- **`GET integracion/contratacion`** (nuevo, `@SkipPermisos`): barato, sin tocar el core. Va sin permiso a propósito — lo consulta cualquier usuario al pintar el menú, y si exigiera permiso un vendedor recibiría 403 y la interfaz concluiría «no contratado» por el motivo equivocado.
- **`lib/contratacion.ts`** (`useContratacion`) en el frontend, con tres estados: mientras no se sabe no se enseña ni se oculta nada, porque un enlace que parpadea es peor que medio segundo de espera. No se cachea entre recargas: el plan se cambia desde la consola de SUMA y tiene que notarse al recargar; un plan cacheado es un cliente que paga un módulo y no lo ve. Si la consulta falla, se asume el plan más pequeño — enseñar de menos molesta, enseñar de más manda a alguien a una pantalla que va a contestarle que no le corresponde.
- **Tres consumidores**: el enlace a Fineract del menú, la pestaña de correspondencia, y la propia pantalla de correspondencia, que si alguien llega por un enlace guardado explica que esa empresa no opera con el registro externo en vez de enseñar un mapa vacío con aire de pendiente.

**Probado.** Caso positivo en vivo: SUMA Local tiene cartera SOMBRA y contabilidad ESPEJO → `usaRegistroExterno: true`, `catalogos.contratado: true`, 16 roles externos, las dos pestañas presentes. Caso negativo con prueba unitaria nueva en `integracion-modo.spec.ts` (`describe('usaRegistroExterno')`): sin fila, con fila apagada, solo cartera, solo contabilidad, y empresa que lo pidió con el techo global apagado.

⚠️ **Jest no corre desde el entorno remoto** (`Module ts-jest in the transform option was not found`, con `rootDir` en `src`). Falla igual en una prueba que no toqué, así que es del entorno, no del cambio: hay que correr `npm.cmd test` en Windows para verlas pasar.

**El plan de pruebas estrena el bloque E-bis**, once casos sobre esto: menú, pestaña, enlace guardado, la API negándose, el catálogo sin llamar al core, contratar y descontratar en caliente, solo-contabilidad, el techo global, y un vendedor pintando su menú. Los tres primeros tienen respaldo unitario; el resto se prueba en pantalla y necesita algo que hoy no existe: **una segunda empresa sin core contratado y un usuario suyo con el que entrar**.

---

## 2026-09-17 (4) · Identidad transversal: el ERP ya da de alta en el directorio

Abel dejó la decisión abierta («haz lo que veas mejor»). Ésta es la decisión y el porqué.

### La pregunta y lo que la zanjó

¿El ERP crea identidades en Keycloak, o solo las pide y las ejecuta el portal o la consola?

Lo zanjó un hecho del despliegue, no una preferencia: **la mayoría de las empresas van a usar solo el ERP, y en su instalación el portal de Fineract no existe.** Si la única forma de crear una identidad fuera el portal —que sí sabe hacerlo, ver abajo— o la consola de SUMA —que la operamos nosotros, no el cliente—, entonces dar de alta a un empleado exigiría abrir un ticket. Eso no escala.

**Así que el ERP crea identidades**, y lo que se conserva del principio «quien opera no aprovisiona» son los límites:

- El cliente de Keycloak lleva `manage-users` y `view-users`, nada más. No es administrador del realm: no toca roles, ni clientes, ni flujos de autenticación.
- Solo actúa sobre el correo que se le pasa. No lista el realm, no modifica a nadie más, no borra.
- Candado de dominios (`DIRECTORIO_DOMINIOS_PERMITIDOS`). Vacío = sin candado, **y eso se reporta en pantalla** en vez de quedarse callado.
- Y sigue siendo el ERP quien decide la **empresa** y el **rol**; el directorio solo guarda la credencial.

### Lo que ya existía y no sabíamos

`fineract/frontend/app/dashboard/admin/users` es una pantalla llamada **«Usuarios Keycloak + Fineract»** que hace justo lo transversal: crea la identidad en el realm y el operador en el core en una sola operación, con `UPDATE_PASSWORD` por correo o contraseña temporal para quien no tiene buzón. Tiene su propio provisionador (`lib/keycloak-admin.ts`, cliente `fineract-provisioner` en el realm `suma`).

Dos cosas que hay que saber de ella:

1. **Está apagada por un dato:** `KEYCLOAK_ADMIN_CLIENT_SECRET` está **vacío** en su `.env.local`, así que `adminConfig()` devuelve null y la pantalla queda en modo consulta. Lo anuncia ella misma: «Keycloak provisioner pendiente».
2. **Su candado está en `open`:** ni `BACKOFFICE_OPERATOR_GROUP` ni `BACKOFFICE_ALLOWED_EMAIL_DOMAINS` están definidas, y `backofficeGuardStatus()` cae en `open` cuando faltan las dos. Poner el secreto sin poner el candado deja que cualquier correo se convierta en operador del back-office. **El candado va primero.**
3. **No crea la fila del ERP**, que es la que decide a qué empresa pertenece la persona. Por eso hacía falta la pata del ERP.

### Lo construido

**`DirectorioIdentidadService` estrena el lado de escritura.** `crearIdentidad({email, nombre, apellido})`:

- Si la identidad **ya existe, la reutiliza** y lo dice. No es un atajo: es el caso «y viceversa». A quien crearon antes en el portal o en la consola, el ERP lo reconoce en vez de crear una segunda identidad para la misma persona —eso produce dos accesos y ninguna forma de saber cuál es el bueno.
- Si el directorio **no contesta**, se detiene sin crear: crear sin haber comprobado es exactamente como se acaba con dos identidades.
- La contraseña **nunca** pasa por el ERP: se crea con `UPDATE_PASSWORD` pendiente y Keycloak manda el correo. Si el SMTP del realm no está configurado, la identidad **no se deshace**: queda creada y se reporta que el correo no salió, porque un administrador puede reenviarlo y borrar la identidad sería peor.
- Devuelve una unión discriminada por **cadena**, no por booleano: este proyecto compila con `strictNullChecks: false` y ahí TypeScript ensancha `true`/`false` a `boolean` y deja de estrechar la unión. Con `resultado: 'ok' | 'error'` sí distingue las ramas. (Lo descubrí porque el compilador se quejó de `alta.codigo`.)

**El alta de usuario: un alta, dos sistemas, en su orden.** La identidad va primero porque es donde vive la credencial; **si falla, no se crea la fila**. Una fila de usuario cuya persona no puede entrar es exactamente la trampa que quitamos ayer, y no se arregla creando la fila igual. Y el `keycloakSubject` se sella **al crear**, no al primer acceso: además de ahorrarse el enganche por correo, lo cierra — nadie puede presentarse con ese correo y quedarse con esa fila.

El tercer sistema **no** se encadena aquí: el ERP y el core viven en módulos distintos y unirlos haría que una caída del core impidiera dar de alta a un empleado. Se avisa (`siguientePaso`) y lo cierra la pantalla de correspondencia, que ya sabe de oficinas y roles del core.

**La pantalla dejó de pedir una contraseña que no autentica nada.** El campo «Contraseña temporal» era un resto del modo local: con `AUTH_MODE=keycloak` esa contraseña no sirve para entrar. Ahora el DTO la hace opcional, el servicio la exige **solo en modo local**, y el formulario la esconde y explica en su lugar qué va a pasar. Si el provisionador no está configurado, avisa en ámbar **antes** de llenar el formulario —no después— de que quedará un pendiente manual.

Y el mensaje de vuelta cuenta sistema por sistema: identidad *creada*, *reutilizada*, o *creada sin que saliera el correo*. «Usuario creado» a secas era lo que hacía que nadie se enterara de que la persona no podía entrar.

### Para encenderlo

En `backend/.env.local` quedó el bloque documentado y comentado. Hace falta un cliente **confidencial** en el realm `suma`, con cuenta de servicio y únicamente `view-users` + `manage-users` de `realm-management`:

```
DIRECTORIO_CLIENT_ID=
DIRECTORIO_CLIENT_SECRET=
DIRECTORIO_DOMINIOS_PERMITIDOS=sumamexico.com
```

Puede ser **el mismo** `fineract-provisioner` que usa el portal: mismo realm, mismo permiso. Dos secretos para lo mismo solo multiplican los sitios donde rotarlo.

### Estado

`tsc --noEmit` limpio en los dos lados. Probado en pantalla el camino sin provisionador: `GET /usuarios/directorio` responde `{configurado: false, identidadEnDirectorio: true}`, el formulario no pide contraseña y avisa en ámbar. Los caminos con provisionador (C3, C3b, C3d, C3e del plan) **no se pueden probar hasta que exista el cliente y su secreto** — es el único paso que falta, y es de Abel.

---

## Etapa 1 de la automatizacion: la identidad de cada empresa deja de vivir en el `.env`

(17 de septiembre. Sigue a `AUTOMATIZACION_ALTA_REALM.md`, que plantea cinco etapas.
Esta es la 1 y es la unica que no cambia el comportamiento de nadie: es aditiva a proposito.)

### El problema que resuelve

Para dar de alta a un cliente **sin trabajo manual** hay que poder decirle al ERP «esta
empresa vive en este realm, con este cliente y este secreto» **mientras corre**. Hoy eso
esta en `backend/.env.local`, y un archivo de entorno tiene dos defectos para este uso:
solo cabe **una** identidad, y para cambiarla hay que **reiniciar**. Eso obliga a un
humano por cliente, que es justo lo que hay que quitar.

### Lo que se construyo

**`common/services/secretos.service.ts`** — AES-256-GCM. La llave (`SECRETOS_LLAVE`) se
hashea a 32 bytes, y el sobre es `v1:<iv>:<etiqueta>:<cifrado>`. Tres decisiones que
importan:

- **GCM y no CBC**: la etiqueta de autenticacion hace que un valor editado a mano en la
  base **no descifre**, en vez de descifrar a basura. Un secreto de Keycloak corrompido
  en silencio se ve como «Keycloak rechaza nuestras credenciales», que es de los errores
  mas caros de diagnosticar.
- **Prefijo `v1:`**: cuando haya que rotar algoritmo, se podra distinguir lo viejo de lo
  nuevo sin adivinar. Sin prefijo, una rotacion obliga a migrar todo de golpe.
- **`descifrar()` devuelve `null`, no lanza**: quien pregunta por una identidad no debe
  caerse porque un secreto este ilegible; debe poder reportarlo. Lo que **si** hace es
  registrar el error, para que no pase desapercibido.

**`iam/entities/empresa-identidad.entity.ts`** + migracion **`1789700000000-EmpresaIdentidad`**
— la tabla. Dos indices unicos que no son adorno:

- `empresaId` unico: una empresa, una identidad. Con dos filas, el resultado quedaria a
  merced de cual devuelva Postgres primero.
- `emisor` unico: dos empresas con el mismo emisor significaria que **los tokens de una
  valen para la otra**. Es justo el agujero que la tabla existe para cerrar, y lo impide
  la base, no la buena memoria del codigo.

Mas un `CHECK` sobre `estado`: una fila con un estado inventado se trataria como «no
activa» y la empresa quedaria en silencio con la identidad del entorno — el tipo de fallo
que no se nota hasta que alguien no puede entrar.

**`iam/services/identidad-empresa.service.ts`** — la unica puerta por la que se pregunta
«de quien aceptamos tokens y con que credenciales le hablamos a su realm». La regla de
precedencia es **la fila de la empresa manda sobre el entorno**, y el orden importa: al
reves, encender una variable global cambiaria la identidad de empresas que ya tienen la
suya. Sin fila, manda el entorno — por eso la instalacion de hoy sigue funcionando sin
tocar nada ni migrar datos.

`emisoresAceptados()` es **control de acceso**, no comodidad: es la lista que impide que
alguien levante su propio Keycloak, firme un token con el correo de un empleado y entre.
Incluye el emisor del entorno y las filas **ACTIVA**. Las `APROVISIONANDO` **no**: un realm
a medio armar puede no tener todavia su politica de contrasenas ni su segundo factor.

El cache es de **un minuto**, no eterno: la consola escribe aqui al dar de alta, y un cache
eterno obligaria a reiniciar el ERP despues de cada alta — exactamente lo que este trabajo
existe para evitar. Y si la tabla **no existe** (migracion sin aplicar), no se cae nada: se
usa el entorno y se deja un `warn`. Antes de esta tabla el sistema funcionaba asi.

**`DirectorioIdentidadService.paraIdentidad()`** — devuelve una **copia** atada a una
identidad concreta en vez de mutar la instancia compartida: dos peticiones de empresas
distintas no pueden pisarse el cliente a media llamada. La identidad llega **por parametro**
y no inyectando el resolutor, para no atar este servicio a la tabla — sigue sirviendo en una
instalacion que no la tenga.

### Estado y como se verifico

- `tsc --noEmit`: **limpio**.
- `identidad-empresa.spec.ts`: **14 casos, 14 pasan**. Cubren ida y vuelta del cifrado,
  que dos cifrados del mismo texto **no** sean iguales (si lo fueran, la base revelaria que
  empresas comparten secreto), deteccion de edicion a mano, llave equivocada, sin llave;
  y del lado del resolutor: entorno por omision, la fila ACTIVA gana, `APROVISIONANDO`
  se ignora, emisor desconocido **rechazado**, barra final indiferente, tabla ausente, y
  que el `resumen()` **no** revele el secreto.
- **Nota para quien siga: `jest` no corre desde el VM remota ni desde el contenedor.**
  Falla con `Module ts-jest in the transform option was not found` incluso pasando la
  **ruta absoluta** del transformador, y falla igual en especificaciones que nadie toco.
  No es un defecto del repo: `jest-resolve` no logra resolver archivos a traves del
  sistema de archivos montado. `tsc` si funciona ahi. Los 14 casos de arriba se corrieron
  con un corredor minimo propio (`describe`/`it`/`expect` sobre `ts-node`), que **no
  sustituye** a `npm.cmd test` en Windows. Si una especificacion falla aqui, es real; si
  jest no arranca aqui, no significa nada.

### Lo unico manual que agrega, y por que es aceptable

Una variable nueva en `backend/.env.local`:

```
SECRETOS_LLAVE=<48 bytes aleatorios>
```

Es **una vez por instalacion y cero veces por cliente**, que es el criterio que fijamos.
Ya quedo puesta en este entorno. Si se pierde, los secretos guardados no se recuperan: hay
que volver a aprovisionar desde la consola. Pruebas y produccion llevan llaves distintas.

**Pendiente de Abel:** aplicar la migracion `1789700000000-EmpresaIdentidad` (las
migraciones no corren solas: `DB_MIGRATIONS_RUN=false`) y correr `npm.cmd test`.

### Consola de SUMA, de paso

Estaba **sin `.env.local`** y por eso no abria. Ahora los ocho puntos del diagnostico estan
en LISTO. En el camino, dos cosas:

- El archivo tenia `OIDC_CLIENT_SECRET` **dos veces** —vacia arriba, con valor abajo—.
  Funcionaba por accidente, porque dotenv se queda con la ultima. Quedo una sola vez.
- `CONSOLA_GRUPO` pedia `/operadores` y el token traia `/Operadores`. En Keycloak son dos
  grupos distintos. Se corrigio el valor y **no** se hizo la comparacion insensible a
  mayusculas: la pantalla ya detecta y explica el caso, y aflojar la comparacion aflojaria
  la unica regla que decide quien entra a la consola.

### Que sigue

La **etapa 2**: que `jwt.strategy.ts` acepte varios emisores preguntandole a
`IdentidadEmpresaService.emisorAceptado()` en vez de fijar uno solo al construirse. Es la
etapa que **puede dejar a todo el mundo fuera**, asi que va sola, en su propio cambio, y
probada contra un realm de pruebas antes de tocar el de produccion. No mezclarla con la 1.

### Etapa 2, verificada en vivo (17 de septiembre, tras reiniciar)

Con el ERP y la consola reiniciados:

- **Nadie quedo fuera.** Token real del emisor del entorno (`.../realms/suma`, `azp:
  syncro-erp`) contra `GET /api/usuarios/directorio`: **200**. Era el riesgo de la etapa 2
  y no se materializo.
- **Cuatro rechazos, los cuatro 401**, alterando el `payload` del token real:
  emisor de otro servidor; **sin** `iss`; un realm del **mismo** Keycloak que no esta
  registrado (`.../realms/inventado`); y el mismo emisor con la firma ya invalida. El
  tercero es el que importa: compartir el host de Keycloak no alcanza para entrar, hay que
  estar en la lista.
- **Consola de SUMA: abre.** Ya no muestra diagnostico, muestra la pantalla de clientes y
  lista las dos empresas que hay en el ERP (`SUMA Local` — ERP + core, modo SOMBRA, sin
  inquilino; y `EMPRESA B PRUEBA AISLAMIENTO` — solo ERP).

### Lo siguiente que topa: la reserva de inquilinos

La consola no puede registrar inquilinos porque falta `FINERACT_TENANTS_DB_URL` en
`backend/.env.local`. No es un olvido: `alta-empresas.service.ts` lee la tabla `tenants` de
la base maestra del core **en solo lectura** para comprobar que un identificador exista de
verdad, y se niega a aceptar cualquiera. Ya paso lo contrario —se registraron `t001`,
`t002`, `t003`, que no existen— y de ahi viene esta regla.

El valor, en esta instalacion, es la base `fineract_tenants` del contenedor `fineract-db-1`
(usuario `root`, puerto 5432 en el host, segun `INICIAR_FINERACT_LOCAL.bat`):

```
FINERACT_TENANTS_DB_URL=postgres://root:<POSTGRES_PASSWORD>@localhost:5432/fineract_tenants
```

La contrasena sale del propio contenedor (`docker inspect`), no se teclea de memoria.


---

## Auditoría completa y correcciones (17 de septiembre)

Abel pidió garantizar que no haya fallas en el ERP ni en Fineract, y revisar
incoherencias de pantalla y flujos a medio madurar. Se auditó el backend (565
archivos) y el frontend completos. Lo que sigue es lo que se encontró, lo que se
corrigió y lo que queda, con el escenario de falla de cada cosa — porque un
hallazgo sin escenario no se puede priorizar.

### Lo más grave: `@Roles(...)` no lo leía nadie

Había **47 anotaciones** `@Roles('administrador', 'direccion')` en los
controladores de integración, conciliación, cobranza y validación. Ninguna se
evaluaba: `ROLES_KEY` aparecía **una sola vez** en todo el repositorio, en su
propia definición. Los únicos guardias registrados eran Throttler, sesión y
permisos por módulo.

No era teórico. Las plantillas dan a `credito` y a `direccion` el módulo
`integracion` en modo consulta, así que **cualquier usuario con rol `credito`
podía llamar `GET /integracion/roles/diagnostico`** —los correos de todos los
usuarios de la empresa y su estado en el core—, más el outbox, la verificación y
los avisos huérfanos. El código declaraba que eso era sólo de administración y
el sistema no lo cumplía.

Se construyó `common/guards/roles.guard.ts` y se registró después del de
permisos. Dos cuidados: compara con `normalizarRol` —las anotaciones se
escribieron con tres estilos distintos a lo largo del tiempo y el rol en la base
es un `varchar` que nadie garantiza en minúsculas, así que comparar literalmente
habría dejado gente fuera por una mayúscula— y el administrador pasa siempre,
con la misma función que usa el guardia de permisos, para no tener dos
definiciones de «administrador» que algún día discrepen. Sin usuario no decide:
las rutas `@Public()` —el webhook del core, la comprobación de dirección— siguen
gobernadas por su propia clave.

De paso: `@Roles('ADMIN', 'DIRECCION', 'CONTABILIDAD')` en los avisos. `CONTABILIDAD`
**no es un rol del catálogo** —se llama `contador`—, así que encender el guardia
sin corregirlo habría dejado fuera justo a quien concilia. Corregido.

### Fugas entre empresas

**`GET /integracion/avisos/huerfanos` devolvía el cuerpo crudo de avisos de otros
inquilinos.** Un aviso queda huérfano precisamente cuando su identificador
externo no se pudo atribuir a una empresa o apunta a más de una: es decir, cuando
es probable que describa a un cliente, un crédito o un pago de **otro cliente de
SUMA**. Ese `jsonb` —nombres, montos, folios— se entregaba a cualquier
administrador, y encima protegido sólo por el `@Roles` muerto. Ahora se devuelve
la ficha (tipo, acción, inquilino, id externo, cuándo llegó, diagnóstico) y no el
contenido, que es lo que la pantalla necesita para su propósito: saber que existe
algo en el core que el ERP no creó.

**`POST /integracion/outbox/despachar` despachaba el outbox de todas las
empresas.** Era el único handler de ese controlador que no tomaba `empresaId` del
token. Escenario: el administrador de la empresa A corrige su configuración,
pulsa «forzar despacho» y provoca el envío al core de hasta 500 eventos
pendientes de B y C —altas de cliente, originaciones de crédito, asientos
contables— que sus responsables tenían deliberadamente en espera. Movimientos en
sistemas de terceros disparados por un inquilino ajeno. Ahora `pendientes()`
acepta empresa: el despachador automático sigue atendiendo a todas —es un proceso
del sistema— y el despacho manual sólo a la de quien lo pide.

**La oficina del core tenía valor por omisión.** En
`fineract-cartera.adapter.ts` la replicación de clientes decía
`?? this.cfg.oficinaPorDefecto`, que es `FINERACT_OFICINA_ID ?? 1` — la Head
Office. En Fineract **la oficina es lo que separa las carteras**, así que dos
empresas sin oficina configurada replicaban todos sus clientes a la oficina 1 y
sus operadores acababan viendo los clientes y los créditos de la otra. No se nota
al replicar: se nota cuando alguien abre la lista de clientes del core.

Es la misma regla que ya se había corregido en el alta de usuarios —«un valor por
omisión que mezcla empresas no es un valor por omisión»—; la replicación de
clientes había conservado el atajo. Ahora se detiene con un mensaje que dice qué
configurar. **Esto cambia comportamiento**: una empresa sin oficina deja de
replicar clientes y lo dice, en vez de replicarlos al lugar equivocado en
silencio. Un cliente mal replicado no se puede deshacer —Fineract no borra
clientes con historia—, así que detenerse es lo correcto.

El mismo `?? '1'` estaba en `aprovisionarCuentaServicio`, que además **no
comprobaba la contratación** (sus tres hermanas sí). Una empresa con los dos ejes
en APAGADO creaba o modificaba el usuario de servicio en el core. Corregidas las
dos cosas.

**`POST /integracion/cuentas/aprovisionar` no miraba el eje contable.**
Comprobaba que el proveedor estuviera disponible —que dice que SUMA lo tiene
levantado, no que esta empresa lo haya contratado— y creaba decenas de cuentas en
el mayor compartido del core. No rompe nada visible: ensucia el catálogo de todos
los inquilinos y no hay operación inversa.

### Dinero

**El tope de aprobación automática de crédito venía en el cuerpo de la
petición.** `topeAutomatico` es exactamente lo que decide entre `APROBADO` y
`REVISION_MANUAL`, y sólo estaba validado con `@Min(0)`. Quien pudiera llamar
`POST /integracion/evaluar-credito` pedía `limiteSolicitado: 3_000_000,
topeAutomatico: 3_000_000` y obtenía una aprobación automática por ese monto,
saltándose el comité.

Ahora se acota con `CREDITO_TOPE_AUTOMATICO`: lo que llega en el cuerpo sólo
puede **bajarlo** —pedir más revisión manual siempre está bien—, nunca subirlo. Y
sin la variable el tope es **cero**: todo a revisión, que es el estado seguro
para algo que aprueba dinero. Quedó en `0` en `.env.local`; el límite real del
negocio es una decisión de política, no técnica.

**En el punto de venta, el descuento por renglón no tenía tope.** El campo dice
«Desc. $» y está junto al precio: teclear ahí 1500 en un renglón de $150 dejaba
el renglón en −$1,350, el TOTAL en negativo y la venta se podía enviar (la
validación de efectivo se cumple con cualquier monto recibido). Se acota al
importe del renglón **en el estado**, no sólo con el `max` del campo, porque el
`max` no impide pegar un valor.

**La pantalla de «¡Venta Completada!» anunciaba un importe distinto del
cobrado.** Mostraba el total de la venta mientras el botón había cobrado
`totalEfectivo` (total menos saldo a favor aplicado). Venta de $1,000 con $300 de
saldo: se cobran $700 y la pantalla dice $1,000 en grande; al cuadrar la caja esa
cifra no coincide con el efectivo. Ahora muestra lo cobrado, con una línea que
explica el saldo aplicado.

**La caja mostraba importes de tres decimales.** `fmt` tenía
`minimumFractionDigits: 2` y no máximo, sobre importes redondeados a cuatro
decimales: tres piezas a $10.333 con IVA se veían como `$35.959`, una cifra que
nadie puede cobrar ni dar de cambio.

**El IVA de las cotizaciones de compra estaba escrito al 16% en el navegador** y
viajaba al servidor como `impuestoTotal`. En una compra exenta o con tasa de
frontera, la cotización nacía con un IVA inventado y un total que no cuadraba con
la orden que saliera de ella. Ahora la tasa se elige (16 / 8 / exento), se
recalcula sin tocar los renglones y la etiqueta dice cuál es.

### Flujos a medio madurar

**Un clic en cualquier compra del panel de clientes caía en un 404 sin salida.**
`actividad-cliente.tsx` enlazaba a `/dashboard/ventas/{id}`, y esa carpeta sólo
tiene `facturar/` y `ticket/` — **no hay `page.tsx`**. El vendedor abría el
expediente de un cliente, pulsaba «Venta #1043» y caía en el 404 de Next dentro
del área de trabajo: sin menú, sin miga de pan, sin botón de volver. Ahora enlaza
al ticket, que ya muestra la venta entera —renglones, impuestos, forma de pago y,
si fue a crédito, su plan de cuotas—. Era el único enlace roto de ese tipo.

**Una devolución reintentada se aplicaba dos veces.** La clave de idempotencia se
generaba **dentro** de `guardar()` con `crypto.randomUUID()`, así que cada intento
llevaba una clave nueva y el backend no tenía cómo reconocer el reintento.
Escenario: devolución de $8,000, la petición expira por red, el usuario ve el
error y pulsa otra vez — si la primera había llegado, quedan dos devoluciones y
dos reembolsos de caja. Ahora la clave identifica la devolución y no el intento
(un `useRef` por formulario), que es el patrón que ya usaban el punto de venta y
cobranza.

**Registrar un pago con la red caída dejaba la pantalla colgada para siempre.**
El `fetch` de cobranza estaba desnudo: si la promesa se rechazaba, no se
ejecutaba nunca `setGuardando(false)` ni ningún aviso. El cobrador capturaba el
abono, pulsaba «Registrar Pago» y el botón se quedaba en «Guardando…», con el
modal abierto y sin saber si el pago entró; la única salida era recargar. Ahora
avisa que no se registró y que puede reintentar —la clave de idempotencia hace
que reintentar sea seguro—, y distingue la sesión caducada, que antes se veía
igual que un error del pago.

### Lo que queda, por orden

Del mismo barrido, pendiente y con su archivo:

1. **Despacho concurrente duplica asientos.** El candado del despachador es por
   proceso (`this.despachando`) y la consulta del outbox no reclama filas (sin
   `FOR UPDATE SKIP LOCKED` ni estado «en proceso»). Con dos réplicas, para
   clientes y créditos salva la idempotencia por `externalId`; **para pólizas no
   hay clave de idempotencia** y la secuencia buscar → vincular → registrar no es
   atómica: dos asientos en el mayor. Hoy con una sola instancia no ocurre.
2. **Redondeo por partida después de validar el cuadre sin redondear.** El
   despachador valida la póliza cruda (`decimal(18,4)`) y el adaptador redondea
   cada línea a dos decimales: `50.0025 + 50.0025` contra `100.005` pasa la
   validación y Fineract rechaza el asiento con 400 no reintentable. La póliza
   nunca se espeja y el mensaje no menciona el redondeo. Relacionado: el ERP
   admite pólizas descuadradas por menos de un centavo, acumulativo e invisible
   en reportes a dos decimales.
3. **La fecha del pago al core se calcula en UTC.** `cartera-publicador` usa
   `toISOString()` en la publicación de pagos, teniendo al lado un `dia()` creado
   justo para esto y usado en las otras cinco. Un cobro a las 19:30 del 30 de
   septiembre en México viaja como 1 de octubre: el corte del ERP y el del core
   no coinciden.
4. **El inquilino asignado por empresa no se usa en operación.** El
   aprovisionamiento toma un tenant de la reserva y lo guarda, y ninguna llamada
   de operación lo lee: todas van contra `FINERACT_TENANT`. Hay que decidir si el
   diseño es un inquilino por empresa —y entonces esto es el aislamiento roto— o
   uno compartido separado por oficina, y en ese caso la reserva no significa lo
   que dice.
5. **El permiso se resuelve contra endpoints desactivados** (falta `activo: true`
   en una consulta de `permisos-dinamicos`), así que un permiso concedido sobre
   una fila hoy desactivada sigue pasando el guardia.
6. **La caché de modo (60 s) sobrevive al apagado en otras instancias**: SUMA baja
   a APAGADO la cartera de quien dejó de pagar y durante un minuto se siguen
   creando préstamos.
7. **`emitir()` se come el fallo de encolado dentro de la transacción de
   negocio.** Promete una tolerancia que PostgreSQL no puede dar: un INSERT
   fallido aborta la transacción entera, así que el `catch` deja la siguiente
   consulta rompiéndose con `current transaction is aborted`.
8. **Las pantallas de `direccion` sobre la integración están inservibles**: la
   plantilla le da `integracion` sólo en consulta y el código anota `direccion`
   en cinco escrituras. Hay que decidir cuál de las dos es la intención.
9. **Frontend, incoherencias que valen una pasada**: el ticket que el cliente
   trae en la mano no se puede buscar en el historial (el POS muestra `folio`, el
   historial busca por UUID y el campo `folio` está declarado y sin usar); el
   historial trae 100 ventas y no lo dice; «Todo su historial» y «Ver cartera»
   pasan `clienteId` por URL y ninguna de las dos pantallas lo lee —se ve el
   historial completo creyendo ver el del cliente—; el correo es obligatorio en
   clientes y opcional en el POS, así que el cliente creado en caja no se puede
   volver a guardar; «Limpiar» vacía el carrito sin preguntar y la tecla que la
   barra anuncia para eso no hace nada; «Cancelar» en el plan de pagos guarda los
   cambios igual; 77 archivos siguen con `fetch` crudo en vez de `lib/api`, así
   que la sesión caducada se ve como «Error al cargar» en vez de llevar a iniciar
   sesión; y tres formatos de dinero conviviendo pese a que `lib/format` existe
   para eso.
10. **«Avisos del core» se ofrece a empresas que sólo contrataron ERP**:
    `module-config.ts` no tiene forma de marcar un ítem como «requiere core» y el
    menú sólo filtra por permisos. Y `/dashboard/permisos/correspondencia` es
    alcanzable por URL sin contratación: se oculta la pestaña, no la pantalla.

### Verificación

`tsc --noEmit` limpio en backend y frontend. **51 casos de prueba** pasan entre
lo nuevo de hoy: 14 de la identidad por empresa, 9 del multi-emisor, 12 del
registro y activación de identidades, 7 del guardia de roles, más los de
integración que ya estaban. Recordatorio: **jest no arranca contra el sistema de
archivos montado** —falla incluso con la ruta absoluta del transformador, y falla
igual en especificaciones que nadie tocó—, así que esto se corrió con un corredor
mínimo propio sobre `ts-node`. No sustituye a `npm.cmd test` en Windows.

Lo que **no** se probó en vivo: todo lo anterior es cierto sobre el código, y el
guardia de roles y la oficina obligatoria **cambian comportamiento**. Hay que
reiniciar el backend y recorrer una vez la integración con un usuario que no sea
administrador.


---

## La primera sesión de un usuario que no es administrador (17 de septiembre)

Se dieron de alta cuatro usuarios finales por la pantalla —almacenista, RRHH,
crédito y contador—, con identidad real en Keycloak, y se entró al ERP como
`almacen.prueba`. Era la primera vez que alguien que no es administrador usaba
este sistema. El administrador **salta la tabla de permisos entera**, así que
todo lo que sigue llevaba meses sin poder verse.

### 1. Las plantillas de permisos no se aplicaban solas

`rrhh` y `credito` quedaron con un usuario cada uno y **cero acciones**. Como el
guardia niega lo que no está concedido, esa persona entra y no puede hacer nada.
Y es por empresa: cada cliente nuevo de SUMA nacía con los trece roles vacíos.

Corregido en `usuarios.service`: al crear un usuario o cambiarle el rol, si ese
rol no tiene **ningún** permiso en la empresa, se siembra su plantilla. Sólo si
está vacío, para no deshacer lo que alguien configuró a mano. Verificado en
vivo: el alta de `contador.prueba` nació con 119 acciones.

### 2. El menú venía vacío aunque los permisos estuvieran bien

Con 102 acciones concedidas, el panel decía «Todavía no tienes módulos
asignados» y el menú tenía dos entradas. La API, en cambio, respondía 200 a
productos, almacenes y categorías. Los permisos estaban bien; lo que fallaba era
`obtenerRutasPermitidas`, de donde sale el menú.

Eran dos restos de SQL Server en dos consultas escritas a mano:
`rep.empresaId` sin comillas —PostgreSQL lo pasa a minúsculas y buscaba una
columna que no existe— y `rep.permitido = 1` sobre una columna booleana. Los dos
errores caían en un `.catch` que devolvía lista vacía: el sistema no se caía, se
quedaba callado y dejaba sin menú a todo el que no fuera administrador. Reescrito
con el constructor de consultas. De dos entradas pasó a nueve módulos.

### 3. Indicadores que valían cero cuando en realidad no se pudieron leer

El panel del almacenista mostraba «Ventas de hoy **$0.00** · 0 transacciones»,
«Ticket promedio $0.00», «Últimos 7 días $0.00». Las tres llamadas respondían
403 y `intentar` se tragaba el error.

Eso no es un hueco: es un dato del negocio, y falso. Si el almacenista lo repite
en voz alta, alguien decide con eso. Ahora `null` significa «no lo sé» y lo que
no se sabe no se pinta.

Lo mismo, y peor, en **Corte de Caja**: la pantalla entera con «TOTAL COBRADO
$0.00» desglosado por efectivo, tarjeta, transferencia y cobranza, en un día que
podía tener ventas. Con eso se cierra una caja mal. Ahora dice que no se puede
calcular y por qué, sin pintar un solo número.

### 4. El punto de venta se abría para quien no puede vender

Al vivir fuera de `/dashboard`, la caja se saltaba el guardia de rutas: el
almacenista la abría entera, buscaba productos, armaba el carrito, y sólo al
pulsar «Cobrar» el servidor decía que no. El backend nunca dejó pasar la venta
—no era un agujero—, pero la negativa llegaba con el cliente enfrente y el
carrito lleno. Ahora se comprueba al abrir. Quien tiene ventas en modo consulta
tampoco entra, que es lo correcto: no se puede cobrar con permiso de lectura.

### 5. Botones que llevaban a una negativa

La barra contextual del módulo ofrecía sus acciones **sin filtrar por
permisos**, mientras la pantalla del centro del módulo sí las filtraba: la misma
barra, dos comportamientos. Al almacenista, en Finanzas, le ofrecía «Nueva
póliza», «Balanza» y «Cierre mensual» en botones destacados. Y en el panel, los
accesos rápidos se filtraban con `puedeVerEnlace`, que acepta que el permiso sea
*descendiente* del enlace —correcto para una sección, no para un destino
concreto—. Los dos corregidos.

### Lo que sí funcionó

La cadena de identidad, completa: el alta creó la identidad en Keycloak, selló
el `sub`, y al entrar el ERP reconoció a la persona con su empresa y su rol. El
guardia de permisos niega de verdad: de dieciséis rutas probadas con el token
del almacenista, las de su trabajo respondieron 200 —productos, almacenes,
categorías, compras y proveedores en consulta— y las ajenas 403: RRHH, usuarios,
administración de permisos, integración, ventas, clientes y finanzas. Entrar por
URL a un módulo ajeno muestra «Esta sección no está en tu perfil» con salida al
panel, sin callejón. Y el catálogo de módulos es coherente: `inventario` cubre
productos, categorías, marcas, unidades, almacenes, existencias, WMS e
importación, así que «almacenista» sí significa el almacén entero.

### Lo que queda de esta sesión

- **Sin SMTP en el realm no entra nadie.** Las cuatro identidades se crearon y
  ninguna recibió el correo para fijar contraseña. El ERP lo reporta bien, pero
  en producción es un muro: hay que configurar el correo del realm antes de
  vender la primera cuenta.
- **`/dashboard/reportes` se concede entero.** Un endpoint de inventario declara
  esa ruta como su pantalla, así que el almacenista ve el módulo de reportes
  completo —Panel ejecutivo, Ventas, Cartera, Estado de cuenta— y cada uno falla
  al abrirse. La ruta declarada debería ser la del reporte concreto.
- **La lista de tareas de «primeros pasos»** en Productos le ofrece al
  almacenista «Completar configuración fiscal» y «Activar Finanzas», que son de
  administración.
- El panel pide `mis-permisos` y `mis-rutas` **dos veces** en cada carga.


---

## Auditoría módulo por módulo (18 de septiembre)

Se auditaron por lectura completa los módulos de **Ventas, Clientes, Facturación
(CFDI) y punto de venta**; **Compras, Proveedores, Inventario/Almacén, Catálogos
y Precios**; y **Finanzas/Contabilidad, Tesorería, Caja y Crédito y cobranza**.
Salieron 45 hallazgos. Abajo está lo corregido y, después, lo que queda con su
escenario de falla, para que se pueda priorizar sin volver a buscarlo.

### Corregido

**El conteo físico vaciaba la ubicación contada.** `wms.service.ts` decidía la
cantidad final con `d.reconteo !== undefined`, y la columna es NULLABLE: el
transformador de decimales devuelve `null`, `null !== undefined` es verdadero, y
la cantidad final quedaba en `Number(null)` = **0**. El almacenista contaba 500
piezas, el detalle guardaba `diferencia = −500`, y al cerrar el conteo se
registraba la salida de las 500 con su póliza de merma. El rack quedaba en cero
con la mercancía puesta ahí. No era un caso raro: era **el único camino
posible**, porque la pantalla nunca manda `reconteo`.

**La recepción de compra valuaba el inventario a una fracción de lo pagado.** El
precio de la orden viene por unidad base, pero se pasaba a `registrarCompra` como
si fuera el precio del empaque, y ese método lo divide entre el factor. 120
piezas a $10 recibidas como «10 cajas de 12» entraban a **$0.83** la pieza: lote
de $100 en vez de $1,200. El costo promedio absorbía el error para siempre, toda
venta posterior mostraba utilidad inflada, y el inventario valuado se separaba
$1,100 de la cuenta contable. El asiento, además, multiplicaba empaques por
costo unitario: decía $100 donde la factura del proveedor decía $1,200. Ahora el
costo va en la misma unidad que la cantidad y el asiento en unidad base.

**El almacenista no podía recibir mercancía** — justo lo que da nombre al rol. La
recepción es un `PATCH` bajo `/compras/...`, y la plantilla da compras sólo en
consulta: veía la pantalla, capturaba todo con el camión enfrente y al guardar
recibía un 403. Se reclasificó la recepción al módulo de inventario, que es
donde pertenece por trabajo aunque cuelgue de esa ruta.

**Parámetros de SQL Server en consultas de PostgreSQL.** `@N` en vez de `$N` —y
con el índice corrido en uno— en la Declaración de IVA y en el estado de cuenta
del cliente. En PostgreSQL `@` es valor absoluto, así que las dos consultas
reventaban en cuanto se acotaba el periodo, que es como se usan siempre. Es la
misma familia del defecto que dejaba sin menú a los no administradores.

**El CFDI mandaba al PAC una tasa de IVA inventada.** Se deducía dividiendo el
impuesto entre el subtotal, los dos ya redondeados a dos decimales: en una venta
de $99.99 salía `0.160016`, y el catálogo del SAT sólo admite `0.160000`. El
timbrado se rechaza y el cliente se va sin factura. La tasa estaba guardada en la
partida; ahora se lee.

**Los pagos cancelados contaban como cobrados** en el estado de cuenta que se le
manda al cliente, en su saldo anterior y en el corte de caja. Se cancelaba un
cobro de $15,000: el saldo del crédito subía bien, pero el documento del cliente
seguía mostrando el abono y un saldo menor, y cobranza dejaba de perseguir esa
deuda.

### Lo que queda, ordenado por lo que cuesta

**Dinero que se entrega mal, hoy**

1. **El punto de venta cobra y da cambio con cifras del navegador.** El servidor
   recalcula precios contra el catálogo y devuelve `discrepanciasPrecio`; esa
   respuesta **no se lee en ninguna parte del frontend**. Si alguien cambia un
   precio mientras la caja tiene el carrito armado, el cajero entrega un cambio
   calculado sobre un total que no es el que se guardó. Con tarjeta pasa al
   revés: se cobra al TPV lo de la pantalla y la venta queda registrada por otro
   importe.
2. **Una devolución previa no se descuenta al facturar.** `timbrarVenta` arma las
   partidas con las cantidades originales sin restar lo devuelto, y sólo bloquea
   si la venta está ANULADA. Se factura por el total de una venta ya devuelta a
   medias, se traslada IVA que no se cobró, y como la devolución ocurrió antes de
   la factura nunca se generará la nota de crédito que lo corrija.
3. **Un timeout del PAC produce un segundo timbrado ante el SAT.** Reintentar
   manda el mismo payload sin preguntar antes si esa serie y folio ya existen.
   Quedan dos CFDI vivos por la misma operación y el ERP sólo conoce el segundo.
4. **La diferencia del arqueo de caja no llega a la contabilidad.** Se calcula, se
   exige una nota y ahí muere: ni tesorería ni el mayor se enteran. La caja
   física y la contable divergen un poco más en cada corte.
5. **Cancelar un movimiento de tesorería revierte el auxiliar pero no el mayor**, y
   la validación de «ya estaba cancelado» ocurre fuera de la transacción, así que
   un doble clic lo revierte dos veces.

**Cosas que se van a atorar en cuanto haya volumen**

6. **El cierre contable no se puede cerrar nunca**, por dos motivos
   independientes: ninguna cobranza guarda su `polizaId` —el generador de
   asientos de cobranza, venta, compra y pago a proveedor no devuelve la póliza,
   aunque sí la crea— y ningún camino del sistema marca un estado de cuenta
   bancario como CERRADA, que el control de bancos exige. Además un solo pago
   cancelado cuenta como «sin contabilizar» y bloquea el mes.
7. **Se puede cobrar con fecha dentro de un periodo cerrado**: el pago, el
   movimiento de tesorería y el de caja se confirman, y el asiento muere
   FALLIDO. El dinero queda en el auxiliar y no en el mayor de un mes firmado.
8. **Una orden de compra recibida de menos no se puede pagar ni cerrar**, y
   cancelarla no revierte lo ya recibido. No existe el paso de factura del
   proveedor: se paga contra el total de la cotización, nunca contra lo recibido
   ni contra un CFDI. Y cancelar una orden deja su requisición muerta, sin
   transición posible.
9. **El conteo compara contra una foto vieja.** La existencia teórica se congela
   al abrir el conteo y no se revalida al cerrarlo: lo que entre o salga mientras
   tanto se convierte en un ajuste falso. El conteo, cuya función es cuadrar,
   descuadra.
10. **Transferencias entre almacenes: el faltante en tránsito desaparece.** Lo
    enviado y no recibido no genera movimiento ni asiento, y la pantalla ni
    siquiera deja capturar faltantes: firma siempre que llegó todo.

**Concurrencia y conciliación**

11. **Conciliación bancaria sin bloqueo**: dos usuarios pueden aplicar el mismo
    movimiento a dos líneas distintas del estado de cuenta, y el reporte cuadra
    con un cargo real de menos. Y el «saldo según libros» del reporte se toma de
    una fila arbitraria, porque la consulta no lleva `ORDER BY`.
12. **Folios sin candado** en pólizas manuales, devoluciones y tesorería: dos
    usuarios simultáneos chocan contra el índice único y uno pierde la
    operación con un error de base de datos.
13. **Idempotencia con códigos de SQL Server** en compras: se comparan los
    números de error 2601/2627 contra una base PostgreSQL, que usa `23505`. El
    reintento no devuelve la respuesta idempotente: revienta con 500 y el
    usuario duplica la entrada de inventario.

**Errores que se ven como datos**

14. El historial de ventas, los conteos, las recepciones, las ubicaciones y las
    búsquedas del punto de venta muestran listas vacías cuando la llamada falla.
    Es el mismo patrón que en el panel y el corte de caja, ya corregidos: hay que
    barrerlo entero.
15. **El saldo a favor del cliente se ignora en silencio si su consulta falla**: la
    caja cobra el total completo y no queda rastro.
16. **Procesar una devolución no pide confirmación y no tiene vuelta atrás**: saca
    dinero de la caja, mueve inventario, toca el crédito y encola la póliza, al
    primer clic.

**Y una que no es un defecto sino una decisión que falta**

17. **Una lectura de precios escribe configuración**: si no hay lista
    predeterminada, la primera consulta de precio del día convierte en
    predeterminada a la primera lista por orden alfabético, sin que nadie lo
    decida ni quede en auditoría. Si esa lista es «Costo especial cliente X», el
    punto de venta empieza a cobrarle esa lista a todo el mundo.

### Nota sobre el método

Los hallazgos salen de lectura de código, no de ejecución. Los que se
corrigieron se confirmaron leyendo entidad, servicio, pantalla y configuración,
no por inferencia. `tsc --noEmit` queda limpio en backend y frontend después de
los cambios. Lo que **no** se puede afirmar todavía: que cada corrección se
comporte bien en vivo — hace falta recibir una compra con empaque, cerrar un
conteo y timbrar una venta cuyo subtotal no sea múltiplo de $0.25.


---

## Barrido de los trece roles con sesión real (18 de septiembre)

### Cómo se hizo, porque importa para repetirlo

Keycloak mantiene **una sola sesión por navegador**, así que no se pueden tener
dos usuarios a la vez ni cambiando de puerto: la segunda dirección entra con el
mismo usuario. Lo que sí funciona es separar el token de la sesión:

1. Se entra como el usuario de prueba y se **guarda su token** aparte en el
   almacenamiento del navegador.
2. Se cierra la sesión de Keycloak y se entra como administrador. El token del
   usuario de prueba **sigue siendo válido**: es un JWT firmado, y el ERP lo
   verifica por firma, no consultando la sesión.
3. Desde una sola pestaña se tienen las dos llaves. Con la de administrador se
   cambia el rol del usuario de prueba; con la suya se comprueba qué alcanza.

Y funciona porque **el rol no viaja en el token**: el ERP lo lee de su propia
fila en cada petición. Cambiar el rol surte efecto en la siguiente llamada, sin
volver a entrar. Para esto hubo que subir el *Access Token Lifespan* del cliente
`syncro-erp` de 5 minutos a 1 hora.

### El resultado

Para cada uno de los trece roles se cambió el rol del usuario de prueba y se
llamó, con **su** token, una ruta GET representativa de cada uno de los 21
módulos. 273 llamadas contra el guardia real y la tabla real.

**Ningún rol alcanzó un módulo que no le toca. Cero, en los trece.** Es la
propiedad que importa y hasta hoy no se había comprobado nunca, porque todas las
pruebas anteriores se hicieron con administrador — que salta la tabla entera.

Tampoco hubo negaciones indebidas. La única que aparecía —contador sin
inventario— resultó ser correcta al mirarla: su plantilla no le da el módulo,
sólo una acción suelta de valuación, así que el estado del módulo es «parcial» y
la ruta de almacenes no está entre lo concedido.

De paso, el barrido encontró **tres reportes que respondían 500 a todo el
mundo, incluido el administrador**: flujo de efectivo, teórico contra real de
recetas y —con otro síntoma— asistencia. Los dos primeros hacían
`Between(new Date(desde), new Date(hasta))` con lo que viniera en la consulta:
sin parámetros, `new Date(undefined)` es una fecha inválida, la base la rechaza y
el usuario ve «No se pudo completar la operación en la base de datos», que
parece una caída del sistema. Ahora se valida antes de tocar la base, con un
mensaje que dice qué falta, y se rechaza el rango invertido —que no fallaba:
devolvía vacío, y quien lo leía concluía que no hubo movimientos—. Se corrigió
igual en hotelería y CRM, que tenían el mismo patrón.

### El candado de los roles

Quedó puesto lo que se pidió: los roles del catálogo **nacen con los permisos de
su plantilla** —se siembra al crear el usuario o al cambiarle el rol, sólo si ese
rol no tiene ya permisos en la empresa, para no deshacer lo que alguien
configuró— y **no se les puede quitar el acceso a su propio trabajo**.

La regla, en una línea: de los módulos propios de un rol se puede quitar la
escritura, no la consulta. Agregar es libre. Vale en las dos puertas —la pantalla
de módulos y el ajuste fino acción por acción—, porque un candado que sólo vive
en una pantalla se salta por la otra. Y la pantalla marca esos módulos, con
«Sin acceso» deshabilitado, para que el candado se vea antes de intentarlo.

Consulta y no acceso completo, a propósito: una empresa donde el almacenista
cuenta pero no corrige existencias es una empresa razonable. Lo que no tiene
sentido es que no pueda ni ver su propio almacén.

### El enrolamiento por `/register`, retirado

Se quitaron la pantalla de registro, la de verificación de correo y el asistente
de puesta en marcha, más las rutas del backend (`POST /auth/register`, su
contrato, el controlador y el servicio de registro, que además no estaban
registrados en ningún módulo: ya eran código muerto que seguía respondiendo por
la ruta de `auth`).

La razón no es de limpieza: con esa puerta abierta, una empresa podía nacer sin
pasar por la consola de SUMA — sin plan contratado, sin inquilino, sin identidad
en el directorio y sin que SUMA supiera que existe. Quien decide qué empresa
existe y qué contrata es la consola, y el alta entra por la puerta de
aprovisionamiento.


---

## El inquilino del core, por empresa (18 de septiembre)

Decisión tomada: **un inquilino de Fineract por empresa**, y la reserva es el
mecanismo correcto. La razón que cierra la discusión no es el aislamiento de
datos —que también— sino la **contabilidad**: en Fineract el catálogo de cuentas
y el mayor son del inquilino, no de la oficina. Con un inquilino compartido los
asientos de todos los clientes caen en un solo mayor, y son personas morales
distintas con sus propios libros. No es un defecto que se corrija después: los
créditos con historia contable no se borran ni se mueven, así que el día que
haya que separar a un cliente no se va a poder.

Lo segundo: la separación por oficina depende de que **cada llamada lleve bien
la oficina, siempre**. Ya se comprobó que no la llevaba (`?? 1`, la oficina raíz,
con todos los clientes de todas las empresas replicándose al mismo sitio). Una
barrera que vive en la disciplina del código se rompe; una que vive en la
estructura, no.

### Por qué no se resolvió pasando `empresaId` a cada método

La mitad de los métodos del puerto no lo recibe —`saldoCredito`,
`cuentasDisponibles`, `consultarAsiento`— y añadirlo a todos deja el riesgo
intacto: basta olvidarlo en uno para escribir en el inquilino equivocado, y eso
no da error, escribe en el lugar de otro cliente.

El contexto viaja **por fuera**, con `AsyncLocalStorage`. Se abre en la frontera
—un interceptor global para cada petición autenticada, y el despachador para
cada evento de la cola— y lo lee un solo sitio: el punto por donde salen todas
las llamadas HTTP al core. Un camino nuevo no puede olvidarlo, porque no tiene
que acordarse de nada.

### Cómo entra, sin romper lo que hoy opera

Interruptor `FINERACT_TENANT_POR_EMPRESA`, hoy en `false`:

- **Apagado** (lo de hoy): si la empresa tiene inquilino asignado, ya se usa el
  suyo; si no lo tiene, sigue el global. Nadie se detiene.
- **Encendido**: la empresa sin inquilino **no opera** contra el core; se detiene
  con un mensaje que dice qué falta. Y una llamada que no declara empresa
  también se detiene: eso es un defecto de programación —falta abrir el
  contexto— y tiene que doler en desarrollo, no en la base de un cliente.

También se corrigió el portal del core: devolvía el inquilino global al abrirlo,
así que la persona entraba y veía una cartera que no es la suya.

### Para encenderlo

1. Registrar en la reserva los inquilinos que el core ya tiene creados (la
   consola ya puede leer su registro: `FINERACT_TENANTS_DB_URL` está puesta).
2. Asignar inquilino a cada empresa que use el core — hoy `SUMA Local` está en
   modo SOMBRA **sin inquilino**.
3. Poner `FINERACT_TENANT_POR_EMPRESA=true` y reiniciar.

Mientras el paso 2 no esté hecho, encenderlo detiene la replicación de esa
empresa. Es el orden correcto: primero el inquilino, después el candado.

### Lo que queda de esta línea

- **Las migraciones del core se aplican por inquilino**, no una vez. Eso es
  trabajo operativo real y repetido, y es el precio de la decisión.
- El alta de una empresa nueva sigue necesitando **ventana de mantenimiento**
  del core para construir el esquema del inquilino; por eso la reserva se
  prepara por lote y el alta toma uno ya listo.
- Falta que la consola **muestre** qué inquilino tiene cada empresa y avise de
  las que operan sin uno. Hoy hay que mirarlo en la base.

---

## 18 de septiembre · el ciclo cerrado, y el portal del core

`DEMO_BIDIRECCIONAL_2026-09-19.md` documenta lo de esta madrugada. Lo esencial:

**El camino de vuelta ya existe.** Faltaban la llave del receptor y el hook en
el core; los dos están puestos. Se probó de verdad: un pago de $100 capturado en
el portal bancario movió el saldo del crédito 11 de $385.15 a $285.15 y llegó al
ERP como aviso `LOAN/REPAYMENT`. La URL del hook **tiene que terminar en barra**
—Fineract la llama al guardarla con un cliente Retrofit, que exige el `/` final
y si no lo hay devuelve un 500 sin cuerpo.

**La conciliación contable no estaba rota: los avisos eran viejos.** 19 de los
21 avisos pendientes decían «no se pudo leer el asiento externo» y describían
una falla ya corregida. La corrida de hoy: 19 asientos revisados, 1 discrepancia
real (`IN-2026-00005`, reversado directo en el mayor externo). El `catch` de la
conciliación no recibía el error, así que el aviso nunca decía la causa; ahora sí.

**El portal del core: el problema era el encuadre.** El contenedor topaba en
1480 px sobre un monitor de 3440 y la barra superior usaba otra rejilla —de ahí
la sensación de cosas encimadas—; la tarjeta del usuario y el botón de salir
caían fuera de pantalla porque toda la columna era una sola zona de scroll; y el
menú se dibujaba con cuatro entradas mientras cargaban los permisos y luego
saltaba a veinticinco. Los cuatro quedaron corregidos en `globals.css` y
`app-shell.tsx`, más `next.config.mjs` para apagar el indicador de desarrollo
que se pintaba encima del menú.

**La tabla de movimientos del crédito estaba en inglés.** El traductor de enums
ya existía y esa celda no lo usaba. Conectado, con los 28 tipos de movimiento de
crédito agregados al diccionario.

**`Unexpected end of JSON input`** llegaba tal cual a la franja roja. Nuevo
`lib/respuesta.ts`: un cuerpo vacío se explica con su código HTTP. Aplicado en
clientes, cartera y —lo que importa— en el punto por el que pasa un pago.

---

## 18 de septiembre (madrugada) · el reflejo automático ya se ve, y el aviso dejó de mentir

**Lo que se creía que faltaba, ya estaba.** `CarteraReflejoService` aplica desde
hace días los movimientos nacidos en el core llamando al servicio de cobranza
del ERP, y la cuenta que lo recibe (`parametrosProveedor.cuentaCobranzaExternaId`)
ya estaba configurada en SUMA Local. Un pago de $100 capturado en el portal del
core estaba en el ERP como «Reflejo del movimiento 40 del registro externo» y
nadie lo sabía.

**Por qué nadie lo sabía: el aviso se clasifica al recibirlo.** El texto decía
«hay que capturarlo aquí con su cuenta de caja o banco», que era verdad cuando se
escribió y dejó de serlo cuando entró el aplicador. El operador leía una tarea
que el sistema ya estaba haciendo. Corregido: ahora dice qué se espera que pase,
y el propio reflejo **cierra el aviso** al aplicarlo (`marcarReflejado`), con el
rastro del pago que registró. Un aviso pendiente ya no significa «hay trabajo
manual» sino **«esto no se reflejó»**, que es la única lectura que sirve.

**El aplicador no rendía cuentas.** Devolvía `revisados: 1, aplicados: 0,
omitidos: []` y eso no distingue «no había nada que reflejar» de «se descartó algo
en el camino». Los `continue` mudos ahora reportan: `descartados` (decisiones de
no aplicar, con el motivo) y `alcance` (qué créditos se miraron y a qué id
externo apuntan). Fue lo que permitió ver que el crédito enlazado al préstamo 11
es `CRD-2026-0007`, no `CRD-2026-0011`.

**Dos huecos que tapó ese mismo trabajo:**

- El barrido sólo miraba créditos ACTIVO/VENCIDO. Un crédito que el ERP da por
  liquidado puede seguir moviéndose en el core —un pago tardío, una reversa— y
  ninguno de esos movimientos se veía. Ahora se incluyen los LIQUIDADO: no se
  aplican (un crédito liquidado no acepta cobranza) pero se reportan.
- Un tipo de transacción que el ERP no sabe clasificar se saltaba en silencio.
  Ahora se reporta, porque así es como se pierde un movimiento de dinero.

**La conciliación contable ya no calla la causa.** Su `catch` no recibía el
error: el aviso decía «no se pudo leer el asiento externo» y nada más. Con veinte
pólizas así no hay por dónde empezar. Ahora la causa va en el aviso. Los 19
avisos que había eran históricos —la corrida de hoy leyó los 19 asientos sin
error— y quedaron descartados con nota.

**Flujos de validación: se pueden editar.** `PATCH /integracion/validacion/flujos/:id`
y su botón en `/dashboard/creditos/verificacion` corrigen nombre, descripción,
tope y puntaje. Los pasos NO: los expedientes ya ejecutados apuntan a ellos y
cambiarlos reescribiría en retrospectiva con qué reglas se aprobó un crédito ya
otorgado; para eso está crear otra versión. Ojo: `topeAutomatico` se recorta
contra `CREDITO_TOPE_AUTOMATICO`, hoy en `0`, así que **editar ese campo en el
flujo activo bajaría su tope de $10,000 a $0**. Poner el techo real en `.env`
antes de tocarlo.

**Nombres de prueba, renombrados en los datos:** los dos flujos de validación,
los cuatro productos (`INV-001`, `INV-002`, `SRV-001`, `SRV-002`) y la categoría
(«Mercancía general»). Quedan cuatro pólizas cuyo *concepto* trae el texto de
prueba: no se editan por diseño —una póliza se cancela, no se corrige— y son
`DI-2026-00002`, `00003`, `00006` y `00009`.

---

## 18 de septiembre (tarde) · demo limpia, y cuatro cosas que estaban mal

**El reflejo se cierra solo, también del lado contable.** Dos avisos nuevos
aparecieron diciendo «no se pudo leer el asiento externo (Circuito abierto hacia
Fineract)» —la causa, que antes no se decía, ya se ve—. Eran de una caída
pasajera de las 14:40. Ahora, cuando una corrida lee bien un asiento, **cierra el
aviso de lectura fallida que lo desmiente**: sólo ése, porque una reversa o unas
partidas distintas siguen siendo verdad aunque la consulta funcione. Sin esto,
cada caída del core dejaba su sedimento y entre veinte avisos falsos se perdía el
único real.

**La póliza atorada desde el 16 ya llegó.** Faltaba mapear `399-01` («Carga de
saldos iniciales»). Se aprovisionó en el core, se reencoló el evento y el outbox
quedó en 53 enviados, cero fallidos.

**Los cambios de un cliente ya se replican.** El suscriptor sólo escuchaba el
alta, y `asegurarCliente` es idempotente por diseño: corregir un nombre no
llegaba nunca al core, así que los dos sistemas se separaban en el campo que más
se mira. Se añadió `actualizarCliente` al puerto, su implementación en Fineract
(PUT de identidad y contacto, nunca la oficina —moverla arrastraría al cliente a
otra cartera—), el evento `CLIENTE_ACTUALIZACION` con clave de idempotencia
fechada, y `afterUpdate` en el suscriptor comparando sólo nombre, razón social,
correo y teléfono. Al probarlo salió un permiso que faltaba: el rol **SYNCRO ERP
Service** no tenía `UPDATE_CLIENT` en Fineract. Añadido.

**La matriz de aprobación de líneas de crédito no existía**, así que ninguna
línea podía autorizarse y la originación estaba muerta de punta a punta. Se creó:
nivel 1 `credito` hasta $50,000, nivel 2 `admin` de ahí en adelante. El sistema
rechaza que el solicitante se autoapruebe —segregación de funciones bien hecha—,
así que **una línea pedida por el admin la tiene que autorizar el rol `credito`**.

### Lo que sigue trabado, y por qué

- **No hay proveedor de validación de identidad.** El paso de INE es bloqueante,
  así que toda originación cae en revisión manual. No es un defecto: es que falta
  contratar el servicio.
- **La cuenta que recibe la cobranza no se puede volver a guardar.** Nació sin
  banco y sin cuenta contable, y hoy la validación exige las dos. Funciona —los
  pagos reflejados generan su póliza— pero es un registro que el propio sistema
  ya no acepta. El catálogo de bancos es global y sólo lo toca un administrador
  de plataforma.
- **Dos medios de pago siguen en inglés** porque el core los protege como
  definidos por sistema.

### Barrido en vivo de los dos frentes

Seis módulos del ERP y ocho pantallas del portal, con sesión real: **104
llamadas, ninguna con error**. Dos observaciones:

- Cada efecto se dispara **dos veces** (StrictMode de desarrollo). Desaparece en
  un build de producción, pero conviene comprobarlo antes de dar cifras de carga.
- `/api/clientes?activos=true` trae **todos** los clientes sin paginar. Con diez
  no se nota; con diez mil, sí.

---

## 18 de septiembre · repaso del portal del core

### Lo que estaba roto de verdad: los reportes

**Ningún reporte con parámetros se podía ejecutar.** El core respondía
«unknown report parameter 'OfficeIdSelectOne' is not registered for report
'Portfolio at Risk'», y con eso los ochenta y cuatro quedaban reducidos a los
que no piden nada.

La causa: en Fineract un parámetro tiene **dos** nombres —el del catálogo
maestro (`OfficeIdSelectOne`) y el que el reporte usa en su consulta
(`officeId`)—. Al ejecutar hay que mandar el segundo, y la API **no lo
devuelve**: `parameterNamePassed` y `reportParameterName` vienen vacíos, así que
el front caía al nombre maestro. Lo que sí devuelve es el SQL del reporte, donde
los parámetros están declarados como `${officeId}`. Ahora se deriva el nombre
corto y **se comprueba contra los marcadores del propio SQL**; si no coincide se
manda el maestro, que es lo que se hacía antes.

**Los botones de exportación tampoco servían.** Mandaban `output-type=CSV|XLS|PDF`
y el core espera `exportCSV=true` / `exportPDF=true`. Además ofrecían **Excel**,
que el core no soporta para estos reportes. La ruta del BFF que dice qué
formatos admite cada reporte ya estaba escrita y nadie la llamaba: ahora se
pregunta y se pinta un botón por formato real (CSV · PDF · JSON).

Comprobado en vivo: *Padrón de clientes* corre y devuelve sus 10 registros.

### Lo que no se puede arreglar desde el portal

De **28 reportes de tabla probados, corren 5**. Los otros 23 fallan con
`BadSqlGrammarException`: los reportes que Fineract trae de fábrica están
escritos en el dialecto de MySQL y esta instalación corre sobre PostgreSQL. Hay
que adaptar su SQL en el core, reporte por reporte. Lo que sí se hizo fue dejar
de mostrar el nombre de la excepción de Java en la franja roja y decir qué pasa
y qué hacer. Los que corren hoy: *Padrón de clientes*, *Antigüedad de saldos ·
detalle*, *Pagos esperados por fecha*, *Grupos · conteos* y *Grupos · importes*.

Los encabezados de las columnas del resultado siguen en inglés porque son los
alias del SELECT del reporte: viven en el core, no en el portal.

### Traducciones

- **Los 84 reportes**, con el nombre original debajo para quien busque en la
  documentación de Fineract. `reportName` sigue viajando intacto a la API: es la
  clave con la que el core ejecuta y con la que se arma el permiso `READ_<name>`.
- **Los parámetros**: «Oficina», «Asesor de crédito», «Tipo de cartera en
  riesgo»… en vez de `Oblig Date Type Select`.

### Otros arreglos

- **Cliente 360 decía «Ahorro consolidado: Multimoneda» a quien no tiene ninguna
  cuenta de ahorro.** La condición separaba «una moneda» de «varias» y metía el
  caso de cero en el saco de «varias». Ahora sin cuentas no se muestra la cifra.
- **Los subtítulos de celda se salían de la tarjeta.** Las descripciones del
  catálogo de reportes traen doscientos caracteres y las celdas no envuelven:
  empujaban la fila fuera de la vista. Dos líneas y puntos suspensivos, con el
  texto completo en el `title`.

### Rutas del BFF sin pantalla que las use

De 256 rutas, 46 sin consumidor aparente. Las que representan trabajo hecho y no
aprovechado: **hoja de cobranza** (`/api/collection-sheet`), **búsqueda
avanzada** (`/api/search/advance`), y la operación de **plazo fijo y depósitos
recurrentes** (`command`, `transactions`): se listan en pantalla pero no se
pueden mover. También las operaciones de caja del cajero
(`cashiers/[id]/cash`, `summary`, `transaction-template`), que dejan el módulo de
tesorería en sólo lectura.

---

## 18 de septiembre · el registro de verificaciones

**El agregado no existía.** Las verificaciones sólo se podían mirar de una en
una —abrir un cliente y ver sus corridas—, y eso contesta «¿a éste lo
revisaron?» pero no la pregunta que hace un comité de crédito o un auditor:
**cuánto se verifica, de qué, y con qué resultado**. Sin ese agregado, un
control que lleva dos meses devolviendo NO_DISPONIBLE porque nadie contrató al
proveedor no se nota hasta que alguien revisa cliente por cliente.

Nuevo `GET /integracion/validacion/tablero?dias=N` (`MotorValidacionService.tablero`):
cuenta por control y por resultado, mide la cobertura de la cartera y devuelve
las últimas corridas con el nombre del cliente. Los pasos se filtran por la
corrida a la que pertenecen, no por su propia fecha: `resultado_paso` no guarda
`empresaId`, así que sin el join no se pueden atribuir a una empresa.

**Tres reglas que el tablero no negocia**, y las tres son sobre no mentir con
los números:

1. **Las simulaciones no se suman.** Se cuentan aparte y se dicen. Sumarlas haría
   ver un control muy ejercitado que en realidad nunca corrió sobre una persona.
2. **Un control que nunca corrió se ve vacío, no en cero.** «0 aprobados» y
   «nunca se ha ejecutado» se confunden a simple vista; la tarjeta lo dice con
   palabras.
3. **Lo que no está instalado se declara.** La consulta de CURP vive en el módulo
   de RPA y hoy **su tabla no existe —faltan migraciones—**: aparece con ese
   estado en vez de desaparecer del tablero.

El componente `TableroVerificaciones` vive fuera de las pantallas porque se usa
en dos: completo en *Crédito → Verificación de clientes*, y compacto —sin
repetir cifras ni la lista de corridas— en la *Cartera de clientes*.

**La pantalla de verificación cambió de orden.** Enseñaba sólo la
configuración: los pasos, el tope, el puntaje. Eso se toca una vez al año. Lo
que se consulta a diario va arriba y el diseño del flujo abajo. También se
alineó con el panel principal (22 px, `max-w-[1280px]`).

### Lo que el tablero destapó al primer vistazo

Las **3 corridas reales** de la empresa acabaron las tres en revisión manual,
porque identidad devolvió `NO_DISPONIBLE` en las tres: no hay proveedor de INE
contratado y el paso es bloqueante. Frente a **15 ensayos simulados**. Eso es
exactamente lo que no se veía sin el agregado.

### Pendiente de datos

Las corridas guardan el **nombre del flujo con el que corrieron**, que es lo
correcto para un registro de auditoría, pero significa que las viejas siguen
mostrando el nombre de prueba. Para limpiarlas:

```sql
UPDATE ejecuciones_validacion
   SET "flujoNombre" = 'Originación con aprobación automática'
 WHERE "flujoNombre" ILIKE '%tope automatico%';
UPDATE ejecuciones_validacion
   SET "flujoNombre" = 'Originación con revisión manual'
 WHERE "flujoNombre" ILIKE '%PRUEBA%';
```

---

## 18 de septiembre · el alta de clientes, por pestañas

**El formulario era una columna de cinco secciones.** Con el panel de crédito
abierto medía más de dos pantallas, así que para llegar al límite había que
bajar por toda la dirección. Ahora son cuatro pestañas —identidad y contacto,
dirección, línea de crédito, notas— y cada tema cabe entero sin desplazarse. La
de crédito sólo existe al editar, que es la regla que ya estaba: primero existe
la persona, después —si lo pide— se le verifica, y sólo entonces se propone un
importe.

**La dirección estaba al revés.** Pedía la calle primero y el país al final, y
eso obliga a capturar hacia atrás: la lista de estados depende del país, así que
pedirla antes la deja vacía. El orden es país → código postal → estado →
municipio → calle, y el selector de estado queda deshabilitado mientras no haya
país, diciéndolo con palabras en vez de mostrar una lista vacía.

**El código postal propone la entidad.** Los dos primeros dígitos del CP
mexicano la identifican y ese reparto lo fija SEPOMEX. Se muestra como
sugerencia con un botón «Usarla», no se rellena solo: rellenarlo en silencio
haría pasar por verificado algo que sólo está inferido, y en un expediente de
crédito esa diferencia importa.

### Lo que falta para una búsqueda de dirección de verdad

No hay catálogo de códigos postales. Los catálogos SAT cargados son
`METODO_PAGO`, `AGRUPADOR`, `BANCO` y `MONEDA`; falta **`c_CodigoPostal`** (unas
145 mil filas), que es lo que permitiría resolver municipio, localidad y
colonias desde el CP. La pieza para cargarlo ya existe —`catalogos_sat_entradas`
con versión, vigencia y sha256 de la fuente—, así que es trabajo de datos, no de
arquitectura.

Nota aparte: el catálogo de países está **en inglés** («Mexico», «Aland
Islands»). Es catálogo global y sólo lo cambia un administrador de plataforma.

---

## Catálogo de códigos postales (SEPOMEX + SAT) — 2026-09-18

**Qué se hizo.** El domicilio del cliente se captura eligiendo, no escribiendo.

- `codigos_postales`: una fila por asentamiento (CP, estado, municipio, ciudad,
  colonia, tipo, fuente, versión). No vive en `catalogos_sat_entradas` a
  propósito: esa tabla modela catálogos fiscales con vigencias y la geografía no
  tiene vigencia.
- `codigos_postales_cargas`: bitácora con el `sha256` del archivo importado. Es
  lo que hace real la promesa de «se carga una vez y se queda»: reimportar el
  mismo archivo no hace nada y lo dice; un archivo nuevo sí actualiza. El
  reemplazo y la bitácora ocurren en una transacción — un catálogo a medias es
  peor que no tenerlo, porque un CP faltante se ve igual que un CP inválido.
- `clientes.colonia`: columna nueva, aditiva. Antes la colonia se escribía
  dentro de `direccion`, donde ningún proceso puede leerla y el domicilio fiscal
  del CFDI la pide aparte.

**Comandos.**

```
npm run cp:importar -- <CPdescarga.txt> [--sat <c_CodigoPostal.xlsx>] [--version 2026-09] [--forzar]
npm run cp:estatus
```

**Por qué SEPOMEX carga y el SAT sólo verifica.** SEPOMEX es la única fuente con
colonias, que es lo que el usuario necesita elegir. `c_CodigoPostal` del SAT no
las trae; sirve para otra pregunta —si un CP es válido para facturar— y por eso
entra como verificación y no como carga. Dos fuentes escribiendo la misma tabla
es cómo se acaba sin saber cuál puso cada renglón.

**Pendiente de negocio, no técnico.** El aviso de uso de SEPOMEX restringe la
comercialización del catálogo, total o parcial. Incorporarlo a un producto que
se vende es una decisión legal; el importador recibe la ruta del archivo en vez
de descargarlo solo justamente para no tomarla por nadie.

**Degradación.** Sin catálogo cargado, el formulario se comporta igual que
antes: deduce la entidad por los dos primeros dígitos del CP, la propone, y
municipio y colonia se escriben a mano.

---

## Por qué una corrección de cliente no llegaba a Fineract — 2026-09-18

**Síntoma.** Se editaba un cliente en el ERP y el core seguía mostrando los datos
viejos. Sin error, sin aviso, sin evento en rojo.

**Causa.** `IntegracionDespachadorService.actualizarCliente` llamaba al adaptador
y devolvía lo que éste devolviera. El adaptador busca al cliente en Fineract por
su `externalId` y devuelve `null` cuando no lo encuentra —un cliente dado de alta
a mano en el core, o replicado antes de la convención de referencias, no lo
tiene—. Ese `null` se tomaba por éxito: el evento quedaba ENVIADO y la corrección
no se aplicaba nunca. Visto desde fuera es idéntico a un sistema que funciona,
que es la forma más cara de fallar.

**Corrección.**

1. El vínculo que el ERP ya guardó (`integracion_vinculos`) manda sobre la
   búsqueda por `externalId`, que queda como respaldo.
2. Un evento de actualización que no encuentra a quién corregir **falla con
   aviso**. Aquí hubo un rodeo que conviene dejar escrito: la primera versión
   replicaba al cliente en ese caso («si no existe, créalo»). Duró una hora. Es
   una regla que parece servicial y es una trampa: un cliente que sí existe en
   el core pero sin vínculo —dado de alta a mano, o replicado antes de la
   convención de referencias— habría recibido un gemelo con el nombre corregido,
   y un cliente con historia no se borra de un core de cartera. Corregir y dar de
   alta son hechos distintos; el evento dice cuál es y no se traduce uno por
   otro. Crear es la única acción sin vuelta atrás, así que es la única que no se
   toma sola.
3. El suscriptor registra en bitácora qué campos cambiaron y que publicó. Sin ese
   renglón, «el ERP no publicó» y «el core no aplicó» se ven igual y se arreglan
   en lugares distintos.

**Límite conocido.** Sólo viajan `nombre`, `razonSocial`, `email` y `telefono`.
El RFC, el tipo de persona y el domicilio no: Fineract no tiene campo propio para
el RFC (iría como *client identifier*) y el cambio de persona física a moral
exige `legalFormId`, que el PUT de actualización no envía. Publicarlos hoy
generaría eventos que no hacen nada — el mismo silencio que se acaba de cerrar.


### Lo que se encontró al buscar el daño — 2026-09-19

De 8 clientes vinculados, **uno** tenía el nombre desfasado: la ficha 5 del core
se llamaba «Alejandra Nava Quiroz» y su referencia apuntaba a «Ricardo Iván
Beltrán Cruz». No era un duplicado —que fue la primera lectura, y era errónea—
sino el síntoma exacto del defecto: alguien renombró ese expediente en el ERP el
12 de septiembre y el core se quedó con el nombre anterior.

Los otros 7 coincidían, lo que acota el alcance: el defecto no corrompía nada por
sí solo, sólo mordía cuando se renombraba un expediente ya replicado.

`npm.cmd run clientes:auditar-nombres` recorre los clientes vinculados y compara
los nombres de ambos lados ignorando acentos y mayúsculas; con `--aplicar`
publica la corrección de los desfasados por el outbox normal. No crea nada: un
cliente sin vínculo no entra en la lista. Aplicado el 19 de septiembre de 2026,
el resultado quedó en 8 coinciden · 0 desfasados.

`npm.cmd run cliente:duplicado -- "<nombre>"` mira un caso concreto: qué fichas
existen de cada lado, cuál tiene créditos y a qué cliente del ERP apunta cada
referencia. Esa última columna es la que distingue un duplicado real de un
nombre viejo, y es la que faltaba para no diagnosticar a ciegas.

---

## Portal Fineract · acciones del expediente de cliente — 2026-09-19

**Lo que faltaba.** La ficha `/dashboard/clients/{id}` no tenía forma de corregir
los datos del cliente. La ruta del BFF (`PUT /api/clients/{id}`, con
`UPDATE_CLIENT`) ya existía y estaba bien hecha; lo que no existía era la
pantalla. Se agregó `/dashboard/clients/{id}/edit` y el botón «Editar» en el
encabezado, visible sólo con `UPDATE_CLIENT`.

**Lo que el formulario deja fuera, y por qué.**

- *Oficina*: en Fineract la oficina separa las carteras. Cambiarla con un PUT
  movería al cliente y a sus créditos sin registro de transferencia. Existe el
  flujo de transferencias para eso, que sí guarda propuesta, aceptación y fecha.
- *Responsable*: Fineract lo expone como comando, no como campo. Mandarlo en el
  PUT no lo aplicaría — quedaría la impresión de haberlo guardado.
- *Forma legal*: persona física y moral no son el mismo expediente con otra
  etiqueta; cambian qué campos de nombre existen. Corregirla sobre un cliente
  con historia deja nombres huérfanos.

Además el PUT envía **sólo los campos que cambiaron**. Mandar el expediente
completo en cada guardado convierte en borrado silencioso cualquier campo que el
formulario no conozca, y deja la auditoría del core ilegible: «alguien reescribió
al cliente» en lugar de «cambió el teléfono».

**Asignar responsable.** La ficha advertía «El cliente no tiene responsable
asignado» y no ofrecía manera de asignarlo. Una advertencia sin acción entrena a
la gente a ignorar las advertencias. Se agregaron los comandos `assignStaff` y
`unassignStaff` (permisos `ASSIGNSTAFF_CLIENT` / `UNASSIGNSTAFF_CLIENT`), con la
lista de personal de la oficina del cliente, cargada al abrir el diálogo y no al
abrir la ficha.

**Permisos por acción.** Todo se decide con los permisos de Fineract, que el
portal lee de la sesión; no hay una segunda tabla de roles en el portal. Se
administran en Administración → Seguridad.

| Acción | Permiso |
|---|---|
| Ver expediente | `READ_CLIENT` |
| Corregir datos | `UPDATE_CLIENT` |
| Activar | `ACTIVATE_CLIENT` |
| Rechazar / retirar solicitud | `REJECT_CLIENT` / `WITHDRAW_CLIENT` |
| Reabrir rechazada / retirada | `UNDOREJECT_CLIENT` / `UNDOWITHDRAWAL_CLIENT` |
| Cerrar / reactivar | `CLOSE_CLIENT` / `REACTIVATE_CLIENT` |
| Asignar / quitar responsable | `ASSIGNSTAFF_CLIENT` / `UNASSIGNSTAFF_CLIENT` |
| Eliminar | `DELETE_CLIENT` — la ruta existe, **sin pantalla a propósito** |

**Sigue sin interfaz, deliberadamente.** `DELETE_CLIENT`: Fineract sólo permite
borrar un cliente sin historia, y un botón de borrar en la ficha más visitada del
portal es un accidente esperando ocurrir. Si se necesita, va detrás de una
confirmación escrita, no de un clic.

---

# Revisión previa a producción — 2026-09-19

## Lo que se corrigió

**1. Setenta y un campos que impedían guardar.** `@IsOptional()` de class-validator
sólo omite `undefined` y `null`; una cadena vacía sigue validándose. Todo
formulario con un `<select>` opcional de tipo GUID —que envía `''` cuando no se
elige nada— fallaba con «debe ser un GUID válido de SQL Server». Se migraron 71
campos en 16 DTO a `@IsSqlServerGuidOpcional()`, que normaliza `''` antes de
validar. Módulos tocados: ventas, CFDI, crédito, CRM, hotelería, compras,
activos, RRHH, nómina, tesorería, inventario y WMS.

*Límite deliberado:* el decorador convierte `''` en `undefined`, no en `null`.
Eso conserva exactamente el comportamiento anterior —antes ese caso era un error,
así que ningún flujo dependía de él— y evita que 71 campos empiecen a escribir
`null` en columnas cuyas rutas de borrado nunca se probaron. Consecuencia
conocida: vaciar un select no borra la relación, la deja como estaba. Convertirlo
en «borrar» es un cambio deseable, pero con la suite de pruebas corriendo.

**2. Países en inglés.** El desplegable mostraba «Mexico», «Germany», «Aland
Islands» mientras las entidades federativas salían en español: una traducción a
medias se lee peor que ninguna. `CatalogosGeograficosService` ahora traduce con
`Intl.DisplayNames`, que vive en el runtime de Node —sin dependencia nueva ni
tabla propia que envejezca— y conserva el nombre original si el runtime no trae
datos de español.

**3. Rebote al iniciar sesión.** Cuando el token expiraba mientras el usuario ya
estaba en `/login`, el destino capturado era `/login` y la URL quedaba en
`/login?next=%2Flogin`: después de entrar, el sistema devolvía al formulario de
acceso. Se veía como un acceso fallido. Ahora las rutas de acceso no se guardan
como destino y un `next` heredado se descarta antes de encadenarlo.

**4. Tope de autorización automática, en silencio.** `editar()` aplicaba
`Math.min(solicitado, techo)`. Con el valor por omisión `CREDITO_TOPE_AUTOMATICO=0`,
quien capturaba un tope de $10,000 lo veía guardarse como $0 sin mensaje: el flujo
quedaba exigiendo autorización manual para todo y nadie sabía por qué. Peor: `crear()`
**no aplicaba el techo**, así que el límite de la instalación se saltaba creando un
flujo nuevo en lugar de corregir el existente. Ahora los dos caminos validan contra
el techo y un valor que lo supera se rechaza diciendo cuál es el techo.

**5. Arranque en producción con URLs de desarrollo.** `FRONTEND_URL` y
`CORS_ORIGINS` tienen valor por omisión para que el proyecto levante sin
configurar nada. En producción ese mismo valor produce dos fallas que no dicen su
causa: CORS rechaza al frontend real con un error de red genérico, y los correos
de alta y recuperación salen con enlaces a `localhost`. Ahora el arranque se
detiene y nombra la variable.

## Lo que se revisó y estaba bien

- **Guardias de autorización.** Los cuatro `APP_GUARD` (throttler, JWT, permisos
  por módulo, roles) están registrados y se evalúan. Las 49 anotaciones
  `@Roles('administrador')` funcionan: `esRolAdministrador()` reconoce esa
  variante histórica aunque el rol del catálogo se llame `admin`.
- **Endpoints `@Public()`.** Los doce son receptores de webhook y comprobaciones
  de dirección, protegidos por clave en la ruta. Ninguno expone datos de negocio.
- **`DB_SYNC`.** Su valor por omisión es `'true'`, pero `debeSincronizarEsquema()`
  lo ignora en producción de forma dominante. No hay riesgo de que TypeORM
  altere el esquema al desplegar.
- **Redirección post-login.** `iniciarSesionKeycloak` ya validaba que el destino
  fuera una ruta relativa; no había vector de redirección abierta.
- **Menú del portal.** Ya está agrupado por función bancaria con submenús que se
  abren según la ruta activa. No requería cambios.

## Lo que se agregó

- Edición de producto de crédito en el portal (`UPDATE_LOANPRODUCT`), con la
  moneda bloqueada al corregir: cambiarla reexpresaría saldos ya asentados.
- Edición de la solicitud de crédito antes de aprobar (`UPDATE_LOAN`).
- Edición de datos del cliente y asignación de responsable en el portal.
- Expediente 360 reorganizado en carril fijo + columna de trabajo.
- Tope de ancho en las rejillas de formulario: seis columnas dejaron de ser
  posibles.

## Estado de la suite — 2026-09-19

`npm.cmd test`: **71 suites, 424 pruebas, todas en verde.**

Dos apuntes que conviene no perder:

- La migración de los 71 campos a `@IsSqlServerGuidOpcional()` quedó cubierta:
  pasan `sql-server-guid.validator`, `clientes.service`, `wms.dto` y
  `hoteleria.dtos`. El compilador decía que encajaban; las pruebas dicen además
  que se comportan.
- El cierre automático de avisos `CONSULTA_FALLIDA` tenía lógica nueva sin
  cobertura, y se notó porque el doble del repositorio en
  `contabilidad-conciliacion.spec.ts` no tenía `update`. Se completó el doble y
  se agregó la prueba que faltaba: una corrida que sí lee el asiento cierra el
  aviso anterior con la misma huella y sin `resueltoPor`, porque no lo resolvió
  una persona.

La suite **no corre desde un entorno Linux que lea el `node_modules` armado en
Windows** (`ts-jest` no resuelve). Corre en la máquina de desarrollo. Si alguna
vez se monta CI, el `npm install` tiene que hacerse en el mismo sistema donde se
ejecuta.

## Pantallas de edición completadas — 2026-09-19

| Entidad | Permiso | Dónde |
|---|---|---|
| Producto de crédito | `UPDATE_LOANPRODUCT` | Botón «Editar» en cada tarjeta del catálogo |
| Producto de ahorro | `UPDATE_SAVINGSPRODUCT` | Igual |
| Solicitud de crédito | `UPDATE_LOAN` | `/dashboard/cartera/{id}/edit`, sólo pendiente de aprobación |
| Solicitud de cuenta de ahorro | `UPDATE_SAVINGSACCOUNT` | `/dashboard/savings/{id}/edit`, sólo pendiente |
| Día inhábil | `UPDATE_HOLIDAY` | Fila de la tabla, sólo mientras no esté activo |
| Cliente (core) | `UPDATE_CLIENT` | `/dashboard/clients/{id}/edit` |

**Dos reglas que se repiten en todas y conviene no romper después.**

*La identidad no se edita.* Producto y cliente de una solicitud, moneda de un
producto, oficinas de un día inhábil: cambiarlos no es corregir una captura, es
capturar otra cosa. Donde el campo se muestra y no se puede tocar, lleva la
razón escrita debajo — un campo que desaparece parece un campo que se perdió.

*Los parámetros estructurales se reenvían desde el registro, nunca desde la
plantilla del producto.* Si el producto cambió de tasa o de amortización desde
que se capturó la solicitud, tomarlos de la plantilla modificaría en silencio
algo que nadie pidió cambiar.

**Correcciones de la auditoría previa.** Grupos y centros figuraban como «sin
edición» y era falso: `GroupingWorkspace` ya la tenía, con la URL en variable, y
mi cruce la buscaba literal. Lo que sí les faltaba —y se agregó— es que los
botones respeten el permiso: el BFF devolvía 403, pero después de llenar el
formulario completo. Ofrecer una acción y luego negarla es peor que no ofrecerla.

## Actividades financieras de Fineract, configuradas — 2026-09-19

Las siete actividades estaban sin mapear (0/7), lo que bloqueaba transferencias,
el módulo de caja y la carga de saldos iniciales. Quedaron 7/7.

| Actividad | Cuenta | Tipo | ¿Existía? |
|---|---|---|---|
| 200 Transferencia de pasivos | `205.06` Transferencias en tránsito — pasivo | Pasivo | nueva |
| 100 Transferencia de activos | `107.05` Transferencias en tránsito — activo | Activo | nueva |
| 300 Contra de saldos iniciales | `399-01` Carga de saldos iniciales | Capital | **ya existía** |
| 101 Efectivo en bóveda | `101.01` Caja y efectivo | Activo | ya existía |
| 102 Efectivo en caja | `101.02` Efectivo en ventanilla | Activo | nueva |
| 103 Fuente de fondos | `102.01` Bancos nacionales | Activo | nueva |
| 201 Dividendos por pagar | `214.01` Dividendos por pagar | Pasivo | nueva |

**Por qué estos códigos y no otros.** La primera versión del script usaba un
rango propio (x190) suponiendo que el catálogo de Fineract sería ajeno al del
ERP. Al mirarlo resultó falso: ya venía sembrado con códigos agrupadores del SAT
y hasta con `399-01 Carga de saldos iniciales`, que es exactamente la
contrapartida que pide la actividad 300. Inventar un rango paralelo habría
dejado dos convenciones en el mismo libro.

**Quién puede hacer esto.** El usuario de servicio del ERP **no** tiene permiso
para crear cuentas contables ni reconfigurar actividades financieras, y no se le
dio: su trabajo es replicar clientes, créditos y pagos. Darle la llave del
catálogo contable ampliaría el daño de una credencial filtrada a algo que
ninguna integración necesita. El 403 que devolvió el script al primer intento
—«User has no authority to READ financialactivityaccounts»— era el sistema
funcionando. Se hizo desde el portal con sesión de administrador, que además
deja el rastro de auditoría bajo una persona y no bajo un servicio.

`scripts/aprovisionar-contabilidad-fineract.ts` queda como registro de qué se
creó y como punto de partida para la siguiente institución; para correrlo hay
que apuntar `FINERACT_USER` a un usuario con permisos de administración,
sólo mientras dura el aprovisionamiento.

**Operación.** Las cuentas `107.05` y `205.06` deben cerrar en cero cada día. Un
saldo distinto de cero significa una transferencia colgada, y ese indicador es
justamente el beneficio de tenerlas separadas del control de ahorros.

---

# Expediente del cliente: RFC, CURP y domicilio al core — 2026-09-19

**El hueco.** El ERP replicaba nombre, correo y teléfono. Nada más. El RFC, la
CURP y el domicilio —capturado con el catálogo de SEPOMEX, con colonia y
municipio validados— se quedaban de este lado. Quien abría la ficha del cliente
en el core para ir a cobrar no sabía dónde vive. Los datos existían en un sistema
y no en el otro, que es la forma más cara de tener dos.

## Lo que hubo que preparar en el core

Nada de esto estaba puesto, y sin ello no había dónde escribir:

- `enable-address` estaba **apagado**. Activado.
- `ADDRESS_TYPE`, `COUNTRY`, `STATE` y `Gender`: **vacíos**. Sembrados con
  Domicilio fiscal / particular / laboral, México, las 32 entidades y los tres
  géneros.
- `Customer Identifier` traía los cuatro de fábrica en inglés —Passport, Id,
  Drivers License, Any Other Id Type— y ninguno servía para México. Se agregaron
  RFC, CURP, INE, Pasaporte, Cédula profesional, Comprobante de domicilio,
  Licencia de conducir y Otro documento, y los cuatro originales se
  **desactivaron** en vez de borrarse: desactivar es reversible.

## Lo que se construyó

`PuertoCarteraExterna.sincronizarExpediente()` y su implementación en Fineract.
Tres decisiones que conviene no romper:

- **Los catálogos se resuelven por nombre, no por id.** Los ids de valores de
  catálogo son de cada instalación; escribirlos en el código haría que funcione
  aquí y falle en la siguiente institución.
- **Cada pieza se aplica o se omite por separado.** Que falte el tipo «CURP» en
  el catálogo no es razón para dejar al cliente sin domicilio. Se devuelve qué se
  aplicó y qué no, y el despachador lo registra: una omisión explicada se
  resuelve, una silenciosa no.
- **El domicilio se manda completo o no se manda.** Medio domicilio en un core de
  cartera es peor que ninguno: la visita de cobranza sale igual y llega a una
  dirección incompleta.

El suscriptor de clientes ahora publica también cuando cambian `rfc`, `curp`,
`direccion`, `colonia`, `ciudad`, `estado`, `codigoPostal` y `pais`. Antes no
estaban y hacían bien en no estar: publicar un cambio que el otro lado descarta
genera eventos que no hacen nada.

`npm.cmd run clientes:expediente [-- --aplicar]` lleva hacia atrás el expediente
de los clientes replicados antes del cambio. Sólo toca clientes ya vinculados.

## Permisos

Al usuario de servicio se le dieron `READ/CREATE/UPDATE_CLIENTIDENTIFIER`,
`READ/CREATE/UPDATE_ADDRESS` y `READ_CODEVALUE`. Esto **sí** es su trabajo —es
replicación de datos del cliente— a diferencia del catálogo contable, que se le
negó deliberadamente. El criterio es el mismo en los dos casos: la integración
tiene exactamente los permisos de los hechos que replica, ni uno más.

## Lo que sigue faltando para ser espejo de verdad

El ERP no tiene dónde guardar cosas que el core sí modela:

| Falta en el ERP | Consecuencia |
|---|---|
| Fecha de nacimiento | El core la pide y la verificación de identidad la necesita |
| Identificadores en tabla, no dos columnas | Un INE o un pasaporte no tienen dónde ir |
| Varios domicilios con tipo | El domicilio fiscal del CFDI y el de cobranza son el mismo campo |
| Expediente documental (archivos) | No existe; sólo hay adjuntos en importaciones y productos |
| Género, tipo y clasificación de cliente | Catálogos del core sin contraparte |

Ese es el orden correcto: **primero el modelo, después la tubería.** Replicar hoy
un domicilio y mañana partirlo en fiscal y particular obliga a rehacer la
replicación y migrar lo ya enviado.

## Homologación del expediente, segunda vuelta — 2026-09-20

**El 400 del domicilio.** La primera implementación mandaba `addressTypeId` en
el cuerpo además del query, y Fineract respondía `400: addressTypeId` — su
manera de decir «ese parámetro no va aquí», que se lee exactamente igual que
«falta ese parámetro». También convertía el código postal a número, lo que borra
los ceros a la izquierda: la mitad de los códigos de la Ciudad de México empiezan
con cero. El contrato correcto —tipo sólo en el query, código postal como
texto— se verificó contra el core antes de volver a correr la carga.

**Idempotencia del domicilio.** Un POST repetido crea un segundo domicilio, no
reemplaza el primero. Ahora se busca el del mismo tipo y se corrige con PUT; sin
eso, correr la carga dos veces dejaba al cliente con la misma dirección
duplicada y nadie sabría cuál es la buena.

**Fecha de nacimiento y género.** Se agregaron al modelo del ERP —columnas
`fechanacimiento` (date) y `genero` (varchar con CHECK)— y viajan al core como
`dateOfBirth` y `genderId`. No es sólo simetría: la fecha de nacimiento es el
segundo dato que coteja cualquier verificación de identidad después del nombre,
y sin ella el flujo de validación compara con una mano atada.

Dos detalles que parecen menores y no lo son:

- La columna es `date`, no `timestamp`, y se formatea con componentes UTC. Una
  fecha de nacimiento no tiene hora, y guardarla con huso la mueve un día para
  quien captura de noche al oeste del meridiano —que en México es el país
  entero—. Una fecha corrida un día es un dato falso que nadie nota hasta que no
  cuadra con una identificación oficial.
- El género se resuelve contra el catálogo `Gender` del core **por nombre**. Los
  ids de valores de catálogo son de cada instalación; fijarlos en el código haría
  que funcione aquí y falle en la siguiente institución.

Ambos campos sólo se capturan para persona física: una sociedad no nace ni tiene
género.

## Lo que sigue pendiente del modelo

| Falta | Por qué importa | Tamaño |
|---|---|---|
| Identificadores en tabla, no dos columnas | Un INE o un pasaporte no tienen dónde ir | Migración + UI |
| Varios domicilios con tipo | El fiscal del CFDI y el de cobranza son el mismo campo | Migración + UI |
| Expediente documental (archivos) | No existe en el ERP | Almacenamiento + UI |

El orden es modelo primero, tubería después: replicar hoy un domicilio y mañana
partirlo en fiscal y particular obliga a rehacer la replicación y migrar lo ya
enviado.

---

# Pruebas en vivo de ambos sistemas — 2026-09-20

## Tres defectos encontrados y corregidos

**1. El mapeo de errores de base de datos estaba muerto desde la migración.**
`FiltroGlobalExcepciones` indexaba los errores por `number`, que es como los
reporta el driver de SQL Server. PostgreSQL los reporta en `code`, una cadena
como `23505`. Al migrar, la tabla dejó de coincidir con nada y **todos** los
errores de base de datos cayeron al 500 genérico.

El costo no era teórico: un RFC duplicado, una cuenta en uso o un id mal formado
devolvían el mismo 500 indistinguible, así que la pantalla no podía decirle al
usuario qué corregir. Ahora se leen ambos, `code` y `number`, y se traducen los
códigos de PostgreSQL que importan (22P02, 23505, 23503, 23502, 23514, 22001,
22003, 40001, 40P01, 57014).

Se descubrió porque `/activos/registro` devolvía 500: la ruta cayó en
`@Get(':id')`, «registro» llegó a la consulta donde se esperaba un UUID y
Postgres lo rechazó. Ahora responde 400 con «El identificador o alguno de los
valores no tiene el formato esperado».

**2. La balanza de comprobación tronaba al abrir, siempre.**
`c.numeroCuenta AS numeroCuenta` sin comillas: PostgreSQL pliega el alias a
`numerocuenta`, la lectura daba `undefined`, y la pantalla —que agrupa las
cuentas por su primer dígito— reventaba con «Cannot read properties of
undefined». En SQL Server el mismo alias conservaba el camelCase, así que el
error cruzó la migración sin que nada lo señalara.

**3. El estado de cuenta del cliente calculaba NaN.**
Misma causa, peores consecuencias: `AS saldoAnterior` llegaba como
`saldoanterior`, `Number(undefined)` da NaN, `Math.max(0, NaN)` también, y ese
NaN contaminaba el saldo corrido completo. Un NaN se imprime como «NaN» en
pantalla, pero en una suma se propaga en silencio.

Se barrió el resto del código en busca de la misma clase de error: sólo había
estos tres casos reales. Un cuarto resultado era un comentario que ya
documentaba este mismo problema en `cobranza.service.ts` —alguien lo encontró
antes ahí y lo resolvió entrecomillando—, lo que confirma que es una trampa
recurrente de esta migración y no un descuido aislado.

## Readiness del core: de 4/9 a 7/9

Los mapeos contables del día anterior se reflejan: `LIABILITY_TRANSFER (200) OK`
y `Teller cash (101/102) OK`. Quedan dos controles, ambos decisión del negocio:

- **Fecha operativa** (`enable-business-date`, deshabilitada). Encenderla cambia
  con qué fecha se asientan todas las operaciones —pasa de la fecha del sistema a
  la fecha de negocio— y es el prerrequisito del cierre de día que clasifica la
  mora. No se encendió de oficio: altera el fechado de movimientos financieros.
- **Personal operativo** (0 colaboradores). Bloquea caja y ventanilla, y también
  la asignación de responsable en el expediente del cliente. Requiere los nombres
  reales de la institución; inventarlos dejaría datos que alguien tendría que
  depurar.

## Identificaciones del cliente, completadas — 2026-09-20

Tabla `cliente_identificaciones`, servicio, endpoints bajo
`/clientes/:id/identificaciones`, replicación al core y pestaña «Documentos» en
el modal de clientes.

**Por qué el RFC y la CURP NO se mudaron ahí.** Es la decisión que más se
discute y conviene dejarla escrita: no son documentos, son claves de identidad
fiscal que medio sistema lee —CFDI, validación, búsqueda— y que están
garantizadas como una sola por persona. Moverlas a una tabla las habría
convertido en una consulta más en cada factura, a cambio de una pureza de modelo
que nadie iba a cobrar. La tabla nueva es para lo que sí es un documento: tiene
folio, puede vencer, y una persona puede tener varios.

Tres decisiones de comportamiento:

- **La vigencia se calcula al leer, no se guarda.** Un campo «vencida» en la
  base nace correcto y se vuelve mentira al día siguiente sin que nadie toque la
  fila.
- **Retirar desactiva, no borra.** Una identificación que estuvo en el
  expediente cuando se autorizó un crédito es parte de por qué se autorizó;
  borrarla deja la decisión sin su sustento.
- **La pestaña exige que el cliente exista.** Capturar documentos de alguien sin
  expediente obligaría a sostenerlos en memoria y escribirlos después del alta,
  con el caso «se guardó el cliente pero no sus documentos» esperando a que
  falle la segunda llamada.

## Pendiente que requiere presencia: la fecha operativa del core

`enable-business-date` sigue apagada. La pantalla del portal la marca como
**control crítico**: encenderla cambia con qué fecha se asientan las
operaciones, y de ahí cuelgan validaciones de originación, pagos, intereses,
contabilización y la ejecución del cierre de día. Es además el prerrequisito
para que el COB clasifique la mora.

No se encendió estando el responsable fuera. El beneficio no es urgente y el
efecto toca el fechado de movimientos financieros: es el tipo de interruptor que
se acciona con alguien mirando la pantalla después.

## Prueba de ciclo completo del expediente — 2026-09-20

Con la tabla ya migrada y las 424 pruebas en verde, se probó el ciclo real
contra la base y el core, no contra dobles:

1. Capturar una INE en la pestaña Documentos → aparece en el expediente.
2. El despachador la lleva al core en su siguiente pasada (~20 s) → aparece como
   identificador tipado en la ficha del cliente.
3. Retirarla en el ERP → **seguía viva en el core**.

El paso 3 destapó un hueco real de lo construido: `sincronizarExpediente` sabía
agregar y corregir, no retirar. Los dos sistemas se separaban justo donde
«espejo» tenía que sostenerse, y sólo se ve probándolo.

**Corrección.** Ahora se borran del core los identificadores de los tipos que el
ERP administra y que ya no tiene activos. Queda fuera «Otro documento» a
propósito: varios tipos del ERP —acta constitutiva, poder notarial, otro— caen
en esa misma etiqueta del core, y ahí puede haber además algo capturado a mano.
Borrar por una etiqueta ambigua es cómo se pierde el documento de alguien más.

Al rol de servicio se le dio `DELETE_CLIENTIDENTIFIER`, con el mismo criterio de
siempre: la integración tiene los permisos de los hechos que replica, ni uno más.

**Verificación final** sobre la ficha 7: alta → replica, retiro → desaparece,
alta de otro tipo → replica. El expediente quedó con RFC, CURP y el domicilio
completo (27 de abril 4, Tacoteno, Minatitlán, Veracruz, 96870), sin rastro de
los folios de prueba.

## Personal operativo y asignación de responsable — 2026-09-20

Se dieron de alta cuatro colaboradores en Head Office, **con nombres ficticios
y autorización expresa** por tratarse de un entorno sin información productiva:

| # | Nombre | Rol en el core |
|---|---|---|
| 1 | Mariana Quintero Salas | Asesor de crédito (`isLoanOfficer`) |
| 2 | Rodrigo Espinoza Lara | Asesor de crédito (`isLoanOfficer`) |
| 3 | Liliana Ordaz Prieto | Operativo (ventanilla) |
| 4 | Ernesto Vidal Carranza | Operativo (ventanilla) |

Correos `@suma.mx` y móviles de la serie 81120001xx, también ficticios. **Antes de
producción hay que desactivarlos o reemplazarlos por la plantilla real.**

Con esto el readiness del core pasó a **8/9**. Queda sólo la fecha operativa.

### Un defecto que sólo apareció al usarlo

Asignar responsable fallaba con un recuadro rojo que decía únicamente
«**locale**». El comando `assignStaff` de Fineract no acepta `locale` ni
`dateFormat`, y su manera de rechazarlos es devolver el nombre del parámetro a
secas — que se lee como si faltara, no como si sobrara.

Es **el mismo patrón** que costó el 400 del domicilio (`addressTypeId` en el
cuerpo cuando iba en el query). Vale la pena escribirlo como regla: **cuando el
core responde con un nombre de campo suelto, casi siempre ese campo sobra, no
falta.**

Corregido: `assignStaff` viaja sólo con `staffId` y `unassignStaff` con el cuerpo
vacío. No llevan fecha porque no la tienen — asignar un asesor no es un hecho con
fecha efectiva, se aplica al momento.

Verificado en vivo: la ficha 7 quedó con «Quintero Salas, Mariana» como
responsable y el aviso «realizada correctamente».
