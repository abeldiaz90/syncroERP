# Alta automática de una empresa cliente, realm incluido

Escrito el 2026-09-17, a raíz de una objeción de Abel: *«no quisiera en
producción darle al usuario final esta talacha, ni a un administrador de SUMA;
todo debe ser automatizado en base a su realm»*.

Tiene razón, y hay una buena noticia dentro: **esto no es trabajo extra**. Es
exactamente el trabajo que `HALLAZGO-AISLAMIENTO-CORE.md` ya había identificado
como imprescindible para que dos empresas con core no compartan cartera. La
automatización y el aislamiento son el mismo proyecto.

---

## 1 · Primero, separar dos cosas que se confunden

Lo que Abel acaba de hacer a mano —crear un cliente en Keycloak y pegar su
secreto— es **una vez por instalación**, no una vez por cliente. Es de la misma
familia que configurar el SMTP o el certificado: se hace el día que se levanta
el ambiente y no se vuelve a tocar. Que eso sea manual está bien.

Lo que **no** puede ser manual es lo que hay que repetir **cada vez que entra
una empresa cliente**. Hoy eso son cinco artefactos, y la consola solo crea uno:

| # | Artefacto por empresa | Hoy |
|---|---|---|
| 1 | El **realm** de esa empresa en Keycloak | ✗ manual |
| 2 | Los **clientes** dentro de ese realm (el del frontend, el de servicio del ERP, el del portal si aplica) y sus secretos | ✗ manual |
| 3 | El **inquilino** de Fineract y su **oficina**, y el registro del emisor en `m_tenant_oidc_config` | ✗ manual, y con reinicio del core |
| 4 | La fila de la **empresa** en el ERP y su configuración | ✓ la consola |
| 5 | La **identidad del administrador** de esa empresa | ✓ la consola |

Ésos son los tres primeros los que hay que automatizar. Y hay un cuarto
problema, más silencioso, que es el que de verdad manda: **el ERP hoy no sabe
recibir a alguien de otro realm.**

---

## 2 · Los tres obstáculos reales

### a) El ERP acepta tokens de UN solo emisor, fijado al arrancar

`backend/src/iam/strategies/jwt.strategy.ts`, en el constructor:

```ts
const issuer = configService.get<string>('KEYCLOAK_ISSUER_URL', '');
super({ issuer, secretOrKeyProvider: jwksRsa.passportJwtSecret({
  jwksUri: `${issuer}/protocol/openid-connect/certs`, ... }) });
```

El emisor y el juego de llaves se resuelven **una vez, al construir la
estrategia**. Un realm creado después no existe para el ERP hasta que alguien
cambie `.env` y reinicie. Con un realm por empresa eso es un reinicio por alta,
que es justo lo que no queremos.

Es el cambio más delicado de todo el sistema —si se hace mal, o no entra nadie o
entra cualquiera— y también el más acotado. Se resuelve así:

- `secretOrKeyProvider` recibe el token **crudo**. Se decodifica sin verificar
  (solo para leer `iss`), se busca ese emisor en una tabla de realms
  registrados, y **solo si está registrado** se pide su JWKS —con un cliente
  jwks-rsa por emisor, cacheado—. Un emisor desconocido se rechaza ahí mismo,
  antes de tocar la red.
- El `issuer` estático se quita de las opciones y la comprobación se mueve a
  `validate()`: `payload.iss` debe ser el de un realm registrado. La cadena
  queda cerrada porque la llave con la que se verificó la firma vino de ese
  mismo emisor.
- Y la empresa **sigue saliendo de la fila del ERP**, no del token. Eso no
  cambia: el realm dice quién es la persona; el ERP, de quién es.

### b) La configuración de identidad vive en `.env`, que es por despliegue

`DIRECTORIO_CLIENT_ID`, `KEYCLOAK_ISSUER_URL`, `KEYCLOAK_CLIENT_ID`… todas son
variables de entorno: una por instalación. Pero con un realm por empresa, cada
empresa tiene su emisor, sus clientes y sus secretos. **Eso es dato, no
configuración**, y tiene que vivir en una tabla.

Nueva `empresa_identidad`, una fila por empresa:

| Campo | Para qué |
|---|---|
| `empresaId` | único |
| `emisor` | `https://key-access…/realms/<realm>`; es la clave de búsqueda de (a) |
| `realm` | el nombre, para las llamadas de administración |
| `clientIdPublico` | el que usa el navegador para iniciar sesión |
| `clientIdServicio` + `secretoServicio` | con el que el ERP habla con el core |
| `clientIdProvisionador` + `secretoProvisionador` | con el que el ERP crea identidades **de esa empresa** |
| `tenantExterno`, `oficinaExterna` | lo que ya vive disperso en la config de integración |
| `estado` | `APROVISIONANDO` / `ACTIVA` / `SUSPENDIDA` |

Los secretos **cifrados en reposo**, con una llave que sí es por instalación
(`SECRETOS_LLAVE`, AES-GCM). Eso deja exactamente **una** variable de entorno
manual nueva, y ninguna por cliente.

Hay una consecuencia buena: el frontend deja de tener el realm quemado en
`NEXT_PUBLIC_*`. Tendría que preguntar «¿qué realm me toca?» antes de mandar a
nadie a iniciar sesión — por subdominio, o por el correo que teclea en una
pantalla previa. Eso hay que diseñarlo, y es de las pocas piezas que todavía no
tienen forma.

### c) Crear un realm necesita una credencial mucho más poderosa

El cliente que acaba de crear Abel tiene `manage-users` y `view-users` **dentro
de un realm**. Crear realms es otra cosa: `POST /admin/realms`, que exige
`create-realm` en el realm `master`. Quien tiene eso puede crear, borrar y
reconfigurar cualquier realm de la instalación.

**Esa credencial vive solo en la consola de SUMA, y nunca en el ERP.** No es un
detalle de implementación: es la razón de que la consola exista como aplicación
aparte. El ERP administra usuarios de su propio realm; la consola crea realms.
Si esa llave acabara en el ERP, una vulnerabilidad en la aplicación con la que
se vende y se cobra alcanzaría el directorio entero.

---

## 3 · Cómo lo haría: plantilla de realm, no veinte llamadas

Keycloak deja crear un realm completo con **un solo POST** a `/admin/realms`
mandándole el JSON del realm entero: clientes, roles, política de contraseñas,
flujos, tema y configuración de correo. Armar eso con veinte llamadas sueltas es
frágil —si falla la número trece queda un realm a medio hacer— y difícil de
revisar.

Así que: un `realm-plantilla.json` versionado en el repo, con marcadores
(`{{REALM}}`, `{{ERP_URL}}`, `{{EMPRESA}}`), y el alta hace:

1. Sustituir los marcadores → `POST /admin/realms`.
2. Leer el secreto de cada cliente creado:
   `GET /admin/realms/{r}/clients/{id}/client-secret`.
3. Registrar el emisor en la base maestra del core (`m_tenant_oidc_config`) y
   crear el inquilino y la oficina.
4. Escribir todo en el ERP por la puerta de aprovisionamiento —que ya existe y
   la consola ya usa (`ERP_BASE_URL` + `ERP_APROVISIONAMIENTO_TOKEN`)—, en una
   transacción, con `estado: ACTIVA` al final.
5. Crear la identidad del administrador **en el realm nuevo**, no en el
   compartido. Eso implica que `lib/identidades.ts` deje de leer el realm de
   `.env` y lo reciba como parámetro: hoy es `const realm = () =>
   process.env.KEYCLOAK_ADMIN_REALM` y todas las rutas son
   `/admin/realms/{ese realm}`.

Que la plantilla esté versionada tiene un beneficio que no es evidente: **todos
los realms nacen iguales**. Política de contraseñas, duración de sesión,
segundo factor, temas de correo — lo que hoy depende de que quien lo crea se
acuerde de marcar las mismas casillas.

Y el paso 3 arrastra lo que ya sabíamos: el core necesita una ventana de
mantenimiento para construir el esquema de un inquilino nuevo. Ahí sí sirve la
idea de la **reserva de inquilinos** que ya está construida — pero con
inquilinos que existan de verdad, verificados contra el core al anotarlos, no
con identificadores inventados como hoy.

---

## 4 · Por etapas, y en este orden

| Etapa | Qué | Riesgo | Se puede probar |
|---|---|---|---|
| **1** | `empresa_identidad` + cifrado en reposo + leerla donde hoy se leen las variables, **con respaldo a `.env`** | Bajo: es aditivo, y si la tabla está vacía todo sigue como hoy | Sí, de inmediato: se mete la fila de SUMA Local y debe comportarse igual |
| **2** | Emisor múltiple en `jwt.strategy` | **Alto**: es la puerta de entrada de todos | Sí, y hay que hacerlo con un segundo realm de pruebas antes de tocar producción |
| **3** | La plantilla de realm y el alta automática en la consola | Medio: código nuevo, no rompe nada existente | Sí, creando y borrando realms de prueba |
| **4** | El inquilino y la oficina del core, con la reserva verificada | Medio, y arrastra la ventana de mantenimiento | Parcial |
| **5** | Que el frontend resuelva el realm que le toca | Medio: cambia el inicio de sesión | Sí |

**Empezaría por la 1**, y no por la 3 que es la vistosa. Razón: mientras la
configuración de identidad viva en `.env`, cualquier automatización produce
artefactos que el sistema no sabe usar. La etapa 1 es aditiva, se prueba el
mismo día contra la empresa que ya existe, y es la que convierte «identidad» en
dato — que es la condición de todo lo demás.

La 2 la haría inmediatamente después y con un realm de pruebas, porque es la
única que puede dejar a todo el mundo fuera. Y no la mezclaría en el mismo
cambio que la 1.

---

## 5 · Lo que no se va a poder automatizar, y conviene aceptar

- **El DNS y el certificado** si cada empresa va a tener subdominio.
- **La primera credencial**: el cliente con `create-realm` en `master` que usa la
  consola. Alguien lo crea a mano, una vez, el día que se levanta el ambiente.
  No hay forma de que un sistema se otorgue a sí mismo el permiso de crear
  realms.
- **El SMTP** de cada realm si se quiere que los correos salgan con el remitente
  del cliente y no con el de SUMA. Se puede meter en la plantilla, pero las
  credenciales de correo de cada cliente las da el cliente.
- **Los permisos de los roles dentro del core.** Esto ya lo sabíamos: el ERP no
  puede adivinar qué autoridad bancaria necesita un «Almacenista» dentro de
  Fineract. La plantilla puede crear los roles; qué habilita cada uno lo decide
  quien conoce el core.

---

## 6 · El resumen en una frase

Lo manual que queda debe ser **una vez por instalación** —una credencial, una
llave de cifrado, DNS— y **cero veces por cliente**. Hoy es al revés: cinco
artefactos por cliente, tres de ellos a mano, y un ERP que no sabe recibir a
nadie de un realm que no conocía al arrancar.
