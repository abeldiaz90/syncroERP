# 08 · El portal de Fineract, paso a paso

**Revisión:** 13 de octubre de 2026
**Para:** quien opera crédito y captación, y quien los capacita.
**Dónde:** el portal, aparte del ERP. En la instalación local, en el puerto 3002.

> Lo que está aquí se leyó del código que se despliega: las ocho áreas del menú,
> los comandos que el portal deja ejecutar sobre un crédito y el permiso que
> cada uno exige. Lo que **todavía no** está aquí, y se dice sin rodeos, son los
> recorridos con capturas pantalla por pantalla: eso va en la siguiente
> revisión, igual que se hizo con los flujos del ERP.

**El estado real de cada dominio** —qué está completo, qué parcial y qué falta,
dominio por dominio— lo mantiene el equipo en
`fineract/docs/FINERACT_UI_COVERAGE.md`, medido contra la instancia corriendo.
Este documento no lo repite: una segunda copia de ese estado envejecería, y
entonces habría dos verdades.

---

## Qué es el portal, y qué no es

Apache Fineract es el **core bancario**: lleva clientes, créditos, ahorro,
depósitos, acciones y su contabilidad. El portal es la pantalla con la que SUMA
lo opera, en español y con los controles que una institución mexicana necesita.

Dos cosas que conviene tener claras desde el primer día:

- **El portal no guarda nada propio.** Todo vive en Fineract. El portal valida,
  traduce y normaliza los errores del core, pero el dato es del core.
- **El portal no es un proxy abierto al core.** Cada operación pasa por un
  endpoint propio que comprueba la sesión, valida lo que entra y exige el
  permiso de Fineract que corresponde. Una consola que mandara llamadas
  arbitrarias al core sería más corta de escribir y una superficie de riesgo
  mucho mayor; está decidido que no se hace.

### La sesión caduca por inactividad, y lo dice

La sesión inactiva del directorio está en **30 minutos**, y el portal sólo
renueva su token cuando llega una petición. Un portal abierto sin usarse pasado
ese plazo vuelve al acceso **por sí solo**; eso no es una avería, pero una
pantalla de acceso que aparece sola se lee como si algo se hubiera roto, así que
lo dice:

![La pantalla de acceso explica que la sesión caducó por inactividad y qué se perdió.](img/portal-sesion-caducada-lo-dice.png)

Lo guardado está guardado; lo que se estuviera capturando sin guardar hay que
volver a escribirlo. **Los 30 minutos son una decisión de operación**: para un
mostrador son cortos, y se cambian en el directorio, no en el portal.

### Y el ERP, ¿dónde queda?

El producto se vende de tres formas —sólo ERP, sólo Fineract, ERP + Fineract—.
Cuando van juntos, el reparto es:

| Lo que se pregunta | Quién lo contesta |
|---|---|
| Qué le vendí a este cliente | El ERP |
| Cuánto me debe y en qué plan de pagos | Fineract |
| Qué cobré hoy en el mostrador | El ERP |
| Qué cobré hoy de cartera | Fineract |
| La póliza de todo eso | El ERP, con el espejo contable del core |

El detalle de la integración está en `02-arquitectura.md`, y cómo se da de alta
una institución en `05-aprovisionamiento-y-consola-suma.md`.

---

## Las ocho áreas del menú

| Área | Qué se hace ahí |
|---|---|
| **Inicio** | Mi jornada, mis pendientes, notificaciones y la búsqueda global |
| **Personas** | Clientes, grupos y centros. El expediente: identificadores, domicilios, familiares, garantías, notas y documentos |
| **Crédito** | Cartera y originación, cobranza, hoja de cobranza, cartera vencida, riesgo y provisiones |
| **Captación** | Centro de captación, cuentas de ahorro, depósitos a plazo, depósitos recurrentes y acciones |
| **Operación** | Centro de operaciones (transferencias e instrucciones permanentes) y caja y tesorería |
| **Control** | Mesa de control, reportes y contabilidad |
| **Productos** | Las definiciones: crédito, ahorro, plazo fijo, recurrente y acciones |
| **Administración** | Configuración institucional: oficinas, personal, usuarios, roles, catálogos, día operativo, trabajos, integraciones |

### Mi jornada, que es por donde se empieza

La bandeja ordena lo que requiere intervención por prioridad, y cada renglón
lleva su acción a la derecha:

![La bandeja operativa, con cada pendiente en un renglón y su acción a la derecha.](img/portal-bandeja-enlace-en-una-linea.png)

### Un cero también se dice

Las franjas de indicadores **esconden las métricas en cero** —en una institución
en marcha la mayoría lo están, y llenaban la parte de arriba de tarjetas que
sólo confirmaban que no había nada que hacer—. Cuando esa franja **es** toda la
sección, esconderla dejaría un hueco que se lee como una pantalla a medio
cargar, así que en su lugar se dice con palabras:

![El Centro de operaciones dice «hoy no hay movimiento» en vez de dejar la sección vacía.](img/portal-operacion-de-hoy-sin-movimiento.png)

El menú **no enseña lo que no se puede abrir**: cada entrada depende de los
permisos de la sesión en Fineract. Si alguien no ve un área, lo que le falta es
un permiso en su rol, no una actualización del portal.

---

# 1 · El ciclo de un crédito, de la solicitud al finiquito

Es el flujo que más se usa y el único que este documento cuenta completo, porque
es el que se pudo verificar comando por comando.

## Un ciclo completo, verificado en pantalla

Ejercido de punta a punta el 14-oct-2026 sobre el crédito `000000024` de Maria
Elena Robles, $10,000.00, producto «Crédito simple a 30 días». Es la primera vez
que el circuito se corre entero por el portal, y queda aquí porque los números
que salieron son los que hay que esperar.

### 1 · Desembolsar

**Dónde:** Crédito → el expediente del crédito → **Desembolsar**.

El diálogo pide **fecha de operación**, **monto**, **motivo/nota**, y deja
registrar la **forma de pago** con su referencia, cuenta, cheque, clave de
rastreo y banco. El monto llega propuesto con el aprobado.

| Lo que cambió | |
|---|---|
| Estado | Aprobado → **Activo** |
| Transacción | `62 · Desembolso · $10,000.00 · Transferencia electrónica · Aplicada` |
| Póliza | `L62`, con la **fecha de operación capturada**, no la del día |
| Calendario | un pago de $10,000.00 con vencimiento a 7 días |

Partida generada por el core:

```
106.01  Cartera de crédito vigente     Cargo   $10,000.00
102.01  Bancos nacionales              Abono   $10,000.00
```

### 2 · Registrar el pago

**Dónde:** el mismo expediente → **Registrar pago**.

Con este producto —0% de interés— el pago completo liquidó el crédito:

| Lo que cambió | |
|---|---|
| Estado | Activo → **Cerrado (liquidado)** |
| Transacción | `63 · Pago · $10,000.00 · Aplicada`, con **Ajustar** disponible |
| Acciones | «No hay acciones principales para este estado» |

```
102.01  Bancos nacionales              Cargo   $10,000.00
106.01  Cartera de crédito vigente     Abono   $10,000.00
```

**Un pago no se edita: se ajusta.** El botón «Ajustar» existe porque Fineract no
corrige una transacción en su sitio — revierte la anterior y crea la corregida,
de modo que el rastro de las dos queda.

### 3 · Un pago con interés, que es el caso normal

El de arriba no toca la cuenta de ingresos, porque el producto no cobra interés.
Se repitió sobre el crédito `000000011`, producto «Mensualidades con interés» al
2.5% mensual, con **$230.45 de capital y $4.70 de interés pendientes**.

Pago parcial de **$50.00**:

```
102.01  Bancos nacionales                        Cargo   $50.00
106.01  Cartera de crédito vigente               Abono   $45.30
401.32  Ingresos por intereses (actividad propia) Abono    $4.70
```

**Fineract aplica primero el interés y el resto a capital.** Los $4.70 eran
exactamente el interés pendiente: quedó en cero y el capital bajó a $185.15. El
crédito siguió **Activo**, con su siguiente cuota el 14/11.

Quien revise el reparto de un pago tiene ahí la regla: no es proporcional, es
interés primero.

### Lo que este recorrido dejó anotado para decidir

- **La forma de pago no decide la cuenta de salida.** Ver §6, «El medio de pago
  no decide la cuenta de salida».
- **Nada de esto llega a la contabilidad del ERP.** Ver §6, «El espejo va en un
  solo sentido».

## Los actos, y el permiso que exige cada uno

| Acto | Qué hace | Permiso en Fineract |
|---|---|---|
| **Aprobar** | Autoriza la solicitud | `APPROVE_LOAN` |
| **Deshacer la aprobación** | La devuelve a solicitud | `APPROVALUNDO_LOAN` |
| **Rechazar** | La cierra negada, con fecha | `REJECT_LOAN` |
| **Retirar** | La cierra porque el solicitante se retiró | `WITHDRAW_LOAN` |
| **Desembolsar** | Entrega el dinero | `DISBURSE_LOAN` |
| **Deshacer el desembolso** | Revierte la entrega | `DISBURSALUNDO_LOAN` |
| **Asignar responsable** | Pone al promotor del crédito | `UPDATELOANOFFICER_LOAN` |
| **Quitar responsable** | Lo libera | `REMOVELOANOFFICER_LOAN` |
| **Recuperar garantías** | Ejecuta el colateral | `RECOVERGUARANTEES_LOAN` |

Y sobre un crédito ya vivo:

| Movimiento | Qué hace | Permiso |
|---|---|---|
| **Pago** | Abona al crédito, con su forma de pago | `REPAYMENT_LOAN` |
| **Condonar interés** | Perdona una porción de interés | `WAIVEINTERESTPORTION_LOAN` |
| **Castigar (quebranto)** | Lo da por perdido, **con causa** | `WRITEOFF_LOAN` |
| **Deshacer el castigo** | Lo revive | `UNDOWRITEOFF_LOAN` |
| **Pago de recuperación** | Cobra sobre un crédito ya castigado | `RECOVERYPAYMENT_LOAN` |
| **Devolución en efectivo** | Regresa dinero al cliente | `REFUNDBYCASH_LOAN` |
| **Finiquito anticipado** | Lo liquida antes del plazo | `FORECLOSURE_LOAN` |
| **Devolución de saldo a favor** | Regresa un sobrepago | `CREDITBALANCEREFUND_LOAN` |

**Un «no autorizado» en cualquiera de estos actos es un permiso del rol en
Fineract**, no un problema del portal. Se reparte en Administración → Usuarios y
roles.

## El castigo lleva motivo, y no es burocracia

Castigar admite y **pide** la causa del quebranto. Sin ella el crédito queda
castigado sin razón registrada, y el reporte de cartera castigada por motivo
—el que se presenta— sale vacío. Un número sin desglose no se puede defender
ante nadie.

## Aprobar puede recalendarizar en el mismo acto

Al aprobar se pueden redefinir los **tramos de desembolso**: aprobar un monto
menor al solicitado y repartirlo distinto, en una sola operación. Lo que no deja
es que no cuadre:

> «La suma de los tramos (45000.00) debe igualar el monto aprobado (50000.00).»

Antes había que aprobar primero y corregir los tramos con otra operación, con el
crédito aprobado por un reparto que nadie quería.

## El desembolso directo a la cuenta de ahorro está cerrado, a propósito

Si se intenta, el portal contesta:

> «El desembolso a cuenta de ahorro está deshabilitado en esta institución:
> Fineract no ofrece segunda firma para esa operación, así que sería un camino
> para desembolsar sin la autorización que sí exige el desembolso normal.
> Desembolsa por el camino habitual y, si el dinero debe quedar en la cuenta de
> ahorro del socio, hazlo después como transferencia entre cuentas.»

**No se pierde una capacidad, se pierde un atajo**: el desembolso sigue
existiendo por el camino con doble firma, y la transferencia a la cuenta de
ahorro se hace después, desde Operación → Centro de operaciones.

Se puede abrir —`DESEMBOLSO_A_AHORRO=permitido` en el entorno del portal— y si
se abre, **hay que dejarlo escrito en el expediente del control**: es la primera
cosa que un auditor va a preguntar cuando vea que el desembolso normal exige dos
firmas y ése no.

---

# 2 · Cobranza

Tres pantallas, y no hacen lo mismo:

| Pantalla | Para qué |
|---|---|
| **Cobranza** | El día a día: a quién hay que cobrarle y qué se cobró |
| **Hoja de cobranza** | La hoja de un grupo o centro para una fecha de reunión. Se puede ver antes sin afectar nada |
| **Cartera vencida** | La foto de lo atrasado, por rango de mora |

**Riesgo y provisiones** es otra cosa: define los rangos y los cubos de mora,
las categorías y criterios de provisión, y corre las provisiones —con o sin
generar las pólizas contables—.

El ERP también lee la cartera: la conciliación de cartera del ERP compara lo que
el core dice que se debe con lo que el ERP tiene registrado. Está en
`07-flujos-y-procesos.md`.

---

# 3 · Captación

| Qué | Dónde |
|---|---|
| Cuentas de ahorro: apertura, aprobación, activación, depósitos, retiros, interés, retenciones, bloqueos, cierre | Captación → Cuentas de ahorro |
| Depósitos a plazo y recurrentes: solicitud, ciclo de vida, aportes, intereses, vencimiento y cierre anticipado | Captación → Depósitos |
| Acciones: compra, aprobación, redención, cierre y dividendos | Captación → Acciones |

Cada familia tiene su **producto** detrás, en el área de Productos, y ahí se
define lo que después no se puede cambiar a mano: moneda, tasas, cargos y las
cuentas contables con las que cada movimiento se asienta.

## Un depósito, verificado

Hecho el 14-oct-2026 sobre la cuenta `000000001`. Desde el expediente de la
cuenta → **Depósito**: monto, fecha y forma de pago.

| Lo que cambió | |
|---|---|
| Saldo | $1,650.00 → **$2,150.00** |
| Movimiento | `Depósito · $500.00 · Efectivo en ventanilla · Aplicada`, con **Modificar** y **Revertir** |

```
102.01  Bancos nacionales                 Cargo   $500.00
203.01  Depósitos de ahorro de clientes   Abono   $500.00
```

El expediente separa **saldo contable** de **disponible para retiro**, que no
son lo mismo en cuanto hay una retención o un bloqueo de débitos.

Y repárese en la forma de pago: se capturó «Efectivo en ventanilla» y el asiento
cargó Bancos nacionales. El porqué —y la decisión pendiente— está en §6.

---

# 4 · La mesa de control

Es la pantalla de quien responde por la institución, y reúne cuatro cosas que
suelen vivir separadas:

- **Autorizaciones (cuatro ojos).** La bandeja de lo que espera una segunda
  firma, con lo que falta por decidir.
- **Procesos.** El programador de trabajos del core: qué está corriendo, qué
  falló y qué está programado.
- **Día operativo y COB.** La fecha lógica de la institución y el cierre de día.
  **No es la fecha del calendario**: es la fecha con la que el core contabiliza,
  y moverla mueve todo.
- **Trazabilidad.** La actividad reciente y la auditoría, con quién capturó qué.

---

# 5 · Caja y tesorería

Las cajas del core —*tellers*— y sus cajeros, con sus movimientos. La pantalla
está ordenada por **fecha operativa**, no por la del reloj: un movimiento de
caja pertenece al día operativo abierto, y por eso el día operativo se cierra
después de la caja y no antes.

La caja del ERP es **otra**, para el mostrador, y está en
`07-flujos-y-procesos.md` §6. Dos cajas distintas para dos cosas distintas: una
cobra una venta, la otra cobra una letra.

## Antes de que una caja pueda cobrar: dos pasos de configuración

Verificado el 14-oct-2026 partiendo de cero —la institución no tenía ninguna
caja dada de alta—.

**1 · Crear la caja.** Caja y tesorería → **Nueva caja**. Pide oficina, nombre,
descripción y la vigencia (inicio obligatorio, fin opcional). Queda **Activa**
desde su fecha de inicio.

**2 · Asignar un cajero.** Dentro de la caja → **Asignar cajero**. Pide la
persona del personal operativo, la vigencia —propone un mes— y si atiende **día
completo** u **horario parcial**.

Mientras no haya un cajero vigente para la fecha operativa, la jornada dice
**«Sin cajeros vigentes»** y lo explica: *«No hay cajeros vigentes para la fecha
operativa actual. Asigna o ajusta la vigencia de un cajero antes de operar.»*
Con uno asignado pasa a **«Lista para operar»**.

Sólo entonces aparecen **Asignar efectivo** y **Liquidar**, que son los dos
actos que mueven dinero.

**La vigencia se mide contra la fecha operativa del core, no contra el reloj de
la computadora.** La propia pantalla lo advierte. Un cajero asignado «desde hoy»
en una institución cuya fecha operativa va atrasada no está vigente todavía.

---

# 6 · Contabilidad del core


El portal lleva el catálogo de cuentas de Fineract, las pólizas manuales
balanceadas, la consulta y reversa de asientos, los cierres por sucursal, los
saldos iniciales y las reglas contables.

## El espejo va en un solo sentido, y conviene saberlo

**El core asienta lo suyo y el ERP asienta lo suyo.** Lo que existe entre los
dos es un espejo **del ERP hacia el core**: cualquier póliza que nace en el ERP
—una venta, una compra, la nómina, la depreciación— se publica en el mayor de
Fineract. Está hecho así a propósito y el porqué está en `02-arquitectura.md`.

**Lo que nace en el core no viaja de vuelta.** Un desembolso, un pago de
crédito, el reconocimiento de interés, un depósito de ahorro o una corrida de
estimaciones preventivas se asientan en el mayor de Fineract y **no aparecen en
la contabilidad del ERP**.

Medido el 14-oct-2026, con los dos sistemas encendidos:

| | |
|---|---|
| Asientos en el mayor del core | 434 |
| Espejados desde el ERP (`SYNCRO-*`) | 383 |
| **Nacidos en el core** | **51**, en 18 transacciones |
| Pólizas del ERP que vienen del core | **0** |

O sea: hoy el estado de resultados del ERP **no incluye los ingresos por
intereses de la cartera**, y nada avisa de ello.

Dicho sin rodeos porque es una decisión de negocio pendiente, no un defecto que
alguien vaya a arreglar solo. Las tres salidas posibles —vuelta del espejo,
póliza de concentración periódica, o dos contabilidades consolidadas fuera—
están planteadas en `claude/lo-que-nace-en-el-core-no-llega-al-erp-2026-10-14`.

## Y la conciliación mira la mitad que viaja

`Finanzas → Espejo contable` compara las dos contabilidades, y es el único sitio
donde eso ocurre. Su alcance es `POLIZAS_VINCULADAS`: recorre las pólizas **del
ERP** que tienen vínculo y las contrasta contra su asiento en el core.

Eso significa que puede decir «coinciden» con los 51 asientos de crédito fuera
del cuadro. No es un error del control —su alcance está en su nombre—, pero
conviene no leer ese verde como «las dos contabilidades dicen lo mismo»: dice
«lo que mandé llegó bien».

## Las tres cuentas que sólo existen de un lado

De las 73 cuentas del mayor del core, **70 corresponden una a una con el
catálogo del ERP**. Tres no:

| Cuenta | | |
|---|---|---|
| `101.02` | Efectivo en ventanilla | hoy sin movimientos |
| `703.22` | Quebrantos por cartera incobrable | |
| `703.23` | Creación de estimaciones preventivas | **con movimientos** |

Son cuentas de operación crediticia: el cajón de la ventanilla y las de pérdida
de cartera. No tienen contraparte en el catálogo del ERP, que es el que lleva
los códigos agrupadores del SAT.

## Qué póliza genera cada acto, verificado

Ejercido en pantalla el 14-oct-2026, crédito por crédito. Las partidas son las
que el core genera solo: no hay captura manual en ninguna.

### Desembolsar un crédito

| Cuenta | | |
|---|---|---|
| `106.01` Cartera de crédito vigente | Cargo | monto desembolsado |
| `102.01` Bancos nacionales | Abono | monto desembolsado |

Nace cartera y sale dinero. La fecha del asiento es **la fecha de operación que
se capturó**, no la del día.

### Registrar un pago

Con un producto sin interés, dos patas —el espejo del desembolso—. Con interés,
**tres**, y el reparto lo decide el core:

| Cuenta | | |
|---|---|---|
| `102.01` Bancos nacionales | Cargo | lo que entró |
| `106.01` Cartera de crédito vigente | Abono | la parte de capital |
| `401.32` Ingresos por intereses | Abono | la parte de interés |

**Fineract aplica primero el interés y el resto a capital.** Medido: un pago de
$50.00 sobre un crédito con $4.70 de interés pendiente se repartió en $4.70 de
interés y $45.30 de capital, y el interés pendiente quedó en cero.

### Un depósito de ahorro

| Cuenta | | |
|---|---|---|
| `102.01` Bancos nacionales | Cargo | depósito |
| `203.01` Depósitos de ahorro de clientes | Abono | depósito |

### La corrida de estimaciones preventivas

| Cuenta | | |
|---|---|---|
| `703.23` Creación de estimaciones preventivas | Cargo | estimación |
| `106.03` Estimación preventiva para riesgos crediticios | Abono | estimación |

## El medio de pago no decide la cuenta de salida

Una decisión de configuración que conviene tomar antes de operar con público.

El desembolso y el depósito preguntan el **medio de pago** —transferencia,
efectivo en ventanilla, contracargo…— y lo guardan en la transacción, donde se
ve. Pero **la cuenta contable no cambia con él**: sale de la cuenta de fondeo
configurada en el producto, que hoy es `102.01 Bancos nacionales` tanto para el
crédito como para el ahorro.

Verificado: un depósito capturado como «Efectivo en ventanilla» cargó
`102.01 Bancos nacionales`. Y `101.02 Efectivo en ventanilla` existe en el
catálogo, con cero movimientos.

Fineract sí permite decidirlo: en el producto, con las **reglas contables
avanzadas** (`paymentChannelToFundSourceMappings`), se mapea cada forma de pago
a su cuenta de salida. Hoy los productos tienen **cero** de esos mapeos.

Para una institución con cajón de efectivo, dejarlo así significa que los libros
dicen que el dinero está en el banco cuando está en la ventanilla.

---

# 7 · Administración

Lo que se toca una vez y se revisa cada tanto: oficinas, personal, usuarios,
roles y permisos, matriz de cuatro ojos, catálogos y valores, formatos de
numeración de cuentas, días festivos y hábiles, monedas, cargos, fondos, formas
de pago, tasas, impuestos, buró de crédito, tablas de datos, encuestas,
*webhooks*, servicios externos e importaciones.

**Las identidades.** Igual que en el ERP, **Keycloak es la autoridad**: el
portal no guarda contraseñas y no las cambia. Si hay que reponer una, se repone
en Keycloak.

---

# 8 · Cartera vencida y estimaciones preventivas

**Dónde:** Crédito → Cartera vencida, y Crédito → Riesgo y provisiones.

## Lo que el portal considera vencido

La pantalla **no inventa la clasificación**: enseña lo que Fineract ya decidió,
agrupado por la escala de mora que configuró la institución. Cada tramo es un
filtro: se toca y la lista de abajo se reduce a ese tramo.

![Cartera vencida: $3,000.00 en un crédito, 9.70 % sobre saldo vivo, 23 días de atraso máximo, y los tramos de la escala con su importe.](img/portal-cartera-vencida.jpg)

Los cuatro números de arriba se leen juntos: **vencido total**, **cartera
activa** (saldo vivo), **en riesgo** —el vencido sobre el saldo vivo— y el
**atraso máximo**. Medido el 12-oct: $3,000.00 vencidos sobre $30,913.15 vivos
dan 9.70 %, y el crédito más atrasado arrastra desde el 19 de septiembre, 23
días. Las tres cuentas cuadran contra el renglón de la lista.

**Dos tramos que no son un tramo**, y conviene saber qué significan:

- **«sin días (cierre pendiente)»** — el core todavía no ha corrido el cierre
  del día, así que no ha calculado los días de atraso de esos créditos.
- **«sin escala de mora (producto sin cubeta)»** — su producto de crédito no
  tiene una escala atada. Fineract reporta el importe vencido pero no lo
  clasifica, y entonces los días los calcula el portal contra la fecha de
  negocio. Es una cosa que se arregla en el producto, no en la pantalla.

El desplegable **«De dónde salen estos números»** dice de qué consulta del core
sale cada cifra. Un número de cartera sin su procedencia no se puede defender
ante nadie.

## El motor de estimaciones preventivas

**Crédito → Riesgo y provisiones** tiene las dos mitades separadas en pestañas:
**Mora** —los rangos de días y las escalas que se asignan a los productos— y
**Provisiones** —las categorías contables, los criterios con su porcentaje y las
corridas—.

![Riesgo y provisiones: cuatro categorías contables y el criterio «Estimación preventiva SUMA» cubriendo los cinco productos de crédito.](img/portal-riesgo-provisiones.jpg)

La cadena completa, en orden:

1. **Rangos de mora** — ventanas de días de atraso (1–29, 30–59, 60–89, 90–179,
   180 o más).
2. **Escalas de mora** — ordenan varios rangos y se asignan a los **productos de
   crédito**. Un producto sin escala es el caso «sin cubeta» de arriba.
3. **Categorías de provisión** — las etiquetas contables que agrupan la cartera
   (A riesgo normal, B medio, C alto, D irrecuperable).
4. **Criterios de provisión** — el porcentaje de estimación por rango, **con la
   cuenta de gasto y la de pasivo** que se van a afectar.
5. **Corridas** — calculan la estimación a una fecha y, si se pide,
   **generan las pólizas contables**.

Es la misma escala la que clasifica la cartera vencida y la que decide el
porcentaje de estimación: una sola definición para las dos cosas, que es lo que
evita que el reporte de mora y el de provisiones discrepen.

---

# 9 · Lo que falta de este documento

Dicho aquí para que nadie lo descubra buscándolo:

- **Los recorridos con capturas.** Las ocho áreas están descritas y el apartado
  8 ya lleva el suyo, con capturas. El 14-oct se añadieron cuatro recorridos
  verificados en pantalla y **con su póliza**: el ciclo de un crédito (§1), un
  depósito de ahorro (§3), el alta de una caja con su cajero (§5) y la tabla de
  qué asiento genera cada acto (§6). Lo que falta de capturas es el resto.
- **Los actos que mueven dinero se documentaron con una persona oprimiendo el
  botón.** Conviene saberlo al leer: lo verificado es el resultado —estado,
  transacción y partida contable—, no una simulación.
- **El manual por rol del portal.** El ERP tiene el suyo en
  `03-manual-por-rol.md`, medido contra sus plantillas de permisos. El del
  portal se mide contra los roles de Fineract, que son otros, y no se ha hecho.
- **Dónde se publica este documento en una instalación de sólo Fineract.** Hoy
  lo sirve el ERP, desde su pantalla de Ayuda, porque esta instalación lleva los
  dos. Una institución que compre sólo Fineract no tendría dónde leerlo: el
  portal no tiene todavía pantalla de documentación. Está anotado en
  `06-limites-conocidos.md`.
