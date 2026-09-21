

---

## Barrido de los trece roles con sesión real (18 de septiembre)

### Cómo se hizo, porque importa para repetirlo

Keycloak mantiene **una sola sesión por navegador**, así que no se pueden tener
dos usuarios a la vez ni cambiando de puerto: la segunda dirección entra con el
mismo usuario. Lo que sí funciona es separar el token de la sesión:

1. Se entra como el usuario de prueba y se **guarda su token** aparte en el
   almacenamiento del navegador.
2. Se cierra la sesión de Keycloak y se entra como administrador. El token del
   usuario de prueba **sigue siendo válido**: es un JWT firmado, y el ERP lo
   verifica por firma, no consultando la sesión.
3. Desde una sola pestaña se tienen las dos llaves. Con la de administrador se
   cambia el rol del usuario de prueba; con la suya se comprueba qué alcanza.

Y funciona porque **el rol no viaja en el token**: el ERP lo lee de su propia
fila en cada petición. Cambiar el rol surte efecto en la siguiente llamada, sin
volver a entrar. Para esto hubo que subir el *Access Token Lifespan* del cliente
`syncro-erp` de 5 minutos a 1 hora.

### El resultado

Para cada uno de los trece roles se cambió el rol del usuario de prueba y se
llamó, con **su** token, una ruta GET representativa de cada uno de los 21
módulos. 273 llamadas contra el guardia real y la tabla real.

**Ningún rol alcanzó un módulo que no le toca. Cero, en los trece.** Es la
propiedad que importa y hasta hoy no se había comprobado nunca, porque todas las
pruebas anteriores se hicieron con administrador — que salta la tabla entera.

Tampoco hubo negaciones indebidas. La única que aparecía —contador sin
inventario— resultó ser correcta al mirarla: su plantilla no le da el módulo,
sólo una acción suelta de valuación, así que el estado del módulo es «parcial» y
la ruta de almacenes no está entre lo concedido.

De paso, el barrido encontró **tres reportes que respondían 500 a todo el
mundo, incluido el administrador**: flujo de efectivo, teórico contra real de
recetas y —con otro síntoma— asistencia. Los dos primeros hacían
`Between(new Date(desde), new Date(hasta))` con lo que viniera en la consulta:
sin parámetros, `new Date(undefined)` es una fecha inválida, la base la rechaza y
el usuario ve «No se pudo completar la operación en la base de datos», que
parece una caída del sistema. Ahora se valida antes de tocar la base, con un
mensaje que dice qué falta, y se rechaza el rango invertido —que no fallaba:
devolvía vacío, y quien lo leía concluía que no hubo movimientos—. Se corrigió
igual en hotelería y CRM, que tenían el mismo patrón.

### El candado de los roles

Quedó puesto lo que se pidió: los roles del catálogo **nacen con los permisos de
su plantilla** —se siembra al crear el usuario o al cambiarle el rol, sólo si ese
rol no tiene ya permisos en la empresa, para no deshacer lo que alguien
configuró— y **no se les puede quitar el acceso a su propio trabajo**.

La regla, en una línea: de los módulos propios de un rol se puede quitar la
escritura, no la consulta. Agregar es libre. Vale en las dos puertas —la pantalla
de módulos y el ajuste fino acción por acción—, porque un candado que sólo vive
en una pantalla se salta por la otra. Y la pantalla marca esos módulos, con
«Sin acceso» deshabilitado, para que el candado se vea antes de intentarlo.

Consulta y no acceso completo, a propósito: una empresa donde el almacenista
cuenta pero no corrige existencias es una empresa razonable. Lo que no tiene
sentido es que no pueda ni ver su propio almacén.

### El enrolamiento por `/register`, retirado

Se quitaron la pantalla de registro, la de verificación de correo y el asistente
de puesta en marcha, más las rutas del backend (`POST /auth/register`, su
contrato, el controlador y el servicio de registro, que además no estaban
registrados en ningún módulo: ya eran código muerto que seguía respondiendo por
la ruta de `auth`).

La razón no es de limpieza: con esa puerta abierta, una empresa podía nacer sin
pasar por la consola de SUMA — sin plan contratado, sin inquilino, sin identidad
en el directorio y sin que SUMA supiera que existe. Quien decide qué empresa
existe y qué contrata es la consola, y el alta entra por la puerta de
aprovisionamiento.
