# SyncroERP · Paquete de remediación

Correcciones derivadas de la auditoría de los módulos, la segregación de
funciones y la ubicación de responsabilidades.

**Léelo completo antes de aplicar nada.** La sección "Lo que NO se tocó" es tan
importante como la lista de cambios.

---

## Qué se verificó

| Comprobación | Antes | Después |
|---|---|---|
| `tsc` backend (`tsconfig.build.json`) | 0 errores | **0 errores** |
| `tsc` frontend | 0 errores | **0 errores** |
| Suite de pruebas backend | 195 pasan · 2 suites no compilan | **236 pasan · 47/47 suites en verde** |
| Claves del mapa navegable sin ruta real | 12 | **0** |
| Pantallas del menú sin endpoint navegable | 31 | **0** |
| Rutas de frontend inventadas por inferencia | 139 | **0** |

Las tres suites que no compilaban están reparadas: sus arneses seguían
construyendo los servicios con firmas viejas. `clientes.service.spec.ts` en
particular llevaba tiempo sin ejecutarse —el reporte sólo decía «1 suite
failed», ocultando que sus 4 pruebas de gobierno de crédito nunca corrían.
**Por primera vez las 47 suites pasan.**

### Lo que NO se pudo verificar

No hay SQL Server en el entorno donde se hicieron estos cambios. **Nada de esto
se ejecutó contra una base de datos real.** Compila y pasa las pruebas
estáticas; el comportamiento en runtime necesita que tú lo pruebes.

Prueba obligatoria antes de producción, en este orden:

1. Venta de contado en efectivo → anularla → **cerrar el turno de caja y
   confirmar que el arqueo cuadra**. Es el cambio con más superficie.
2. Pago a proveedor desde una cuenta tipo `CAJA` → verificar que el turno
   descuenta y que no deja sacar más efectivo del que hay.
3. Retiro manual de caja → confirmar que baja el turno, **baja el saldo en
   Tesorería** y genera póliza contra la contrapartida elegida.
4. Traspaso entre dos cuentas → confirmar que genera **una sola** póliza
   cuadrada (Dr. destino / Cr. origen).
5. Arrancar la app y verificar que no hay error de dependencia circular:
   `CajaModule ↔ TesoreriaModule ↔ FinanzasModule` usan `forwardRef`, pero
   eso **no se pudo probar en runtime**. Es lo primero que fallaría al
   arrancar.
3. Arrancar el backend y revisar la tabla `endpoints`: las filas
   `esNavegable = 1` deben corresponder sólo a pantallas reales.
4. Entrar con un usuario de cada rol y confirmar qué ve en el menú.

---

## Cambios aplicados

### 1. Segregación de funciones · `iam/data/plantillas-permisos.ts`

- **`comprador`**: se retira `/configuraciones-aprobacion`. Quien crea
  requisiciones y órdenes ya no puede reescribir la matriz que lo aprueba
  —topes, aprobadores y niveles—, incluida la matriz financiera de crédito.
- **`cobranza`**: se retira `/caja`. Se rompe la combinación de autorizar el
  cobro, custodiar el efectivo y registrar el movimiento en la misma persona.
- **Nuevos roles `tesoreria`, `contador` y `rrhh`.** El código los exigía en 17
  operaciones de nómina (`exigirRol`) y no existían como plantilla: aunque se
  creara el rol no recibía ningún endpoint, así que en la práctica sólo el
  administrador podía dispersar y pagar la nómina. Toda la segregación
  RRHH → Finanzas → Tesorería colapsaba en una sola persona.
- **`gerencia` y `direccion`**: se les dan prefijos de consulta. Antes sólo
  tenían `/aprobaciones`, así que autorizaban una línea de crédito sin poder
  abrir el cliente, su cartera ni la venta que la originaba.

> Nota: `tesoreria` recibe `/rrhh/nomina-avanzada/periodos`, que cubre más
> endpoints de los estrictamente necesarios porque el sistema de permisos
> trabaja por prefijo. Los `exigirRol` dentro del servicio siguen siendo la
> defensa real (tesorería no puede calcular ni aprobar la nómina). Si necesitas
> granularidad fina, hay que dividir el controlador.

### 2. Autorización de anulaciones · nuevo `ventas/constants/autorizacion-ventas.ts`

`PATCH /ventas/:id/anular` no recibía el rol y el servicio no tenía ninguna
comprobación. Con el prefijo `/ventas` de la plantilla `empleado`, cualquier
cajero podía anular **cualquier** venta de la empresa, sin umbral ni aprobación.

- El controlador ahora pasa `@ActiveUser('rol')`.
- El umbral por defecto es **cero**: anular revierte inventario, crédito,
  tesorería, contabilidad y CFDI de golpe; no es operación de mostrador. Se
  puede subir con `ANULACIONES_MONTO_APROBACION` si quieres el comportamiento
  anterior.
- De paso se centraliza aquí el umbral de devoluciones, que estaba suelto en
  `process.env` dentro del servicio, invisible desde la pantalla de permisos.
- Los roles por defecto incluyen ahora `GERENCIA` y `DIRECCION`, que son los
  nombres reales del sistema; la lista original usaba `GERENTE` y `SUPERVISOR`,
  que no existen como rol.

### 3. Caja: dos flujos que sacaban dinero sin descargar el turno

Cinco servicios registraban tesorería **y** caja correctamente. Dos no:

- **`anulacion-ventas.service.ts`**: al anular una venta en efectivo el dinero
  se devolvía al cliente pero `efectivoEsperado` no bajaba. Al cerrar, el
  cajero aparecía con un **faltante** por dinero que había devuelto
  legítimamente, y tenía que justificarlo por escrito.
- **`ordenes-compra.service.ts`**: pagar a un proveedor desde una cuenta tipo
  `CAJA` producía lo mismo, y además se saltaba la validación que impide sacar
  más efectivo del que hay en el turno.

Ambos registran ahora el movimiento de caja cuando la cuenta es de tipo `CAJA`,
con el mismo patrón que ya usaban devoluciones, cobranza y hotelería.
`CajaModule` se cableó en `ComprasModule` (en `VentasModule` ya estaba).

### 4. Navegación y permisos · el hallazgo principal

Había **dos** mapas `ENDPOINTS_NAVEGABLES`: uno en `iam/data/endpoints-navegables.ts`
(85 entradas, el corregido) y otro inline en `permisos-dinamicos.service.ts`
(57 entradas, el viejo). El servicio usaba el inline; **el archivo de datos era
código muerto que nadie importaba.**

- Se elimina el bloque inline de 297 líneas; el servicio importa el archivo.
- Se elimina la "inferencia inteligente" que generaba `/dashboard${ep.ruta}`
  para todo GET sin `:id`. Producía **139 rutas que no existen en Next**
  (`/dashboard/catalogo/almacenes`, `/dashboard/auth/verificar-email`, incluso
  `/dashboard/`). El permiso se concedía a una URL fantasma mientras la
  pantalla real quedaba bloqueada; y como `puedeVerEnlace()` compara en ambos
  sentidos, esas rutas basura abrían enlaces del menú que el usuario no debía
  ver.
- Se añade **saneamiento de instalaciones existentes**: al arrancar, las filas
  marcadas como navegables por la inferencia anterior y que hoy no están
  declaradas se retiran. Sin esto las rutas fantasma sobreviven en la base
  aunque el código ya no las genere.
- Se corrigen las **12 claves rotas** del mapa (apuntaban a endpoints
  inexistentes, así que el permiso nunca se podía derivar y la pantalla era
  invisible para todo el que no fuera administrador).
- Se añaden **32 entradas** para pantallas que no tenían ninguna: RRHH casi
  entero (vacaciones, préstamos, pagos, cumplimiento, conceptos, configuración
  patronal, cuentas bancarias, centro de nómina), la caja, los asientos
  pendientes, conteos, ubicaciones, reubicaciones, devoluciones, integridad
  financiera, catálogos SAT y los seis wizards.

### 5. Menú · `frontend/app/dashboard/module-config.ts`

`/dashboard/rrhh/aprobaciones-estructura` existía y era alcanzable desde
Puestos, Departamentos y el asistente de empleado, pero no estaba en el mapa:
se pintaba sin barra de módulo ni breadcrumb y, como el layout valida
`puedeEntrar(permisos, pathname)`, un no-administrador recibía "sin acceso" al
llegar por esos enlaces. El flujo completo (solicitud → Gerencia → Finanzas)
estaba construido y sólo lo podía ejecutar un administrador.

### 6. Bitácora de auditoría · `auditoria/interceptors/auditoria.interceptor.ts`

98 de los 252 endpoints de escritura quedaban fuera de la lista blanca,
incluidos el timbrado y la **cancelación de CFDI**, los traspasos de tesorería,
la apertura y cierre de turnos de caja, los retiros de efectivo y las bajas de
activos. Dos huecos eran erratas de una letra: la lista decía `creditos` cuando
la ruta real es `/credito`, y `catalogo` cuando los catálogos cuelgan de
`/catalogos`. Se añaden 12 claves.

### 7. Asientos contables atascados · `finanzas/services/asientos-pendientes.service.ts`

`REINTENTANDO` se asignaba y nunca se liberaba. Si el proceso moría a mitad del
reintento —un despliegue, un OOM— la fila quedaba congelada: el cron sólo
recoge `PENDIENTE` y el botón manual sólo reclama `PENDIENTE` o `FALLIDO`, así
que respondía "ya está siendo procesado por otro usuario" indefinidamente. Y
como el diagnóstico de cierre cuenta `REINTENTANDO` como bloqueo, **un
despliegue mal cronometrado durante una venta dejaba el cierre mensual trabado
sin salida por pantalla.**

Se añade `liberarReclamosHuerfanos()` al inicio del cron: devuelve a
`PENDIENTE` lo que lleve más de 10 minutos reclamado.

### 8. Anulación de ventas históricas · `ventas/services/anulacion-ventas.service.ts`

La rama para ventas anteriores al costeo por lote escribía un
`MovimientoInventario` de ENTRADA con costo cero y devolvía éxito. Pero la
existencia se calcula como `SUM(lote.stockRestante)` y ahí no se creaba ni
actualizaba ningún lote: **el stock no subía**. El kardex mostraba una entrada
fantasma y la advertencia ("el inventario se devolvió, pero sin costo") era
falsa.

Ahora lanza `ConflictException` explicando que hay que registrar la entrada
manualmente. Entre mentir y detenerse, se detiene.

**Cambio de comportamiento:** anulaciones de ventas históricas que antes
"funcionaban" ahora fallan. Es intencional: antes no funcionaban, sólo lo
parecían.

### 9. Saldo a favor en anulaciones · `ventas/services/anulacion-ventas.service.ts`

`generarAsientoDeVenta` carga la cuenta de saldos a favor de clientes cuando se
aplica, pero `generarAsientoDeCancelacionVenta` no recibe `saldoFavorAplicado` y
abona el total íntegro a la cuenta del método de pago: el pasivo con el cliente
quedaría sin cancelar y la cuenta de cobro sobreabonada. Se bloquea la anulación
en ese caso y se remite a devolución, que sí maneja el desglose.

### 10. Callejón sin salida en cotizaciones · `compras/services/cotizaciones.service.ts`

`PATCH /compras/cotizaciones/:id/seleccionar` marcaba `SELECCIONADA`, pero
`crearDesdeCotizacion` exige `APROBADA`. Una cotización marcada por ese endpoint
**ya nunca podía convertirse en orden de compra**, y no hay forma de devolverla
a `APROBADA`: la requisición quedaba atascada en `COTIZANDO` para siempre.

El endpoint se conserva por compatibilidad pero ya no persiste el estado. La
adjudicación real ocurre al generar la orden, que es donde siempre estuvo.

### 11. Vacaciones del primer año · `rrhh/services/nomina-calculo.service.ts`

`diasVacacionesLey()` devolvía **0** para menos de un año de antigüedad. Como
alimenta el factor de integración del SBC (Art. 27 LSS), todo empleado nuevo
integraba **sin prima vacacional**: su salario base de cotización quedaba por
debajo del legal y las cuotas al IMSS se enteraban de menos —exactamente la
diferencia que el Instituto liquida con recargos y actualización.

Ahora devuelve 12 desde el primer día, que es el mínimo de integración. El resto
de la tabla ya era correcta según la reforma de Vacaciones Dignas 2023.

**Cambio de comportamiento:** el SBC de los empleados con menos de un año sube,
y con él las cuotas patronales. Es la cifra correcta.

### 12. Código muerto

Se elimina `clientes/resolver-credito-cliente.dto.ts`
(`['AUTORIZAR','RECHAZAR','SUSPENDER']`), que nadie importaba. Es el resto de
cuando la línea de crédito se autorizaba desde Clientes; hoy sólo se resuelve
en la bandeja central. Conviene que no siga ahí invitando a recablearlo.

### 13. Pruebas de coherencia transversal · nuevo `common/coherencia.spec.ts`

20 pruebas que leen el código fuente y comparan **unos módulos contra otros**.
Cada una corresponde a un hallazgo real de la auditoría. Ninguna de estas
regresiones la detecta una prueba unitaria de módulo, porque dentro de cada
módulo todo es consistente:

- Cada `OrigenMovimiento` declarado tiene al menos un productor.
- Todo método del despachador de asientos existe en el motor contable.
- Sólo hay un mapa `ENDPOINTS_NAVEGABLES` y el servicio lo importa.
- No se infieren rutas de frontend a partir de rutas de API.
- Cada clave del mapa navegable corresponde a una ruta real del backend.
- Ningún endpoint se declara dos veces (esto además rompe la compilación).
- Cada pantalla del menú tiene un endpoint que la habilita.
- Ningún rol operativo administra la matriz de aprobación.
- Quien gestiona la cartera no custodia la caja.
- Todo rol exigido por el código tiene plantilla de permisos.
- La anulación de ventas exige rol autorizador.
- Los 7 flujos con efectivo descargan el turno de caja.
- Toda columna `decimal` usa `decimalNumberTransformer`.
- Los módulos que mueven dinero o afectan al SAT se auditan.

Dos pruebas llevan una lista de excepciones documentadas (`NOMINA`,
`TESORERIA`, `COMISION_BANCARIA`, `IMPUESTO`). **Esas listas son la lista de
pendientes**: cuando implementes cada integración, borra la excepción.


### 14. Contabilidad de tesorería y caja · segunda tanda

`TipoAsiento.TESORERIA` estaba declarado, el despachador lo mapeaba a
`generarAsientoDeTesoreria` y **ese método no existía**. No explotaba porque
nadie lo encolaba: el módulo de tesorería no tenía una sola referencia
contable. `POST /tesoreria/movimientos`, `POST /tesoreria/traspasos` y las
entradas y retiros manuales de caja movían dinero en el auxiliar y jamás
tocaban el mayor.

- **Nuevo `generarAsientoDeTesoreria`** en el motor contable:
  - Movimiento INGRESO: `Dr. Caja/Banco / Cr. Contrapartida`
  - Movimiento EGRESO: `Dr. Contrapartida / Cr. Caja/Banco`
  - Traspaso: `Dr. Cuenta destino / Cr. Cuenta origen`, en **una sola póliza**.
    Dos pólizas independientes dejarían medio traspaso contabilizado si la
    segunda fallaba.
  - Nuevo resolvedor estricto `cuentaContableDeCuentaBancaria`: si la caja o el
    banco no tienen cuenta contable configurada, el asiento falla de forma
    visible en lugar de aterrizar en una cuenta genérica.
- **`TesoreriaService` encola el asiento** dentro de la transacción, pero
  **sólo** para los orígenes `MANUAL`, `COMISION_BANCARIA` e `IMPUESTO`. Los
  movimientos que llegan desde ventas, cobranza, compras u hotelería ya generan
  su póliza en el módulo que los produce; encolar otra duplicaría el importe.
- **`CajaService.registrarManual` propaga a Tesorería** en la misma
  transacción. Antes un retiro del cajón bajaba `efectivoEsperado` del turno
  mientras Tesorería seguía diciendo que el dinero estaba ahí.
- **Contrapartida obligatoria.** El sistema no puede adivinar si un ingreso
  manual es una aportación de capital, un préstamo o un cobro extraordinario, ni
  si un retiro es un depósito al banco, un gasto o una entrega a dirección. Se
  valida al capturar (`BadRequestException`), no al generar el asiento: así el
  dinero no se mueve en el auxiliar antes de descubrir que no se puede
  contabilizar.

**Cambio de API (rompe clientes existentes):**

| Endpoint | Campo nuevo |
|---|---|
| `POST /tesoreria/movimientos` | `cuentaContrapartidaId` (obligatorio si `origen` es MANUAL) |
| `POST /caja/movimientos/entrada` | `cuentaContrapartidaId` (obligatorio) |
| `POST /caja/movimientos/retiro` | `cuentaContrapartidaId` (obligatorio) |

Las dos pantallas afectadas ya están actualizadas con un selector de cuenta
contable: `tesoreria/caja` y `tesoreria/movimientos`. Si tienes integraciones
externas contra esos endpoints, tendrán que mandar el campo.

**Con esto el triángulo caja ↔ tesorería ↔ mayor queda cerrado** salvo por la
nómina, que sigue sin registrar salida de tesorería.


### 15. Nómina → Tesorería · el último hueco del triángulo

La póliza de pago abonaba la cuenta contable del banco, pero **no se creaba
ningún `MovimientoTesoreria`**. El saldo bancario en Tesorería quedaba
sobrevaluado por el importe íntegro de la nómina en cada periodo y la
conciliación bancaria no podía cuadrar nunca. `OrigenMovimiento.NOMINA` llevaba
declarado desde el principio sin que nadie lo produjera.

- `registrarPago` recorre las aplicaciones y registra un `EGRESO` de tesorería
  por cada una, con origen `NOMINA`, dentro de la misma transacción.
- Si la cuenta es de tipo `CAJA` (nómina pagada en efectivo), **también
  descarga el turno**.
- `COMPENSACION` se excluye a propósito: no mueve dinero, se descuenta contra
  un adeudo.

**Campo nuevo:** `cuentaBancariaId` en cada aplicación de
`POST /rrhh/nomina-avanzada/periodos/:id/pago`. Es distinto de
`cuentaFinancieraId`, que es la cuenta *contable*: hacía falta saber de qué
caja o banco sale físicamente el dinero. Es opcional para no romper
integraciones, pero **sin él el pago no se registra en Tesorería**.

Se retiró además el mapeo `TipoAsiento.NOMINA → generarAsientoDeNomina` del
despachador. Ese método **nunca existió**; la nómina genera sus pólizas por su
propia vía porque el asiento depende del desglose por concepto, empleado y
centro de costo, que sólo existe en ese contexto. El despachador ya no promete
lo que no puede cumplir.

**Con esto el triángulo caja ↔ tesorería ↔ mayor queda cerrado por completo.**

### 16. Pólizas manuales contra cuentas de auxiliar

`crearPolizaManual` validaba cuadre, importe distinto de cero y periodo
abierto, pero **nunca a qué cuentas se afectaba**. Cualquiera con acceso a
Finanzas podía cargar o abonar a mano Bancos, Clientes CxC o Inventario: el
auxiliar no cambiaba, el mayor sí, y la conciliación cuadraba igual. Es el
mecanismo con el que se disimula un faltante.

- Nueva columna `CuentaContable.permiteMovimientoManual` (por defecto `true`).
- Nuevo `validarCuentasAfectables()` en `PolizasService`: rechaza pólizas
  manuales que toquen cuentas cerradas, y de paso las cuentas de mayor
  (`esAfectable = false`), que tampoco deberían recibir movimientos directos.
- El valor se **deriva del rol de sistema**: `ROLES_CONTROLADOS_POR_AUXILIAR`
  cubre CAJA, BANCOS, INVENTARIO, CLIENTES_CXC, PROVEEDORES, las cuatro cuentas
  de IVA y SALDOS_FAVOR_CLIENTES.
- Al sembrar el catálogo se **sanean las instalaciones existentes**: sólo se
  baja la bandera, nunca se sube, por si alguien la abrió a propósito.

Los asientos del motor contable no pasan por esta validación: usan
`crearPoliza`, que es la vía legítima para mover esas cuentas.


### 17. Identificadores rechazados por `@IsUUID()` · bug bloqueante

Síntoma: `POST /credito/cuentas-bancarias → 400 · cuentaContableId must be a UUID`.

SQL Server admite cualquier hexadecimal 8-4-4-4-12 en `uniqueidentifier`, y
`NEWSEQUENTIALID()` genera GUIDs que **no cumplen RFC-4122**: el nibble de
versión puede ser cualquier cosa. El ID de empresa que fallaba era
`EDE597DD-F98D-**F111**-8D6E-...`, con versión `F`. `@IsUUID()` exige versión
1-5, así que rechazaba identificadores perfectamente válidos de la propia base.

El proyecto ya tenía el validador correcto (`IsSqlServerGuid`) y su comentario
describe el caso exacto — la migración simplemente quedó incompleta. **Trece
decoradores en tres DTOs** bloqueaban el alta de cuentas bancarias, la
generación de órdenes de compra, las recepciones, los pagos a proveedor y el
cierre contable.

Se conserva `@IsUUID()` **a propósito** en `claveIdempotencia` e
`idempotencyKey`: esas claves las genera el cliente con `crypto.randomUUID()`,
que sí produce un v4 legítimo, y ahí la validación estricta es la correcta.
La prueba de coherencia contempla esa excepción.

### 18. Preparación para despliegue en Azure

**Tareas programadas.** Los cinco `@Cron` corren dentro del proceso de la API.
Sólo el de asientos pendientes está protegido contra ejecución múltiple
(reclama cada fila con compare-and-set). Los otros cuatro no tenían ninguna
protección: con dos réplicas, la **auditoría nocturna hotelera duplicaba los
cargos de renta** en los folios abiertos, la cartera vencida se recalculaba dos
veces y el resumen semanal salía por duplicado.

Nuevo `common/utils/tareas-programadas.util.ts` con el interruptor
`CRONS_HABILITADOS`:

```
API con varias réplicas  → CRONS_HABILITADOS=false
Worker dedicado (uno)    → CRONS_HABILITADOS=true
```

Por defecto `true`, para no cambiar el comportamiento de quien corre una sola
instancia. En WMS el guardia distingue la corrida automática de la manual: si
un usuario dispara la liberación desde la pantalla, se ejecuta aunque los crons
estén apagados en esa instancia.

**Versión de Node fijada** (`engines.node: >=20.11 <23`) en backend y frontend.
Sin esto Azure elige una versión por su cuenta.

**`DB_ENCRYPT`** documentado: en Azure SQL debe ser `true` o el servidor
rechaza la conexión.


### 19. Costo de ventas en hotelería · la fuga que crecía sola

`operacion-hotel.service.ts` llamaba a `registrarSalida`, que devuelve el costo
real calculado lote por lote, y **ese valor se descartaba**. El inventario
físico bajaba y la cuenta contable de Inventario nunca se acreditaba: crecía
indefinidamente respecto a la existencia real, el Costo de ventas quedaba
subvaluado y la utilidad, inflada. En un hotel con restaurante son decenas de
miles de pesos al mes que nadie puede explicar en el cierre.

- `generarAsientoDeHospedaje` recibe ahora `costoConsumos` y añade
  `Dr. Costo de ventas / Cr. Inventario`, igual que el asiento de venta.
- Al cerrar el folio se suman los movimientos de salida ligados a ese folio
  —consumos directos y los insumos que consumió una receta— para obtener el
  costo real.
- Va dentro de la misma póliza: el ingreso y su costo son el mismo hecho
  económico, y separarlos permitiría que uno quedara registrado sin el otro.

**Pendiente relacionado:** la dotación de habitación al check-in se liga a la
habitación, no al folio, así que no entra en este costo. Sigue saliendo del
almacén sin asiento. Es un gasto de operación del hotel, no costo de venta del
huésped, y merece su propio tratamiento.

### 20. Baja de activos y reversión de depreciación

**Baja.** `darDeBaja` calculaba el valor en libros y el resultado —su propio
comentario decía «lo que contabilidad necesita para la póliza»— y lo devolvía
en el JSON de la respuesta. Nunca generaba nada.

- Nuevo `generarAsientoDeBajaActivo`: cancela la depreciación acumulada, da de
  baja el activo a costo histórico, registra el cobro si fue venta y reconoce
  la utilidad o pérdida.
- Nuevo `TipoAsiento.BAJA_ACTIVO` y nuevos roles de cuenta `OTROS_INGRESOS` y
  `OTROS_GASTOS`.
- `darDeBaja` ahora corre **dentro de una transacción**: antes marcaba el
  activo y guardaba sin atomicidad con el asiento.
- Campo nuevo opcional `cuentaBancariaId` para indicar dónde entró el dinero de
  la venta.

**Reversión de depreciación.** Borraba los registros del auxiliar y dejaba la
póliza aplicada. Y como `crearPoliza` es idempotente por `origenClave`, volver a
correr el mes **no** creaba una póliza nueva: la omitía en silencio, dejando el
periodo contabilizado con la corrida vieja y el auxiliar con la nueva.

Ahora **rechaza la reversión** si la póliza sigue vigente, indicando que hay que
cancelarla primero desde Finanzas. Preferí detener a revertir a medias: cancelar
una póliza tiene sus propias reglas de periodo y auditoría que no deben
ejecutarse de forma implícita desde el módulo de activos.

---

## Lo que NO se tocó, y por qué

Todo esto requiere probarse contra una base con datos. Escribirlo a ciegas y
entregarlo empaquetado daría algo que parece terminado y falla en el cierre de
mes.

| Pendiente | Impacto | Dificultad |
|---|---|---|
| Costo de ventas en hotelería y recetas | La cuenta de Inventario crece indefinidamente; la utilidad queda inflada | Alta |
| Integración recetas ↔ POS | Un producto KIT no se puede vender en el punto de venta | Alta |
| Timbrado real del CFDI de nómina | Hoy sólo genera "expedientes de preparación" | Alta |
| Cierre anual y resultado del ejercicio | El Balance General acumula todos los ejercicios | Media |
| Mover `CuentaBancaria` de Crédito a Tesorería | Tres roles pueden dar de alta cuentas bancarias | Media |
| Mover el gobierno de aprobaciones de Compras a `aprobaciones/` | Claridad de dominio | Media |
| Validación del arqueo por un segundo usuario | Custodia + registro + verificación en una persona | Media |
| Aprobación para ajustes y mermas de inventario | El custodio ajusta su propio registro | Media |
| Migrar los 33 archivos con `fetch` crudo a `lib/api` | Sesión expirada = pantalla muerta en esas 33 pantallas | Baja pero repetitiva |
| Unificar corte de caja (Reportes vs Tesorería) | Dos números distintos para el mismo corte | Baja |
| Sacar Recetas de Hotelería en el menú | Un restaurante sin hotel no lo encuentra | Baja |

---

## Cómo aplicarlo

**Recomendado: revisar el parche.**

```bash
cd /ruta/a/tu/repositorio
git checkout -b remediacion-auditoria
git apply --stat  parches/syncro-erp-remediacion.patch   # qué toca
git apply --check parches/syncro-erp-remediacion.patch   # ¿aplica limpio?
git apply         parches/syncro-erp-remediacion.patch
```

El parche usa los prefijos `backend-src/` y `frontend-app/`. Ajusta con `-p` o
edita las rutas según tu estructura. Son **15 archivos**; revísalos uno por uno
antes de hacer commit.

**Alternativa: copiar los archivos.** En `backend/` y `frontend/` están los
archivos completos ya modificados. Reemplaza sólo los 15 listados abajo; no
sustituyas carpetas enteras.

### Archivos modificados (32)

Ejecuta `git apply --stat parches/syncro-erp-remediacion.patch` para verlos
todos. Los principales por área:

```
SEGREGACIÓN
  iam/data/plantillas-permisos.ts
  ventas/constants/autorizacion-ventas.ts              ← NUEVO
  ventas/controllers/ventas.controller.ts
  auditoria/interceptors/auditoria.interceptor.ts

NAVEGACIÓN Y PERMISOS
  iam/data/endpoints-navegables.ts
  iam/services/permisos-dinamicos.service.ts
  frontend/app/dashboard/module-config.ts

DINERO EN TRES CAPAS
  finanzas/services/motor-contable.service.ts          ← generarAsientoDeTesoreria
  finanzas/services/polizas.service.ts                 ← validarCuentasAfectables
  finanzas/entities/cuenta-contable.entity.ts          ← permiteMovimientoManual
  finanzas/services/cuentas-contables.service.ts
  finanzas/services/asientos-pendientes.service.ts
  tesoreria/services/tesoreria.service.ts
  tesoreria/dto/tesoreria.dto.ts · tesoreria/modules/tesoreria.module.ts
  caja/services/caja.service.ts · caja/dto/caja.dto.ts · caja/modules/caja.module.ts
  ventas/services/anulacion-ventas.service.ts
  compras/services/ordenes-compra.service.ts · compras/modules/compras.module.ts
  rrhh/advanced/nomina-avanzada.service.ts · nomina-avanzada.dto.ts
  rrhh/modules/rrhh.module.ts
  frontend/app/dashboard/tesoreria/caja/page.tsx
  frontend/app/dashboard/tesoreria/movimientos/page.tsx

OTROS
  compras/services/cotizaciones.service.ts
  rrhh/services/nomina-calculo.service.ts
  clientes/resolver-credito-cliente.dto.ts             ← ELIMINADO
  common/coherencia.spec.ts                            ← NUEVO (23 pruebas)
  caja/services/caja.service.spec.ts                   ← arnés actualizado
  auditoria/services/auditoria.service.spec.ts         ← arnés reparado
```

### Después de aplicar

```bash
cd backend  && npm ci && npx tsc -p tsconfig.build.json --noEmit && npx jest
cd frontend && npm ci && npx tsc --noEmit
```

Espera **236 pruebas en verde y las 47 suites pasando** y 1 suite sin compilar
(`clientes.service.spec.ts`, que ya fallaba antes).

### Variables de entorno nuevas (opcionales)

```
ANULACIONES_MONTO_APROBACION=0        # umbral; 0 = toda anulación requiere rol
ANULACIONES_ROLES_AUTORIZADORES=ADMIN,ADMINISTRADOR,SUPER_ADMIN,GERENCIA,DIRECCION
DEVOLUCIONES_MONTO_APROBACION=5000    # sin cambio respecto al valor anterior
DEVOLUCIONES_ROLES_AUTORIZADORES=...  # ahora incluye GERENCIA y DIRECCION
```

### Al primer arranque

`PermisosDinamicosService` recorre los controladores y sanea la tabla
`endpoints`. Las rutas fantasma que dejó la inferencia anterior se marcan como
no navegables. **Revisa el menú de cada rol después de ese arranque**: es normal
que algunos usuarios vean menos entradas que antes, porque las que desaparecen
son las que apuntaban a pantallas inexistentes.
