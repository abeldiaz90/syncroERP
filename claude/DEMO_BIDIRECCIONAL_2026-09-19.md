# Demo: ERP + Fineract, los dos lados del mismo crédito

Fecha del ensayo: 18 de septiembre de 2026, de madrugada.
Modo demostrado: **ERP + Fineract** (`SUMA Local`: cartera en SOMBRA, contabilidad en ESPEJO).

---

## Lo que estaba roto y ya no

### El camino de vuelta no existía

Fineract no tenía a dónde avisar. El ERP publicaba hacia el core —eso ya
funcionaba— pero nada regresaba: un pago capturado en el portal bancario no
llegaba nunca al ERP. Faltaban dos cosas, y las dos están hechas:

1. `FINERACT_WEBHOOK_TOKEN` en `backend/.env.local` (la llave sin la cual el
   receptor del ERP contesta 404 a todo).
2. El hook en el core, apuntando a

   ```
   http://localhost:4000/api/integracion/avisos/<llave>/
   ```

   **La barra final no es opcional**: al guardar el hook, Fineract construye un
   cliente Retrofit contra esa dirección y le manda una petición de prueba;
   Retrofit exige que la URL base termine en `/` y si no lo hace revienta con un
   500 sin cuerpo. El hook quedó creado con estos eventos:

   `LOAN`: REPAYMENT · DISBURSE · APPROVE · ADJUST · WAIVEINTERESTPORTION ·
   WRITEOFF · FORECLOSURE — `CLIENT`: CREATE · ACTIVATE.

### El ensayo, hecho de verdad

Crédito 11 (`CLIENTE SINTETICO PRUEBA POS`, «Mensualidades con interés»),
pago de **$100.00** capturado en el portal del core:

| | antes | después |
|---|---|---|
| Saldo pendiente | $385.15 | **$285.15** |
| Pagado | $192.58 | **$292.58** |

Y en el ERP, en *Crédito y cobranza → Avisos del core*, apareció el aviso
`LOAN/REPAYMENT · recurso 11`:

> «Se registró un cobro en el core sobre el crédito 11. Si no salió del ERP, hay
> que capturarlo aquí con su cuenta de caja o banco.»

Eso es el ciclo cerrado: el movimiento se aplica en el core, el core avisa, y el
ERP pide la decisión contable en vez de inventarla. **Ése es el momento que vale
la pena mostrar**, porque es el que explica por qué hay dos sistemas y no uno.

### La pantalla de avisos estaba llena de ruido viejo

Había 21 avisos pendientes; **19 eran el mismo aviso histórico**:
«No se pudo leer íntegramente el asiento externo». Se corrieron de nuevo las
conciliaciones y el resultado de hoy es **19 asientos revisados, 1 discrepancia**
—y esa una es real: `IN-2026-00005` fue reversado directamente en el mayor
externo—. Es decir: los 19 avisos describían una falla ya corregida y seguían
ahí como si nada. Quedaron descartados con nota.

Dos cosas se corrigieron de raíz:

- El `catch` de la conciliación **no recibía el error**, así que el aviso decía
  «no se pudo leer» y nada más. Con veinte pólizas en ese estado no había por
  dónde empezar: ¿el asiento no existe, la oficina está mal, el core no
  contesta? Cada causa se atiende distinto y ninguna se adivina. Ahora la causa
  va dentro del aviso.
- Queda **un aviso huérfano** de una sonda de verificación mía
  (`DESCONOCIDA/DESCONOCIDA`, sin empresa atribuida). No se puede cerrar desde
  la pantalla a propósito —un aviso sin empresa puede describir al cliente de
  otro inquilino—. Si molesta en la demo, se borra en la base:

  ```sql
  DELETE FROM integracion_avisos
   WHERE entidad = 'DESCONOCIDA' AND "empresaId" IS NULL;
  ```

---

## El portal del core: lo que se corrigió

Los cuatro estorbos eran de encuadre, no de contenido.

**La página vivía en una columna angosta.** El contenedor topaba en 1480 px; en
el monitor de 3440 px eso deja casi mil píxeles vacíos a cada lado —justo donde
un operador necesita columnas de tabla—. La medida subió a 1880 px y **la barra
superior ahora comparte esa medida**: antes la búsqueda quedaba pegada al borde
izquierdo y los indicadores al derecho, con la página flotando en el centro sin
relación con ninguno de los dos. Eran dos rejillas distintas en la misma
pantalla, y eso es lo que se leía como «encimado».

**La identidad de quien opera no se veía.** Toda la columna izquierda era una
sola zona de desplazamiento, así que con el menú completo —25 entradas— la
tarjeta del usuario y el botón de cerrar sesión caían fuera de la pantalla. En
un portal bancario eso no es estético: es la referencia de quién firma cada
movimiento. Ahora la barra se reparte en tres piezas fijas y sólo el menú rueda.

**El menú se dibujaba a medias y luego saltaba.** Mientras no llegaban los
permisos, la barra mostraba las cuatro entradas que no exigen ninguno y un
segundo después saltaba a veinticinco. Quien abría el portal veía primero un
sistema pequeño y roto. Ahora se dibuja el hueco del menú hasta que la sesión
responde.

**El indicador de desarrollo de Next** se pintaba fijo sobre la última sección
del menú. No es del producto; se apagó (`next.config.mjs`).

### Y lo que se leía en inglés

La tabla de movimientos del crédito —la que se mira para saber qué le pasó a la
cuenta, delante del cliente— mostraba los nombres internos del core:
`Disbursement`, `Accrual`, `Repayment`. Ya existía el traductor de enums del
portal y esa celda no lo usaba. Se conectó y se agregaron los movimientos de
crédito completos (28 tipos: desembolso, pago, devengo de interés, condonación,
castigo, recuperación, contracargo…). Lo mismo en la tabla de movimientos de
ahorro. También `Foreclosure` → **«Liquidar por anticipado»** y
`Revertir write-off` → **«Revertir el castigo»**.

Queda en inglés lo que es **catálogo del core, no código**: los medios de pago
(`Money Transfer`, `Repayment Adjustment Chargeback`) se renombran en
*Administración → Catálogos financieros*, y conviene hacerlo antes de la demo
porque aparecen en el diálogo de registrar pago.

### «Unexpected end of JSON input»

La pantalla de clientes mostró ese texto en la franja roja. `response.json()`
lanza ese error cuando el cuerpo llega vacío, y quien lo lee no sabe si el
cliente no existe, si no tiene permiso o si el core está caído: parece que el
portal se rompió. Un cuerpo vacío no es un misterio —es la ruta que no alcanzó a
responder— y eso es lo que hay que decir, con el código HTTP, que es el único
dato que distingue un caso del otro. Se aplicó en el listado de clientes, en el
listado de cartera y, sobre todo, **en el punto por el que pasa un pago**: ahí un
error del intérprete deja al operador sin saber si el pago entró.

### «Mi jornada» abría vacía

La pantalla de inicio abría el día con dos cifras: cuántos clientes hay y si el
core responde. Ninguna de las dos dice cómo va la institución. Ahora abre con
**cartera colocada, cartera vencida y % en riesgo**, tomados del mismo BFF de
cartera vencida en vez de volver a paginar desde el navegador, y sólo si la
sesión puede leer crédito —un cajero de captación no ve cartera—. Hoy:
$1,085.15 colocados en 15 créditos, $0.00 vencido.

---

## El reflejo es automático (cambio del 18 de septiembre)

Un movimiento que nace en el core **se aplica solo en el ERP**. No hay que
capturarlo a mano. Lo hace `CarteraReflejoService` cada cinco minutos —o al
instante desde `POST /credito/cobranza/reflejar-externas`— y lo aplica llamando
al servicio de cobranza del ERP, con sus validaciones y su asiento, nunca
escribiendo saldos a mano. La cuenta que recibe ese dinero es la que la empresa
designó en `parametrosProveedor.cuentaCobranzaExternaId`; sin ella no se aplica,
porque un asiento de cobranza contra una caja elegida al azar es peor que no
tener asiento.

Entonces el aviso **es una bitácora**, no una tarea:

| lo que pasó | qué se ve |
|---|---|
| El ERP originó el movimiento y el core lo confirma | eco: queda registrado, no pide nada |
| Nació en el core y se reflejó | se cierra solo, con el rastro: «Reflejado automáticamente en el ERP: pago … de 50 sobre CRD-2026-0007» |
| Nació en el core y **no** se pudo reflejar | sigue pendiente, y dice por qué |

Eso último es lo que hay que conservar: el aviso pendiente ya no significa «hay
trabajo manual», significa **«esto no se reflejó»**. Es la única lectura que
sirve, porque es la que distingue un sistema que va al día de uno que se está
separando en silencio.

Probado de verdad esta madrugada: un pago de $50 capturado en el portal del core
apareció en el ERP como pago `18ade4ca` sobre `CRD-2026-0007`, y su aviso pasó a
PROCESADO por sí mismo.

## Guion sugerido, y por qué en ese orden

1. **Mi jornada** en el portal del core. Se ve la institución de un golpe:
   colocado, vencido, riesgo, core operativo.
2. **El crédito en el ERP** (`/dashboard/creditos`, `CRD-2026-0007`): saldo y
   plan de pagos *desde el lado del ERP*.
3. **El mismo crédito en el portal del core** (`/dashboard/cartera/11`): las
   mismas cifras, calculadas por el core. Esto es lo que hay que dejar claro
   antes de mover nada: **un solo crédito, dos ventanas**.
4. **Registrar un pago en el portal del core.** Saldo y pagado se mueven ahí.
5. **Volver al ERP.** El pago ya está, con su asiento. Si no quieres esperar el
   cron, `POST /credito/cobranza/reflejar-externas` lo trae al instante; conviene
   tener ese botón a mano en vez de esperar cinco minutos delante de la gente.
6. **Avisos del core**: el aviso de ese cobro aparece ya cerrado, con el rastro
   de qué pago se registró. Ahí se explica la idea completa: lo que queda
   pendiente es sólo lo que NO se pudo reflejar.

El paso 3 antes del 4 es deliberado: si se mueve el saldo antes de que hayan
visto las dos pantallas coincidir, el movimiento no prueba nada.

Y el paso 5 antes del 6 también: primero el hecho —el dinero ya está en el
ERP—, después la explicación de cómo se enteró. Al revés parece que el aviso es
el mecanismo, y el aviso sólo es el registro.

---

## El estado con el que arranca la demo

- **Cliente del crédito:** Jorge Alberto Cantú Riveros. Crédito `CRD-2026-0007`
  en el ERP ↔ préstamo **11** en el core. Saldo $235.15 de $550.00.
- **Bandeja de avisos:** 1 pendiente (la reversa real de `IN-2026-00005`),
  4 resueltos, 1 eco del ERP, 19 descartados históricos.
- **Outbox:** 53 enviados, cero fallidos. **Cuentas sin mapear: 0.**
- **Clientes:** los diez tienen nombres normales en los dos sistemas.
- **Cartera en el portal:** $1,035.15 colocados, $0.00 vencido.

### Si quieres mostrar también la originación

Está preparada a medias a propósito, porque el último paso no lo puedes dar solo:

1. María Fernanda Robles Aguilar ya existe en los dos sistemas y **tiene una
   solicitud de línea por $20,000 pendiente**.
2. La autoriza el rol `credito`, no el admin: el sistema **prohíbe que quien
   solicita se autoapruebe**. Entra como `credito.prueba@sumamexico.com` en otra
   ventana y apruébala — y aprovecha para decirlo en voz alta, porque
   segregación de funciones es justo lo que un banco quiere oír.
3. Con la línea autorizada, el crédito se origina y se replica al core solo.

Y si alguien pregunta por qué el flujo de verificación manda todo a revisión
manual: porque **no hay proveedor de identidad contratado** y el paso de INE es
bloqueante. El motor funciona; le falta el servicio detrás.

## Antes de la demo (para Abel)

- [ ] Renombrar los medios de pago del core al español (*Administración →
      Catálogos financieros*). Salen en el diálogo de registrar pago.
- [ ] Borrar el aviso huérfano de la sonda (el SQL está arriba) si no quieres
      que la bandeja diga «1 sobre recursos que este ERP no conoce».
- [ ] Correr `npm test` del portal **en Windows**: desde mi lado no se puede,
      `node_modules` tiene los binarios nativos de rollup para Windows. `tsc
      --noEmit` sí corre y está limpio.
- [ ] Decidir si se queda el token de una hora en Keycloak o vuelve a cinco
      minutos. Con cinco minutos, una demo de media hora obliga a reautenticar
      en medio.
- [ ] SMTP del realm `suma`: sigue pendiente y sin eso ningún empleado puede
      obtener contraseña. No afecta la demo, sí al alta real.

## Lo que no se tocó y sigue pendiente

Siguen en pie los 17 hallazgos de `AUDITORIA_MODULOS_2026-09-18.md`. Los que
pueden asomarse en una demo del ERP: el POS ignora `discrepanciasPrecio`, y el
cierre contable queda bloqueado porque las cobranzas no guardan `polizaId` y
ningún camino deja un estado de cuenta bancario en CERRADA.

El interruptor `FINERACT_TENANT_POR_EMPRESA` sigue en `false`, que es lo
correcto: `SUMA Local` todavía no tiene inquilino asignado y encenderlo
detendría su replicación. Primero el inquilino, después el candado —ver
`INQUILINO_POR_EMPRESA_2026-09-18.md`.
