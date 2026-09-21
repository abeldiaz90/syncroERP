

---

## La primera sesión de un usuario que no es administrador (17 de septiembre)

Se dieron de alta cuatro usuarios finales por la pantalla —almacenista, RRHH,
crédito y contador—, con identidad real en Keycloak, y se entró al ERP como
`almacen.prueba`. Era la primera vez que alguien que no es administrador usaba
este sistema. El administrador **salta la tabla de permisos entera**, así que
todo lo que sigue llevaba meses sin poder verse.

### 1. Las plantillas de permisos no se aplicaban solas

`rrhh` y `credito` quedaron con un usuario cada uno y **cero acciones**. Como el
guardia niega lo que no está concedido, esa persona entra y no puede hacer nada.
Y es por empresa: cada cliente nuevo de SUMA nacía con los trece roles vacíos.

Corregido en `usuarios.service`: al crear un usuario o cambiarle el rol, si ese
rol no tiene **ningún** permiso en la empresa, se siembra su plantilla. Sólo si
está vacío, para no deshacer lo que alguien configuró a mano. Verificado en
vivo: el alta de `contador.prueba` nació con 119 acciones.

### 2. El menú venía vacío aunque los permisos estuvieran bien

Con 102 acciones concedidas, el panel decía «Todavía no tienes módulos
asignados» y el menú tenía dos entradas. La API, en cambio, respondía 200 a
productos, almacenes y categorías. Los permisos estaban bien; lo que fallaba era
`obtenerRutasPermitidas`, de donde sale el menú.

Eran dos restos de SQL Server en dos consultas escritas a mano:
`rep.empresaId` sin comillas —PostgreSQL lo pasa a minúsculas y buscaba una
columna que no existe— y `rep.permitido = 1` sobre una columna booleana. Los dos
errores caían en un `.catch` que devolvía lista vacía: el sistema no se caía, se
quedaba callado y dejaba sin menú a todo el que no fuera administrador. Reescrito
con el constructor de consultas. De dos entradas pasó a nueve módulos.

### 3. Indicadores que valían cero cuando en realidad no se pudieron leer

El panel del almacenista mostraba «Ventas de hoy **$0.00** · 0 transacciones»,
«Ticket promedio $0.00», «Últimos 7 días $0.00». Las tres llamadas respondían
403 y `intentar` se tragaba el error.

Eso no es un hueco: es un dato del negocio, y falso. Si el almacenista lo repite
en voz alta, alguien decide con eso. Ahora `null` significa «no lo sé» y lo que
no se sabe no se pinta.

Lo mismo, y peor, en **Corte de Caja**: la pantalla entera con «TOTAL COBRADO
$0.00» desglosado por efectivo, tarjeta, transferencia y cobranza, en un día que
podía tener ventas. Con eso se cierra una caja mal. Ahora dice que no se puede
calcular y por qué, sin pintar un solo número.

### 4. El punto de venta se abría para quien no puede vender

Al vivir fuera de `/dashboard`, la caja se saltaba el guardia de rutas: el
almacenista la abría entera, buscaba productos, armaba el carrito, y sólo al
pulsar «Cobrar» el servidor decía que no. El backend nunca dejó pasar la venta
—no era un agujero—, pero la negativa llegaba con el cliente enfrente y el
carrito lleno. Ahora se comprueba al abrir. Quien tiene ventas en modo consulta
tampoco entra, que es lo correcto: no se puede cobrar con permiso de lectura.

### 5. Botones que llevaban a una negativa

La barra contextual del módulo ofrecía sus acciones **sin filtrar por
permisos**, mientras la pantalla del centro del módulo sí las filtraba: la misma
barra, dos comportamientos. Al almacenista, en Finanzas, le ofrecía «Nueva
póliza», «Balanza» y «Cierre mensual» en botones destacados. Y en el panel, los
accesos rápidos se filtraban con `puedeVerEnlace`, que acepta que el permiso sea
*descendiente* del enlace —correcto para una sección, no para un destino
concreto—. Los dos corregidos.

### Lo que sí funcionó

La cadena de identidad, completa: el alta creó la identidad en Keycloak, selló
el `sub`, y al entrar el ERP reconoció a la persona con su empresa y su rol. El
guardia de permisos niega de verdad: de dieciséis rutas probadas con el token
del almacenista, las de su trabajo respondieron 200 —productos, almacenes,
categorías, compras y proveedores en consulta— y las ajenas 403: RRHH, usuarios,
administración de permisos, integración, ventas, clientes y finanzas. Entrar por
URL a un módulo ajeno muestra «Esta sección no está en tu perfil» con salida al
panel, sin callejón. Y el catálogo de módulos es coherente: `inventario` cubre
productos, categorías, marcas, unidades, almacenes, existencias, WMS e
importación, así que «almacenista» sí significa el almacén entero.

### Lo que queda de esta sesión

- **Sin SMTP en el realm no entra nadie.** Las cuatro identidades se crearon y
  ninguna recibió el correo para fijar contraseña. El ERP lo reporta bien, pero
  en producción es un muro: hay que configurar el correo del realm antes de
  vender la primera cuenta.
- **`/dashboard/reportes` se concede entero.** Un endpoint de inventario declara
  esa ruta como su pantalla, así que el almacenista ve el módulo de reportes
  completo —Panel ejecutivo, Ventas, Cartera, Estado de cuenta— y cada uno falla
  al abrirse. La ruta declarada debería ser la del reporte concreto.
- **La lista de tareas de «primeros pasos»** en Productos le ofrece al
  almacenista «Completar configuración fiscal» y «Activar Finanzas», que son de
  administración.
- El panel pide `mis-permisos` y `mis-rutas` **dos veces** en cada carga.
