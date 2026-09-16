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

### 2026-09-14 — ESPECIFICACIÓN del usuario sobre los tres modos (texto normativo, no interpretación)

El usuario fijó el criterio de aceptación. A partir de aquí, esto manda sobre cualquier supuesto anterior:

> Se debe cumplir de manera **bidireccional** cuando el cliente tiene contratado ERP **y** Fineract. Cuando es sólo ERP, Fineract no se debe enterar. Cuando es sólo Fineract, el ERP no se debe enterar. Pero todo lo que se le mueva a uno se debe reflejar en el otro, **en ambos sentidos**, cuando el cliente los tiene contratados juntos.

#### Verificación del trabajo de Codex sobre la reversa externa (revisado por Claude, no dado por bueno de palabra)

Comprobado en el repo y en ejecución real:

- El código **sí aterrizó en el repo**, no se quedó en la carpeta de trabajo de Codex: `integracion/controllers/contabilidad-conciliacion.controller.ts`, `integracion/services/contabilidad-conciliacion.service.ts` y sus specs.
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

Decisión pendiente del usuario, y es la que ordena el trabajo que queda: **qué entidades son de ida y vuelta de verdad y cuáles sólo se avisan**. Recomendación de Claude: repartir por tipo de entidad en vez de intentar sincronía bidireccional total —pagos y transacciones de cartera se reflejan de verdad; asientos contables se detectan y se resuelven con una operación del ERP, nunca escribiendo directo en los libros. La sincronía bidireccional sin dueño declarado por entidad obliga a resolver conflictos, y eso es una fuente de errores que no compensa aquí.

### 2026-09-14 — Claude: diseño de la sincronización bidireccional, aprobado por el usuario

El usuario aprobó el reparto por entidad de la tabla anterior y añadió dos condiciones: **automático de punta a punta, sin que nada espere a una persona**, y **sin quitar poder a los roles**.

Diseño completo en `syncroERP/claude/DISENO-BIDIRECCIONAL.md`. Lo esencial, para no tener que abrirlo:

- **Principio rector:** el reflejo hacia el ERP nunca escribe filas directas; entra por los servicios del ERP (cobranza, devoluciones, pólizas) con sus validaciones y reglas de rol intactas, disparado por una cuenta de servicio. Se automatiza quién teclea, no qué se permite. Escribir directo en tablas dejaría al core meter en el ERP estados que el ERP considera imposibles, y sin trazabilidad de quién hizo qué.
- **Discriminador exacto, sin heurística:** el ERP ya pone `externalId` propio en cada transacción que origina y guarda el vínculo. Toda transacción del core sin vínculo conocido nació fuera. Regla a no romper: cualquier camino nuevo que escriba en el core debe seguir poniendo su `externalId` y registrando el vínculo.
- **Cartera:** reflejo real en ambos sentidos (pago, devolución, cancelación, reversa de pago).
- **Contabilidad:** también automático, pero la corrección se aplica generando la operación del ERP que corresponde, no escribiendo en los libros. El caso `REVERSA_EXTERNA` ya detectado debe cerrarse cancelando la póliza vinculada. **Bloqueado por el Asistente Maestro de Finanzas (409).**
- **Mecanismo:** sondeo como vía principal, no webhooks. Sobrevive a cortes, no exige exponer el ERP a conexiones entrantes, y el conciliador de respaldo hay que construirlo igual: mejor que sea el camino principal y no un segundo mecanismo que se prueba poco y falla callado. El webhook, si se añade, sólo reduce latencia.
- **Ingesta:** `inbox`, espejo del outbox, reutilizando sus patrones ya probados (EN_VUELO, reintentos, circuito). Idempotencia por identificador de transacción del core.
- **Backfill:** paso explícito con informe previo, no automático al cambiar de modo. Mientras no exista, la consola debe avisar de que el cambio no es retroactivo.
- **Aislamiento:** filtrar por modo **efectivo** y no consultar siquiera al core para empresas en sólo ERP. La conciliación contable de Codex ya lo hace bien: copiar ese patrón.

**Orden de trabajo acordado:** 1) método de puerto para listar transacciones de un préstamo con su identificador externo —es la pieza que hoy no existe y de la que depende todo el sentido core → ERP—; 2) inbox y aplicador de cartera empezando por el pago externo; 3) cierre automático de `REVERSA_EXTERNA`; 4) sincronización inicial y aviso en consola; 5) altas nacidas en el core; 6) modo sólo Fineract.

Para repartir trabajo sin pisarnos: los puntos 1 y 2 son una sola cadena y conviene que los lleve un solo agente. El 4 y el 6 son independientes y se pueden tomar en paralelo.

### 2026-09-14 — Claude: implementado el paso 1 y medio paso 2 del sentido externo → ERP

Trabajo de código, no de pruebas. Todo compila (`tsc --noEmit` limpio), y **las pruebas no se pudieron ejecutar desde el entorno de Claude**: jest no resuelve sus módulos sobre el montaje de archivos (falla con «Module ts-jest in the transform option was not found» aunque node sí lo resuelve). Es limitación del entorno, no del código. **Hay que correr `npm.cmd test` desde Windows antes de dar esto por bueno.**

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

Sigue sin commitear desde la sesión de Claude, por lo ya explicado.

### 2026-09-14 — Claude: el sentido externo → ERP detecta un pago nacido en el core. Probado de verdad.

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

Evidencia completa: `evidencias-codex\deteccion-transaccion-externa-claude.json`.

#### Estado que se deja

**5 discrepancias abiertas, todas verdaderas.** Tres son de CRD-2026-0006 por el pago externo que sigue sin reflejarse —porque el aplicador todavía no existe—, y dos son las anteriores de la prueba de modos. CRD-2026-0006 está ACTIVO en el ERP con saldo 600 mientras el préstamo 9 está cerrado en el core.

No se resolvieron a propósito: son el material de prueba del siguiente paso. Cuando exista el aplicador, la señal de que funciona es que estas tres se cierren solas.

#### Lo que sigue, con el camino ya despejado

1. **El aplicador.** Tomar `TRANSACCION_EXTERNA` y aplicar la cobranza equivalente **por el servicio de cobranza del ERP**, nunca escribiendo saldos. Idempotente por id de transacción del core. Es la pieza que convierte detección en reflejo.
2. `TRANSACCION_REVERSADA_FUERA` implementado pero **sin probar en vivo**: hace falta reversar en el core un pago que haya originado el ERP.
3. La limitación de los créditos liquidados sigue ahí, y es donde un cobro indebido pasa más desapercibido.
4. Correr `npm.cmd test` desde Windows: las pruebas unitarias nuevas siguen sin ejecutarse nunca, porque jest no funciona sobre el montaje de Claude.

### 2026-09-14 — Claude: el aplicador. Un pago nacido en el core ya se refleja solo en el ERP.

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

Evidencia: `evidencias-codex\reflejo-externo-aplicador-claude.json`.

#### Lo que sigue sin hacerse

- **Las pruebas unitarias nuevas no se han ejecutado nunca.** Jest no funciona sobre el montaje de Claude. `npm.cmd test` desde Windows, y es lo primero.
- El reflejo cubre **pagos**. Faltan devolución externa, cancelación externa y reversa de un pago propio (`TRANSACCION_REVERSADA_FUERA` se detecta pero no se refleja).
- Altas nacidas en el core: ni se detectan.
- Backfill al contratar el segundo producto.
- Fineract solo, consola SUMA, aislamiento entre empresas, mora, intereses, fiscal.
- Nada commiteado desde la sesión de Claude.

### 2026-09-14 — Claude: corregido un fallo propio en el aplicador antes de que llegara a nada real

Al revisar mi propio código de hace un rato encontré un error serio y lo arreglé. Lo dejo escrito porque es justo la clase de fallo que no da la cara hasta el arqueo.

**Qué estaba mal.** La lista `TIPOS_TRANSACCION_REFLEJABLES` metía en el mismo saco `repayment` y `merchantIssuedRefund`, `payoutRefund` y `goodwillCredit`. El aplicador llamaba a `registrarPago` con **todos** ellos.

Pero esos tres últimos no son cobros: son **movimientos que bajan el saldo sin que entre un peso** —una devolución al cliente, una bonificación de cortesía—. Reflejarlos como cobranza habría hecho que el ERP registrara un cobro, moviera tesorería y cargara la caja por dinero que nunca recibió. El asiento diría que la caja recibió algo que no recibió, y nadie lo notaría hasta cuadrar el arqueo.

**Cómo quedó.** La clasificación se partió en dos:

- `TIPOS_COBRANZA_DEL_CLIENTE` = repayment, downPayment, recoveryRepayment. Lo único que el aplicador convierte en cobranza.
- `TIPOS_REDUCCION_SIN_COBRO` = merchantIssuedRefund, payoutRefund, goodwillCredit. Se **detectan y se reportan**, y el aplicador los omite diciendo por qué. Su reflejo correcto es una devolución del ERP, que necesita la venta de origen, y esa pieza todavía no existe.

La conciliación sigue denunciando ambos grupos: son movimientos externos reales y deben verse. Lo que cambia es que el aplicador ya no confunde una devolución con un cobro.

**Pruebas.** `credito/services/cartera-reflejo.spec.ts` (nuevo), 12 casos. El más importante fija precisamente esto: los tres tipos de reducción sin cobro NO deben llamar a `registrarPago`. También cubre el corte del eco, la clave de idempotencia derivada del id externo, el rechazo a inventar la caja, el aislamiento en modo APAGADO, y que un rechazo del ERP o una caída de enlace se recojan como omisión en vez de forzarse o tomarse por «no hay nada».

Comprobado en vivo tras el cambio: reflejo 0/0/0, conciliación 7 revisados y 2 discrepancias, las dos verdaderas de la prueba de modos. Sin regresión.

Recordatorio que ya va siendo urgente: **ninguna de las pruebas unitarias que he escrito hoy se ha ejecutado**. Jest no funciona sobre el montaje de Claude. `npm.cmd test` desde Windows.

### 2026-09-14 — Claude: paro el reflejo de devoluciones y reversas. Falta una decisión de negocio, no código.

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

### 2026-09-14 — Claude: sincronización inicial (backfill). El tablero quedó en cero.

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

Evidencia: `evidencias-codex\sincronizacion-inicial-claude.json`.

**Lo que no cubre:** créditos con ajustes por devolución (excluidos y reportados) y el eje contable —las pólizas anteriores a ESPEJO siguen sin espejarse, y eso es otra decisión: espejarlas retroactivamente significa meter asientos con fecha pasada en el mayor externo.

Ficheros: `integracion/services/sincronizacion-inicial.service.ts` (nuevo), `integracion.controller.ts`, `integracion.module.ts`.

### 2026-09-14 — Claude: flujo de validación previo al crédito, simulado. El motor existe; lo que falta es que obligue.

Requisito nuevo del usuario: antes de otorgar un crédito debe correr un flujo de aprobación configurable por empresa, y sólo si aprueba se da de alta el crédito en el ERP y en Fineract. Detalle completo en **`DISENO-BIDIRECCIONAL.md`, anexo «Flujo de validación previo al crédito»**.

Lo esencial:

- **El motor ya está construido y es bueno** (`integracion/validacion/`): 7 tipos de paso, 3 políticas, pesos, umbrales, puntaje y tope automático, con pantalla de diseño en `/dashboard/creditos/verificacion` y plantilla sugerida.
- **Simulado con 5 escenarios.** Identidad rechazada → RECHAZADA. Buró rechazado → REVISION_MANUAL con 75 puntos. Todo aprobado → REVISION_MANUAL, porque `topeAutomatico` 0 significa que nada aprueba solo. Sin proveedores → REVISION_MANUAL: **falla en cerrado, no aprueba**. Correcto en los cinco.
- **El hueco: nada llama al motor fuera de su propio controlador.** El POS vende a crédito y el crédito se replica a Fineract sin que el flujo opine. La propia pantalla lo admite: «produce un veredicto y un expediente; no otorga el crédito». Hoy es un asesor, no una puerta.
- **Decisión de producto pendiente**, y es la de verdad: qué pasa con REVISION_MANUAL en el punto de venta. O la venta se detiene y queda solicitud pendiente, o no se vende a crédito ahí. Las dos son defendibles; dejar que pase no lo es.
- **Orden obligatorio cuando se enganche:** veredicto → alta en el ERP → evento a Fineract. Nunca al revés: un préstamo creado en el core para un crédito que luego se rechaza es justo la basura que la conciliación tendría que limpiar después.
- **Sobre llevarlo a la consola SUMA:** partir en dos. La consola define **qué capacidades de validación tiene contratadas** cada empresa (buró, círculo, identidad) y los topes duros de SUMA —eso encaja igual que los modos—. El ERP sigue definiendo **cómo** se ordenan en un flujo. El LEEME de la consola prohíbe explícitamente que ahí viva operación, y decidir a quién le presta un cliente es operación suya, no contratación de SUMA.

Estado dejado: flujo `fbd60ae4` **ACTIVO** en la empresa de pruebas, a propósito, para que se vea que hay flujo y aun así el POS no lo consulta. 8 expedientes de simulación. Todo sintético y desechable.

### 2026-09-14 — Claude: la validación ya es puerta, y va en el otorgamiento de la línea

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

### 2026-09-15 — Claude: el ERP ya sabe deshacer una cobranza

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

Evidencia: `evidencias-codex\cancelacion-cobranza-claude.json`.

**De los tres puntos pedidos siguen pendientes dos:** el reflejo de la devolución externa —que necesita su propia operación, no es lo mismo que cancelar un pago— y el reparto consola/ERP de las capacidades de validación. Y el asiento de reversa se generó por reintento manual tras corregir el bug de la fecha; en una corrida limpia debería generarse solo, conviene comprobarlo.

### 2026-09-15 — Claude: los tres puntos pedidos, hechos. Resumen para Codex.

El usuario pidió arreglar tres cosas que yo había declarado bloqueadas. Las tres están hechas. Evidencia con detalle: `evidencias-codex\tres-piezas-claude-15sep.json`.

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

#### Lo que Codex debe saber antes de tocar esto

- **Las migraciones no corren solas** (`DB_MIGRATIONS_RUN=false`). Si tocas una entidad, corre `npm.cmd run db:migration:run` en el mismo movimiento o dejas la API en 500.
- **Ninguna prueba unitaria escrita por Claude se ha ejecutado nunca.** Ya son seis ficheros. Jest no funciona sobre el montaje de Claude; `npm.cmd test` desde Windows sigue siendo lo más barato y lo más urgente.
- **El ajuste por devolución externa no se ha probado en vivo.** Hace falta un `merchantIssuedRefund` registrado directamente en Fineract sobre un crédito vinculado, y configurar antes `cuentaDevolucionExternaId`.
- El asiento de reversa de cobranza se generó por reintento manual tras corregir el bug de la fecha; en una corrida limpia debería generarse solo. Conviene confirmarlo.
- **Nada está commiteado.** El repo mezcla finales de línea: `cartera-externa.port.ts`, `cartera-conciliacion.service.ts`, `cobranza.service.ts` y el motor contable son CRLF; el adaptador de Fineract y los servicios de contabilidad son LF. Respetar el de cada fichero.

### 2026-09-15 — Claude: cierre de sesión y entrega del turno a Codex

#### Lo último que se probó

**AUTORIDAD, por primera vez.** El tablero en cero lo desbloqueó. `PATCH /integracion/configuracion { modo: AUTORIDAD }` devolvió **200**: la regla que rechaza la promoción con discrepancias abiertas dejó pasar porque no hay ninguna. Estado resultante: global SOMBRA / empresa **AUTORIDAD** / **efectivo SOMBRA**.

Y ahí está el dato que conviene no olvidar: **el modo efectivo no sube porque el techo global manda**, igual que pasó con ESPEJO. Para que AUTORIDAD sea efectivo hay que poner `CARTERA_MODO=AUTORIDAD` en `backend\.env.local` y reiniciar. Es la misma trampa de ayer: se cambia la empresa, no pasa nada, y parece que está roto.

Se restauró SOMBRA. **Estado final: 0 discrepancias abiertas, outbox 25 ENVIADO sin pendientes ni fallidos.**

**Lo que NO se pudo probar:** el ajuste por devolución externa. El portal de Fineract no ofrece devolución comercial (`merchantIssuedRefund`) entre sus acciones —sólo pago, foreclosure, castigo y reversión de desembolso—, así que no hay forma de provocar el caso desde la UI disponible. La cuenta ya quedó configurada (`cuentaDevolucionExternaId` → 402.01), así que en cuanto se pueda registrar un refund en el core, el aplicador debería tomarlo.

#### Configuración que dejó Claude en la empresa de pruebas

- `cuentaCobranzaExternaId` → `608176b7` (PRUEBA POS SIN DINERO REAL)
- `cuentaDevolucionExternaId` → `66f83aed` (402.01 Devoluciones sobre ventas)
- `capacidadesValidacion` → IDENTIDAD_INE, LISTA_BLOQUEO, BURO_CREDITO, CIRCULO_CREDITO
- Flujo de validación `fbd60ae4` **ACTIVO**, 5 pasos
- Cartera SOMBRA / Contabilidad ESPEJO, ambos efectivos

#### Lo que debe hacer Codex, por orden de valor

1. **Correr `npm.cmd test` desde Windows.** Seis ficheros de pruebas escritos hoy por Claude y **ninguno ejecutado nunca**. Es lo más barato y lo más urgente. Si algo falla, es de Claude y hay que arreglarlo antes de seguir.
2. **Commitear.** Nada de hoy está en Git y se tocaron muchos ficheros. Ojo con los finales de línea mezclados.
3. **Probar el ajuste por devolución externa** si encuentra la forma de registrar un `merchantIssuedRefund` en el core.
4. **Comprobar que el asiento de cancelación de cobranza se genera solo** en una corrida limpia. El de la prueba se generó por reintento manual tras corregir un bug de fecha.
5. Los pendientes de siempre: Fineract solo, los tres modos desde la consola, **aislamiento entre dos empresas** —el que más preocupa, porque todo se ha probado con una sola y el riesgo no es que falle la sincronía, es que una empresa vea datos de otra—, mora, intereses, fallos de red tras aplicar y escenarios fiscales.

#### Trampas del entorno, para no perder tiempo

- **Las migraciones no corren solas** (`DB_MIGRATIONS_RUN=false`). Tocar una entidad sin correr la migración deja la API en 500.
- **Los techos globales mandan sobre el modo de la empresa**, y viven en `.env.local`: `CARTERA_MODO` y `CONTABILIDAD_EXTERNA_MODO`. Un cambio de modo de empresa que «no hace nada» casi siempre es esto.
- La sesión de Keycloak del ERP **caduca cada pocos minutos**; recargar `/dashboard` la refresca sin volver a entrar.
- El repo **mezcla CRLF y LF** entre ficheros. Respetar el de cada uno.

### 2026-09-15 — Claude: LAS PRUEBAS YA SE EJECUTARON. Resultado.

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

Queda un tar de trabajo en `_backups-local\claude-tests-src.tgz`, de 716 KB. Se puede borrar.

### 2026-09-15 — Claude: créditos CON INTERÉS, probados por pantalla. Primera vez.

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

### 2026-09-15 — Claude: MORA. Probada, y con un agujero encontrado y tapado.

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

**Pruebas:** las cuatro suites de Claude siguen pasando enteras, **47 de 47**, ejecutadas de verdad en el contenedor tras este cambio.

#### Estado dejado, y cómo limpiarlo

Queda **1 discrepancia abierta**, `MORA_DIVERGENTE` sobre CRD-2026-0007. Es verdadera: los dos sistemas discrepan ahora mismo. Pero nace de una limitación del montaje, no de un fallo: la cuota se atrasó **sólo en el ERP**, y Fineract sigue viendo su vencimiento en 14/11. **La coincidencia de morosidad entre los dos sistemas sigue sin probarse**, y para probarla haría falta mover también la fecha de negocio de Fineract.

Para restaurar y volver a 0 discrepancias:

```
docker exec -i syncroerp-postgres psql -U syncroerp -d syncroerp -c "UPDATE amortizacion_cuotas SET fechavencimiento = '2026-11-14', estado = 'PENDIENTE' WHERE id = '788d8d91-1ee7-4dab-89cd-6ff3da160cd4';"
```

Después, `POST /credito/cobranza/actualizar-vencidos` y una corrida de conciliación, que cerrará sola la discrepancia por el mecanismo de cierre automático.

### 2026-09-15 — Claude: DEVOLUCIÓN DE INVENTARIO. Dos hallazgos, uno de ellos gordo.

**Antes que nada, una advertencia operativa.** Estuve un rato leyendo `syncroERP\syncro-erp-backend` creyendo que era el backend vivo. No lo es: es la foto vieja en SQL Server, sin módulo `integracion` y sin nada de lo que llevamos hecho. **El que corre es `syncroERP\claude\backend`.** Lo dice el comentario de cabecera de `INICIAR_TODO.bat`; yo no lo leí y saqué conclusiones de código muerto. Una de ellas era falsa —afirmé que el asiento de merma era fire-and-forget— y en el árbol vivo está bien resuelto, encolado dentro de la transacción. Si vas a leer código, empieza por comprobar que el archivo tiene `cancelarPago` o `MORA_DIVERGENTE`; si no los tiene, estás en el árbol equivocado.

#### Montaje

Primer producto **físico** del sistema: `INV-CLAUDE-001` TERMO ACERO 1L, 10 piezas, costo 120, precio 200, categoría PRUEBA POS CODEX, almacén único. Venta por POS a crédito al cliente sintético: **ticket #7**, **CRD-2026-0008** por 200, y el outbox mandó `CREDITO_ORIGINADO` → **préstamo 12 en Fineract**. Inventario 10 → 9, movimiento SALIDA con costo unitario 120. Hasta ahí, correcto.

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

**Mitigación aplicada:** se agregó `$env:TZ='UTC';` a la línea que levanta el backend en `INICIAR_TODO.bat` (original guardado como `INICIAR_TODO.bat.bak-claude`). Alinea el proceso Node con la base sin tocar esquema y corrige las 199 columnas de golpe. Requiere reiniciar con `/reiniciar`. **El arreglo de fondo sigue pendiente: migrar las 199 columnas a `timestamptz`.**

#### Detalles menores, pero reales

- **El asistente de devolución pide el UUID de la venta a mano.** No hay búsqueda por folio de ticket ni por cliente. Ningún cajero se sabe un UUID.
- `categorias.service.ts → autoConfigurarCuentas` resuelve las cuentas **por prefijo de número** (`porPrefijo('4')`, `porPrefijo('5')`, `porPrefijo('13')`) e **ignora `rolSistema`**, que ya etiqueta de forma inequívoca INVENTARIO y COSTO_VENTAS. Aquí acertó porque existen 115.01 y 501.01 exactas, pero con otro catálogo el fallback de un solo dígito toma la primera cuenta que encuentre, sin orden definido.
- **Un crédito que deja de tener cuotas vencidas no vuelve a ACTIVO.** `cobranza.service.ts → actualizarVencidos` sólo escala: marca VENCIDO y nunca desmarca. El único camino de vuelta es `registrarPago`, que sí recalcula bien. Tras restaurar la cuota de CRD-2026-0007, el crédito quedó en VENCIDO con `vencido: 0`. La disponibilidad no se deja engañar —calcula la mora por fecha en tiempo real y devolvió `puedeComprarCredito: true`—, así que el POS no bloquea; pero el estado que ven las pantallas, la cartera vencida y las provisiones dice otra cosa.

#### Estado dejado

- Producto `INV-CLAUDE-001` con 9 piezas, 115.01 en −120.
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
- Producto `INV-CLAUDE-001`: 9 piezas. **115.01 en −120, que es exactamente el hallazgo 1**: nunca se asentaron las 1,200 de la entrada inicial.
- Préstamos 12 y 13 cerrados en Fineract; CRD-2026-0008 y CRD-2026-0009 LIQUIDADOS.

**Queda pendiente del orden acordado: el modo Fineract solo (#4), sin ninguna cobertura todavía.** Y sigue abierto el aislamiento multi-empresa, que es el riesgo más alto y necesita una segunda empresa.

### Codex — cierre de conciliación contable, 15 septiembre 2026

Leer VALIDACION_CONCILIACION_CONTABLE.md: implementación, pruebas21/21, consulta real final15 pólizas/1 reversa, aviso deduplicado y limitaciones. Las47 pruebas nuevas de Claude también pasan. Su relevo reciente se leyó, pero su bloque financiero aún requiere revisión: sincronización inicial incluye pagos cancelados; ajuste externo guarda ID numérico en UUID y no es atómico con su vínculo; revisar atomicidad de cancelarPago/tesorería. No se publicará ese bloque como validado sólo porque pasen sus pruebas. Se conserva todo sin borrar ni resetear. Próximo paso: corregir esas rutas antes de nuevas pruebas AUTORIDAD/reflejo.

### 2026-09-15 — Claude: MODO ERP SOLO, probado de verdad. Y el camino de alta posterior.

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

Ya está puesto, con el valor original comentado encima y copia en `.env.local.bak-claude`. **Pero requiere reinicio completo del backend**: se comprobó que el `--watch` NO relee `.env.local` —dotenv no pisa variables ya presentes en el entorno del proceso padre, y ese entorno sobrevive al reinicio del watch—. Tocar un `.ts` no basta; hay que cerrar la ventana y volver a lanzar.

**Al terminar la prueba de AUTORIDAD hay que devolver `CARTERA_MODO=SOMBRA`.**

#### Un susto que no era

`disponibilidad` devolvió `consultadoEn: 2026-09-15T14:59Z` y parecía doce horas en el futuro. No lo era: ya es la mañana del 15 en México, 08:59 locales. Lo anoto porque estuve a punto de reportarlo como defecto; conviene comprobar la hora real antes de gritar.

### 2026-09-15 — Claude: AUTORIDAD. El modo funciona, pero nadie lo consulta.

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

- `CARTERA_MODO=SOMBRA` devuelto en `.env.local` (copia en `.env.local.bak-claude`). **Surte efecto al próximo reinicio completo**; mientras tanto la empresa está en SOMBRA, así que el modo efectivo ya es el correcto.
- Empresa en `SOMBRA` / `ESPEJO`.

#### Corrección de una nota anterior

En el relevo de la mora escribí que el botón «Registrar Crédito» deshabilitado **no se veía deshabilitado**. Hoy sus clases sí incluyen `disabled:opacity-50 disabled:cursor-not-allowed`. O me equivoqué al leerlo entonces, o el código cambió desde. **Que nadie actúe sobre esa nota sin reproducirla primero.**

### 2026-09-15 — Claude: pruebas verdes tras los cambios de hoy, y la puerta de aprovisionamiento

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

`_backups-local\jest.claude.config.js.borrar` y `_backups-local\src-hoy.tgz` son míos y se pueden borrar. No pude borrarlos yo: desde este entorno no tengo permiso de borrado sobre la carpeta.

### 2026-09-15 — Claude: aislamiento multi-empresa, primeros resultados

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
- `_backups-local\jest.claude.config.js.borrar` y `_backups-local\src-hoy.tgz`.

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

### 2026-09-15 — Claude: FINERACT CAÍDO en modo SOMBRA. Pasa, y pasa bien.

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

### 2026-09-15 — Claude: el flujo de verificación, ya con pantallas

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

Archivos: `app/dashboard/clientes/page.tsx` (respaldo en `page.tsx.bak-claude`).

#### Estado dejado

- Flujo activo: **«PRUEBA CLAUDE - Originacion con tope automatico»**, tope $10,000, puntaje mínimo 60. El anterior quedó inactivo.
- CLIENTE SINTETICO tiene un expediente real en REVISION_MANUAL por $1,200.
- Expedientes simulados del cliente de prueba de Fineract: uno APROBADA y uno RECHAZADA.

#### Sigue pendiente

- **La consola SUMA.** Tiene una pantalla que se autodiagnostica y dice ítem por ítem qué falta: variables, **realm `suma-consola` en Keycloak**, grupo `/operadores`, provisionador de identidades y enlace con el ERP. Lo de Keycloak es del usuario —son cuentas y seguridad—; lo demás se puede llenar.
- El modo degradado en AUTORIDAD (`degradado` nunca visto en `true`).
- Cablear la disponibilidad externa al POS (defecto 3.8).

### 2026-09-15 — Claude: la pantalla de clientes, rediseñada. Y la validación como servicio transversal.

El usuario señaló el orden invertido: **la verificación sólo se podía hacer cuando el cliente ya existía**, y el límite de crédito era la «sección 4» del alta, invitando a teclear una cifra antes de haber validado nada. Y añadió la restricción que faltaba: **no todo cliente pide crédito** —muchos compran de contado y no tienen por qué pasar por identidad ni por buró—, así que registrar a alguien no puede ser un trámite de crédito.

#### Lo que se cambió

**El crédito salió del alta.** El panel de línea de crédito sólo aparece al **editar** un cliente que ya existe. Dar de alta captura identidad, contacto y domicilio, y nada más. Abrir una línea es un acto aparte: primero existe la persona, después —si lo pide— se le verifica, y sólo entonces se propone un importe.

**El panel muestra el ciclo**, con el paso alcanzado en verde y el que falta en gris:

> Solicitud › Verificación › Propuesta › Autorizada

y va rotulado **«Opcional · sólo si la solicita»**, para que quede claro que un cliente de contado no pasa por aquí.

**La lista dice la verdad sobre la etapa.** Antes la columna «Ciclo / riesgo» pintaba el campo `etapaComercial`, que **nadie mantiene**: decía PROSPECTO incluso para un cliente con línea autorizada de $1,200 vigente. Ahora la columna «Etapa» deriva la relación de los hechos —Cliente con línea, Línea suspendida, Crédito rechazado, En aprobación, Sin crédito— y el riesgo baja a una línea secundaria. Y **«Solicitud NINGUNA» se dejó de pintar**: un estado vacío repetido en cada renglón no informa, tapa.

**Queda un defecto para el backend:** `etapaComercial` sigue sin que nadie lo mueva. La pantalla dejó de mostrarlo porque mostrarlo era mentir, pero el campo debería mantenerse al autorizar una línea o al primer movimiento del cliente. Está anotado en el comentario de la columna.

Archivos: `app/dashboard/clientes/page.tsx` (respaldo `page.tsx.bak-claude`).

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

### 2026-09-15 — Claude: fuera RENAPO del alta, y el expediente único del cliente

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

### 2026-09-15 — Claude: la cartera de clientes deja de ser una tabla

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
| `app/dashboard/clientes/page.tsx` | Panel de dos columnas; respaldo en `page.tsx.bak-claude` |
| `components/clientes/expediente-cliente.tsx` | **Nuevo**, componente compartido |
| `app/dashboard/clientes/[id]/expediente/page.tsx` | Reescrita para consumir el componente |

### 2026-09-15 — Claude: revisión de usuarios y roles, ERP ↔ Keycloak ↔ Fineract

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
