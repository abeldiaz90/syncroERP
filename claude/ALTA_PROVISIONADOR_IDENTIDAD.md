# Encender el provisionador de identidad — paso a paso

Lo que se consigue al terminar: **dar de alta un usuario en el ERP crea su
identidad en Keycloak y le manda el correo para que fije su contraseña**, sin
que nadie tenga que entrar al directorio a mano.

Tiempo: unos 15 minutos. Se puede parar después del paso 5 y continuar otro día.

Antes de empezar, una advertencia que importa más que el orden: **el paso 6 (el
candado del portal) va antes de encender el portal**, no después. Hoy su candado
está en modo `open`, y con el secreto puesto y sin candado cualquier correo del
mundo podría convertirse en operador del back-office.

---

## 1 · Crear el cliente en Keycloak

Entra a `https://key-access.sumamexico.com/admin` y **selecciona el realm
`suma`** en el desplegable de arriba a la izquierda. No el realm `master`, ni
`suma-consola`: el de las instituciones.

> Si la consola se ve distinta a lo que describo, es una versión anterior. Los
> nombres cambian («Clients → Create» en vez de «Create client»), pero los
> conceptos son los mismos: cliente confidencial, cuenta de servicio, dos roles.

**Clients → Create client**

| Campo | Valor |
|---|---|
| Client type | `OpenID Connect` |
| Client ID | `suma-provisioner` |
| Name | `Provisionador de identidad (SUMA)` |

→ **Next**

En **Capability config**, así exactamente:

| Opción | Cómo |
|---|---|
| Client authentication | **On** ← esto es lo que lo hace confidencial |
| Authorization | Off |
| Standard flow | **desmarcado** |
| Direct access grants | **desmarcado** |
| Implicit flow | desmarcado |
| **Service accounts roles** | **marcado** ← sin esto no hay `client_credentials` |

→ **Next** → en **Login settings** deja todas las URL vacías: este cliente no
abre ninguna pantalla, solo habla máquina a máquina → **Save**.

*¿Por qué desmarcar Standard flow y Direct access grants?* Porque este cliente
no debe poder iniciar sesión de nadie ni pedir contraseñas. Solo pide un token
para sí mismo. Un cliente con menos puertas es un cliente con menos formas de
usarse mal.

---

## 2 · Darle los dos permisos, y solo esos dos

En el cliente recién creado → pestaña **Service accounts roles** →
**Assign role** → cambia el filtro a **Filter by clients** → busca
`realm-management` y asigna:

- `view-users`
- `manage-users`

→ **Assign**

**No le asignes `realm-admin`.** Con esos dos puede buscar y crear usuarios, y
nada más: no toca roles, ni clientes, ni flujos de autenticación, ni la
configuración del realm. Si algún día alguien se lleva este secreto, el daño
posible queda acotado a eso.

---

## 3 · Copiar el secreto

Pestaña **Credentials** → *Client Authenticator* debe decir
`Client Id and Secret` → copia el valor de **Client secret**.

Guárdalo donde guardes los demás secretos. No hace falta que lo pegues en el
chat; de hecho, mejor que no.

---

## 4 · Comprobar que el cliente sirve, antes de tocar el ERP

Merece la pena: si algo está mal, aquí se ve en diez segundos y no hay que
adivinar después. En PowerShell, sustituyendo `PEGA_AQUI_EL_SECRETO`:

```powershell
$secreto = "PEGA_AQUI_EL_SECRETO"
$t = (Invoke-RestMethod -Method Post `
  -Uri "https://key-access.sumamexico.com/realms/suma/protocol/openid-connect/token" `
  -Body @{ grant_type="client_credentials"; client_id="suma-provisioner"; client_secret=$secreto }).access_token

Invoke-RestMethod -Uri "https://key-access.sumamexico.com/admin/realms/suma/users?email=abel.diaz@sumamexico.com&exact=true" `
  -Headers @{ Authorization = "Bearer $t" }
```

Debe devolver **tu** usuario. Qué significa cada fallo:

| Lo que ves | Qué pasó |
|---|---|
| `invalid_client` | El Client ID no coincide, o *Client authentication* quedó en Off |
| `unauthorized_client` | Falta marcar **Service accounts roles** |
| `403 Forbidden` | El token se emitió, pero faltan los roles del paso 2 |
| Un arreglo vacío `[]` | Funciona; ese correo no existe en el realm |

El secreto queda en el historial de PowerShell. Si te importa, ciérralo con
`Clear-History` o usa una ventana nueva y no la guardes.

---

## 5 · Ponerlo en el ERP

En `D:\SUMA\erpfineract\syncroERP\claude\backend\.env.local` ya dejé el bloque
comentado al final del archivo. Descoméntalo y llénalo:

```
DIRECTORIO_CLIENT_ID=suma-provisioner
DIRECTORIO_CLIENT_SECRET=el-secreto-del-paso-3
DIRECTORIO_DOMINIOS_PERMITIDOS=sumamexico.com
```

Sobre `DIRECTORIO_DOMINIOS_PERMITIDOS`: es a **quién** se le puede crear
identidad. Vacío significa sin candado, y el ERP lo dice en pantalla en vez de
quedarse callado. Pon los dominios que de verdad uses, separados por comas. Si
los empleados de tus clientes usan sus propios correos corporativos, van aquí
también.

**Reinicia el backend.** El `--watch` recarga código, no variables de entorno:
hay que pararlo y volver a levantarlo.

Comprobación, con el ERP abierto en el navegador (consola del navegador, F12):

```js
fetch('http://localhost:4000/api/usuarios/directorio', {
  headers: { Authorization: 'Bearer ' + localStorage.getItem('syncro_token') }
}).then(r => r.json()).then(console.log)
```

Debe decir `configurado: true` y listar tus dominios.

---

## 6 · El candado del portal de Fineract — ANTES del secreto

En `D:\SUMA\erpfineract\fineract\frontend\.env.local` hay dos variables sin
definir. Una de las dos, no las dos:

```
# Por dominio: cualquiera de estos dominios puede ser operador del back-office
BACKOFFICE_ALLOWED_EMAIL_DOMAINS=sumamexico.com

# O por grupo de Keycloak, que es más fino: solo quien esté en ese grupo
# BACKOFFICE_OPERATOR_GROUP=/operadores-core
```

Sin ninguna de las dos, `backofficeGuardStatus()` cae en modo `open` y la
pantalla «Usuarios Keycloak + Fineract» deja convertir en operador bancario a
cualquier correo. Con el secreto vacío eso no se notaba porque la pantalla
estaba en modo consulta; en cuanto le pongas el secreto, se nota.

**Recomiendo el grupo** si vas a tener clientes con sus propios dominios: por
dominio, cualquier empleado con correo corporativo es candidato; por grupo,
solo quien alguien haya puesto ahí a propósito.

---

## 7 · Encender el portal

En el mismo `.env.local` del portal:

```
KEYCLOAK_ADMIN_CLIENT_ID=suma-provisioner
KEYCLOAK_ADMIN_CLIENT_SECRET=el-mismo-secreto-del-paso-3
```

Puede ser **el mismo cliente** que el ERP: mismo realm, mismos dos permisos.
Dos secretos para lo mismo solo multiplican los sitios donde rotarlo el día que
haya que rotarlo. (El `.env.local` del portal ya dice `fineract-provisioner`; si
ese cliente existe y ya tiene los dos roles, úsalo y sáltate los pasos 1 y 2.)

Reinicia el portal. En `/dashboard/admin/users` debe desaparecer el aviso
«Keycloak provisioner pendiente».

---

## 8 · El correo: sin esto, el alta queda a medias

Keycloak es quien manda el enlace para fijar la contraseña. Si el realm no tiene
SMTP, el ERP crea la identidad y **te dice** que el correo no salió — no se
rompe, pero la persona no recibe nada.

**Realm settings → Email** en el realm `suma`: servidor, puerto, remitente y
credenciales. Hay un botón **Test connection** que manda un correo de prueba a
la dirección del usuario con el que estás dentro; úsalo antes de dar de alta a
alguien de verdad.

---

## 9 · La prueba de fuego

Ahora sí, el usuario que desbloquea media docena de pruebas:

1. ERP → **Administración → Usuarios → Nuevo Usuario**
2. Nombre: `Almacenista Prueba`
3. Correo: uno **real que puedas abrir** y de un dominio permitido
4. Rol: **Almacenista**
5. Registrar

Qué debe pasar:

- El formulario **no** pide contraseña y explica que el directorio manda el enlace.
- El mensaje de vuelta dice *«Se creó su identidad en SUMA y le llegó un correo para fijar su contraseña»*.
- Llega el correo. Al abrir el enlace, Keycloak pide contraseña nueva.
- Con esa contraseña, entra al ERP y **ve el almacén y nada más**: ni Finanzas, ni Administración.
- Puede recibir una orden de compra — una ruta `PATCH`, de las 97 que estuvieron muertas hasta ayer.

Ese último punto es el que de verdad importa: es la primera vez que el modelo de
permisos se ejerce con alguien que no es administrador.

---

## Si algo sale mal

| Síntoma | Causa más probable |
|---|---|
| «No se creó el usuario porque no se pudo preparar su acceso: … 403» | Faltan los roles del paso 2, o se asignaron en el cliente equivocado |
| «… ya existe una identidad con ese correo» | Ya está en el realm. Vuelve a intentarlo: el ERP debe **reutilizarla** y decir «ya tenía identidad en SUMA». Si en vez de eso falla, avísame |
| «Solo se pueden crear identidades de …» | El correo no es de un dominio permitido. Es el candado del paso 5 haciendo su trabajo |
| Identidad creada pero «el correo no salió» | SMTP del realm (paso 8). La identidad quedó bien; reenvía el enlace desde Keycloak: *Users → el usuario → Credentials → Credential Reset* |
| El ERP sigue diciendo `configurado: false` | No se reinició el backend, o las variables quedaron comentadas |
| Entra al ERP pero lo ve todo | El rol se guardó como `admin`, o el usuario se dio de alta antes de configurar el rol. Revísalo en Roles y permisos |

---

## Lo que NO hace falta para esto

- **Nada en Fineract.** Habilitar al mismo operador en el core es un paso
  aparte, desde *Roles y permisos → Correspondencia*, y solo para empresas que
  tengan el core contratado. Y ojo: los 13 roles espejo siguen vacíos, así que
  eso todavía no le habilita nada allá. Ese es el siguiente frente.
- **Nada en la consola de SUMA.** La consola crea empresas y su administrador;
  los empleados de cada empresa los crea el propio ERP, que es de lo que trata
  este documento.
