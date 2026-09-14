# Continuidad compartida Codex / Claude

Actualizado: 2026-09-14. Responsable de esta actualización: Codex.
Estado: trabajo abierto; no declarar terminada la integración.

## Cómo retomar

1. Leer este archivo y `VALIDACION_FINERACT_2026-09-12.md` en el mismo directorio.
2. Revisar `git status -sb`, HEAD y cambios locales antes de editar. No asumir que la rama o el estado de la base siguen iguales.
3. Un agente modifica cada checkout a la vez. Antes de alternar, actualizar este archivo con resultados, pendientes, procesos activos y cambios sin commit.
4. Al volver, leer el avance del otro agente y comprobarlo; no repetir pruebas persistentes a ciegas ni revertir trabajo ajeno.
5. Publicar commits enfocados en la rama acordada y registrar el resultado real del push. No hacer merge a main ni force push por defecto.

## Rutas y permisos

Raíz para Claude Code: `D:\SUMA\erpfineract`.

- ERP: `D:\SUMA\erpfineract\syncroERP\claude` (raíz Git: directorio padre syncroERP).
- Fineract: `D:\SUMA\erpfineract\fineract`.
- SUMA: `D:\SUMA\erpfineract\suma-consola`.
- Este documento versionado: `D:\SUMA\erpfineract\syncroERP\claude\CONTINUIDAD_CODEX_CLAUDE.md`.
- Entrada común: `D:\SUMA\erpfineract\LEER_PRIMERO_CODEX_CLAUDE.md`.

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

La carpeta original de Codex `C:\Users\abeld\OneDrive\Documentos\ChatGPT\SyncroERP-Fineract-SUMA` conserva JSON de resultados y scripts diagnósticos. No hace falta dar permiso de escritura allí: las evidencias relevantes se copiarán a `D:\SUMA\erpfineract\evidencias-codex` para lectura compartida. No ejecutar los builders o scripts one-off de esa carpeta; pueden repetir mutaciones.

## Registro de relevo

2026-09-14 Codex: creado protocolo de continuidad pedido por el usuario. Retomando POS. No se ejecutaron nuevas operaciones comerciales en esta actualización inicial. Antes de ceder, añadir estado final abajo y registrar cualquier nuevo fixture o pendiente.

### Cierre de actualización del 14/09 — preparación POS lista

Preparación completada y comprobada: un almacén, categoría, producto y banco activos; lista PRUEBA POS CODEX por defecto (antes no existían listas). Servicio TEST-POS-CODEX a600; categoría con cuentas existentes401.01/402.01. Cliente CLIENTE SINTETICO PRUEBA POS con línea sintética1200, sólo para el escenario. Su alta se publicó; confirmar envío antes de vender. No se simuló una aprobación real: estos datos se prepararon técnicamente.

Evidencia exacta y todos los IDs: D:\SUMA\erpfineract\evidencias-codex\preparacion-pos.json. No volver a ejecutar preparar-pos-local.cjs: el escenario ya existe. Reutilizarlo.

Próxima acción: acceder al ERP3000 con sesión humana, abrir /dashboard/ventas/pos, buscar TEST-POS-CODEX, agregar dos unidades, seleccionar CLIENTE SINTETICO PRUEBA POS y producto MSI a seis cuotas sin enganche. Revisar importes1200 y fecha válida antes de confirmar la venta sintética. Después comprobar crédito, cron, pago600 y devolución de una unidad por UI, y cerrar verificando ambos saldos0 y pólizas. Si cualquier pantalla falla, documentar URL, mensaje y estado persistido antes de reintentar.

Bloqueo de UI al cerrar esta preparación: sesión expirada, login Keycloak abierto y solicitado al usuario. No hubo venta por UI. No hay una prueba comercial ejecutándose en segundo plano. ESPEJO sigue pendiente y no se activó.

Al finalizar el escenario, desactivar únicamente los fixtures identificados en preparacion-pos.json y dejar cliente sin línea, conservando trazabilidad. Lista no tiene columna activo: revisar su uso antes de cambiarla, no borrar historial. Registrar en este archivo cualquier saldo o asiento que quede pendiente.

### Relevo 2026-09-14 — Claude: recorrido POS cerrado por pantalla

Responsable: Claude. Motivo del relevo: Codex agotó su cuota a mitad del pago/devolución por UI.

Estado encontrado al entrar (verificado, no asumido): venta folio 2 `a624dc2f-1458-4c6f-b437-5f1f26b5664d` COMPLETADA por POS UI, total 1200, método MENSUALIDADES, cliente y almacén de `preparacion-pos.json`. Crédito `CRD-2026-0004` (`38d4b3be-ea43-4a93-8805-1ea936ecf9a7`) ACTIVO, 6 cuotas de 200 sin interés. El pago de 600 por UI de Codex (`acf30168`, EFECTIVO, ref PRUEBA UI CODEX SIN DINERO REAL) ya estaba aplicado: cuotas 1-3 PAGADAS, saldo 600. Outbox 15 ENVIADO, 0 pendientes. Conciliación previa: 7 revisados, 0 discrepancias.

Ejecutado por Claude, sólo por pantalla: `/dashboard/ventas/devoluciones/nueva`, venta #2, 1 unidad de TEST-POS-CODEX, condición "Regresa a existencia", reembolso EFECTIVO sobre la caja sintética, motivo "PRUEBA UI CLAUDE SIN DINERO REAL". Importe estimado 600.00. POST `/ventas/:id/devoluciones` respondió 201. Devolución `0da34eb0-fa56-462e-8312-f23bad44871a`, folio DEV-2, PROCESADA.

Resultado final del ciclo completo POS -> crédito -> pago -> devolución:

- Venta folio 2: PARCIALMENTE_DEVUELTA, totalDevuelto 600.
- Crédito CRD-2026-0004: LIQUIDADO, saldoPendiente 0, montoAjustesDevolucion 600.
- Outbox: 16 ENVIADO, 0 pendientes, 0 fallidos, 0 reintentos. Secuencia CLIENTE_ALTA -> CREDITO_ORIGINADO -> PAGO_REGISTRADO -> AJUSTE_DEVOLUCION, todos despachados por el cron real sin forzar el despachador.
- Conciliación tras la devolución: 6 revisados, 0 discrepancias, 0 abiertas. El conteo bajó de 7 a 6 al cerrarse el préstamo 8 del core.
- Disponibilidad del cliente: límite 1200, utilizado 0, disponible 1200, vencido 0.
- Pólizas internas ERP, las tres VIGENTES y balanceadas: IN-2026-00002 venta 1200/1200 (105.01 cargo / 401.01 abono); IN-2026-00003 cobranza 600/600 (101.01 cargo / 105.01 abono); DI-2026-00002 devolución 600/600 (402.01 cargo / 105.01 abono). Neto de 105.01 Clientes nacionales: 0.

Evidencia con todos los IDs: `D:\SUMA\erpfineract\evidencias-codex\pos-ciclo-ui-claude.json`.

Limitación declarada: el saldo del préstamo 8 en Fineract se comprobó por la conciliación ERP-core (0 discrepancias) y por la baja de 7 a 6 registros revisados, no leyendo la UI de Fineract. Si se quiere evidencia directa del core, queda pendiente abrir 3002 y capturar el préstamo 8 cerrado.

No commiteado desde esta sesión: el checkout se leyó desde un montaje Linux y `git status` marca todo el árbol como modificado por fin de línea. Commitear desde ahí reescribiría cientos de archivos. El commit de este relevo debe hacerse desde Windows (rama `codex/verificacion-productos-fecha-activacion`). Cambios sin commit reales de esta sesión: este archivo y `evidencias-codex/pos-ciclo-ui-claude.json`.

No se tocó ESPEJO: contabilidad externa sigue APAGADO, 4 cuentas sin mapear, cartera en SOMBRA. No se desactivaron los fixtures de `preparacion-pos.json`; siguen activos y el cliente conserva su línea de 1200 ahora libre. Decidir si se desactivan al cerrar el escenario o se reutilizan para la prueba de ESPEJO.

Pendiente inmediato sin cambios respecto a lo anterior: 1) ESPEJO con mapeo de cuentas, asiento externo balanceado, consulta, reversa e idempotencia. 2) Mora, intereses, devolución de inventario, exceso pagado, fallos de red tras aplicar y escenarios fiscales. 3) Platform/SUMA y smoke integrado, incluidos los tres modos (ERP+Fineract, ERP solo, Fineract solo) desde consola.

### Relevo 2026-09-14 (2) — Claude: ESPEJO preparado y bloqueado por variable de entorno

Hecho en esta tanda, tras cerrar el POS:

1. `GET /integracion/cuentas/pendientes` devolvió exactamente 4 cuentas, todas las que tocan las pólizas de la prueba: 105.01 (5 usos), 101.01 (2), 402.01 (2), 401.01 (1). El mapeo estaba vacío.
2. `POST /integracion/cuentas/aprovisionar?simular=1`: 4 se crearían, 0 reutilizadas, 0 problemas. Se repitió sin `simular` con el alcance por omisión `soloUsadas=true`, **no** con `todas=1`. No se aprovisionó el catálogo completo, así que las 1030 candidatas y las 53 cuentas ORDEN del informe anterior siguen sin tocar.
3. Resultado real: 105.01 -> idExterno 1, 101.01 -> 2, 402.01 -> 3, 401.01 -> 4. Mapeo guardado con el mismo código en ambos lados, 0 problemas, `cuentasSinMapear` pasó de 4 a 0.
4. `PATCH /integracion/configuracion` con `modoContabilidad: ESPEJO`. Respuesta 200, `avisos: []`. `GET /integracion/verificacion` devuelve `[]`: el proveedor no va a asentar por su cuenta, los productos siguen en accountingRule NONE.

Estado de contabilidad ahora: modoGlobal APAGADO, modoEmpresa ESPEJO, **modoEfectivo APAGADO**. Cartera intacta en SOMBRA.

**El espejo NO está encendido y no se asentó nada en el mayor externo.** El techo global se lee de `CONTABILIDAD_EXTERNA_MODO` en `syncroERP/claude/backend/.env.local`, hoy `APAGADO`. `IntegracionModoService.combinarContabilidad()` devuelve APAGADO mientras ese techo esté apagado, sin importar lo que pida la empresa: el global es un techo, no un valor por omisión. Así que falta un paso que sólo se puede dar desde Windows.

Evidencia: `D:\SUMA\erpfineract\evidencias-codex\espejo-preparacion-claude.json`.

#### Para quien retome (Codex): siguiente paso exacto de ESPEJO

Precondición, desde Windows: editar `syncroERP\claude\backend\.env.local` línea 29, `CONTABILIDAD_EXTERNA_MODO=ESPEJO`, y reiniciar sólo el backend 4000. No tocar `CARTERA_MODO=SOMBRA`. Después comprobar con `GET /integracion/estado` que `contabilidad.modoEfectivo` sea ESPEJO y que `cuentasSinMapear` siga en 0.

Luego, sin preparar nada nuevo: los fixtures de `preparacion-pos.json` siguen activos y el cliente `5336e38d` tiene su línea de 1200 libre otra vez, así que se puede hacer una segunda venta sintética por POS y recorrer venta -> cobro -> devolución observando el mayor externo. Lo que hay que probar y aún no se ha probado nunca:

- Asiento externo balanceado: que cada póliza VIGENTE del ERP genere su contrapartida en Fineract con el mismo importe y contra las cuentas 1/2/3/4 ya mapeadas.
- Consulta: poder leer ese asiento desde el ERP y que coincida con el interno.
- Reversa: cancelar una póliza en el ERP y ver que el asiento externo se revierte, no que se borra.
- Idempotencia: reintentar el mismo evento y que no duplique el asiento, igual que ya se validó para pago y devolución.

Riesgo conocido a vigilar: duplicar cuentas por cobrar si el proveedor asienta por su cuenta. Por eso `verificacion` debe seguir devolviendo `[]` después de encender el techo; si devuelve avisos, apagar antes de operar.

Incidencia operativa de esta sesión, por si reaparece: la sesión Keycloak caducó a mitad del trabajo y devolvió 401 "Sesión Keycloak inválida". Recargar `/dashboard` refresca el token y se puede continuar; no hizo falta volver a entrar. El aprovisionamiento de cuentas había terminado antes del 401, no quedó a medias.

Sigue sin commitear desde esta sesión, por lo ya explicado del fin de línea. Archivos tocados en esta tanda: este documento y `evidencias-codex/espejo-preparacion-claude.json`.

### Relevo 2026-09-14 (3) — Claude: modo ERP solo probado, y un hallazgo que conviene decidir antes de seguir

Primero lo que no se pudo: **SUMA 3010 y Platform 3003 no responden**. Los tres modos no se conmutaron desde la consola. Se usó `PATCH /integracion/configuracion`, que es exactamente la maquinaria (`IntegracionModoService`) que la consola gobierna, así que la prueba del comportamiento vale; lo que queda sin probar es la pantalla de la consola.

**Modo ERP solo.** Cartera de la empresa a APAGADO (efectivo APAGADO, global sigue SOMBRA). Venta por POS UI: 1 unidad de TEST-POS-CODEX, 600, cliente sintético, producto "Crédito simple a 30 días", vence 14 oct 2026. POST `/ventas` 201. Resultado: venta folio 3 COMPLETADA método CREDITO_30D, crédito **CRD-2026-0005** (`23a70f35-026e-4653-aa53-fe06532f575b`) ACTIVO con saldo 600, disponibilidad servida por el ERP sin degradación, y **cero eventos nuevos en el outbox**: siguió clavado en 16 ENVIADO. El ERP opera solo, de verdad: vende a crédito, calcula plazos y contabiliza sin tocar el core.

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

Falta, entonces, una migración o backfill al encender un eje, o como mínimo un aviso explícito en la consola SUMA de que el cambio de modo no es retroactivo. Es una decisión de producto, no un bug que Claude deba parchear por su cuenta.

#### Estado que se deja, a propósito

**Quedan 2 discrepancias ABIERTAS.** No se resolvieron porque son verdaderas: CRD-2026-0005 existe de verdad en el ERP y no tiene préstamo en el core. Cerrarlas sin corregir el fondo sería maquillar el hallazgo. Tres formas de cerrarlas, a elegir:

- Anular la venta 3, lo que cancela CRD-2026-0005. Ojo: en SOMBRA eso emite CREDITO_CANCELADO sobre un préstamo que el core nunca tuvo, y puede dejar el evento en rojo tras sus 8 reintentos. Es, de hecho, otra prueba interesante.
- Dar de alta a mano el préstamo equivalente en el core y vincularlo.
- Resolver con nota, como el 13/09 con `0915fd09`, dejando constancia de que el origen fue esta prueba de modos.

Mientras sigan abiertas, **cualquier intento de subir a AUTORIDAD será rechazado**. Tenerlo presente para no diagnosticarlo como fallo.

Evidencia completa: `D:\SUMA\erpfineract\evidencias-codex\modos-erp-solo-claude.json`.

Estado final de configuración al cerrar: cartera global SOMBRA / empresa SOMBRA / efectivo SOMBRA. Contabilidad global APAGADO / empresa ESPEJO / efectivo APAGADO, 0 cuentas sin mapear. Outbox 16 ENVIADO, 0 pendientes, 0 fallidos.

Pendiente, en orden: 1) Decidir qué hacer con las 2 discrepancias y con el backfill entre modos. 2) Encender `CONTABILIDAD_EXTERNA_MODO=ESPEJO` desde Windows y probar asiento externo, consulta, reversa e idempotencia. 3) Levantar SUMA 3010 y Platform 3003 para probar los tres modos desde la consola, que es como el cliente los va a cambiar. 4) Fineract solo, mora, intereses, devolución de inventario, exceso pagado, fallos de red y fiscal.

### Relevo 2026-09-14 (4) — Claude: ESPEJO encendido, primer asiento externo e idempotencia aprobada

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

Evidencia: `D:\SUMA\erpfineract\evidencias-codex\espejo-primer-asiento-claude.json`.

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

### Relevo 2026-09-14 (5) — Codex: reversa core observada y saldo externo corregido

Leídos y preservados todos los avances de Claude. No se repitió la venta ni la devolución del ticket 2. Estado inicial por PostgreSQL y portal: póliza IN-2026-00005 VIGENTE, vínculo a2bef5f612d7, outbox17 ENVIADO y las mismas2 discrepancias de cartera.

La revisión automática impidió al agente confirmar la reversa por considerarla transacción financiera persistente. El usuario pulsó la confirmación y escribió «ya pulse». El portal confirmó la reversa: original a2bef5f612d7 marcado Reversado; nueva transacción a2bf0fcd569d, 101.01 CREDIT600 y401.01 DEBIT600, ambas vigentes. No se hizo una segunda reversa ni se restauró el asiento.

Después, el ERP conserva IN-2026-00005 VIGENTE, polizaReversaId null y vínculo original; outbox17 ENVIADO, sin nuevos eventos, mismas2 discrepancias. Revisión del código: /integracion/conciliacion usa CarteraConciliacionService; no se encontró conciliación del mayor. La divergencia contable de esta prueba sigue ABIERTA y no fue maquillada. La reversa ERP -> core continúa pendiente del asistente de Finanzas.

Corrección encontrada en esta revisión: saldoCuenta leía un booleano debit inexistente. La API real devuelve entryType.id (DEBIT2/CREDIT1). El adaptador ahora aplica el signo correcto y rechaza tipo/importe ilegible. Conserva tanto original como contrapartida para neutralizar reversas. Validación: 9 pruebas en2 suites aprobadas; consulta real por el adaptador devuelve caja0 y ventas0 después de la reversa. Esto corrige la lectura, NO agrega conciliación automática ni sincronización inversa.

Evidencias compartidas: resultado-reversa-core-antes.json, resultado-reversa-core-despues.json, resultado-mayor-core.json y saldo-contable-reversa-codex.json en D:\SUMA\erpfineract\evidencias-codex. La evidencia del mayor contiene las partidas originales marcadas reversed=true; el ID nuevo y sus partidas se comprobaron en el portal. Los JSON de Claude se conservaron.

Próximo trabajo: implementar conciliación contable con alcance explícito. No comparar indiscriminadamente todo el histórico ERP contra el core: las pólizas anteriores a ESPEJO no se enviaron. Comparar primero pólizas vinculadas/partidas y detectar reversas externas; definir corte y saldos de apertura para la conciliación agregada. Revisar también paginación de saldoCuenta (limit=-1 heredado) antes de usarlo sobre un mayor grande. Mantener abiertas las2 discrepancias de cartera del ticket3 hasta corregir su causa; no promover AUTORIDAD. Fixtures siguen activos para continuar pruebas, con su historial sintético intacto.

Operación: consultas elevadas confirmaron servicios3000,3002,3010,4000,8443 y55432 activos; no se reiniciaron. La sesión de Fineract se recuperó por SSO. No se volvió a probar aún la ruta de devolución que Claude reportó404 ni Platform3003.
