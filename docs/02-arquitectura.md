# 02 · Arquitectura

**Revisión:** 28 de septiembre de 2026
**Alcance:** arquitectura, autenticación, autorización, aislamiento, integración
con el core financiero, y las reglas que el sistema hace cumplir por sí mismo.

> Este documento describe lo que el sistema **hace**, verificado contra el
> sistema corriendo, no lo que se pretendía que hiciera. Donde algo no se ha
> podido comprobar, se dice —y lo que no está probado está reunido en
> `06-limites-conocidos.md`—.

---

## 1. Piezas y puertos

Ver `01-instalacion-y-puesta-en-marcha.md` §1 para la tabla completa y los
requisitos.

En resumen: frontend Next.js (3000) → backend NestJS + TypeORM + PostgreSQL
(4000, prefijo `/api`) → PostgreSQL (55432). Keycloak remoto, realm `suma`. En
los modos con core: Fineract (8443) y su portal (3002). Consola SUMA (3010).

**El código que corre vive en `syncroERP/claude/backend` y
`syncroERP/claude/frontend`.** Las carpetas `syncro-erp-backend` y
`syncro-erp-frontend` del mismo repositorio están congeladas desde el 10 de
septiembre y no ejecutan nada. Conviene retirarlas.

### La estrategia de nombres

El proyecto usa `LowercaseNamingStrategy`: PostgreSQL pliega a minúsculas todo
identificador que no vaya entrecomillado. De ahí salen dos reglas que valen para
todo el código y que han costado varios defectos:

- **Nunca entrecomillar una columna camelCase** en SQL crudo ni en una
  migración: una columna creada como `"empresaId"` conserva las mayúsculas y
  ninguna consulta del proyecto podrá volver a pedirla.
- **Todo alias con mayúsculas sí va entre comillas**, y si se entrecomilla al
  declararlo, se entrecomilla al referenciarlo.

Las dos las vigila una prueba (§10).

---

## 2. Los tres modos de despliegue

El producto se vende de tres formas, y el código lo respeta:

1. **Sólo ERP** — sin core financiero.
2. **Sólo Fineract** — el core sin el ERP.
3. **ERP + Fineract** — integrados.

La contratación se expresa en tres ejes independientes, y cada pantalla declara
de cuál depende (`requiereCore: 'cartera' | 'contabilidad' | 'validacion'`):

- **`ModoCartera`** — créditos y cobranza en el core (`APAGADO` · `SOMBRA` ·
  `AUTORIDAD`).
- **`ModoContabilidad`** — el espejo contable (`APAGADO` · `ESPEJO`).
- **`validacion`** — verificación de crédito.

Una regla que se descubrió a golpes: **el techo global es un techo, nunca un
valor por omisión.** Ofrecer una pantalla de integración a una empresa que no
contrató el core es enseñarle una puerta que no compró.

Esa regla vive en `integracion/utils/modo-contabilidad.util.ts` como funciones
puras, porque el cierre contable también la necesita y no puede inyectar el
servicio de integración. **Una sola implementación, dos consumidores**: copiarla
habría sido la quinta lista paralela del sistema, y así nacieron la mitad de los
defectos de este proyecto.

> **Una empresa «usa registro externo» si cualquiera de los dos ejes está
> encendido.** Preguntar por un solo eje —lo que hacía el código de alta— era
> contestar por los dos: una empresa con contabilidad en espejo y cartera
> apagada quedaba clasificada como si no tuviera core. La predicado único vive
> en `AltasEmpresasService.usaRegistroExterno`, y
> `integracion/tres-modos-de-contratacion.spec.ts` (15 pruebas) recorre las
> combinaciones.

---

## 3. Autenticación

**Keycloak es obligatorio.** El login del frontend redirige al realm `suma`; el
backend no autentica contraseñas.

La estrategia JWT (`iam/strategies/jwt.strategy.ts`) acepta **sólo RS256 de un
emisor registrado**, y comprueba que el emisor esté registrado **antes** de
pedirle sus llaves — ese orden es la mitad de la seguridad del archivo. Un token
emitido por el propio ERP no abre nada.

Cada empresa puede tener su propio realm, en la tabla `empresa_identidad`
(ver §5 y `05-aprovisionamiento-y-consola-suma.md`).

> **Corregido el 25-sep-2026:** esa tabla se creó con las columnas
> entrecomilladas en camelCase (`"empresaId"`). Postgres conserva las mayúsculas
> del identificador entrecomillado, así que **ninguna consulta contra esa tabla
> funcionó nunca**, y el `try/catch` que las envuelve lo convertía en «esta
> empresa no tiene realm propio». La separación por inquilino existía en la
> tabla y no llegaba a aplicarse. Migración `1790300000000-IdentidadEnMinusculas`.

### Contraseñas

Se administran **en Keycloak**. El ERP retiró el 25-sep-2026 sus cuatro rutas
públicas de contraseña (`verificar-email`, `reenviar-verificacion`,
`recuperar-password`, `restablecer-password`) y sus dos pantallas.

Lo que las delataba no era que existieran, sino que **el controlador ya tenía la
guarda correcta y sólo una ruta la invocaba**. Una guarda escrita y no llamada es
peor que ninguna: quien lee el archivo cree que está protegido.

El portal de Fineract hace lo mismo: `POST /api/auth/login` responde **410**
—«el acceso por usuario y contraseña de Fineract está deshabilitado»— y el único
camino es OIDC.

---

## 4. Autorización: tres sistemas que tienen que coincidir

1. **`PermisoEndpointGuard`** — la tabla `rol_endpoint_permisos`. Decide **quién
   deja pasar**.
2. **`@Roles(...)`** — el guardia estático del controlador. Sólo puede **negar**.
3. **`exigirRol()`** dentro de los servicios — reglas de negocio.

La tabla concede; el guardia veta. Si la plantilla concede lo que el `@Roles`
veta, al arrancar se apagan esas filas y quedan botones que el frontend pinta y
el servidor rechaza.

### Cómo se reparte

- `modulos-catalogo.ts` agrupa rutas en módulos por prefijo.
- `plantillas-permisos.ts` da a cada rol sus módulos (`completo` / `consulta`),
  sus `accionesIrrenunciables` (el piso) y sus `accionesVedadas` y
  `modulosVedados` (el techo).
- Al arrancar, el **piso** se repone entero —incluidas las acciones nuevas de un
  módulo ya concedido— y sólo **enciende**, nunca apaga: una ampliación hecha a
  mano sobrevive al reinicio.

### Trece roles

`empleado`, `almacenista`, `comprador`, `finanzas`, `contador`, `tesoreria`,
`credito`, `cobranza`, `hoteleria`, `rrhh`, `gerencia`, `direccion`, `gobierno`,
más `administrador`.

`gobierno` merece mención: define quién aprueba qué, y tiene
`PATCH /aprobaciones/:id/resolver` **explícitamente vedado**. Gobierna la matriz
de firmas sin poder firmar ninguna.

### De la acción a la pantalla

`endpoints-navegables.ts` traduce «este rol puede llamar a `GET /x`» en «este rol
ve la pantalla `/dashboard/y`». El frontend pide su mapa de rutas a
`/admin/permisos/mis-rutas`.

> **Dos defectos corregidos aquí, y son el mismo con dos disfraces:**
>
> 1. El catálogo guarda cada endpoint con **todos** sus parámetros renombrados a
>    `:id`; el diccionario se escribía con el nombre real (`:estadoCuentaId`) y
>    la búsqueda era por clave exacta. Toda entrada cuyo parámetro no se llamara
>    `id` quedaba **muda** — no fallaba, no hacía nada. Cuatro pantallas
>    invisibles para todos los roles, entre ellas la **conciliación bancaria**,
>    que es el único desbloqueo del cierre mensual.
> 2. Los endpoints con `@SkipPermisos()` —los catálogos de referencia— **no se
>    dan de alta** en la tabla: no hay permiso que conceder. Pero `mis-rutas` se
>    armaba sólo con filas de permiso, así que sus pantallas quedaban fuera y el
>    layout las negaba. La acción permitida y la pantalla negada.

### El portal de Fineract: 449 funciones de ruta

El BFF del portal (256 archivos `route.ts`, 449 funciones exportadas) replica el
modelo de permisos de Fineract en el borde. **437 comprueban permiso**; las 12
restantes son las de autenticación, el webhook que se autentica con el token de
la URL, la salud del proceso y el diagnóstico «¿qué alcanzo yo a ver?», que se
queda sin permiso a propósito —sondea con el token de quien pregunta, y exigirle
permiso lo volvería inútil justo para quien lo necesita—.

`pruebas/todas-las-rutas-tienen-guardia.test.ts` recorre `app/api` entero y se
pone roja el día que alguien escriba una ruta sin guardia, no el día que alguien
la use. Las excepciones se declaran una por una con su motivo, y la prueba
también avisa si sobra una excepción huérfana.

### Superficie pública del ERP

Toda ruta `@Public()` tiene su propia puerta, y hay una prueba que lo exige:

| Ruta | Puerta |
|---|---|
| `/salud`, `/salud/listo` | Sonda de vida, no devuelve datos. |
| `POST /auth/login` | Es el acto de obtener sesión (cerrado en modo Keycloak). |
| `POST /usuarios/invitacion` | Lectura por token; POST para que el token no quede en el log de URLs. |
| `POST /usuarios/aceptar-invitacion` | El token de la invitación. |
| `/aprovisionamiento/empresas/*` (10) | Clave de servicio en cabecera. |
| `POST /integracion/avisos/:clave` | Clave en la ruta (webhook de Fineract). |

---

## 5. Aprovisionamiento

**SUMA, desde su consola.** El ERP es ejecutor, no administrador. El detalle
operativo está en `05-aprovisionamiento-y-consola-suma.md`; aquí sólo la puerta.

`APROVISIONAMIENTO_TOKEN` en la cabecera `x-aprovisionamiento`:

- Comparación en **tiempo constante** — salir en el primer carácter distinto
  haría que el tiempo de respuesta revelara cuántos se acertaron.
- Sin clave configurada, o con menos de 32 caracteres, las rutas responden
  **404**, no 403: parecen no existir.

Hubo una pantalla para esto dentro del ERP y **era un error**: dejaba que el
administrador de una empresa operadora diera de alta clientes, convirtiendo a un
inquilino en administrador de los demás. Se retiró junto con el registro público.

---

## 6. Aislamiento entre empresas

83 entidades llevan `empresaId`. El aislamiento no es propiedad de una pantalla
ni de un servicio: es propiedad de **cada consulta**, y basta una que se olvide.

Hay una prueba que exige que toda consulta cruda mencione la empresa, con seis
excepciones declaradas una por una con su razón. **La lista es corta a
propósito: si crece, el aislamiento se está erosionando.**

Medido en vivo con dos empresas y nueve roles: **291 llamadas, cero fugas**.

> **Corregido:** el diagnóstico de configuración contaba los detalles de
> transferencia huérfanos de **todas** las empresas. El daño no era sólo el dato
> filtrado: a una empresa limpia se le reportaba un ERROR con enlace a una
> pantalla donde no había nada que arreglar. Un error irresoluble acaba
> ignorándose, y con él los que sí eran suyos.

---

## 7. Contabilidad y cierre mensual

### Pólizas

Cinco caminos las crean, y todos pasan por una sola puerta, que además impide
registrar una póliza con **fecha futura**: la contabilidad registra lo que ya
ocurrió.

> **Corregido el 25-sep:** esa puerta era `aFecha`, que además de validar
> **normaliza**. Y la reversa empieza leyendo la fecha de la póliza *original*
> con esa misma función, así que **cancelar una póliza ya fechada adelante era
> imposible**: respondía «No se puede registrar una póliza con fecha 2026-10-15»
> a quien no estaba registrando nada, sino intentando arreglar exactamente eso.
> El control tapaba la única salida del problema que venía a evitar. Normalizar y
> validar se separaron (`aFecha` / `aFechaNueva`); la reversa por omisión ya no
> hereda una fecha futura, se fecha hoy.

Las cuentas controladas por un auxiliar (bancos, clientes, proveedores,
inventario) **no admiten pólizas manuales**, y el sistema lo explica: registra la
operación en su módulo para que el auxiliar y el mayor coincidan.

### Quien genera el asiento avisa al documento

Cada módulo escribía el resultado en su propio documento **en el mismo sitio
donde llama a `reintentarAhora`**, justo después de confirmar la operación. Si
ese primer intento fallaba, el asiento se quedaba en la cola y se generaba
después —por el cron o por el botón de «Asientos pendientes»— y **ahí ya no había
nadie que volviera a tocar el documento**.

Resultado medido el 28-sep: un cobro de City Ledger de $1 200 con
`estadoContable: 'PENDIENTE'` y sin póliza, cuyo asiento estaba **GENERADO** y
con póliza. La contabilidad se hizo; el cobro no se enteró nunca. Eso dejaba un
hallazgo de severidad **CRÍTICA** que nadie podía resolver y la instalación
entera en `BLOQUEADO`.

**La regla, ahora:** quien pone el asiento en GENERADO avisa al documento, en un
solo sitio —no repartido por cada módulo, que es lo que dejó el hueco—. Cinco
tablas guardan a qué asiento esperan (`hoteleria_city_ledger_cobros`, `folios`,
`pagos_proveedor`, `pagos_cobranza`, `importaciones_inventario`) y el aviso:

- lleva la póliza con `COALESCE`, para no borrar la que el documento ya tuviera;
- lleva la empresa: el aislamiento no se rompe ni para arreglar esto;
- sólo toca lo que no está al día (`<> 'GENERADO'`);
- **se emite también cuando el asiento ya estaba generado**, que es exactamente
  el caso a reparar: sin eso, el botón manual contestaba «ya estaba generado» sin
  arreglar nada, que es lo más parecido a no tener botón;
- si falla, el asiento sigue generado y no se tira la cola por esto.

La migración `1790530000000-ElDocumentoNoSeEntero` repara lo que quedó atascado.
Copia un hecho **que ya es cierto** —el asiento está en GENERADO y con qué
póliza—; no genera pólizas, no toca importes y no decide nada. Usa `to_regclass`
para saltar las tablas que una instalación todavía no tenga, y **no se deshace**:
volver a `PENDIENTE` sería reintroducir la mentira a propósito.

### Un movimiento de tesorería no cancela el documento que lo originó

`TesoreriaService.cancelar()` marca el movimiento y escribe una contrapartida. No
toca el documento de origen, y nadie mira después si el movimiento quedó
cancelado. Así que dos clics bastaban para que cancelar el movimiento de un pago
a proveedor devolviera el saldo al banco **y dejara la orden de compra diciendo
que está pagada**: dos subsistemas afirmando cosas contrarias, cada uno coherente
por dentro, y ninguna pantalla donde se vea la diferencia.

**La regla:** se cancela el **documento**, y el documento cancela su movimiento.
Un movimiento con `tipoDocumento` se niega, y la negativa dice qué lo generó y
**dónde** se deshace. Donde el ERP no tiene esa pantalla —hoy, el pago a
proveedor— lo dice también, en vez de inventar un remedio: mandar a alguien a una
puerta que no está en la pared cuesta más que la propia negativa.

La contrapartida de una cancelación se escribe con
`tipoDocumento: 'CANCELACION_TESORERIA'` y `documentoId` del original, así que
entra por la misma puerta: cancelar la cancelación es un nudo, no una corrección.
Y un `tipoDocumento` que nadie declaró **también** se niega, nombrándolo: la
tabla se mantiene a mano y quedarse corta no puede significar «entonces déjalo
pasar».

La pantalla de Tesorería → Movimientos deja de ofrecer el botón donde el servidor
va a negar, y enseña «del documento» en su lugar. **Un botón que lleva a una
negativa es la familia de defectos que más veces ha aparecido en este proyecto.**

### El cierre: nueve controles

| Clave | Qué comprueba | Bloquea |
|---|---|---|
| `MEDICION` | Que ninguna consulta del diagnóstico falló | sí |
| `POLIZAS` | Que el mes tiene registros contables | sí |
| `BALANZA` | Que Debe y Haber coinciden | sí |
| `INTEGRIDAD` | Que ninguna póliza está a medias o descuadrada | sí |
| `ASIENTOS` | Que nada del mes quedó esperando póliza | sí |
| `OPERACIONES_SIN_CONTABILIZAR` | Que ningún módulo se quedó fuera del mayor | sí |
| `BANCOS` | Que cada cuenta activa tiene conciliación **cerrada** | configurable |
| `ESPEJO_CONTABLE` | Que las pólizas llegaron al mayor externo | sí *(sólo en modo ESPEJO)* |
| `CONCILIACION_INICIAL` | Que existe una revisión de referencia | no |

Más tres confirmaciones humanas y un respaldo que toma el propio sistema.

> **Para cerrar un mes había que atravesar seis defectos en fila**, cada uno
> tapando al siguiente. El 24-sep-2026 se cerró **el primer mes en la historia
> del sistema**; no había forma de que hubiera ocurrido antes.

Tres reglas que salieron de ahí y valen más allá del cierre:

- **Un control que cuenta un estado que ningún código escribe no es estricto: es
  imposible.**
- **Una consulta que falló no vale cero.** Lo que no se pudo medir es un bloqueo
  con nombre, no un verde.
- **Un control que no puede fallar es ruido, y el ruido tapa a los que sí
  importan.** Por eso `ESPEJO_CONTABLE` **no aparece** en una instalación sin
  core: a quien compró sólo el ERP no le dice nada, y si apareciera en verde
  aprendería a pasar de largo por la lista entera.

#### `ESPEJO_CONTABLE`

El diagnóstico tenía ocho controles y ninguno preguntaba por la única integración
que la empresa declaró como su mayor espejo. Medido: **50 eventos en la bandeja
de salida, 5 fallidos**, es decir cinco pólizas registradas en el ERP que nunca
llegaron al mayor externo — y agosto se cerró así.

Cuenta lo no entregado en **los tres** estados: `FALLIDO`, `REINTENTABLE` y
`PENDIENTE`. Contar sólo los fallidos dejaría pasar el caso peor —un asiento que
se envió y del que nunca se supo la respuesta—, que es justamente la divergencia
de la que nadie se entera.

### El respaldo

Lo toma el cierre, después de todos los controles y **antes** de las escrituras
—de modo que el archivo refleja el estado previo, que es al que alguien querría
volver—. Si falla, el mes no se cierra.

Se descartó a propósito escribir un volcado propio: un respaldo sólo vale si
restaura, y uno hecho a mano tiene mil formas de salir «bien» y no restaurar.

El servicio **verifica** lo que quedó en disco: tamaño mayor que cero, la marca
`PostgreSQL database dump complete` al final, y su huella SHA-256 en la
evidencia. Si el archivo se cortó a la mitad lo rechaza **y lo borra**: un archivo
a medias es peor que ninguno, porque alguien lo encuentra el día de la desgracia
y cree que tiene respaldo.

### El candado del período cerrado

`periodoEstaCerrado` remataba su consulta con `.catch(() => [])`, así que cuando
la consulta fallaba la respuesta a «¿está cerrado este período?» era **no**: el
único control que impide escribir en un mes cerrado se volvía permisivo justo al
dejar de funcionar. **Corregido:** ahora falla y dice por qué. Entre no poder
comprobar y dejar pasar, un candado elige lo primero.

Lo mismo con la numeración de folios: un `.catch(() => [null])` reiniciaba el
correlativo en 1, y un folio contable repetido es una póliza que tapa a otra en
cualquier reporte que agrupe por folio.

---

## 8. La bitácora de auditoría

Cada registro guarda un SHA-256 canónico de su contenido **más el hash del
registro anterior**, escrito dentro de una transacción `SERIALIZABLE` con
*advisory lock* por empresa y `FOR UPDATE` sobre el último. Así una bitácora
manipulada se delata: borrar o alterar un registro rompe la cadena.

> **Corregido el 25-sep, y es el defecto más grave de toda la revisión.** La
> consulta del hash anterior decía `SELECT hashRegistro` — sin comillas.
> PostgreSQL pliega a minúsculas todo identificador suelto, así que la fila
> llegaba como `{ hashregistro }`, `anteriores[0].hashRegistro` era `undefined`,
> el `?? null` lo convertía en `null` y **cada registro se guardaba con
> `hashAnterior = null`**.
>
> La bitácora no era una cadena: era una pila de registros sueltos. Se podía
> borrar uno de en medio y nada lo delataba — lo único que un hash encadenado
> viene a impedir. Todo el andamiaje estaba puesto y bien puesto, y no encadenaba
> nada.
>
> Y de rebote, `verificarIntegridad` contestaba **`integra: false` a partir del
> segundo registro, siempre, en cualquier instalación**, sobre una bitácora
> intacta. Un verificador que acusa a todo el mundo es un verificador que nadie
> vuelve a mirar.

El verificador ahora distingue dos fallas que se veían iguales: un registro
**alterado** y un registro **que nunca se encadenó**. Sigue devolviendo
`integra: false` en ambos casos —no hay cadena que verificar en un tramo sin
enlace— pero lo dice con su nombre y añade `contenidoIntacto`, para no acusar de
manipulación a nadie.

**Para la entrega:** ver la última casilla de `01-instalacion-y-puesta-en-marcha.md` §7.

---

## 9. Integración con Fineract

- **Outbox** por tipo de evento: los de contabilidad y los de cartera se
  despachan y se cuentan por separado. Apagar un eje no puede quedar bloqueado
  por eventos del otro.
- **Ambigüedad explícita:** un 4xx del core **no** es «no sé si llegó». Sólo
  `{408, 409, 429}` y los 5xx dejan un vínculo en vuelo. Un 4xx es un no.
- **Espejo contable:** compara el mayor del ERP contra el del core. Medido en
  vivo: 36 pólizas revisadas, 3 discrepancias, cada una con su código
  (`REVERSA_EXTERNA`, `VINCULO_INCOMPLETO`) y su explicación en castellano.

### Aprovisionar cuentas en el mayor externo

`POST /integracion/cuentas/aprovisionar` crea cuentas en el core y **no tiene
operación inversa**.

> **Corregido el 25-sep:** la bandera de ensayo vivía sólo en la cadena de
> consulta. Mandarla en el cuerpo —que es lo que cualquiera escribe en un POST
> con opciones— no la activaba: hacía el aprovisionamiento de verdad y respondía
> `"simulacion": false` con las cuentas ya creadas. Una bandera de seguridad que
> se ignora en silencio cuando se manda de la forma natural es una trampa, no una
> interfaz. Ahora se lee de las dos formas.

---

## 10. Reglas que el sistema se hace cumplir solo

Las pruebas de coherencia leen el código fuente y comparan unas partes contra
otras. **Cada una corresponde a un defecto real.**

| Regla | Dónde |
|---|---|
| Todo alias de SQL con mayúsculas va entre comillas dobles, explícito o implícito. | `common/alias-sql-en-camello.spec.ts` |
| Ninguna consulta con parámetros lleva dos sentencias, ni empieza con `;`. | `common/una-sentencia-por-consulta.spec.ts` |
| Ninguna consulta manda más parámetros de los que su SQL usa. | `common/coherencia.spec.ts` |
| Toda consulta cruda menciona la empresa, salvo las declaradas. | `common/coherencia.spec.ts` |
| Ninguna migración crea columnas que la estrategia de nombres no podrá pedir. | `common/coherencia.spec.ts` |
| Todo estado que el cierre cuenta tiene quien lo escriba. | `common/coherencia.spec.ts` |
| Ninguna consulta del diagnóstico se traga su error en silencio. | `common/coherencia.spec.ts` |
| Toda entrada del diccionario navegable se encuentra con la ruta tal como la guarda el catálogo. | `common/coherencia.spec.ts` |
| Las pantallas sin permiso se conceden a todos, no a nadie. | `common/coherencia.spec.ts` |
| Toda ruta `@Public()` exige una clave, un token, o está declarada. | `common/coherencia.spec.ts` |
| El alta de empresas no se alcanza con una sesión de usuario. | `common/coherencia.spec.ts` |
| Ninguna acción irrenunciable está vetada por el `@Roles` de su endpoint. | `common/coherencia.spec.ts` |
| Toda pantalla que sólo vive del core declara que lo requiere. | `common/coherencia.spec.ts` |
| Todo cuerpo que una pantalla manda trae lo que su DTO exige (40 pares cruzados). | `common/lo-que-la-pantalla-no-manda.spec.ts` |
| Toda llamada del frontend tiene un endpoint que la atienda (255 llamadas). | `common/una-llamada-sin-nadie-al-otro-lado.spec.ts` |
| Todo enlace lleva a una pantalla que existe — del frontend **y** del servidor (141 pantallas). | `common/un-enlace-que-no-lleva-a-ninguna-pantalla.spec.ts` |
| Toda clave de idempotencia tiene un índice único que la respalde. | `common/una-clave-de-idempotencia-sin-red.spec.ts` |
| Toda ruta del BFF del portal declara el permiso que exige. | `portal/pruebas/todas-las-rutas-tienen-guardia.test.ts` |

Sobre las dos primeras:

- La del **alias en camelCase** nació de encontrar el mismo defecto seis veces
  por separado. Encontrarlos de uno en uno no escala: no fallan, no se registran
  en ningún log, y la pantalla enseña un número redondo.
- La palabra `END` **no** está en la lista de excepciones de esa prueba, aunque
  sea reservada: `CASE … END tieneCityLedger` es justamente la forma peligrosa, y
  meterla habría dejado la prueba verde sobre el defecto que vino a cazar. Se
  descubrió al verificarla en rojo.

Sobre la de **idempotencia**: el `catch` que resolvía una recepción de mercancía
duplicada estaba escrito esperando un índice único que no existía. **Un `catch`
inalcanzable es peor que ninguno.** El índice se creó
(`1790520000000-RecibirDosVecesLoMismo`, parcial sobre
`empresaId · ordenCompraId · claveIdempotencia` donde la clave no es nula) y la
migración **se niega y nombra los duplicados** en vez de fallar a la mitad.

**1 075 pruebas del ERP en 170 suites · 106 del portal en 14 suites · 8 de la
consola SUMA.** Toda prueba que fija un defecto se verificó **en rojo** antes de
aceptarse.

Y varias comprueban primero **que miraron**
(`expect(revisadas).toBeGreaterThan(n)`), porque ya ocurrió que una diera verde
sin haber leído una sola llamada. Volvió a ocurrir en una prueba nueva que medía
una **copia** de la decisión escrita en el propio archivo de prueba: se rompió el
servicio de verdad y siguió verde. Se reescribió contra el servicio.

---

## 11. Las familias de defectos

Ocho formas que se repiten, y que conviene tener presentes al leer código nuevo:

| Familia | Ejemplo |
|---|---|
| **Una consulta que falló no vale cero.** | `periodoEstaCerrado` con `.catch(() => [])`. |
| **Silencio reportado como éxito.** | La consola decía «LISTO · Creada» y la empresa quedaba sin catálogo. |
| **Un control que no se puede satisfacer.** | El hallazgo crítico de City Ledger, sin botón que lo resolviera. |
| **Un botón que lleva a una negativa.** | Cancelar en todos los renglones de tesorería. |
| **Una negativa que nombra un remedio inexistente.** | «Deshazlo desde Compras», donde no hay reversa. |
| **Una ausencia leída como decisión.** | Preguntar por un eje y contestar por los dos. |
| **Un estado que nadie escribe.** | `EstadoContablePagoProveedor.REVERTIDO`, con nombre y sin camino. |
| **Un rótulo que miente.** | Dos tarjetas «Configuración general», y la del 0 % era la de facturación. |

---

## 12. Lo que no está probado

Está reunido, con su motivo, en **`06-limites-conocidos.md`**. No se repite aquí
para que haya un solo sitio donde mirar.
