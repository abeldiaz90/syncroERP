# 04 · Compras y nómina

**Revisión:** 8 de octubre de 2026
**Para:** las personas que operan estos dos ciclos y quien las capacite.

Los dos ciclos tienen algo en común y conviene decirlo antes de empezar: **los
firma más de una persona, a propósito**. Si estás solo delante de la pantalla y
algo «no te deja», lo más probable es que no sea un fallo sino el diseño: le toca
a otra persona. Cada capítulo dice a quién.

---

# Parte 1 · Compras

Cuatro manos, en este orden:

```
almacenista           comprador            quien manda            tesorería
   pide       →      cotiza y      →       autoriza        →       paga
                     adjudica
   recibe    ←──────────────────────────── orden de compra
```

**Comprar, autorizar, recibir y pagar son cuatro manos distintas.** El sistema lo
impide activamente: quien pide no aprueba lo que pidió, quien pide la
adjudicación no la aprueba, y el comprador no puede recibir ni pagar.

---

## 1. Antes de la primera compra (una vez)

Tres cosas tienen que existir, y si faltan el sistema te lo dice por su nombre en
vez de fallar a medias:

| Qué | Quién | Dónde |
|---|---|---|
| El **área** del solicitante | administrador | Configuración → Áreas |
| La **ruta de aprobación** del área | se crea sola al arrancar | Flujos de aprobación |
| La **categoría** de cada producto que mueve existencias | comprador | Productos |

Sobre la última: de la categoría cuelgan las cuentas contables del producto. Sin
ella la mercancía entra al almacén y **la póliza se queda encolada** — la
recepción en verde y la contabilidad sin enterarse. Aplica a FÍSICO, CONSUMIBLE y
MATERIA_PRIMA; un SERVICIO no lleva inventario y no la necesita.

> **Los umbrales por monto están implementados pero sin configurar.** Hoy toda
> requisición sube al mando, cueste diez cajas de guantes o una flotilla. Los
> números —«hasta $X no necesita firma»— los pone SUMA en *Flujos de aprobación*.
> Es una decisión de negocio, no técnica.

---

## 2. Requisición · «necesito esto» (almacenista)

**Compras → Requisiciones → Nueva.**

1. Elige el **almacén** de destino y la **fecha en que lo necesitas**.
2. Agrega renglones: producto y cantidad. **No se capturan precios**: una
   requisición pide cantidad, no dinero.
3. Guardar.

El sistema la valúa solo, con el **costo de la última compra** de cada producto, y
ese importe decide si necesita firma. Un producto del que todavía no se sabe el
costo vale 0, lo que empuja **hacia abajo**: lo desconocido no escala solo.

**Qué pasa después:** si el importe supera el umbral, la requisición queda
*PENDIENTE* y aparece en la bandeja de quien manda. Si no lo supera, nace ya
*COTIZANDO* y el comprador puede trabajarla.

**Si el aprobador se fue de la empresa**, la requisición no se detiene. El sistema
busca, en este orden: la persona que la ruta nombra si sigue activa → quien tenga
ese rol → quien tenga el rol que esa persona tenía → administración. **El
solicitante no aparece en ninguno de los cuatro.** La suplencia cubre ausencias;
no perdona la separación de funciones.

---

## 3. Autorizar la requisición (gerencia / dirección)

**Aprobaciones → Requisiciones pendientes.**

Se ve qué se pide, para cuándo, quién lo pide y el importe estimado.

- **Aprobar** la manda a cotización.
- **Rechazar** exige **motivo escrito**. No es burocracia: el motivo es lo único
  que le dice al solicitante qué cambiar.

Si el botón no aparece o responde que no te toca, esa requisición la pediste tú.

---

## 4. Cotizar y adjudicar (comprador)

**Compras → Cotizaciones.**

1. **Nueva cotización** desde la requisición aprobada.
2. Captura las propuestas de cada proveedor: producto, cantidad, precio.
3. **Adjudicar** al proveedor elegido.

La adjudicación **también se aprueba**, y no por quien la pidió. Es el punto donde
se decide a quién se le da el dinero, así que es donde más se paga tener dos pares
de ojos.

---

## 5. Orden de compra (comprador)

Al aprobarse la adjudicación nace la **orden de compra**. Revísala y **envíala al
proveedor**. Desde aquí el comprador ya sólo **da seguimiento**: puede consultar
las recepciones para saber si llegó, y no puede registrarlas.

---

## 6. Recepción · «llegó» (almacenista)

**Compras → Recepciones** o desde la orden.

1. Captura **lo que llegó de verdad**, renglón por renglón. Puede ser menos de lo
   pedido: la orden queda *PARCIAL* y espera el resto.
2. **Elige la ubicación** de cada producto. El desplegable marca con ★ las
   posiciones donde ese producto ya tiene casa y las pone primero.
   - Si eliges una posición donde el producto nunca ha estado, aparece un aviso
     con **«Asignar a B-02-07»**. Pulsa, y la posición pasa a ★.
   - Si tu rol no puede asignar, la pantalla te dice **a quién pedírselo** en vez
     de esconder un botón muerto.
3. Firmar la recepción.

**Qué pasa solo, y conviene que lo sepas:**

- El **costo del producto** se actualiza con lo que se pagó.
- El **precio de venta** se recalcula desde ese costo con el margen configurado
  (ejemplo real: costo $100 → precio $135; sube el costo a $137 → el precio pasa a
  $185 sin recapturar nada).
- Se genera la **póliza** de la entrada.
- Ese costo nuevo valúa la **siguiente requisición** del mismo producto.

> **Si pulsas dos veces, no recibes dos veces.** La recepción lleva una clave de
> idempotencia y, desde el 28-sep-2026, un índice único que la respalda. Antes el
> código que resolvía el duplicado estaba escrito esperando un índice que no
> existía, así que nunca se ejecutaba: un doble clic afortunado duplicaba la
> entrada, el costo y la póliza.

> **Lo que hay que vigilar.** Si al producto le falta la cuenta de inventario, la
> mercancía entra y **la póliza no se genera**, y nada en la pantalla de recepción
> lo delata. Revisa **Finanzas → Asientos pendientes** después de recibir: ahí
> aparece qué faltó y por qué. El cierre mensual también lo bloquea, pero eso es
> tres semanas tarde.

---

## 7. Pagar (tesorería)

**Tesorería → Pagos a proveedores.** El comprador no puede llegar aquí, y es
deliberado: quien elige al proveedor no le firma el cheque.

### El diálogo enseña el asiento antes de cometerlo

Al registrar el pago, antes de pulsar nada, la pantalla muestra en qué cuentas
va a caer:

```
Asiento contable que se generará:
  Dr. 210-01 Proveedores   $1000
     Cr. Caja mostrador    $1000
```

En una pantalla de dinero eso no es un adorno: quien paga ve el asiento **antes**
de cometerlo, no después en el libro diario.

### No se puede pagar con efectivo que no hay

Si el importe supera lo disponible en la caja o cuenta elegida, el servidor se
niega y **dice el número real**:

> La salida excede el efectivo disponible. Disponible: 1000.00.

Nada se escribe. El diálogo se queda abierto con el importe puesto, así que se
corrige y se reintenta.

> Ese aviso aparece como mensaje flotante y **se desvanece en unos tres
> segundos**. Si pulsaste «Pagar» y la pantalla parece no haber hecho nada,
> probablemente fue esto: vuelve a pulsar y lee enseguida.

### El IVA acreditable se reclasifica solo, y en proporción

Esto sorprende la primera vez y conviene entenderlo: **la póliza del pago no
vale lo que pagaste.**

Medido el 7-oct con un pago de $1,000 sobre una orden de $96,152.40: la póliza
`EG-2026-00003` salió con **cuatro partidas** y **$1,137.93**.

Los $137.93 de diferencia son **IVA acreditable que se reclasifica**, en
proporción a lo que se pagó:

```
IVA de la orden      = 96,152.40 × 16/116 = 13,262.40
proporción pagada    = 1,000 / 96,152.40  =  1.0400 %
IVA a reclasificar   = 13,262.40 × 1.04 % =    137.93
```

Para qué sirve: así el IVA acreditable del mes es el del IVA **efectivamente
pagado** y no el facturado, que es como lo pide la ley. Un pago parcial
reclasifica su parte, ni más ni menos; el resto espera al siguiente pago.

No hay que hacer nada para que ocurra. Sólo hay que no asustarse al ver que la
póliza no cuadra con el cheque.

### Lo que no se puede deshacer

> **No hay reversa de pagos a proveedor.** Y cancelar su movimiento desde
> Tesorería → Movimientos **no** deshace el pago: el sistema lo niega y lo dice.
> Ver `03-manual-por-rol.md` → *Movimientos de tesorería*.

---

# Parte 2 · Nómina

Aquí las manos son tres, y el sistema no deja que una sola las junte:

| Etapa | Quién |
|---|---|
| Conceptos, preparar la aprobación, CFDI, capturar cuentas bancarias | **Recursos humanos** |
| Dispersión, marcar enviada, conciliar, registrar el pago | **Tesorería** |
| Configuración patronal, póliza detallada, cierre financiero | **Finanzas / Contabilidad** |
| Préstamos y obligaciones | RRHH o Finanzas |
| **Validar** una cuenta bancaria | Finanzas o Tesorería — **nunca quien la capturó** |

RRHH **prepara, mira y no firma**. Es lo correcto, y explica casi todos los «no me
deja» de este módulo.

---

## 1. Configuración patronal (finanzas o contador) — **una vez, y va primero**

**RRHH → Nómina → Configuración patronal.**

RFC del patrón, registro patronal IMSS, prima de riesgo de trabajo, mapa de
cuentas contables y datos del PAC.

**Sin esto la nómina no se puede calcular.** La pantalla está en el menú de
Recursos humanos pero el botón de guardar es de Finanzas o Contabilidad: es la
única pantalla del módulo con esa mezcla, y es a propósito —quien define el mapa
contable es quien lleva la contabilidad—.

---

## 2. Conceptos y su cuenta contable

- **RRHH** define los conceptos: percepciones, deducciones, su fórmula.
- **Contabilidad** dice **a qué cuenta** va cada uno
  (*Conceptos → cuenta contable*). El gasto lo clasifica quien lleva los libros.

---

## 3. Préstamos y obligaciones (rrhh o finanzas)

**RRHH → Nómina → Préstamos** y **Obligaciones**. Se descuentan solos en el
período que corresponda.

---

## 4. Cuentas bancarias de los empleados

1. **Capturar** — RRHH o Tesorería.
2. **Validar** — Finanzas o Tesorería, y **no quien la capturó**.

Esa segunda línea es todo el control: una cuenta bancaria mal capturada manda el
sueldo de alguien a otra parte, y un control que ejerce quien capturó el dato no
controla nada.

> Para poder guardarlas, `NOMINA_DATA_ENCRYPTION_KEY` tiene que estar
> configurada: la CLABE se guarda cifrada y el sistema se niega a guardarla en
> claro. Ver `01-instalacion-y-puesta-en-marcha.md` §2.3.

---

## 5. Calcular el período (rrhh)

**RRHH → Nómina → Períodos → Calcular.**

El sistema genera la prenómina: percepciones, deducciones y neto por empleado.
Revísala **antes** de pedir firmas — mandarla a aprobación y corregir después
invalida las firmas ya dadas, que es justo lo que tiene que pasar.

---

## 6. Preparar la aprobación (rrhh)

**«Preparar aprobación».** El sistema toma una **huella del cálculo** y crea los
niveles de firma.

A partir de aquí, **si el cálculo cambia las firmas se caen**: al intentar firmar,
el sistema responde *«El cálculo cambió después de preparar la aprobación»*. No es
un fallo. Es que nadie firme una cifra y se pague otra.

---

## 7. Firmar (los roles de la matriz)

**Aprobaciones → Nómina.** Las firmas son **secuenciales**: el nivel 2 no aparece
hasta que el 1 está dado, y **una misma persona no puede firmar dos niveles del
mismo ciclo**.

Si el botón dice que no te toca, el mensaje nombra a quién: *«Esta firma es de
finanzas»*.

---

## 8. Dispersión (tesorería)

**«Generar dispersión»** produce el archivo para el banco, con el neto y la CLABE
de cada empleado.

**Sólo Tesorería**, y es una decisión tomada a propósito: ese archivo lleva cuánto
gana cada persona con nombre y cuenta, y Finanzas aprueba el presupuesto de un
puesto sin ver quién lo ocupa. Si la empresa lo quiere de otro modo, se cambia en
una línea de la matriz de firmas y las tres capas del sistema se enteran solas.

Después: **«Marcar como enviada»** → **«Conciliar dispersión»** contra el
movimiento del banco → **«Registrar pago»**.

---

## 9. Contabilizar y cerrar (finanzas / contador)

1. **Póliza detallada** — genera el asiento de la nómina.
2. **Cierre financiero del período** — lo deja cerrado.

> **Cuidado con la fecha.** El sistema no acepta pólizas fechadas en el futuro, y
> hace bien: la contabilidad registra lo que ya pasó. Si el período de nómina
> termina el 15 de octubre, su póliza de devengo no puede emitirse el 23 de
> septiembre. Esto ya ocurrió una vez y dejó dos asientos que el mayor externo
> rechazó.

---

## 10. CFDI de nómina (rrhh)

**«Preparar CFDI»** arma los comprobantes.

> **No probado:** no hay PAC real conectado. Ver `06-limites-conocidos.md`.

---

# Qué hacer cuando algo no te deja

| Lo que ves | Qué significa |
|---|---|
| «Quien solicita no puede resolver este nivel» | Correcto. Lo pediste tú; firma otra persona. |
| «Esta firma es de finanzas» | El nivel pendiente es de otro rol. |
| «Existe un nivel anterior pendiente» | Las firmas van en orden. Falta la de antes. |
| «Una misma persona no puede resolver más de un nivel» | Correcto. Dos niveles, dos personas. |
| «El cálculo cambió después de preparar la aprobación» | Se tocó la nómina después de pedir firmas. Vuelve a preparar. |
| «El motivo es obligatorio para rechazar» | Escribe por qué. Es lo único que le sirve a quien lo pidió. |
| «Sólo una persona puede firmar el nivel N» *(en Flujos de aprobación)* | Aviso para quien gobierna la matriz: ese nivel se traba si lo pide esa misma persona. |
| Un aviso ámbar en una aprobación de crédito | El expediente de validación no concluyó. **Nadie más va a revisarlo**: si firmas, la línea se autoriza con eso. |
