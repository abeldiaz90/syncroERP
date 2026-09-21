# Plan de pruebas de punta a punta — Consola SUMA · ERP · Fineract

Escrito el 2026-09-17. Cubre los **tres modos que van a convivir en producción**:
empresas con solo ERP, con ERP + Fineract, y con solo Fineract.

Cómo leer cada caso: **precondición → pasos → qué debe pasar**. Lo que ya se
sabe que falla lleva ⚠️ y dice por qué, para que nadie pierda una tarde
redescubriéndolo. Lo que hoy no se puede probar lleva 🚫 y dice qué falta.

Orden sugerido: A → B → F → C → D → E → G → H. Las últimas dependen de que las
primeras hayan dejado datos.

---

## A · Estado inicial y arranque

| # | Caso | Pasos | Qué debe pasar |
|---|---|---|---|
| A1 | Los cuatro servicios arriba | `INICIAR_TODO.bat` | ERP 3000/4000, consola 3010, portal 3002, core 8443. `GET /api/integracion/estado` → `enlace.disponible: true`, circuito cerrado |
| A2 | Migraciones al día | `npm.cmd run db:migration:show` | Sin pendientes. ⚠️ `1789560000000-FechasConZonaHoraria` sigue **sin aplicar**: hasta que se aplique, las fechas mezclan `timestamp` y `timestamptz` |
| A3 | Endpoints sincronizados | Roles y permisos → *Sincronizar* | 487 acciones, 26 controladores, 0 obsoletos. Verificar que PATCH ≈ 92 y DELETE ≈ 5 (si salen al revés, se regresó el defecto de `METHOD_MAP`) |
| A4 | Inventario de arranque | `select count(*) from usuarios; select * from empresas;` | Saber con qué se empieza. Hoy: 2 empresas, 2 usuarios |

---

## B · Consola SUMA — quién es cliente y qué contrata

La consola es la única puerta de alta. Vive aparte a propósito: quien opera no
aprovisiona.

| # | Caso | Pasos | Qué debe pasar |
|---|---|---|---|
| B1 | Entrar con el realm propio | Login en 3010 con una cuenta del realm `suma-consola`, grupo `/operadores` | Entra. Una cuenta del realm `suma` **no** debe entrar |
| B2 | Alta de empresa **solo ERP** | Nueva empresa, sin Fineract, con correo de administrador real | Empresa creada, identidad creada en Keycloak con `UPDATE_PASSWORD`, correo de invitación enviado, usuario admin en el ERP |
| B3 | El correo del administrador se valida | Alta con `prueba`, con `a@b`, con el texto del instructivo | Los tres rechazados con mensaje claro. (Antes se colaba: en la base quedó `el-correo-con-el-que-entras-al-erp` como admin activo) |
| B4 | Una persona, una empresa | Alta de una segunda empresa con el mismo correo de administrador | Rechazo diciendo qué empresa ya administra |
| B5 | Alta de empresa **ERP + Fineract** | Nueva empresa marcando Fineract | Se consume un tenant de la reserva y se anota la oficina del core ⚠️ ver `HALLAZGO-AISLAMIENTO-CORE.md`: el tenant se deduce del emisor del token, no de la cabecera. **Dos empresas con core comparten datos hoy** |
| B6 | Reserva de inquilinos | Registrar un tenant inventado | ⚠️ Hoy lo acepta sin comprobar que exista en el core. Debería verificar contra el core antes de anotarlo |
| B7 | Cambiar servicios contratados | Subir y bajar los modos de una empresa | El ERP lo respeta al siguiente arranque de sesión. Una empresa **nunca** puede subir por encima del techo global de `.env.local` |
| B8 | Desactivar una empresa | Desactivarla desde la consola | Sus usuarios dejan de entrar al ERP (401 «La cuenta o la empresa están desactivadas») |

---

## C · Modo **solo ERP**

| # | Caso | Pasos | Qué debe pasar |
|---|---|---|---|
| C1 | Primer acceso del administrador | Entrar con la identidad recién creada | Entra; se sella `keycloakSubject`; queda en la bitácora «Identidad enlazada» |
| C2 | Correo sin verificar | Intentar entrar con una identidad cuyo correo el directorio no ha verificado | 401 «SUMA todavía no ha verificado este correo». (Sin esto, quien se registre con el correo de un empleado se lleva su fila, su empresa y su rol, para siempre) |
| C3 | Alta de usuario desde el ERP, **con provisionador** | Con `DIRECTORIO_CLIENT_ID/SECRET` puestos: Administración → Usuarios → Nuevo | No pide contraseña. Crea la identidad en el realm, manda el correo de `UPDATE_PASSWORD`, crea la fila con su `keycloakSubject` ya sellado, y el mensaje dice qué pasó en cada sistema |
| C3b | Alta con identidad preexistente | Dar de alta a alguien que ya existe en el realm (p. ej. creado antes en el portal del core) | **Reutiliza** la identidad, no crea una segunda, y lo dice: «ya tenía identidad en SUMA». Ése es el caso «y viceversa» |
| C3c | Alta sin provisionador | Quitar `DIRECTORIO_CLIENT_SECRET` y reintentar | El formulario avisa **antes** de llenarlo que quedará un pendiente manual. Se crea la fila y se dice que falta crear la identidad en SUMA |
| C3d | El candado de dominios | Con `DIRECTORIO_DOMINIOS_PERMITIDOS=sumamexico.com`, dar de alta un `@gmail.com` | Se rechaza y **no se crea la fila**: la identidad va primero, y si no se puede preparar el acceso no se crea un usuario que no podrá entrar |
| C3e | El directorio no contesta | Apagar la red hacia Keycloak y dar de alta | Se detiene sin crear nada. Crear sin haber comprobado es como se acaba con dos identidades para la misma persona |
| C3f | La contraseña nunca pasa por el ERP | Revisar la fila creada | `passwordHash` queda como `sin-acceso-local:identidad-en-el-directorio`, y el `GET /usuarios` no devuelve ni hash ni tokens |
| C4 | Rol por módulos | Roles y permisos → Almacenista → *Usar módulos sugeridos* | 102 acciones en 2 módulos y consulta en 3. Inventario 77/77 |
| C5 | El rol manda de verdad | Entrar con un usuario `almacenista` | Ve el almacén; **no** ve Finanzas ni Administración. Puede recibir mercancía (una ruta PATCH — la que estuvo rota 97 veces) |
| C6 | Venta de contado | POS: producto, efectivo, cobrar | Venta, ticket, inventario descontado, póliza de ingreso |
| C7 | Venta a crédito sin línea | POS con un cliente sin línea | Bloqueada, diciendo por qué |
| C8 | Verificación de crédito — camino feliz | Clientes → Verificar → aprobado | Se crea la línea con el monto autorizado, queda en el expediente |
| C9 | Verificación — no feliz | Forzar rechazo y revisión humana | Sin línea; el expediente muestra las tres corridas con su resultado |
| C10 | Cobranza y mora | Cuota vencida, correr `actualizarVencidos` | Crédito a VENCIDO; al pagar, vuelve a al corriente (la regularización) |
| C11 | Devolución | Devolver una venta | Nota de crédito, inventario de vuelta, póliza inversa |
| C12 | Cierre contable | Cerrar el periodo | No deja cerrar con asientos pendientes |

---

## D · Modo **ERP + Fineract** (el que más importa)

| # | Caso | Pasos | Qué debe pasar |
|---|---|---|---|
| D1 | Correspondencia de roles | Roles y permisos → Correspondencia | 13 roles del ERP, catálogo del core, semáforo `ERP / SUMA / Core` por persona |
| D2 | ⚠️ Roles espejo vacíos | Mirar los chips | **Todos los mapeos apuntan hoy a roles espejo sin permisos.** Quien los reciba no puede hacer nada en el core. Hay que darles permisos allá, o mapear contra roles que ya funcionen. Es la precondición de D3 en adelante |
| D3 | Aprovisionar un operador | Diagnóstico → *Dar de alta allá* | Se crea en el core **en la oficina de su empresa** y queda el vínculo. Si la empresa no tiene oficina configurada, se niega (antes caía a Head Office y mezclaba empresas) |
| D4 | Corregir roles no quita autoridad | Cambiar el mapa y pulsar *Corregir roles* sobre alguien con roles propios en el core | Sus roles anteriores **siguen ahí**; solo se suman los del mapa. (Al revés dejó a un administrador con `403: no authority to READ roles`) |
| D5 | Operador de otra empresa | Intentar aprovisionar un correo que ya existe en el core en otra oficina | Se niega: es el operador de otra empresa |
| D6 | Cliente espejo | Alta de cliente en el ERP | Aparece en el core con `syncro:cliente:<id>` y queda el vínculo |
| D7 | Crédito automático | Verificación favorable en ERP+Fineract | Crédito en el ERP con su monto **y** préstamo en el core ya aprobado. Sin doble decisión |
| D8 | Pago | Cobrar una cuota en el ERP | Se refleja en el core; saldos coinciden |
| D9 | Conciliación | Pantalla de conciliación | Cero discrepancias; si las hay, dicen cuál y de qué lado |
| D10 | Contabilidad espejo | Venta y pago con `ModoContabilidad=ESPEJO` | Póliza en el ERP y su espejo en el core. ⚠️ `cuentasPorMapear: 10` — esas diez harán fallar el espejo en cuanto se usen |
| D11 | Día de negocio | Comparar la fecha de un préstamo creado a las 19:00 | El día debe ser el local, no el UTC (fue el defecto de las 6 horas) |

---

## E · Modo **solo Fineract**

| # | Caso | Pasos | Qué debe pasar |
|---|---|---|---|
| E1 | Entrar al portal | Portal 3002 con una identidad de SUMA | Entra y ve solo la cartera de su oficina |
| E2 | Verificación transversal | Solicitar un préstamo desde el portal | 🚫 **Falta**: la verificación (identidad, buró, listas) tiene que correr también aquí, antes de otorgar. Hoy solo existe en el front del ERP |
| E3 | Alta y aprobación | Flujo propio del core | Solicitud → aprobación, cada plataforma con su camino |
| E4 | Sin ERP detrás | Con el ERP apagado | El portal sigue operando: no debe depender del ERP |

---

## E-bis · Que TODO dependa del plan contratado

El bloque que faltaba, y el que más se parece a lo que va a pasar en producción:
la mayoría de las empresas van a usar **solo el ERP**. Para ellas, el core no es
un módulo apagado que hay que configurar — es un módulo que no compraron, y no
debe asomar por ningún lado.

El predicado es uno solo: `IntegracionModoService.usaRegistroExterno()`, que es
verdadero cuando la empresa tiene encendida la cartera **o** la contabilidad
espejo. Ambos ejes están apagados por omisión y una empresa nunca hereda el
techo global.

| # | Caso | Pasos | Qué debe pasar |
|---|---|---|---|
| Eb1 | Empresa solo-ERP: el menú | Entrar con una empresa sin core contratado | **No** aparece el enlace a Fineract en el menú lateral |
| Eb2 | Empresa solo-ERP: la pestaña | Administración → Roles y permisos | **No** aparece «Correspondencia con Fineract». Solo «Roles y accesos» |
| Eb3 | Empresa solo-ERP: por enlace guardado | Teclear `/dashboard/permisos/correspondencia` | Pantalla que explica que esa empresa no opera con el registro externo, y un botón de vuelta. No un mapa vacío que parezca un pendiente |
| Eb4 | Empresa solo-ERP: la API se niega | `POST /integracion/roles/aprovisionar/:usuarioId` y `POST /integracion/roles/espejo` | 403 con el motivo. Aprovisionar operadores en un core que no se contrató crearía usuarios en un registro ajeno |
| Eb5 | Empresa solo-ERP: el catálogo no llama al core | `GET /integracion/roles/catalogos` | `contratado: false`, `externos: []`, y **cero** llamadas de red al core |
| Eb6 | Empresa solo-ERP: el diagnóstico | `GET /integracion/roles/diagnostico` | Lista vacía, sin tocar el core |
| Eb7 | Contratar en caliente | Desde la consola de SUMA, encender la cartera de esa empresa y recargar el ERP | Aparecen el enlace y la pestaña **sin reiniciar nada**. El plan no se cachea en el navegador a propósito |
| Eb8 | Descontratar en caliente | Apagar los dos ejes y recargar | Desaparecen los dos, y la correspondencia vuelve a explicar en vez de proponer |
| Eb9 | Solo contabilidad espejo | Empresa con cartera APAGADO y contabilidad ESPEJO | **Sí** ve la correspondencia: también es cliente del core, aunque no mueva cartera |
| Eb10 | El techo global manda | Empresa que pidió AUTORIDAD con `CARTERA_MODO` apagado en el despliegue | Se queda apagada, y no ve nada del core |
| Eb11 | Un vendedor pinta su menú | Entrar con un usuario no administrador | El menú se pinta bien: `GET /integracion/contratacion` es `@SkipPermisos`, y si exigiera permiso un 403 haría concluir «no contratado» por el motivo equivocado |

Los casos Eb1, Eb2 y Eb9 tienen prueba unitaria en
`services/integracion-modo.spec.ts` (`describe('usaRegistroExterno')`); los
demás se prueban en pantalla.

## F · Identidad y roles entre los tres sistemas

| # | Caso | Pasos | Qué debe pasar |
|---|---|---|---|
| F1 | Semáforo de los tres | Correspondencia → lista de usuarios | `ERP ✓ · SUMA ✓ · Core ✓` para quien esté completo |
| F2 | Encender la consulta al directorio | `DIRECTORIO_CLIENT_ID` / `DIRECTORIO_CLIENT_SECRET` (cliente con `view-users`) | El `SUMA ?` pasa a `✓` o `✕`. Sin configurar debe decir `?`, nunca `✕` |
| F3 | Alguien que no está en SUMA | Usuario del ERP con un correo que no existe en el realm | Acción `NO_EXISTE_EN_DIRECTORIO`, no «dar de alta en el core» |
| F4 | Core caído | Apagar el core y recargar | Acción `CORE_NO_DISPONIBLE` y **sin** botón de alta (si ofreciera darlo de alta, duplicaría) |
| F5 | Deshabilitado en el directorio | Deshabilitar a alguien en Keycloak | Etiqueta «deshabilitado en SUMA» |
| F6 | Sin fugas | `GET /api/usuarios` | Sin `passwordHash`, sin `tokenVerificacion`, sin `tokenRecuperacion` |

---

## G · Aislamiento entre empresas

| # | Caso | Pasos | Qué debe pasar |
|---|---|---|---|
| G1 | Cartera ajena | Con dos empresas, pedir por id un cliente de la otra | 404, no 403: no se confirma ni que exista |
| G2 | Correo único | Alta del mismo correo en dos empresas | Rechazo. El índice único de `usuarios(email)` existe y está verificado |
| G3 | La empresa sale del ERP | Token con `empresaId` manipulado | Se ignora: la empresa se resuelve por la fila del ERP |
| G4 | Oficinas distintas | Dos empresas con core, cada una con su oficina | Los operadores de una no ven la cartera de la otra ⚠️ limitado por B5: hoy ambas caen en el mismo tenant |
| G5 | Techo global | Empresa que intenta subir su modo por encima de `.env.local` | Se queda en el techo |

---

## H · Degradado y caminos no felices

| # | Caso | Pasos | Qué debe pasar |
|---|---|---|---|
| H1 | Core caído en SOMBRA | Apagar el core y vender | La venta se completa; el evento queda en el outbox |
| H2 | Core caído en AUTORIDAD | Igual, con la empresa en AUTORIDAD | La operación que **necesita** el core se niega con un mensaje que lo explica, no con un error genérico |
| H3 | Circuito abierto | Provocar fallos consecutivos | El circuito abre, deja de golpear al core y se reabre solo |
| H4 | Reintento del outbox | Levantar el core | Los pendientes salen sin duplicar (claves de idempotencia) |
| H5 | Doble envío | Repetir la misma operación | Una sola vez del otro lado |
| H6 | Token vencido | Dejar la sesión 6 minutos (los tokens duran 5) | Se renueva sin tirar al usuario, y lo que se reenvía al core sigue siendo válido |

---

## Lo que hoy **no** se puede probar, y qué falta

| Tema | Qué falta |
|---|---|
| Dos empresas con core de verdad | Un realm por empresa, un tenant real, el registro del emisor y un adaptador que pida el token del realm que toca (`HALLAZGO-AISLAMIENTO-CORE.md`) |
| Roles del core que sirvan | Permisos reales en los 13 roles espejo, o mapear contra roles existentes |
| Verificación desde el front de Fineract | No existe todavía |
| El provisionador del portal de Fineract | `KEYCLOAK_ADMIN_CLIENT_SECRET` está **vacío** en `fineract/frontend/.env.local`: la pantalla «Usuarios Keycloak + Fineract» existe y funciona, pero queda en modo consulta. Y antes de llenarlo hay que poner el candado (`BACKOFFICE_OPERATOR_GROUP` o `BACKOFFICE_ALLOWED_EMAIL_DOMAINS`), que hoy está en modo `open` |
| Fechas con zona horaria | La migración está escrita y sin aplicar |
| Los casos E-bis en pantalla | Hace falta una segunda empresa **sin** core contratado y un usuario suyo para entrar. Hoy la única empresa con usuario real tiene cartera SOMBRA y contabilidad ESPEJO, así que solo se puede comprobar el caso positivo |
