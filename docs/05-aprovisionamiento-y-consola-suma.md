# 05 · Aprovisionamiento y consola SUMA

**Revisión:** 28 de septiembre de 2026
**Para:** SUMA. Cómo se da de alta una empresa cliente.

> La consola es **una aplicación aparte, a propósito**, y vive en su propio
> repositorio (`erpfineract/suma-consola`), con su propia puesta en marcha en el
> `LEEME.md` de ahí. Este documento describe lo que hace y cómo se opera; la
> instalación de la consola no se duplica aquí.

---

## 1. Por qué está separada

El ERP y el portal de Fineract son herramientas con las que una empresa **opera**:
vende, cobra, lleva su cartera. La consola es la que decide **quién es cliente y
qué contrata**. Tenerlas juntas convierte a un inquilino del sistema en
administrador de los demás, y ninguna cantidad de roles arregla eso: la separación
tiene que ser de aplicación, de despliegue y de identidad.

Hubo dos intentos previos que no bastaban:

1. **Dentro del ERP**, protegida por un rol. Cualquier administrador de la empresa
   operadora podía dar de alta clientes. Y quien puede otorgarse el rol, puede
   aprovisionar.
2. **Dentro del portal de Fineract**, acotada por inquilino. Mejor, pero seguía
   siendo la aplicación con la que un cliente opera lo financiero.

La consola tiene además **su propio realm** (`suma-consola`), aparte del de las
instituciones: compartirlo significaría que una cuenta de operación comprometida
alcanza el aprovisionamiento. Sólo entra quien pertenece al grupo `operadores`.

---

## 2. La puerta contra el ERP

La consola habla con el ERP por las diez rutas `/aprovisionamiento/empresas/*`,
con la cabecera `x-aprovisionamiento`. La clave es la misma cadena en los dos
lados: `APROVISIONAMIENTO_TOKEN` en el ERP, `ERP_APROVISIONAMIENTO_TOKEN` en la
consola.

- Comparación en **tiempo constante**.
- Sin clave, o con menos de 32 caracteres, esas rutas responden **404**: parecen
  no existir.
- **Ninguna sesión de usuario del ERP las alcanza**, y hay una prueba de
  coherencia que lo exige.

---

## 3. Dar de alta una empresa

**Nueva empresa** — nombre comercial, RFC, qué contrata y el correo de su
administrador. El resultado **no dice «listo»**: dice **paso por paso** qué quedó
hecho y qué no, y cada paso sale como `listo`, `pendiente` o `falló` con su
detalle.

| Paso | Qué hace | Cuándo sale `pendiente` |
|---|---|---|
| **Empresa en el ERP** | Crea la empresa y su configuración de modos. | — |
| **Inquilino del core** | Le entrega un inquilino ya reservado, si contrató core. | Si la reserva está vacía. |
| **Catálogo de crédito** | Siembra los productos de crédito. | Si el ERP no pudo sembrarlos. |
| **Realm propio de la empresa** | §5. | Si falta la credencial de `master`. |
| **Administrador en el ERP** | Da de alta la cuenta del administrador. | — |
| **Identidad en el directorio** | Crea la identidad en Keycloak, **sin credencial** y con la acción de definirla. | — |
| **Invitación** | Manda el correo con el enlace. | Si el SMTP del realm rechaza. |

> **El catálogo de crédito fallaba en silencio**: la consola decía «LISTO ·
> Creada» y la empresa quedaba sin productos. Es la familia *silencio reportado
> como éxito*, y por eso ahora cada paso se declara por separado.

### Los tres modos

| Modo | Qué se le pide a la consola |
|---|---|
| **Sólo ERP** | Empresa, catálogo, administrador. Sin inquilino. |
| **ERP + Fineract** | Todo lo anterior más el inquilino del core. |
| **Sólo Fineract** | **No se da de alta desde aquí.** El portal no menciona el ERP en ninguna parte: una institución que no usa el ERP no es cliente del ERP. |

---

## 4. La reserva de inquilinos del core

**Fineract sólo construye el esquema de un inquilino al arrancar**, así que
crearlos al vuelo obligaría a reiniciar el core con todas las empresas operando.
Se preparan **por lote, en mantenimiento**, y el alta toma uno ya listo.

La pantalla de **Reserva de inquilinos** los lee del registro del propio core y
los enseña con su estado:

| Estado | Qué significa |
|---|---|
| **libre** | Listo para entregarse a la siguiente empresa. |
| **de tal empresa** | Ya asignado, y se dice a cuál. |
| **sin anotar** | El core lo tiene, la reserva del ERP no. Se anota **de un clic**. |

**No hay nada que teclear.** Antes la reserva pedía escribir a mano el
identificador que el sistema ya sabía.

Y **«asignar un inquilino» era un consejo sin puerta**: el estado de una empresa
lo recomendaba y no existía forma de hacerlo. Hoy es un botón
(`POST /aprovisionamiento/empresas/:id/inquilino`) que toma uno libre con
`FOR UPDATE SKIP LOCKED` —dos operadores a la vez no se llevan el mismo—, lo
escribe conservando los demás parámetros del proveedor, y lo deja en la bitácora.

Si la reserva está vacía, la consola **lo dice con palabras** en vez de ofrecer un
botón que contesta que no: un inquilino lo construye el core al arrancar, y ahí no
hay botón que valga.

---

## 5. El realm por empresa

**Escrito, probado por unidad, y dormido hasta que exista la credencial.**

El alta le crea a la empresa su propio realm de un solo POST con la plantilla
versionada (`plantillas/realm-plantilla.json`): clientes, mapeador de grupos,
política de contraseñas, protección contra fuerza bruta. Después **vuelve a leer
lo que creó** —que los tres clientes existan, que sus secretos se lean, que la
cuenta de servicio tenga de verdad `manage-users`— y lo registra **cifrado** en el
ERP. Si algo no cuadra **no lo activa**: una identidad a medio armar que el ERP
acepte es peor que ninguna, porque abre la puerta sin que nadie sepa hasta dónde.

Que la plantilla esté versionada tiene un beneficio que no se ve: **todos los
realms nacen iguales**, en vez de depender de que quien lo crea se acuerde de
marcar las mismas casillas.

**Falta una sola cosa, y es manual una vez por instalación, no una por cliente:**
en Keycloak, un cliente de servicio en el realm `master` con el rol **`admin`**, y
sus datos en el `.env.local` de la consola.

> **`create-realm` a secas no basta**, y es el tropiezo más probable: en Keycloak
> crear un realm y administrarlo son permisos distintos. Un cliente con
> `create-realm` crea el realm y después no puede leer sus clientes ni sus
> secretos, así que el alta no podría registrarlo en el ERP. La consola **distingue
> los dos casos** —un 401/403 al leer no es lo mismo que un 404— y dice cuál es.

**Por qué esa llave vive en la consola y nunca en el ERP:** quien tiene
`create-realm` puede crear, borrar y reconfigurar cualquier realm de la
instalación, incluido el de la propia consola. Si acabara en la aplicación con la
que se vende y se cobra, una vulnerabilidad ahí alcanzaría el directorio entero. Y
no se puede automatizar: ningún sistema puede otorgarse a sí mismo el permiso de
crear realms.

**Sin esa credencial el alta funciona igual que hoy**: la empresa nace en el realm
común y el paso sale como *pendiente* diciendo qué falta. No se pinta de verde
nada que no se hizo.

Del lado del ERP, cada realm por empresa se guarda en `empresa_identidad` y la
estrategia JWT sólo acepta emisores registrados (ver `02-arquitectura.md` §3).

---

## 6. «Qué le falta» a cada empresa

Cada empresa dada de alta se abre y **dice qué le falta**, con el botón que
resuelve cada punto al lado:

| Punto | Acción automática |
|---|---|
| Catálogo de crédito sin sembrar | `SEMBRAR_CATALOGO` |
| Nadie puede entrar | `DAR_ADMINISTRADOR` |
| Sin inquilino del core | `ASIGNAR_INQUILINO` |
| La invitación no llegó | Reenviar |

Y **quién puede entrar viene por nombre** —cuenta, rol, si está activa, si tiene
acceso local— para poder reenviarle la invitación sin ir a buscarla a Keycloak.

> Esa lista existía en el ERP desde el principio y **ninguna pantalla la
> enseñaba**. Es la familia *un control que no se puede satisfacer*: un estado que
> el sistema sabe calcular y nadie puede resolver.

---

## 7. Lo que la consola NO hace, y por qué

**No fija contraseñas.** La identidad se crea sin credencial y con la acción de
definirla; la persona la elige por un enlace. Una contraseña que alguien teclea
por otro es una contraseña que viaja por correo o por chat y que después nadie
sabe quién vio.

**No crea inquilinos en el core.** §4.

**No hace operación.** Ni cartera, ni clientes finales, ni créditos, ni
contabilidad. Si algún día se propone agregar «un reportito de cartera porque es
cómodo», ése es el momento de decir que no.

---

## 8. Pendientes de la consola

- El **registro de instituciones** sigue siendo un archivo con secretos dentro.
  Debe guardar una *referencia* al secreto, nunca su valor: así rotarlo es una
  operación del gestor de secretos y no una escritura desde la web. Después, de
  archivo a tabla.
- **El SMTP del realm rechaza credenciales**: las invitaciones fallan hasta
  arreglarlo. La identidad queda creada igual y se puede reenviar.
- **`private_key_jwt`** en vez de secreto compartido, como mejora posterior.
- El **realm por empresa** no se ha ejercitado contra un Keycloak vivo (§5 y
  `06-limites-conocidos.md`).
