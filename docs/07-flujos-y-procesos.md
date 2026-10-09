# 07 · Flujos y procesos, paso a paso

**Revisión:** 8 de octubre de 2026
**Para:** usuarios finales, quien los capacita y quien recibe el sistema.

> Cada flujo de este documento está **ejercido contra el sistema corriendo o
> leído del código que se despliega**. Los mensajes que aparecen entre comillas
> son literalmente los que verás en pantalla.

**Compras y nómina tienen su propio manual**, en `04-compras-y-nomina.md`.
**El alcance de cada rol** está en `03-manual-por-rol.md`.

---

## Cómo leer este documento

Cada proceso se cuenta igual:

- **Quién lo empieza** y desde qué pantalla.
- **Los pasos**, con el estado en que queda el documento después de cada uno.
- **Quién firma**, cuando hace falta una segunda persona.
- **Qué te va a negar el sistema**, con el texto exacto y el motivo.

Esa última sección es la que más se usa en el día a día. Un ERP no se aprende
por lo que deja hacer, sino por lo que no deja y por qué.

### Una regla que atraviesa todo el sistema

**Quien captura no autoriza.** Aparece en ocho lugares distintos y siempre
significa lo mismo: la persona que registra un documento no puede ser la que lo
firma. No es rigidez; es lo que hace que una firma valga algo.

Cuando el sistema te lo dice, no estás ante un error de permisos: estás ante un
control funcionando. La respuesta correcta nunca es pedir más permisos, sino
que firme quien le toca.

---

# 1 · Vender en mostrador

**Quién:** `empleado`. **Dónde:** Punto de venta.

## Los pasos

| # | Qué pasa | Estado de la venta |
|---|---|---|
| 1 | Eliges la caja donde vas a cobrar | — |
| 2 | Agregas productos al carrito | — |
| 3 | Eliges método de pago y cobras | **COMPLETADA** |

La venta **nace completada**. No hay borrador ni pendiente: o se cobró o no
existe.

## Lo que la caja decide por ti

Al elegir la caja quedan fijados **el almacén de donde sale la mercancía y la
lista de precios** con la que vendes. No son campos que el cajero escoja.

Es deliberado: quien vende no decide desde qué almacén se descuenta ni a qué
precio se factura. Si cambias de caja con el carrito lleno y esa caja vende
desde otro almacén o con otra lista, el sistema te lo dice:

> «Vacía el carrito antes de cambiar de caja: ésta vende desde otro almacén o
> con otra lista de precios, y el stock y los precios ya fueron confirmados.»

## Lo que pasa solo al cobrar

- Se **descuenta la existencia** del almacén de la caja, por lote y con su costo.
- Se registra el **movimiento de tesorería** y, si la cuenta es una caja, el
  **movimiento de caja**.
- Se **encola la póliza contable**. Si la contabilidad no puede generarse en ese
  momento, la venta igual se cobra y el asiento queda en
  **Finanzas → Asientos pendientes**. Nunca se pierde una venta por un problema
  contable.
- Si la venta es a crédito, nacen el **crédito y su tabla de amortización** en la
  misma operación.

## Qué te va a negar el sistema

| Si intentas… | Te dirá | Por qué |
|---|---|---|
| Cobrar en efectivo sin abrir caja | «No existe un turno abierto para la caja seleccionada. Abre la caja antes de cobrar o reembolsar efectivo.» | El efectivo tiene que caber en un arqueo |
| Cobrar más de lo que hay | «Disponibilidad insuficiente. Física: …, reservada: …, bloqueada: …» | Te dice **por qué** no alcanza, no sólo que no alcanza |
| Vender un producto sin precio | «… no tiene precio en la lista aplicable. En este ERP el precio de venta vive en las listas de precios» | El precio no se teclea en la venta |
| Recibir menos efectivo que el total | «El monto recibido debe cubrir …» | — |
| Vender a crédito sin cliente | «Una venta a crédito requiere seleccionar un cliente.» | No hay crédito sin a quién cobrarle |
| Pasarte del crédito del cliente | «Crédito global insuficiente. Disponible: …; solicitado: …» | Con la cifra, para que sepas cuánto falta |
| Aplicar un descuento | «… no se puede aplicar. Tu perfil no tiene descuento autorizado. En este ERP el precio de venta lo fijan las listas de precio…» | El descuento no se autoriza en el mostrador |

---

# 2 · Devolver una venta

**Quién la captura:** `empleado`. **Quién la firma a partir de $5,000:**
`gerencia` o `direccion`.

## Los pasos

1. Abres la venta y eliges qué renglones se devuelven y cuántas piezas.
2. Dices **en qué condición vuelve** cada producto:
   - **reintegrable** — vuelve a su lote y a su costo original;
   - **dañado** — entra y sale por merma, para que quede el rastro;
   - **no reintegrable** — no toca existencias, sólo el importe.
3. Eliges el **destino del importe**: reembolso, o saldo a favor del cliente.
4. La venta queda **PARCIALMENTE_DEVUELTA** o **DEVUELTA**.

## Qué te va a negar el sistema

| Si intentas… | Te dirá |
|---|---|
| Devolver después de 30 días | «La venta tiene N días y la política permite devoluciones hasta 30 días.» |
| Devolver en un mes ya cerrado | «El periodo contable MM/AAAA está cerrado. No se puede registrar la devolución.» |
| Devolver más de lo vendido | «…: sólo quedan N unidades disponibles para devolver.» |
| Reembolsar en efectivo desde un banco | «Un reembolso en efectivo debe salir de una cuenta de tipo CAJA.» |
| Devolver $5,000 o más sin ser gerencia | «La devolución por $… requiere autorización de supervisor porque supera el umbral de $5,000.» |
| Devolver a existencia algo cuya salida no identifica lote | «…: la salida histórica no identifica lote. Usa "No reintegrable" o regulariza el movimiento…» |

> **El umbral se configura.** `DEVOLUCIONES_MONTO_APROBACION` cambia la cifra y
> `DEVOLUCIONES_ROLES_AUTORIZADORES` quién puede firmarla.

## Si la venta estaba facturada

La nota de crédito se genera sola. Si el PAC falla, la devolución **igual se
registra** y queda pendiente de timbrar, con aviso:

> «La devolución fue confirmada; la nota de crédito quedó pendiente para
> reintento desde Facturación.»

---

# 3 · Anular una venta

**Quién:** sólo `gerencia`, `direccion` o el administrador. **Por cualquier
importe.**

El umbral de anulación es **cero a propósito**: anular elimina la venta entera,
y eso no está al alcance de un cajero por ningún monto. Un cajero que se
equivocó hace una **devolución**, no una anulación.

## Qué te va a negar el sistema

Anular está lleno de puertas cerradas, y todas por la misma razón: **si la venta
ya movió dinero de otro, anularla dejaría un descuadre.**

| Si intentas… | Te dirá |
|---|---|
| Anular sin motivo | «Indica el motivo de la anulación. Queda en la bitácora y en la póliza de reversión.» |
| Anular una venta con devoluciones parciales | «…Devuelve el remanente desde el módulo de devoluciones; no puede anularse completa.» |
| Anular una venta a crédito ya liquidada | «…Anular dejaría un pago sin documento que lo respalde.» |
| Anular una venta a crédito con enganche o abonos | «…Debe procesarse como devolución con reembolso para no dejar CxC, caja e IVA inconsistentes.» |
| Anular una venta anterior al costeo por lote | «…no existe registro de a qué lote ni a qué costo salió la mercancía, así que el sistema no puede reintegrarla sin corromper la valuación.» |

Ese último mensaje además **te dice qué hacer**: registrar la entrada a mano
desde Inventario → Ajustes y después anular, o procesar una devolución
indicando el lote.

## Una puerta que se abrió, y por qué se podía abrir

**Hasta el 5 de octubre de 2026, una venta pagada en parte con saldo a favor del
cliente no se podía anular.** El sistema decía:

> «Anularla dejaría ese saldo sin restituir y la cuenta de cobro descuadrada.
> Regístralo como devolución total.»

Y tenía razón **para el código que había**: la póliza de reversión se calculaba
de nuevo en vez de contrarrestar la de la venta, así que no sabía del saldo a
favor y abonaba el total a la cuenta de cobro. El pasivo con el cliente quedaba
sin cancelar.

Hoy la reversión **espeja la póliza original** —devuelve cada peso a la cuenta de
la que salió— y además el saldo vuelve al auxiliar del cliente, que es el que
dice cuánto le queda. Hechas las dos mitades, el motivo del bloqueo desapareció y
el bloqueo con él.

**Lo que esto significa para quien opera:** una venta con saldo a favor ya se
anula como cualquier otra, y el cliente recupera su saldo en el mismo momento.
Se ve en Catálogos → Clientes, en el movimiento de saldo a favor, con el
concepto «Restitución por anulación de la venta #N».

## Lo que pasa al anular

Se reintegra la mercancía **al lote y al costo originales**, se cancela el
crédito, se revierte el movimiento de caja, **se le devuelve al cliente el saldo
a favor que la venta había consumido**, se genera una **póliza de reversión**
—no se edita la original, se contrarresta— y se cancela el CFDI con motivo SAT
`03`.

Esa póliza de reversión es el espejo exacto de la de la venta: las mismas
cuentas, los mismos importes, los lados invertidos. No vuelve a decidir a qué
cuenta va cada peso, porque la póliza original ya lo dice. Eso es lo que hace que
el enganche vuelva a caja, que el IVA se reparta entre cobrado y no cobrado igual
que al vender, y que el saldo a favor se restituya sin que nadie tenga que
acordarse.

---

# 4 · Facturar (CFDI 4.0)

**Quién:** `empleado`, `finanzas`, `contador`.

## Antes de la primera factura

Tres cosas que sin ellas no se timbra nada, y conviene tenerlas listas el día
uno:

1. **Datos fiscales de la empresa**, en Configuración.
2. **El PAC conectado.** Sin usuario y contraseña del PAC: «Falta conectar el
   PAC antes de timbrar.»
3. **Cada producto con sus claves SAT y su impuesto asignado.**

Ese tercer punto es el que más detiene una puesta en marcha. El sistema no
adivina:

> ««Martillo» (SKU-01) no se puede facturar: le falta la clave de producto y la
> clave de unidad del catálogo SAT. Se captura en la ficha del producto, en
> Costos y precios.»

Y sobre el impuesto es aún más explícito, porque el error silencioso sería peor:

> «…nadie ha declarado qué impuesto lleva. **Sin impuesto asignado se factura con
> IVA cero, que no es lo mismo que exento ni que tasa 0 %.**»

## Lo que el sistema decide solo

- **PUE o PPD** según el método de pago: contado es PUE; crédito es PPD con
  forma de pago `99`.
- **La tasa sale del impuesto del producto**, nunca deducida del importe. Un
  producto exento y uno a tasa 0 % no se facturan igual aunque el importe
  coincida.
- **El folio fiscal** se reserva bajo llave, de modo que dos cajas cobrando a la
  vez no pueden repetirlo.

## Complemento de pago (REP)

Cada abono de un crédito con factura PPD genera su complemento. Dos reglas que
verás:

> «Primero debe timbrarse la factura PPD de la venta.»

> «Existe un pago anterior sin complemento. Los REP deben generarse en orden
> cronológico.»

La segunda es del SAT, no del ERP: los complementos llevan número de
parcialidad, y saltarse uno rompe la serie.

---

# 5 · Mover mercancía entre almacenes

**Quién la pide:** `almacenista`. **Quién la autoriza y quién la recibe:**
`gerencia` o `direccion`.

## Los pasos, y por qué son cuatro

| # | Acción | Estado | Quién |
|---|---|---|---|
| 1 | Solicitar | **SOLICITADA** | almacenista |
| 2 | Autorizar | **AUTORIZADA** | gerencia / dirección |
| 3 | Enviar | **EN_TRANSITO** | almacenista |
| 4 | Recibir | **RECIBIDA** | quien no envió |

Dos firmas distintas, y las dos las hace cumplir el sistema:

> «Quien solicita la transferencia no puede autorizarla.»

> «Quien envía la mercancía no puede registrar su recepción.»

La segunda importa más de lo que parece: mientras la mercancía está
**EN_TRANSITO** ya salió del origen y todavía no llegó al destino. Si el mismo
que la envió pudiera darla por recibida, esa mercancía existiría sólo en su
palabra.

> **No hay atajo.** La transferencia de un paso, sin firmas, está cerrada para el
> almacén. Quien necesite moverla de golpe lo hace como administrador y queda
> anotado.

## Conteo físico

Lo captura el almacén; **lo cierra gerencia**. Las diferencias se convierten en
entradas o salidas de ajuste con su póliza, y quien contó no es quien acepta la
diferencia.

## Entrada y salida rápidas desde el catálogo

En **Productos → Catálogo**, cada renglón tiene dos iconos: uno verde para
**entrar** mercancía y uno ámbar para **sacarla**. Sirven para lo que no llega
por una orden de compra ni se va por una venta: la caja que apareció sin
papeles, la pieza que se usó internamente, el faltante que alguien detectó.

**Lo que hacen, y lo que ya no te puede pasar:**

| | Qué mueve | Qué deja en los libros |
|---|---|---|
| Entrada (verde) | sube la existencia y el valor del almacén | una póliza que carga inventario y abona la cuenta de diferencias |
| Salida (ámbar) | baja la existencia y el valor | una póliza que carga costo de ventas y abona inventario |

Las dos quedan en el kardex **con tu nombre**. Y el motivo que escribes viaja al
concepto de la póliza, así que el contador lee en el libro lo mismo que tú
escribiste en la pantalla.

> **Hasta el 5 de octubre de 2026 estas dos puertas movían el valor del
> inventario sin generar ninguna póliza y sin guardar quién lo hizo.** El
> almacén cuadraba y la contabilidad no, y el kardex mostraba el movimiento con
> la columna de usuario vacía. Está corregido, pero si tu base tiene
> movimientos anteriores a esa fecha hechos por aquí, su contrapartida no
> existe: hay que buscarlos en el kardex y asentarlos a mano.

**Por qué la salida va a costo de ventas y no a mermas.** Una merma es una
pérdida que alguien declara como tal, y para eso está **Inventario → Ajustes**,
que sí la manda a la cuenta de mermas. La salida del catálogo no declara nada
—puede ser una muestra, un consumo o un faltante—, así que su valor va a costo
de ventas. De ese modo la cuenta de mermas sigue diciendo sólo lo que de verdad
se echó a perder, que es lo que el contador mira para decidir si hay un problema
en el almacén.

> **Qué te va a negar el sistema.** Una entrada cuyo producto no tiene costo de
> compra capturado: «el costo de entrada debe ser mayor a cero». Y cualquiera de
> las dos si la categoría del producto no tiene configuradas sus cuentas
> contables: el movimiento entra, y su póliza queda **fallida en la bandeja de
> asientos pendientes** nombrando qué cuenta falta. Nunca se contabiliza a
> medias.

---

# 6 · Abrir, cobrar y arquear la caja

**Quién:** `tesoreria` abre y cierra; `empleado` cobra. **Dónde:** Tesorería →
Caja, corte y arqueo, y el Punto de venta.

Este flujo está probado con **dos cajas abiertas a la vez** y una ráfaga de seis
cobros simultáneos, tres por caja: folios 4 a 9, sin repetidos y sin huecos.

## Cómo está armado

Una **caja** es una cuenta bancaria de tipo CAJA, con su cuenta contable y, si
se quiere, su almacén y su lista de precios: el punto de venta las obedece.

Un **turno** se abre por caja, con su fondo inicial. La apertura corre con un
candado por caja, así que **dos personas no pueden abrir dos turnos sobre el
mismo cajón**, ni aunque pulsen al mismo instante.

## Los pasos

| # | Quién | Qué pasa |
|---|---|---|
| 1 | tesorería | Abre el turno de cada caja y declara su fondo inicial |
| 2 | empleado | Elige su caja en el punto de venta y cobra |
| 3 | tesorería | Registra entradas y retiros manuales, si los hay |
| 4 | tesorería | Cuenta el cajón y cierra |

## Varias cajas a la vez

El punto de venta propone la caja marcada «por omisión» de la empresa, que es
**la misma en todas las terminales**. Con tres mostradores, eso significa que
los tres cobrarían contra el mismo turno si nadie mira.

Dos cosas lo evitan, y conviene conocerlas:

- **La terminal recuerda su caja.** El cajón es del mostrador físico, no de la
  empresa. La de omisión sólo se propone en una terminal que no ha elegido
  nunca. Si una terminal se reinstala, vuelve a proponer la de la empresa.
- **El turno dice de quién es.** Bajo el desplegable sale «Turno abierto por
  Fulano · desde las 11:58», y **en ámbar cuando no eres tú**, con el remedio:
  «Si tu efectivo va a otro cajón, elige tu caja antes de cobrar».

**No se bloquea.** Hay mostradores donde se relevan en el mismo cajón y eso es
legítimo. Se dice, que es lo que permite darse cuenta antes de cobrar.

## Contar el cajón

El arqueo no pide un número: pide **el conteo por montones**, con las
denominaciones de México —billetes de $1,000 a $20, monedas de $20 a 50¢—, el
parcial de cada montón al lado y el total abajo.

Se hace así porque quien cuenta hacía la suma de cabeza o en el teléfono, y
cualquier error de esa suma se convierte en un faltante contabilizado a su
nombre; después nadie puede reconstruir si faltaba dinero o faltaba un cero.

Mientras el conteo por montones está abierto, **el total no se teclea: es el
resultado**. Dos cifras que pueden decir cosas distintas en la misma pantalla
son peor que una mal tecleada: la segunda se descubre, la primera se discute.

> El billete y la moneda de $20 se cuentan por separado. Valen lo mismo y
> conviven en el cajón; con una sola casilla, teclear unos borraría los otros.

## La diferencia se dice antes de cerrar

En cuanto hay una cifra contada, la pantalla resta: «**FALTAN $20.00**: cuentas
$130.00 y se esperaban $150.00», y dice qué va a pasar con la diferencia.

Esto importa porque **cerrar un turno no se deshace**, y si el conteo no cuadra
el sistema levanta una póliza de faltante o sobrante **a nombre de quien
cerró**. Enterarse después no sirve de nada.

Si hay diferencia, las observaciones son obligatorias. No es burocracia: es el
único sitio donde queda escrito por qué.

## Qué te va a negar el sistema

| Mensaje | Qué significa | Qué hacer |
|---|---|---|
| «Esta caja no tiene turno abierto: ábrelo en Tesorería → Caja, corte y arqueo antes de cobrar en efectivo.» | Correcto. Sin turno no hay dónde registrar el efectivo | Que tesorería abra el turno |
| Cerrar con el conteo por montones abierto y sin teclear una sola pieza | Se rechaza. Cerrar con cero contabilizaría **todo** el efectivo esperado como faltante | Si el cajón está vacío de verdad, se declara escribiendo un 0 |
| «Ya existe un turno abierto para esta caja» | Correcto, y es el candado | Usar el turno abierto, o cerrarlo antes |
| El desplegable de contrapartida sin cuentas de mayor | Correcto. «100 · Activo» no recibe pólizas | Elegir una cuenta de detalle |

## Lo que queda anotado

- **El cajero no puede abrir su propio turno** desde el punto de venta: el fondo
  inicial y el cierre son de tesorería. Es una decisión —abrir un turno es
  declarar un fondo—, pero con tres mostradores alguien tiene que abrir tres
  turnos cada mañana.
- El reparto de caja por terminal se guarda en el navegador de esa terminal.

---

# 7 · Vacaciones

**Quién la captura:** `rrhh`. **Quién la autoriza:** `gerencia`.

## Los pasos

| # | Qué pasa | Efecto en el saldo |
|---|---|---|
| 1 | RRHH captura la solicitud | días a **RESERVADOS** |
| 2 | Gerencia aprueba | RESERVADOS → **DISFRUTADOS** |
| 3 | Nace sola la incidencia de nómina | se paga en el periodo que la contiene |

## Las tres reglas de ley que el sistema aplica solo

1. **El derecho nace al año** (LFT art. 76). Antes de eso la pantalla lo dice con
   fecha: «Las vacaciones nacen al cumplir el primer año de servicios (LFT art.
   76). Este empleado lo cumple el AAAA-MM-DD.»
2. **Sólo se descuentan días laborables.** El domingo no cuenta (art. 69), y
   tampoco los días de descanso obligatorio del art. 74 —incluido el traslado de
   tres de ellos al lunes por el decreto de 2006—.
3. **La prima vacacional es el 25 %** y se paga sola (art. 80), exenta hasta 15
   UMA al año (LISR art. 93-XIV). No se captura en ninguna parte: sale de la
   incidencia.

## Qué te va a negar el sistema

> «Quien solicita vacaciones no puede aprobarlas.»

Si eres quien la capturó, no la firmas. Que la firme gerencia, o la otra persona
de Recursos humanos.

---

# 8 · Incidencias de nómina

**Quién las captura:** `rrhh`. **Quién las autoriza:** `gerencia` o `direccion`.

Una incidencia mueve dinero de alguien: una falta le quita días de sueldo, unas
horas extra se los suman. Por eso:

> «Quien registra una incidencia no puede aprobarla. Debe autorizarla Gerencia u
> otra persona de Recursos humanos.»

## Los estados, y qué significa cada uno en la pantalla

| Estado | Qué quiere decir |
|---|---|
| *(sin marca)* | Pendiente de aprobar. Cuenta en el indicador |
| **Aprobada** | Firmada, esperando el cálculo de nómina |
| **En nómina** | Ya movió un recibo |
| **Rechazada** | Resuelta en contra. No descuenta nada |
| **Cancelada** | Retirada después de aprobada. No descuenta nada |

Los indicadores de arriba cuentan **sólo lo que sigue vivo**: una incidencia
rechazada o cancelada no aparece en «Pendientes de aprobar» ni suma días en
«Días no pagados». Ese número y el de la nómina siempre dicen lo mismo.

## La que llega tarde

Si se aprueba una incidencia cuyo periodo **ya se pagó**, no se pierde: se
aplica **retroactivamente** en el siguiente periodo que se calcule, con su propio
renglón en el recibo y sus fechas:

> `Faltas de periodos anteriores (2026-09-30)`

No se esconde restando días del sueldo del mes, porque entonces el recibo diría
que se trabajaron menos días de los que se trabajaron.

---

# 9 · Correr la nómina

**Quién:** `rrhh`. **Quién firma el periodo:** `gerencia` y `direccion`.

## Los pasos

1. **Crear el periodo** — número, fechas y fecha de pago.
2. **Calcular** — trae a todos los empleados vigentes del periodo.
3. **Revisar las alertas**, si las hay.
4. **Aprobar, timbrar, dispersar y contabilizar.**

## El cálculo se niega si hay algo sin resolver

> «Hay N incidencias del periodo pendientes de resolución.»

Es a propósito: una nómina calculada con incidencias a medio firmar es una
nómina que habrá que recalcular.

## Las alertas dicen la dirección del error

No se limitan a avisar que algo no cuadra; dicen hacia dónde y qué implica:

> «SBC: el expediente informa $495.00 sin validar y la nómina cotiza con $472.19
> (mínimo de ley). **El informado es MAYOR que el calculado, así que si es el que
> está registrado ante el IMSS se estarían enterando cuotas de menos.** Valida el
> SBC en la ficha del empleado antes de timbrar y de enviar el SUA.»

---

# 10 · Cuando el sistema te dice que no

Tres respuestas distintas que conviene no confundir:

| Lo que lees | Qué significa | Qué hacer |
|---|---|---|
| «Tu perfil no incluye esta acción. Pide acceso al administrador.» | **Permiso.** Tu rol no tiene esa pantalla o ese botón | Pedir el acceso, si de verdad te toca |
| Un mensaje que explica una regla —«Quien solicita… no puede…», «La venta tiene N días…» | **Regla de negocio.** Tu permiso está bien | Que firme quien le toca, o corregir el documento |
| «No hay conexión con el servidor.» | El backend no responde | Avisar a sistemas |

La diferencia entre las dos primeras es la que más tiempo ahorra. **Si el
mensaje te explica una regla, pedir más permisos no sirve de nada**: el sistema
no te está negando el acceso, te está diciendo que esa operación necesita a otra
persona.
