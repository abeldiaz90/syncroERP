# 03 · Manual por rol

**Revisión:** 8 de octubre de 2026
**Para:** usuarios finales y quien los capacite.

> El alcance de cada rol está **medido contra el sistema corriendo**, no copiado
> de un diseño. Si una pantalla no aparece en tu lista, es que tu rol no la
> tiene.

**Compras y nómina tienen su propio manual**, en `04-compras-y-nomina.md`.

---

## Cómo está organizado el sistema

Cada rol entra y ve **su centro de trabajo**: las acciones de su día, no el menú
completo. El menú lateral sólo muestra los módulos donde tiene algo que hacer.

Si abres una dirección que no te corresponde, el sistema lo dice con claridad
—«esta sección no está en tu perfil»— en vez de enseñarte una pantalla vacía. Eso
es a propósito: una pantalla vacía parece un error del sistema; un mensaje
explica de quién es la decisión.

---

## Los trece roles y para qué son

| Rol | En una frase |
|---|---|
| **empleado** | Vende en mostrador: punto de venta, clientes, CFDI. |
| **almacenista** | Recibe, cuenta, ubica y transfiere mercancía. |
| **comprador** | Requisiciones, cotizaciones, órdenes y proveedores. |
| **tesoreria** | Paga, cobra, concilia el banco y arquea la caja. |
| **contador** | Pólizas, estados financieros, IVA y cierre mensual. |
| **finanzas** | Lo del contador, más crédito, nómina y activos. |
| **credito** | Línea de crédito, verificación del cliente, originación. |
| **cobranza** | Recuperación de cartera vencida. |
| **rrhh** | Plantilla, nómina, asistencia, incidencias. |
| **hoteleria** | Rack, folios, city ledger, recetas. |
| **gerencia** | Ve casi todo, escribe casi nada. |
| **direccion** | Igual que gerencia, con la última firma. |
| **gobierno** | Define quién aprueba qué. **No firma ninguna aprobación.** |

Esa última línea no es un detalle. Quien escribe las reglas de aprobación no
puede además aprobar: `PATCH /aprobaciones/:id/resolver` le está vedado por
contrato. Si algún día ese renglón desaparece, el rol deja de ser un control y
pasa a ser un aprobador con poder para reescribir las reglas — el peor de los dos
mundos.

---

## Lo que cada rol alcanza, medido

Esto se lee en la pantalla de cada quien: el panel dice «**N de M disponibles
con tu perfil**», y N es este número. Sale de la plantilla del rol, no de un
diseño; una prueba lo compara contra ella, así que si alguien cambia un permiso
y no toca esta tabla, el barrido se pone rojo.

**Escribe** es lo que puede capturar y modificar. **Consulta** es lo que puede
abrir y leer, sin tocar.

| Rol | Escribe | Consulta | Total |
|---|---:|---:|---:|
| dirección | 2 | 21 | 23 |
| gerencia | 2 | 18 | 20 |
| finanzas | 7 | 7 | 14 |
| contador | 4 | 7 | 11 |
| tesorería | 3 | 6 | 9 |
| empleado | 5 | 3 | 8 |
| hotelería | 5 | 3 | 8 |
| crédito | 3 | 4 | 7 |
| cobranza | 3 | 3 | 6 |
| comprador | 2 | 3 | 5 |
| almacenista | 2 | 2 | 4 |
| rrhh | 2 | 2 | 4 |
| gobierno | 1 | 2 | 3 |

De 24 módulos en el catálogo. El administrador los tiene todos.

Tres lecturas que explican el reparto:

- **Dirección y gerencia ven casi todo y escriben casi nada** —2 módulos de
  escritura cada una—. Es la forma correcta: la supervisión no necesita
  permisos de captura, necesita poder mirar.
- **El mostrador escribe más que el comprador** (5 contra 2). No es un error:
  vender, cobrar, facturar, dar de alta un cliente y llevar el embudo son cinco
  trabajos distintos que hace la misma persona. El comprador pide y cotiza; la
  firma que autoriza es de otro.
- **Gobierno tiene tres módulos y ninguna firma.** Quien escribe las reglas de
  aprobación no puede además aprobar: `PATCH /aprobaciones/:id/resolver` le está
  vedado por contrato.

---

## Probar el sistema con el rol de otro

**Administración → Ver el ERP como otra persona.** Es la herramienta de quien
capacita y de quien configura permisos: enseña el ERP exactamente como lo ve el
puesto elegido —el menú, el panel, los botones y las negativas del servidor—
sin pedir su contraseña ni entrar con su cuenta.

Tres cosas que conviene saber antes de usarlo:

1. **Lo que guardes queda registrado a nombre de esa persona.** Si cobras una
   venta viendo el ERP como el mostrador, la venta sale a nombre del mostrador.
   La banda ámbar de arriba lo dice todo el rato, y el punto de venta lo repite
   junto al nombre de quien atiende.
2. **Cerrar la pestaña termina la suplantación.** Vive en la pestaña y no en la
   cuenta, a propósito: dejarla puesta de un día para otro es la receta para
   creer que «el ERP no te deja hacer nada» sin acordarte de que te quedaste
   como almacenista.
3. **Se sale con «Volver a ser yo»**, en esa misma banda. Si la pantalla donde
   estás no es del perfil que estás viendo, el ERP lo dice —y la salida está
   arriba, no en el mensaje.

En producción esto se apaga con `SUPLANTACION_HABILITADA`. Déjalo apagado salvo
mientras capacitas.

---

## Manual · Cierre mensual (contador)

El cierre protege un mes: después de cerrarlo no se pueden registrar ni modificar
pólizas de ese periodo.

### Antes de empezar

El mes tiene que estar **terminado**. El mes en curso y los futuros no se pueden
cerrar, y el sistema lo dice.

### Paso 1 · Abrir la revisión

**Finanzas → Cierre mensual**, elegir el año y pulsar **«Revisar para cerrar»**
en el mes. El sistema toma una *fotografía* y corre nueve controles:

| Control | Qué comprueba |
|---|---|
| Todos los controles pudieron medirse | Que ninguna consulta del diagnóstico falló |
| El mes tiene registros contables | Que no cierres un mes vacío por accidente |
| Debe y Haber coinciden | Que la balanza cuadre |
| Pólizas completas y cuadradas | Que ninguna esté a medias |
| Operaciones esperando póliza | Que nada del mes quedara sin contabilizar |
| Módulos que llegaron al mayor | Que ningún módulo se quedara fuera |
| Conciliación bancaria del mes | Que cada cuenta activa tenga su conciliación **cerrada** |
| **Las pólizas llegaron al mayor externo** | Que la bandeja de salida no tenga nada sin entregar *(sólo si tu empresa opera en espejo con Fineract)* |
| Existe una conciliación de referencia | Aviso, no bloqueo |

Los rojos **bloquean**; los amarillos avisan. Si algo sale rojo, corrígelo y pulsa
**«Volver a calcular»**: el sistema no genera ajustes automáticos.

> Si aparece **«No se pudo medir: …»**, no lo ignores. Significa que una consulta
> falló y que los demás verdes no son de fiar. El motivo está en el log del
> servidor.

#### Si sale rojo «Operaciones esperando póliza»

Ve a **Finanzas → Asientos pendientes**. Cada asiento trae su motivo, y el botón
**«Reintentar ahora»**:

- Si el asiento sigue pendiente, lo vuelve a intentar.
- Si el asiento **ya estaba generado** y lo que quedó atrás es el documento —un
  cobro, un folio, un pago que sigue diciendo «pendiente» aunque su póliza
  exista—, el mismo botón repara el documento. Antes contestaba «ya había sido
  generado» y no arreglaba nada.

#### Si sale rojo «Las pólizas llegaron al mayor externo»

Dice cuántos asientos no llegaron y por qué suele pasar. Ve a **Integración →
Bandeja de salida**: cada evento fallido trae su motivo.

Lo más común, con diferencia, es **una cuenta contable sin mapear al mayor
externo**. En ese caso: **Integración → Cuentas pendientes → Aprovisionar**, y
luego **Reencolar** los eventos fallidos y **Despachar**.

Cerrar el mes con asientos sin entregar dejaría los dos libros distintos, y el
cierre es precisamente la afirmación de que los números son los definitivos.

### Paso 2 · Las tres confirmaciones humanas

1. Revisé bancos, cajas y partidas en tránsito.
2. Revisé el IVA contra los comprobantes disponibles.
3. No faltan ventas, compras, nómina ni documentos del mes.

Escribe en **notas** qué revisaste. Esa nota queda en la evidencia del cierre y es
lo que alguien leerá dentro de un año.

**El respaldo no se firma.** Lo toma el sistema al cerrar, verifica que el archivo
esté completo y guarda su huella. Si el respaldo falla, el mes **no** se cierra.

### Paso 3 · Cerrar

**«Cerrar período»** y confirmar. El sistema:

1. Toma el respaldo y lo verifica. *(Si falla, aquí se detiene todo.)*
2. Vuelve a correr los controles — la información pudo cambiar desde la
   fotografía.
3. Marca las pólizas del mes como protegidas.
4. Guarda la evidencia: diagnóstico, confirmaciones, notas y datos del respaldo.

### Si hay que reabrir

**«Ver / reabrir»**, con **motivo obligatorio**. La reapertura no borra el cierre
anterior: queda en la bitácora. Es excepcional y debe notarse.

---

## Manual · Conciliación bancaria (tesorería)

Es lo que desbloquea el cierre mensual del contador.

1. **Tesorería → Conciliación bancaria.**
2. Elige la **cuenta**, el **mes** y el **ejercicio**.
3. **«Cargar estado de cuenta»**: captura el saldo inicial y el **final** del
   banco, y pega los movimientos desde Excel (fecha, descripción, referencia,
   cargo, abono). Acepta `dd/mm/aaaa` y `aaaa-mm-dd`; ignora símbolos de moneda y
   comas.
   - **Mes sin movimientos:** si el saldo no se movió, deja el pegado vacío y pon
     el mismo saldo inicial y final. El botón dirá **«Cargar mes sin
     movimientos»**. Una cuenta dormida ya no bloquea el cierre.
   - El sistema exige que el estado de cuenta **cuadre consigo mismo** antes de
     aceptarlo.
4. **«Conciliar automáticamente»** empareja por importe y ventana de fechas. Lo
   ambiguo queda pendiente y se reporta; no se adivina.
5. **«Ver reporte»**: explica la diferencia entre banco y libros — depósitos y
   cheques en tránsito, cargos y abonos no registrados.
6. **«Cerrar conciliación del periodo»**, que sólo aparece **si cuadra**. Cerrar
   con diferencia sería firmar que cuadra cuando no cuadra.

Una conciliación cerrada no se modifica. Es la afirmación de que ese mes, en esa
cuenta, banco y libros ya se explican entre sí.

---

## Manual · Movimientos de tesorería (tesorería)

**Tesorería → Movimientos.**

Cada renglón muestra de dónde viene el dinero. Y ahí está la regla que conviene
entender:

| Lo que ves en el renglón | Qué significa |
|---|---|
| El botón **«Cancelar»** | El movimiento se **capturó a mano**. Se puede cancelar aquí. |
| La leyenda **«del documento»** | Lo generó una venta, un pago, un cobro, la nómina, un folio… **Se deshace desde ese documento, no desde aquí.** |

**Por qué.** Cancelar aquí devuelve el saldo al banco y **no toca el documento**:
la orden de compra seguiría diciendo que está pagada. Dos subsistemas afirmando
cosas contrarias, cada uno coherente por dentro, y ninguna pantalla donde se vea
la diferencia. Aparece meses después, en una conciliación, cuando ya nadie
recuerda qué pasó.

Si intentas cancelar uno de estos —por API, por ejemplo— el sistema **dice qué lo
generó y dónde se deshace**. Donde el ERP todavía no tiene esa pantalla —hoy, el
pago a proveedor— lo dice así, en vez de mandarte a buscar media hora algo que no
está.

Al cancelar un movimiento capturado a mano, el sistema escribe una
**contrapartida** enlazada al original. Esa contrapartida **tampoco se cancela**:
devolver el dinero a los libros de algo ya cancelado es un nudo, no una
corrección.

---

## Manual · Póliza manual (contador)

**Finanzas → Nueva póliza.**

1. **Tipo**: Diario, Ingreso o Egreso.
2. **Fecha**: no se aceptan fechas futuras. La contabilidad registra lo que ya
   ocurrió.
3. **Concepto**: qué fue, en palabras.
4. **Partidas**: al menos dos. Busca la cuenta por número o nombre.
5. Captura cargos y abonos hasta que diga **«Cuadrada»**.

**Cuentas que no admiten póliza manual.** Bancos, clientes, proveedores e
inventario los lleva un auxiliar. Si eliges una, el sistema lo explica y te manda
al módulo correcto, para que el auxiliar y el mayor no se separen.

**Para cancelar una póliza** se emite su **reversa**: el sistema invierte cargos y
abonos y deja las dos en el libro, con referencia cruzada. Una póliza nunca se
borra ni se edita. Si el período original está cerrado —o la póliza estaba fechada
adelante— la reversa se fecha **hoy**, que es cuando de verdad se está cancelando.

---

## Manual · Corregir la ficha de un activo fijo (finanzas)

**Activos → Registro**, y el **lápiz** del renglón.

El módulo sabía dar de alta y dar de baja, y nada en medio: corregir un número de
serie mal capturado exigía dar de baja el activo —lo que escribe una póliza y
calcula utilidad o pérdida— y volverlo a crear con un código nuevo, que va pegado
en una etiqueta física. Ya no.

| Qué se toca | Cuándo |
|---|---|
| **Ficha descriptiva** — nombre, marca, modelo, número de serie, ubicación, responsable | **Siempre.** No cambia ningún número ya asentado. |
| **Base de cálculo** — costo, valor residual, método, tasa, vida útil, fecha de inicio, categoría | **Sólo mientras no haya depreciación corrida.** |
| **Código** | **Nunca.** Está pegado en una etiqueta. |

Si intentas cambiar la base de cálculo con depreciaciones corridas, el sistema
**dice qué campo** no se puede tocar y **nombra el camino que sí existe**:
revertir las corridas, corregir y volver a correrlas. Con las corridas revertidas
la corrección se acepta.

Un activo **dado de baja o vendido** no se edita: su costo ya es parte de la
utilidad o pérdida asentada.

---

## Manual · Autorizar una línea de crédito (crédito, gerencia, dirección)

**Aprobaciones → bandeja.** Cada solicitud muestra el cliente, el importe pedido,
el plazo y el nivel de riesgo.

### El recuadro que hay que leer antes de firmar

Si aparece un **recuadro rojo**, el botón está apagado: hay algo que impide
autorizar —no hay expediente de validación, el expediente quedó RECHAZADO, o el
importe que se validó es menor que el que se está autorizando—. El recuadro dice
cuál de los tres y trae un enlace para verificar al cliente; al volver, el botón
se enciende solo.

Si aparece un **recuadro ámbar**, el botón **sí** funciona, y ahí está lo
delicado: significa que el expediente de validación **no concluyó** —por ejemplo
porque todavía no hay proveedor de identidad conectado— y lista los motivos. El
sistema deja la decisión en tus manos a propósito, porque «revisión manual»
quiere decir que la mire una persona y esa persona eres tú.

El recuadro termina con la frase que importa: **«Nadie más va a revisarlo: si
firmas, la línea se autoriza con esto.»**

### Las reglas de firma

- **Las firmas van en orden.** El nivel 2 no aparece hasta que el 1 está dado.
- **Quien pide no firma.**
- **Una misma persona no puede firmar dos niveles del mismo ciclo.**
- **Rechazar exige motivo escrito.**

---

## Manual · Flujos de aprobación (gobierno)

**Configuración → Flujos de aprobación.** Aquí se define, por proceso, quién firma
y a partir de qué importe.

Cada nivel guardado muestra **su diagnóstico**:

| Lo que ves | Qué significa | Qué hacer |
|---|---|---|
| Nada | El nivel tiene quien lo firme | — |
| **Ámbar: «Este nivel tiene un solo firmante»** | Sólo una persona puede firmarlo, y esa persona también puede originar el documento. **Toda solicitud que ella misma levante será rechazada al guardarse.** | Dar de alta a otra persona con ese rol, o enrutar el nivel a un rol distinto del que origina |
| **Rojo: «Este nivel no tiene quien lo firme»** | Ninguna persona activa tiene ese rol, o la persona asignada se dio de baja | Corregir la matriz o el usuario |

Ese aviso existe porque la matriz de crédito de esta instalación se veía
impecable y **no dejaba levantar una sola solicitud**: el único rol que podía dar
de alta un cliente con línea era también el único que podía firmar el nivel 1. El
problema se descubría el día que alguien intentaba trabajar; ahora se ve donde se
decide.

---

## Manual · Alta de un empleado (rrhh)

El acceso al sistema **no** se crea aquí: la identidad vive en SUMA (Keycloak). Al
dar de alta al empleado, el sistema prepara su identidad en el directorio y le
llega el correo desde ahí. El ERP no pide ni guarda contraseñas.

Si un empleado olvida su contraseña, la recupera **en SUMA**, no en el ERP.

---

## Qué hacer cuando algo no aparece

| Lo que ves | Qué significa |
|---|---|
| «Esta sección no está en tu perfil» | Tu rol no la incluye. Pídela al administrador. |
| Un combo obligatorio vacío | Avísalo: es un defecto, no una configuración. |
| «No se pudo completar la operación en la base de datos» | Error del servidor. El detalle está en su log, con un código de traza. |
| «El período N/AAAA está cerrado» | Correcto. Para tocarlo hay que reabrirlo con motivo. |
| «No se pudo comprobar si el período está cerrado» | El sistema prefirió no hacer nada antes que arriesgarse a escribir en un mes cerrado. Avisa a soporte con el código de traza. |
| «Quien solicita no puede resolver este nivel» | Correcto: lo pediste tú. |
| «Existe un nivel anterior pendiente» | Las firmas van en orden. |
| «Este movimiento no se registró a mano: lo generó …» | Correcto. Se deshace desde el documento que lo originó. |
| «Revierte esas corridas de depreciación…» | Correcto. Ese campo cambia la base de cálculo de meses ya asentados. |

---

## Lo que todavía no se ha probado

Está reunido, con su motivo, en **`06-limites-conocidos.md`**.
