

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
