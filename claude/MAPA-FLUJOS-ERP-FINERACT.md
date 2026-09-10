# Mapa de flujos: SyncroERP ↔ Fineract

Cada camino que existe entre los dos sistemas, qué lo dispara, por dónde pasa y
dónde se puede romper.

> Convención: **(R)** petición síncrona, dentro de un request.
> **(A)** asíncrono, sale del outbox por el despachador.
> **(H)** lo dispara una persona desde administración.

---

## Los seis caminos

| # | Camino | Tipo | Estado |
|---|---|---|---|
| 1 | Disponibilidad de crédito en el POS | (R) | Probado contra Fineract |
| 2 | Alta de cliente | (A) | Probado — COTEMAR replicado, id externo 8 |
| 3 | Venta a crédito → préstamo | (A) | **Probado 2026-09-07** — ticket #2, $406.00, 30 días |
| 4 | Cobranza → abono | (A) | Construido, nunca ejecutado |
| 5 | Póliza → asiento espejo | (A) | **Probado 2026-09-07** — 2 pólizas espejadas |
| 6 | Usuarios y roles | (H) | Construido, cuenta de servicio en uso |

> **Primera venta a crédito de punta a punta: 7 de septiembre de 2026.** Cuatro
> eventos en el buzón, cuatro entregados, cero fallidos. Estrenó la cuenta
> `209.01 · IVA trasladado no cobrado`, que sólo aparece en ventas a crédito y
> por eso no estaba mapeada: el asiento falló con el motivo exacto, se dio de
> alta la cuenta y el evento se reencoló. El fallo hizo bien su trabajo.

Y dos que **no existen** y conviene tener presentes: la vuelta de Fineract hacia
el ERP (webhook) y las reversas.

---

## 1 · Disponibilidad de crédito en el POS  (R)

El único camino síncrono. Es el que no puede fallar.

```
Cajero elige "crédito"
  └─ GET /api/integracion/disponibilidad/:clienteId
       └─ IntegracionModoService.perfilDe(empresa)
            ├─ APAGADO   → PoliticaCreditoService (ERP)            → origen ERP
            ├─ SOMBRA    → ERP decide; se consulta Fineract y se compara
            └─ AUTORIDAD → Fineract manda
                             ├─ caché fresco (30 s)     → origen EXTERNO
                             ├─ HTTP 1.2 s              → origen EXTERNO
                             ├─ timeout → caché ≤30 min → CACHE_DEGRADADO
                             └─ sin caché               → ERP, marcado degradado
```

**Dónde se rompe y qué pasa:** Fineract caído → cortacircuitos abre tras 5
fallos y deja de esperar 20 s; la venta sigue con caché o con el ERP, marcada
`degradado: true`.

**Lo que hay que vigilar:** una venta autorizada en degradado puede haber
autorizado contra un disponible viejo. Por eso queda marcada.

---

## 2 · Alta de cliente  (A)

```
Aprobación de línea de crédito (CREDITO_CLIENTE)
  └─ aprobaciones-documentos.service · finalizarDocumento()
       └─ cartera.lineaAutorizada(empresa, cliente, límite, versión)   [misma transacción]
            └─ fila en integracion_eventos  (clave: linea:<cliente>:v<versión>)

  ── después, fuera de la transacción ──
  IntegracionDespachadorService (cada minuto)
    └─ replicarCliente()
         ├─ ¿ya hay vínculo? → devuelve el id externo
         └─ adaptador.asegurarCliente()
              ├─ GET  /v1/clients/external-id/syncro:cliente:<uuid>
              └─ POST /v1/clients
         └─ guarda el vínculo (tipo CLIENTE)
```

**La versión entra en la clave** porque cada reautorización de línea es un hecho
distinto, no una repetición.

**Dónde se rompe:** cliente borrado en el ERP → falla en firme, no reintenta.
Fineract caído → reintenta con retroceso 5 s → 1 h.

---

## 3 · Venta a crédito → préstamo  (A)

El camino principal.

```
POS: venta a crédito
  └─ VentasService.crear()                        ── una sola transacción ──┐
       ├─ PoliticaCreditoService.validarOperacionEnTransaccion()            │
       ├─ CreditosService.crearCredito()                                    │
       │    ├─ calcula amortización (francés / plazo único)                 │
       │    ├─ CreditoCliente + AmortizacionCuota                           │
       │    └─ cartera.creditoOriginado()  → integracion_eventos            │
       ├─ Tesorería / Caja (enganche)                                       │
       └─ AsientosPendientes → póliza → dispara el camino 5                 │
                                                    ───────────────────────┘
  ── después ──
  Despachador
    └─ replicarCliente()  (si hace falta, aunque su evento no haya salido)
    └─ adaptador.originarCredito()
         ├─ GET  /v1/loans/external-id/syncro:credito:<uuid>
         ├─ POST /v1/loans                    ← elige producto según tipoCredito
         ├─ POST /v1/loans/{id}?command=approve
         └─ POST /v1/loans/{id}?command=disburse
```

**Los tres comandos van juntos** porque en mostrador la mercancía sale en el
instante en que se autoriza. La originación con expediente usará los tres por
separado.

**Dónde se rompe:**
- producto no configurado para ese `tipoCredito` → falla en firme;
- producto con contabilidad ≠ NONE → **duplica las cuentas por cobrar** (ver §5);
- el préstamo se creó pero se perdió la respuesta → el `externalId` lo resuelve
  consultando, no duplicando.

**Lo que hay que verificar la primera vez:** que la tabla de amortización de
Fineract coincida **peso por peso y fecha por fecha** con `amortizacion_cuotas`.
Si no coincide, el producto está mal configurado y todo lo demás va a mentir.

> **Peso por peso no basta.** El 7 de septiembre de 2026, cinco créditos de
> prueba cuadraron en importes y dos de ellos vencían con dos meses de
> diferencia entre los dos sistemas. Comparar sólo dinero no detecta nada:
>
> 1. El adaptador mandaba `repaymentEvery: 1` en meses para **todos** los
>    créditos. Con una sola cuota, 30, 60 y 90 días vencían el mismo día.
>    Los créditos de una exhibición viajan ahora en días, que es como los
>    calcula el ERP (`fechaPorTipo` suma días, no meses).
> 2. Fineract recorría al siguiente día hábil las cuotas que caían en fin de
>    semana. El ERP no. Esa regla ahora vive en el ERP
>    (`politicas_vencimiento_empresa`), porque hay empresas sin Fineract que
>    necesitan la misma política, y `verificarConfiguracion` marca como ERROR
>    que el proveedor externo mueva fechas por su cuenta.

---

## 4 · Cobranza → abono  (A)

```
CobranzaService.registrarPago()                   ── una sola transacción ──┐
  ├─ aplica a cuotas, recalcula saldo                                       │
  ├─ Tesorería + Caja                                                       │
  ├─ CFDI: complemento de pago (REP)                                        │
  ├─ AsientosPendientes → póliza → camino 5                                 │
  └─ cartera.pagoRegistrado()  → integracion_eventos                        │
                                                    ───────────────────────┘
  ── después ──
  Despachador
    └─ ¿existe vínculo del crédito?
         ├─ no  → error REINTENTABLE (espera a que pase el camino 3)
         └─ sí  → POST /v1/loans/{id}/transactions?command=repayment
```

**El orden importa y está resuelto:** si el pago llega antes que su préstamo, el
evento se marca reintentable y espera. No se pierde.

---

## 5 · Póliza → asiento espejo  (A)

```
Cualquiera de los CINCO lugares que crean pólizas
  (motor contable · captura manual · manual en transacción · reversas · cierre)
       └─ INSERT en polizas
            └─ PolizaEspejoSubscriber.afterInsert()   [misma transacción]
                 └─ contabilidad.polizaRegistrada() → integracion_eventos

  ── después ──
  Despachador · espejarPoliza()
    ├─ ¿vínculo EN_VUELO? → se detiene y pide verificación humana
    ├─ ¿póliza cancelada? → no se espeja (su reversa es póliza propia)
    ├─ valida que cuadre
    ├─ MapeoCuentasService.resolverEstricto()  ← falla si falta una cuenta
    ├─ marca el vínculo EN_VUELO
    ├─ POST /v1/journalentries
    └─ marca REGISTRADO con el id externo
```

**Por qué un suscriptor y no cinco llamadas:** una lista de puntos de enganche
es una lista que alguien olvidará ampliar. La condición aquí es «existe una
póliza», que es la que interesa.

**El riesgo específico de este camino:** un asiento manual no admite clave de
idempotencia del lado de Fineract. Si el POST se aplica y la respuesta se
pierde, un reintento ciego duplicaría el asiento y descuadraría el mayor **sin
dejar rastro**. Por eso el vínculo se marca `EN_VUELO` antes de llamar y un
reintento que lo encuentra así se detiene. Es preferible un evento en rojo que
un mayor con un asiento doble.

**Y el error más caro de toda la integración:** si los productos de préstamo de
Fineract tienen contabilidad automática, Fineract asienta el préstamo por su
cuenta **además** de recibir el espejo. `GET /api/integracion/verificacion` lo
detecta.

---

## 6 · Usuarios y roles  (H)

```
Administrador
  ├─ GET  /api/integracion/roles/catalogos     roles del ERP + roles de Fineract
  ├─ POST /api/integracion/roles/mapeo         rol ERP → roles Fineract
  ├─ GET  /api/integracion/roles/diagnostico   qué le falta a cada usuario
  └─ POST /api/integracion/roles/aprovisionar/:usuarioId
            ├─ ¿existe en Fineract? → reasigna roles
            └─ no → POST /v1/users con los roles mapeados
```

**Por qué hace falta:** Fineract corre con `AUTO_CREATE_USER=false`. El ERP ya
reenvía el token del usuario en las consultas, pero eso sólo sirve si esa
persona existe también del otro lado.

**Nunca es automático.** Dar de alta operadores en un core bancario no debe ser
un efecto secundario de que alguien entre al ERP.

---

## Los dos caminos que NO existen

### La vuelta: Fineract → ERP

No hay webhook. Si alguien captura un pago directamente en el portal, el ERP se
entera en la conciliación del día siguiente. Durante esas horas los dos sistemas
dicen cosas distintas sobre el saldo de un cliente, y el POS puede autorizar
contra un disponible que ya no existe.

**Mientras eso no exista, la regla es: dentro de una empresa integrada, la
cartera se captura desde el ERP.** El portal se usa para consultar y para lo que
el ERP no cubre (reestructuras, castigos, provisiones). Si se quiere captura en
ambos, el webhook deja de ser opcional **antes** de encender la primera empresa
en `AUTORIDAD`.

### Las reversas

`CREDITO_CANCELADO`, `PAGO_REVERTIDO` y `AJUSTE_DEVOLUCION` se publican al
outbox pero el despachador **falla a propósito** en ellos, pidiendo resolverlos
a mano. Su equivalente en Fineract (`undo`, `adjust`, `waive`) depende del
producto configurado, y una reversa mal traducida corrompe el saldo del cliente
en silencio.

Las reversas **contables** sí funcionan: en el ERP una reversa es una póliza
propia y viaja por el camino 5 como cualquier otra.

---

## Lo que hay que mirar cuando algo se rompe

| Síntoma | Dónde mirar |
|---|---|
| El POS dice que no puede operar | `razonBloqueo` de la respuesta — siempre viene |
| Un crédito no aparece en Fineract | `GET /api/integracion/outbox` → `ultimoError` |
| Un asiento no llegó al mayor | Igual, y revisa `cuentas/pendientes` |
| Un evento lleva horas pendiente | ¿el circuito está abierto? `GET /api/integracion/estado` |
| Saldos que no cuadran | `GET /api/integracion/conciliacion` |
| Alguien no puede operar en Fineract | `GET /api/integracion/roles/diagnostico` |

---

## Catálogo de productos de crédito (dinámico, no `enum`)

Hasta ahora los tipos de crédito eran cinco valores fijos en el código y los
ids de producto de Fineract se capturaban a mano en un JSON de parámetros.
Eso tenía tres consecuencias: agregar un plazo requería desplegar, todas las
empresas del servidor vendían lo mismo, y una empresa nueva podía vender a
crédito **sin que nada cruzara a Fineract**, porque el producto de allá no
existía y nadie lo creaba.

### Lo que hay ahora

`productos_credito`, una fila por producto y por empresa, con el plazo
(`unidadplazo` + `cadacuantos`), el rango de cuotas, la tasa y los límites de
importe. La fila es **completa y vendible por sí sola**: una empresa sin
Fineract tiene ahí todo su catálogo y el ERP calcula la amortización con eso.

El id del producto en Fineract **no** vive en esa tabla: vive en
`integracion_vinculos` con tipo `PRODUCTO_CREDITO`, igual que el de clientes,
créditos y pagos. Así una empresa puede cambiar de proveedor sin tocar su
catálogo comercial.

### Las dos mitades de la regla

| Empresa | Catálogo | Qué se exige para vender |
|---|---|---|
| **Sin** registro externo | Independiente, sólo en el ERP | Que el producto esté ACTIVO |
| **Con** registro externo | Uno solo, con dos representaciones | Que exista allá **y** que las dos tablas de amortización coincidan |

Nadie tiene que acordarse de esa distinción: la resuelve
`ProductosCreditoSyncService` leyendo el modo de la empresa.

### Correspondencia en los dos sentidos

`POST /credito/productos/sincronizar` publica en Fineract lo que se dio de alta
en el ERP e **importa en borrador** lo que ya existía en Fineract y aquí no.
Lo importado nunca se activa solo: un producto capturado del otro lado no trae
detrás la política de crédito ni el flujo de validación de esta empresa.

### La verificación es una condición, no un informe

`POST /credito/productos/:id/verificar` manda una amortización de prueba de
$12,345.67 a los dos sistemas y compara **cuota por cuota: número, fecha e
importes**. Un producto que no cuadra no se puede activar.

Esto existe por lo que costó no tenerlo: durante semanas los importes cuadraron
peso por peso mientras los créditos a 30, 60 y 90 días vencían todos el mismo
día en Fineract, porque el adaptador mandaba el plazo en meses. Comparar las
definiciones de los dos productos no lo habría detectado. Sólo lo detecta
comparar la tabla completa.

### La costura para lo que viene

`productos_credito.flujovalidacionid` apunta al flujo de validación —identidad,
buró, círculo, política interna— que hay que aprobar antes de originar con ese
producto. Hoy puede ser nulo. Cuando entren esas validaciones no hay que tocar
la tabla ni el punto de venta: es una columna que ya está y un módulo
(`integracion/validacion/`) que ya existe.

### Cómo se opera

```
npm.cmd run db:migration:run                     crea la tabla y siembra a las empresas actuales
npm.cmd run productos:catalogo                   muestra qué falta para poder vender cada producto
npm.cmd run productos:catalogo -- --aplicar      siembra, sincroniza, verifica y activa
```

### Lo que se conserva a propósito

`creditos_clientes.tipocredito` sigue existiendo y sigue siendo obligatoria: los
créditos ya emitidos apuntan a ella y los reportes la leen. Los créditos nuevos
llevan además `productocreditoid`, que es el dato bueno. La columna vieja se
retira cuando esos reportes lean el producto, no antes.

---

## Estado probado · 8 de septiembre de 2026

Lo que sigue distingue tres cosas que suelen confundirse: lo que está
**probado de punta a punta**, lo que está **escrito pero no caminado**, y lo
que **se sabe que está mal**.

### Probado de punta a punta

| Camino | Cómo se probó | Resultado |
|---|---|---|
| Catálogo de productos | `productos:catalogo --aplicar` | 5 productos publicados en Fineract (9–13) y cuadrando cuota por cuota |
| El guardián rechaza | `productos:probar` | 17 comprobaciones, 0 fallas |
| Venta a crédito por producto | POS, navegador | CRD-2026-0010 → préstamo 25 → producto 13 |
| Enganche, línea, plazo, producto suspendido, aislamiento | `credito:probar-escenarios` | 10 comprobaciones, 0 fallas |
| Cobranza | `cobranza:diagnosticar` | pago aplicado y replicado |
| Fechas de calendario | `test fecha-calendario creditos-politica` | 13 pruebas |
| **Fineract caído** | apagado real del 8443, venta desde el POS | la venta se consumó; 3 hechos esperaron y se aplicaron al volver |
| **Reversas** | `credito:probar-reversas` | devolución baja el saldo allá; anulación deja el préstamo retirado |
| **Empresa sin Fineract** | `productos:probar` | catálogo completo y vendible sin sincronizar nada |

### Escrito pero no caminado

- **Reversa de un pago de cobranza.** La traducción está escrita, pero el ERP
  todavía no permite deshacer un cobro: el evento no tiene quien lo dispare.
- **Modo AUTORIDAD**, mora y cartera vencida, cierre del turno de caja.
- **Nómina, CRM y conciliación bancaria**: tienen corregido el mismo bug de
  `boolean = integer` que tuvo cobranza rota durante meses, pero nadie ha
  caminado esos flujos. El bug sólo aparece cuando alguien pasa por ahí la
  primera vez.
- **Webhook Fineract → ERP**: no existe. Mientras no exista, cada empresa tiene
  un solo sistema de captura.

### Se sabe que está mal

- **Un centavo por crédito.** El ERP y Fineract reparten el redondeo de la
  última cuota distinto: en CRD-2026-0010 la cuota 3 es 14.22 aquí y 14.21
  allá. No crece con el monto —es la última cuota, no una proporción— y cae
  dentro de la tolerancia de conciliación. Está pendiente decidirlo a
  propósito: o el ERP adopta el redondeo de Fineract, o se documenta que la
  conciliación tolera un centavo por crédito.
- **Los créditos CRD-2026-0001 a 0009 son anteriores a las correcciones.** Sus
  fechas están corridas un día y, en 0002, 0003 y 0006, Fineract también las
  tiene mal por el bug de meses-por-días. No se recalculan: son datos de prueba
  y repararlos costaría más que rehacerlos.
- **`PRODUCTO-DE-PRUEBA-DEL-G`** en el catálogo es el residuo del script de
  pruebas: Fineract no permite borrar productos de préstamo, así que la
  sincronización lo reimporta. Queda en borrador y no se vende.

### El patrón que se repite

Tres de los hallazgos más caros de estos días —el plazo en meses en lugar de
días, el parseo de fechas en UTC, y la verificación que mandaba la tasa que
decía comprobar— **cuadraban contra sí mismos**. Ninguno lo habría encontrado
una revisión de código ni el compilador; los tres salieron de comparar contra
un sistema externo y de leer con cuidado *por qué* pasó una prueba, no sólo
que pasó.

---

## La caída del registro externo, probada de verdad

Se apagó Fineract —`ECONNREFUSED` confirmado por el propio reporte— y se vendió
a crédito desde el punto de venta.

**Lo que el cajero vio:** nada. El catálogo de productos apareció completo
(vive en el ERP), la línea del cliente resolvió, la amortización se calculó con
su fecha de vencimiento, y la venta se consumó con su inventario, su póliza y
su crédito. Ninguna pantalla se colgó.

**Lo que quedó esperando:** tres hechos en REINTENTABLE —el crédito y las dos
pólizas del espejo contable— cada uno con su error y su próximo intento. Ni uno
en FALLIDO: el sistema distinguió una caída temporal de un error definitivo.

**Al volver Fineract**, el crédito se aplicó solo. Las dos pólizas no, y ahí
aparecieron dos defectos reales:

### «No sé si llegó» no es lo mismo que «probadamente no llegó»

Un asiento contable no admite clave de idempotencia en Fineract, así que el
vínculo se marca EN_VUELO antes de llamar y un reintento que lo encuentra así
se detiene: es preferible un evento en rojo que un mayor con un asiento doble.
Correcto.

Pero el fallo fue `ECONNREFUSED`: no hubo ni siquiera socket, la petición
jamás salió de la máquina. No había nada que verificar. En operación real eso
significaba que **cada caída convertía todas las pólizas del periodo en trabajo
manual**, que es exactamente lo que el outbox existe para evitar.

Ahora el error viaja con `pudoAplicarse`. Sólo los códigos que prueban que no
hubo conexión levantan la marca; el timeout y el reset siguen exigiendo
verificación, porque ahí la petición sí pudo haber llegado.

### La verificación que se le pedía a una persona la puede hacer el código

El mensaje decía «verifica en el mayor externo si el asiento se registró». Pero
el asiento viaja con `referenceNumber: SYNCRO-<folio>`: esa verificación es
abrir Fineract, filtrar por oficina y fecha, y buscar esa cadena.

Ahora la hace el despachador. Si el asiento está allá, recupera el vínculo y no
duplica; si no está, lo manda; si el mayor no contesta, espera. La protección
contra el asiento doble sigue intacta y dejó de costar trabajo humano —incluido
el caso feo de verdad, ése en que el POST sí se aplicó y se perdió la respuesta,
que antes también acababa en alguien comparando pantallas.

---

## Reversas: el hueco más grande, y no era el que parecía

La suposición era que las reversas estaban «mal traducidas». La realidad era
peor: **los eventos nunca se emitían**. `anulacion-ventas` cancelaba el crédito
en la base del ERP sin avisarle a nadie, `devoluciones-ventas` bajaba el saldo y
las cuotas igual, y si algo hubiera llegado, el despachador lo rechazaba con un
«todavía no tiene traducción, resuélvelo a mano».

Es decir: **anular una venta a crédito dejaba a Fineract con el préstamo vivo
por el importe completo**, en silencio y para siempre.

### Cómo se traduce cada una

| Hecho del ERP | En Fineract | Por qué así |
|---|---|---|
| Crédito cancelado | deshacer desembolso → deshacer aprobación → retirar | Un préstamo no se borra: hay que recorrer su ciclo de vida hacia atrás |
| Devolución de mercancía | `merchantIssuedRefund` | NO un pago: el efecto en el saldo es el mismo, pero un pago cuenta como cumplimiento del cliente y una devolución no |
| Pago revertido | `transactions/{id}?command=undo` | Escrito, sin productor todavía |

Los dos servicios publican el hecho **dentro de su propia transacción**, igual
que la venta original: si la anulación se revierte, el aviso se revierte con
ella.

### Lo que costó, y lo que enseña

La cancelación falló dos veces antes de quedar bien, y las dos veces por lo
mismo: **encadenar pasos a ciegas**.

Primero se mandaba «deshacer desembolso» seguido de «retirar», y Fineract sólo
admite retirar un préstamo pendiente de aprobación. El préstamo quedaba
*aprobado sin desembolsar* —ni vivo ni cancelado— mientras el ERP lo daba por
cancelado. Y la prueba dijo que había pasado, porque comprobaba «no está
activo» en vez de «quedó cancelado».

Después, con el ciclo completo, los comandos de deshacer rechazaban `locale`:
Fineract responde `400: locale` a los parámetros que un comando no espera, y
sólo el retiro —que registra una fecha— los necesita.

Ahora el ciclo relee el estado entre pasos, lo que además lo hace
**reanudable**: los dos préstamos que quedaron a medias durante las pruebas se
completaron solos al reintentar, sin intervención.

**Tres veces en el mismo día una prueba en verde tapó un defecto real:** la
verificación que mandaba la tasa que decía comprobar, el enganche rechazado por
el mensaje equivocado, y la cancelación a medio hacer. En los tres casos el
código estaba mal y la aserción era demasiado floja para notarlo. Un `PASA`
sólo vale lo que vale el motivo.

---

## PENDIENTE · Conectar el flujo de verificación a la originación

**Estado: esqueleto completo, desconectado.**

El motor de validación existe entero —siete evaluadores (INE, Buró, Círculo,
historial interno, listas de bloqueo, política interna, revisión manual),
expedientes, simulación, flujos por empresa— y ya tiene su pantalla en
*Crédito y cobranza → Configuración → Flujo de verificación*.

Lo que NO existe es la conexión: `MotorValidacionService` no se invoca desde
la originación de crédito ni desde la venta a plazos, y `flujoValidacionId`
se guarda en el producto y nunca se lee. Hoy se otorga crédito sin verificar
identidad, sin consultar burós y sin revisar listas. Aplica sólo la política
de crédito general (límite y línea disponible).

Conectarlo cambia a quién se le presta, así que no se hace por iniciativa
propia. Falta decidir, cuando lleguen los desarrollos pendientes:

- Qué hacer cuando un proveedor todavía no está contratado y el paso responde
  `NO_DISPONIBLE`: ¿bloquea, deja pasar, o manda a revisión?
- En qué punto exacto corre: al capturar la solicitud, al autorizar, o ambos.
- Qué pasa con los créditos ya vivos: no se re-verifican hacia atrás.
- Dónde se captura y se guarda el folio de autorización firmada del titular,
  sin el cual no se puede consultar Buró ni Círculo.

Mientras tanto la pantalla advierte que un flujo activo no está conectado, para
que nadie lo lea como si estuviera verificando.
