# SyncroERP ↔ Apache Fineract

Cómo se unen los dos mundos, qué queda en cada lado y por qué.

**Léelo antes de encender nada.** Las secciones «El error que hay que evitar»,
«Lo que Fineract no va a hacer» y «Lo que falta» son tan importantes como el
resto.

---

## 1. Dos tipos de empresa

SyncroERP es multiempresa y **no todas contratan Fineract**:

| | Sin Fineract | Con Fineract |
|---|---|---|
| Contabilidad | Sólo en el ERP, como siempre | En el ERP **y espejada** en el mayor de Fineract |
| Cartera y crédito | Sólo en el ERP | Fineract es el registro |
| Acceso a Fineract | No existe | Botón de acceso con la misma sesión de Keycloak |
| Qué cambia en su operación | **Nada** | Ver más abajo |

Esto se controla con **dos ejes independientes por empresa**, ambos apagados por
omisión (`integracion_configuracion_empresa`):

- `modo` → autoridad de Fineract sobre la **cartera**: `APAGADO` · `SOMBRA` · `AUTORIDAD`
- `modoContabilidad` → espejo del **mayor**: `APAGADO` · `ESPEJO`

Una empresa puede tener uno sin el otro. Y cada eje tiene además un techo global
(`CARTERA_MODO`, `CONTABILIDAD_EXTERNA_MODO`) que una empresa puede respetar por
debajo pero nunca exceder: es la protección contra encender por accidente a
todos los inquilinos.

**Una empresa sin el módulo no ejecuta ni una línea distinta.** El publicador
consulta el perfil y se retira; ninguna póliza, venta ni pago cambia de camino.

---

## 2. Dónde vive cada cosa

**Fineract no se construyó dentro del ERP.** Corre como servicio aparte, en su
propio contenedor, con **su propia base de datos PostgreSQL**
(`docker-compose.fineract.yml`). No comparte esquema ni tablas: se hablan por
REST. Compartir base sería la vía más rápida a que una migración de Fineract
rompa la contabilidad.

Lo que vive en el backend del ERP es un **cliente**, en tres capas:

```
  ventas · crédito · aprobaciones · motor contable     ← el núcleo del ERP
        │
        │  sólo conoce CarteraPublicador y ContabilidadPublicador
        │  y escribe una fila en integracion_eventos
        ▼
  src/integracion/                                     ← dominio neutral
        · outbox, vínculos, perfiles por empresa
        · despachador, conciliación, mapeo de cuentas
        · disponibilidad de crédito, decisión de crédito
        · PuertoCarteraExterna  ·  PuertoContabilidadExterna
        │
        ▼
  src/integracion/adaptadores/fineract/                ← único lugar que dice "loan"
        · cliente HTTP, OAuth2, cortacircuitos
        · FineractCarteraAdapter · FineractContabilidadAdapter
        │
        ▼  HTTP
  Fineract (servicio aparte, base aparte)
```

Reglas que sostienen esto:

- **El núcleo no nombra al proveedor.** `creditos.service.ts` llama a
  `cartera.creditoOriginado(...)`. No sabe que existe Fineract.
- **Dos archivos conocen a Fineract.** Los adaptadores. Cambiar de proveedor es
  escribir otros dos y cambiar **una línea** en `integracion.module.ts`.
- **Los identificadores externos son opacos.** El ERP los guarda en
  `integracion_vinculos` y los devuelve; nunca los interpreta.
- **Los parámetros del proveedor son opacos.** Los ids de producto viven en
  `integracion_configuracion_empresa.parametrosProveedor` (JSON).

### Sacarlo a un proceso aparte, después

El outbox es la costura. El ERP **sólo escribe** en `integracion_eventos`; quien
lee esa tabla —hoy `IntegracionDespachadorService`, en el mismo proceso— puede
mudarse a un worker independiente sin que el backend del ERP cambie una línea.
No se hizo todavía porque un proceso más cuesta despliegue, log y healthcheck, y
aún no se ha visto a Fineract responder contra datos reales.

---

## 3. Quién asienta: el ERP. Fineract recibe copia.

**El motor contable del ERP es el único que decide el cargo y el abono.** Cada
póliza que nace se replica a Fineract como asiento manual. Fineract queda con el
mayor completo —el libro principal, consolidable— y el ERP conserva el libro
fiscal mexicano.

Como los dos libros nacen del **mismo** asiento, no pueden divergir
estructuralmente. Ésa es toda la razón del diseño.

No existe un modo en que Fineract calcule el asiento, y no es una omisión: dos
motores calculando la misma operación divergen siempre, y el que se equivoca es
el que nadie está mirando.

### El enganche: un suscriptor, no cinco llamadas

El ERP crea pólizas desde cinco lugares (motor contable, captura manual, captura
manual en transacción, reversas, cierre). En vez de inyectar una llamada en cada
uno —una lista que alguien olvidaría ampliar— hay un suscriptor de TypeORM sobre
`Poliza`:

`PolizaEspejoSubscriber.afterInsert` corre **dentro** de la transacción que creó
la póliza y recibe su `EntityManager`, así que el evento del outbox nace y muere
con ella. La condición de enganche es «existe una póliza», que es exactamente la
que interesa.

### Mapeo de cuentas

Los dos catálogos son distintos por naturaleza: el del ERP está codificado según
el agrupador del SAT, el de Fineract es el suyo. `integracion_mapeo_cuentas`
guarda la correspondencia.

**Una póliza con una cuenta sin mapear falla en firme.** No se sustituye por una
cuenta parecida ni se manda a una cuenta puente: eso produce un mayor que cuadra
y miente, que es peor que un evento en rojo pidiendo atención.

`GET /integracion/cuentas/pendientes` lista lo que falta por mapear.

---

## 4. El error que hay que evitar

Fineract puede generar asientos **por su cuenta** cuando desembolsa o cobra un
préstamo, según el `accountingRule` del producto. Si además recibe el espejo de
la póliza que el ERP ya generó para esa misma venta, **las cuentas por cobrar
quedan al doble**, y el descuadre aparece semanas después, cuando ya nadie
recuerda qué cambió.

**Los productos de préstamo en Fineract deben quedar en «None».**

Esto no se deja a la memoria de nadie:

- `GET /integracion/verificacion` lee cada producto configurado y devuelve un
  `ERROR` si su contabilidad no es «None».
- Encender `modoContabilidad: ESPEJO` corre esa verificación y devuelve los
  avisos en la misma respuesta.

Córrela cada vez que alguien toque los productos del lado de Fineract.

---

## 5. La decisión de alcance

| Dominio | Sistema de registro | Por qué |
|---|---|---|
| Línea autorizada, créditos, amortización, pagos, mora, historial | **Fineract** | Es para lo que existe. El ERP lo resuelve con `creditos_clientes`: funciona, pero no tiene provisiones, reestructuras, castigos ni buró. |
| Mayor contable general | **ERP calcula · Fineract copia** | El ERP es el único que conoce el IVA mexicano. Fineract queda como libro principal consolidable. |
| Pólizas fiscales, catálogo SAT, cierre mensual, contabilidad electrónica | **ERP** | `motor-contable.service.ts` tiene 2 300 líneas de reglas mexicanas ya auditadas. |
| CFDI, complemento de pago (REP), cancelaciones | **ERP** | Fineract no conoce el SAT ni lo va a conocer. |
| Cuentas por pagar | **ERP (fase 2)** | Fineract no tiene módulo de CxP. |
| Tesorería, caja, arqueo de turno | **ERP** | El efectivo se cuenta donde está la caja. |

### Por qué el mayor fiscal no se movió a Fineract

Fineract tiene mayor general genérico, pensado para una institución financiera
internacional. Lo que no tiene, y el ERP sí:

- código agrupador del SAT y su mapeo por cuenta,
- generación de la póliza en formato de contabilidad electrónica,
- reclasificación de IVA trasladado a IVA cobrado en el momento del pago —que en
  México es cuándo se causa el impuesto, no cuándo se factura—,
- amarre póliza ↔ CFDI ↔ complemento de pago,
- cierre mensual con sus revisiones y su bloqueo de periodo.

Reconstruir todo eso encima de Fineract tiene costo alto y beneficio cero: nadie
audita mejor por tener el asiento sólo en Fineract. Con el espejo, Fineract sí
tiene el mayor completo —que era lo que se quería— sin pagar ese costo.

---

## 6. Cómo fluye una venta a crédito

```
  Venta a crédito (POS)
        │
        ├─ 1. ¿puede comprar?  ──► GET /integracion/disponibilidad/:clienteId
        │                              (timeout 1.2 s, caché de respaldo)
        │
        ├─ 2. se consuma la venta ── transacción única del ERP ──┐
        │      · CreditoCliente + cuotas                          │
        │      · movimiento de tesorería / caja                   │
        │      · póliza contable  ──► el suscriptor encola el espejo
        │      · EventoIntegracion (outbox)  ◄── se escribe aquí ─┘
        │
        └─ 3. después, fuera de la transacción
               IntegracionDespachadorService (cada minuto)
                   ├─ replica el cliente si hace falta
                   ├─ origina y desembolsa el crédito
                   ├─ espeja la póliza en el mayor
                   └─ marca los eventos ENVIADO
```

### El outbox

Ninguna llamada al proveedor ocurre dentro de una transacción de negocio. Si
ocurriera, un timeout dejaría al cliente sin ticket y a la caja sin cuadrar.

- si la venta se revierte, el evento desaparece con ella;
- si el proveedor está caído, el evento espera con retroceso exponencial
  (5 s → 1 h) y se aplica cuando vuelve;
- si el despacho se repite, la referencia determinista
  (`syncro:credito:<uuid>`) hace que el proveedor rechace el duplicado y el
  adaptador lo resuelva consultando en lugar de crear un gemelo.

Un evento que agota sus intentos queda en `FALLIDO` y aparece en
`GET /integracion/estado`. No se silencia.

### Idempotencia del asiento espejo

Un asiento manual **no** admite clave de idempotencia del lado de Fineract. Si el
POST se aplica y la respuesta se pierde, un reintento ciego duplicaría el asiento
y descuadraría el mayor sin dejar rastro.

Por eso el vínculo de la póliza se marca `EN_VUELO` **antes** de llamar, y un
reintento que lo encuentra así se detiene y pide verificación humana. Es
preferible un evento en rojo que un mayor con un asiento doble.

---

## 7. Los tres modos de cartera

| Modo | Qué hace | Quién decide el disponible |
|---|---|---|
| `APAGADO` | Nada. El ERP se comporta como siempre. | ERP |
| `SOMBRA` | Se replican los hechos y se concilian a diario. | **ERP** |
| `AUTORIDAD` | Fineract manda; las tablas del ERP quedan como proyección. | **Fineract** |

**La regla que no se negocia:** una empresa no pasa a `AUTORIDAD` mientras
`integracion_discrepancias` tenga filas abiertas. El endpoint lo verifica y
responde 409. `SOMBRA` no es un paso ceremonial: es donde se descubre que el
redondeo de la cuota 12 difiere en tres centavos.

---

## 8. El punto de venta

`GET /integracion/disponibilidad/:clienteId` es la única puerta. Siempre
responde, y siempre dice de dónde salió:

| `origen` | Significado |
|---|---|
| `ERP` | Modo `APAGADO` o `SOMBRA`. Decidió el ERP. |
| `EXTERNO` | Modo `AUTORIDAD`, consulta en línea exitosa. |
| `CACHE_DEGRADADO` | Fineract no respondió; último valor conocido (hasta 30 min). |

`degradado: true` marca la venta para que la conciliación la revise. La caja no
se detiene por una falla de infraestructura, pero tampoco autoriza a ciegas y sin
dejar rastro.

Hay además un cortacircuitos: tras 5 fallos seguidos las llamadas fallan de
inmediato durante 20 s. Sin él, cada venta pagaría 1.2 s de timeout mientras
Fineract está caído.

---

## 9. Acceso a Fineract desde el ERP

`GET /integracion/acceso` devuelve la URL de la interfaz web de Fineract y el
tenant, **sólo** para empresas con algún eje encendido. Una empresa sin el módulo
recibe 403.

No se emite ningún token ni se pasa credencial por la URL: Fineract comparte
Keycloak con el ERP, así que basta con que el navegador ya tenga sesión. Firmar
una URL de acceso sería inventar un segundo mecanismo de autenticación al lado
del que ya existe, y el segundo siempre es el que se rompe.

Configúralo con `FINERACT_WEB_APP_URL`.

---

## 10. Originación de crédito: el flujo lo diseña cada empresa

Antes había una política fija. Ahora hay un **motor de pasos configurables**: el
administrador de cada empresa arma su propia secuencia y la versiona.

`validacion_flujos` · `validacion_pasos` · `validacion_ejecuciones` ·
`validacion_resultados_paso`

### Siete tipos de paso

`IDENTIDAD_INE` · `BURO_CREDITO` · `CIRCULO_CREDITO` · `HISTORIAL_INTERNO` ·
`LISTA_BLOQUEO` · `POLITICA_INTERNA` · `REVISION_MANUAL`

Cada uno se resuelve contra su puerto. **Un puerto sin proveedor devuelve
`NO_DISPONIBLE`, nunca `APROBADO`** — un evaluador permisivo por omisión es la
clase de decisión que se olvida y termina otorgando crédito sin validar a nadie.
Los proveedores llegan cuando se migren los componentes de la suite de SUMA;
enchufar uno es escribir una clase y sumarla a la lista del módulo.

### Tres políticas por paso

| Política | Si el paso no aprueba |
|---|---|
| `BLOQUEANTE` | corta el flujo y rechaza |
| `DERIVA_A_REVISION` | el expediente pasa a una persona |
| `INFORMATIVO` | sólo suma o resta puntos |

**Un bloqueante que falla detiene el recorrido.** No tiene sentido pagar una
consulta de buró —que se cobra por consulta— cuando la identidad ya salió
rechazada.

### Reglas que el sistema no deja romper

Al crear un flujo se rechaza si:

- no incluye validación de identidad — es la línea que separa un control de
  crédito de un formulario;
- la identidad es `INFORMATIVA`;
- un paso de revisión manual es `INFORMATIVO`: no revisa nada.

Y el tope automático arranca en **cero**, o sea que todo pasa por autorización
humana hasta que alguien decida lo contrario a conciencia.

### Versionado

Un flujo publicado no se edita: se publica una versión nueva, y cada ejecución
guarda con qué versión corrió. Si mañana alguien endurece la política, las
decisiones de ayer siguen siendo explicables con la política de ayer — que es lo
primero que pregunta una auditoría de crédito.

### Simulación

`POST /api/integracion/validacion/simular` permite forzar la respuesta de cada
paso para ver cómo se comporta el flujo ante un buró bajo o una identidad
rechazada, sin provocarlo de verdad. El expediente queda marcado como
simulación y no otorga nada.

Desde línea de comandos, sin sesión:

```
npm.cmd run flujo:simular
```

Siembra un flujo de ejemplo y lo somete a seis escenarios.

### Lo que el motor NO hace

**No otorga.** Produce un expediente y un veredicto. Quien autoriza sigue siendo
el flujo `CREDITO_CLIENTE` de aprobaciones, con su matriz de autorizadores. La
segregación de funciones que se corrigió en la remediación no se pierde por
meter un motor de scoring.

---

## 10 bis. Usuarios y roles entre los dos sistemas

Fineract corre con `AUTO_CREATE_USER=false`: un token de Keycloak válido no
basta, la persona tiene que existir también allá.

- **Consultas**: el ERP reenvía el token del usuario, así que Fineract audita a
  nombre de quien realmente consultó y le aplica sus permisos. Si esa persona no
  existe allá, cae a la cuenta de servicio en vez de negarle la consulta al
  cajero.
- **Escrituras**: cuenta de servicio, porque salen del outbox cuando ya no hay
  petición viva. La identidad del operador viaja como nota, sin falsificarse.
- **Mapeo de roles** (`integracion_mapeo_roles`): de muchos a uno, porque un rol
  del ERP suele necesitar varios del otro lado.
- **Diagnóstico**: `GET /api/integracion/roles/diagnostico` dice de cada usuario
  qué le falta — `MAPEAR_ROL`, `DAR_DE_ALTA`, `CORREGIR_ROLES` o `NINGUNA`.
- **Aprovisionamiento**: lo dispara una persona. Un rol sin mapear no se
  aprovisiona: el alta falla con un mensaje claro en vez de crear un usuario sin
  roles.

---

## 11. Puesta en marcha

### 11.1 Levantar Fineract

```bash
docker compose -f docker-compose.postgres.yml -f docker-compose.fineract.yml up -d
```

### 11.2 Configurar en Fineract, a mano

- la oficina (anota su id: va en `oficinaContableExterna`),
- la moneda MXN,
- **los productos de préstamo, todos con contabilidad «None»** (§4): uno para
  crédito simple 30/60/90 días, uno para mensualidades con interés sobre saldos
  insolutos, y uno para meses sin intereses,
- el **catálogo de cuentas** del mayor, al que se mapearán las del ERP.

### 11.3 Keycloak

Cliente de servicio `syncro-erp-fineract` (client credentials) con su rol en
Fineract, en el mismo realm que ya usa el ERP. El ERP entra como servicio, no
suplantando usuarios: Fineract no soporta impersonación real. La identidad del
operador se conserva en el ERP —que ya la audita— y viaja como nota del recurso.

### 11.4 Variables

En `backend/.env.local`, según `.env.example`. Sin `FINERACT_URL` los adaptadores
quedan inertes y el ERP arranca igual que antes.

### 11.5 Mapear el catálogo de cuentas

```
GET  /integracion/cuentas/pendientes     → lo que falta
POST /integracion/cuentas/mapeo          → { cuentaContableId, idExterno }
```

Debe quedar en cero antes de encender el espejo.

### 11.6 Encender, por empresa

```
PATCH /integracion/configuracion
{ "modo": "SOMBRA",
  "modoContabilidad": "ESPEJO",
  "oficinaContableExterna": "1",
  "productoCreditoSimpleId": 1,
  "productoMensualidadesId": 2,
  "productoMsiId": 3 }
```

Revisa los `avisos` de la respuesta. Un `ERROR` de `contabilidad-duplicada`
significa que un producto va a asentar por su cuenta: corrígelo antes de operar.

### 11.7 Vivir en SOMBRA

`GET /integracion/conciliacion` debe quedar vacío varios días seguidos. Sólo
entonces subir la cartera a `AUTORIDAD`.

---

## 12. Lo que Fineract no va a hacer

Conviene que quede escrito antes de que alguien lo prometa en una junta:

- **No emite CFDI ni complementos de pago.**
- **No genera la póliza fiscal mexicana.** Recibe el espejo del asiento, no la
  responsabilidad de producirlo.
- **No cierra el periodo contable.** El cierre, sus revisiones y su bloqueo
  siguen en el ERP.
- **No lleva cuentas por pagar.** No tiene el módulo.
- **No sabe de IVA.** El importe que recibe es el total; la separación del IVA y
  su reclasificación al cobrar es del ERP.
- **No reemplaza la caja.** El arqueo de turno se queda donde está el efectivo.

---

## 13. Lo que falta

1. **Ninguna venta a crédito se ha ejecutado de punta a punta contra Fineract.**
   El enlace ya autentica y el despachador ya llama; lo que no se ha hecho es el
   recorrido completo con datos reales. Es lo primero que hay que hacer.
2. **Reversas de cartera.** `CREDITO_CANCELADO`, `PAGO_REVERTIDO` y
   `AJUSTE_DEVOLUCION` fallan a propósito pidiendo resolución manual. Su
   equivalente en Fineract depende del producto configurado y una reversa mal
   traducida corrompe el saldo en silencio.
3. **Webhook de Fineract hacia el ERP.** La sincronía va en un sentido más
   conciliación diaria. Ver la regla de captura única en
   `MAPA-FLUJOS-ERP-FINERACT.md`.
4. **Conciliación del mayor.** Hoy se concilia el saldo de cartera por cliente;
   falta comparar saldo por cuenta contable. El puerto ya expone `saldoCuenta`.
5. **Proveedores de validación.** Los siete evaluadores existen; INE, buró,
   círculo y listas esperan a que se migren los componentes de SUMA.
6. **Aislamiento entre empresas en Fineract.** Todo vive en el tenant `default`
   y en Head Office. Para varias empresas hacen falta oficinas (mismo tenant) o
   tenants separados. Ver §15.
7. **Cuentas por pagar.** Fase 2.
8. **Pantallas.** La administración es por API. Deliberadamente no se marcó
   ningún endpoint como navegable, para no repetir el problema de menús que
   apuntan a páginas inexistentes que corrigió la remediación.
9. **El frontend no refresca el token.** Cuando el access token de Keycloak
   caduca, el usuario va al login y pierde lo que estaba haciendo. Está fuera
   del alcance de esta integración, pero es una molestia diaria y Keycloak ya
   entrega el refresh token.

---

## 14. Prueba mínima antes de producción

En una empresa de prueba, con `CARTERA_MODO=SOMBRA` y
`CONTABILIDAD_EXTERNA_MODO=ESPEJO`:

1. **Verificar primero que otra empresa sin el módulo no cambia nada**: una venta
   a crédito completa debe comportarse exactamente igual y no generar ningún
   evento en `integracion_eventos`.
2. `GET /integracion/verificacion` sin ningún `ERROR`.
3. `GET /integracion/cuentas/pendientes` vacío.
4. Alta de cliente → autorizar línea → verificar que aparece en Fineract con el
   `externalId` correcto.
5. Venta a crédito a 6 mensualidades → la tabla de amortización de Fineract debe
   coincidir **peso por peso** con `amortizacion_cuotas`. Si no, el producto está
   mal configurado.
6. La misma venta → verificar que el asiento espejo llegó al mayor de Fineract
   **una sola vez** y con las mismas cuentas que la póliza del ERP.
7. Pago de cobranza parcial → verificar abono, saldo y su asiento espejo.
8. **Apagar Fineract** y hacer una venta a crédito. Debe completarse sin demora
   perceptible, con los eventos pendientes.
9. Encender Fineract y esperar un minuto: los eventos deben aplicarse solos.
10. `POST /integracion/conciliacion/ejecutar` sin discrepancias.

---

## 15. Tres formas de vender esto

La dependencia va en un solo sentido: Fineract y su portal no saben que el ERP
existe. Eso permite tres productos, no uno.

| | Qué lleva | Estado |
|---|---|---|
| **Solo ERP** | Ventas, inventario, CFDI, contabilidad SAT. Crédito en tablas propias. | Funciona hoy |
| **Solo Fineract + portal** | Cartera, productos financieros, originación, mora | Funciona hoy |
| **ERP + Fineract** | Todo, con la cartera en el core | En construcción |

Para vender el segundo a terceros hace falta resolver el aislamiento (§13.6):
hoy todo comparte tenant y oficina, así que dos clientes se verían la cartera.

---

## 16. Quién manda contablemente

**El ERP.** Tres razones, en orden de peso:

1. **El libro de registro debe ser el que carga la obligación legal.** Quien
   presenta contabilidad electrónica, timbra CFDI y responde una auditoría es la
   empresa a través del ERP. Un mayor autoritativo que no puede producir el
   formato que la ley exige no es autoritativo, es un reporte.
2. **El alcance no coincide.** La contabilidad incluye inventario, nómina,
   activo fijo, compras, costo de ventas. Fineract no modela nada de eso.
3. **Es el patrón de la industria.** Cuando un core bancario convive con un ERP,
   el core es auxiliar y alimenta al mayor del ERP. Nadie sostiene dos mayores
   generales a propósito.

**Sobre el espejo contable (§3), con honestidad:** no es práctica estándar.
Crea un segundo libro que hay que conciliar para siempre y su valor es sobre
todo de presentación. Vale la pena si se va a consolidar varias empresas en el
core, si alguien va a usar los reportes de Fineract en serio, o si se prepara
regulación que exija reportar desde ahí. Si no, conviene dejarlo apagado —que es
como viene.

**Y hay un escenario donde la respuesta se invierte:** si el crédito se separa
en otra figura legal (una SOFOM), ya no hay un libro y su copia sino **dos
entidades con dos contabilidades**, con operaciones entre partes relacionadas.
Ahí Fineract sí manda contablemente, en sus propios libros. Conviene responder
esa pregunta antes de invertir más en el espejo: los dos caminos divergen.

---
