

---

## Auditoría módulo por módulo (18 de septiembre)

Se auditaron por lectura completa los módulos de **Ventas, Clientes, Facturación
(CFDI) y punto de venta**; **Compras, Proveedores, Inventario/Almacén, Catálogos
y Precios**; y **Finanzas/Contabilidad, Tesorería, Caja y Crédito y cobranza**.
Salieron 45 hallazgos. Abajo está lo corregido y, después, lo que queda con su
escenario de falla, para que se pueda priorizar sin volver a buscarlo.

### Corregido

**El conteo físico vaciaba la ubicación contada.** `wms.service.ts` decidía la
cantidad final con `d.reconteo !== undefined`, y la columna es NULLABLE: el
transformador de decimales devuelve `null`, `null !== undefined` es verdadero, y
la cantidad final quedaba en `Number(null)` = **0**. El almacenista contaba 500
piezas, el detalle guardaba `diferencia = −500`, y al cerrar el conteo se
registraba la salida de las 500 con su póliza de merma. El rack quedaba en cero
con la mercancía puesta ahí. No era un caso raro: era **el único camino
posible**, porque la pantalla nunca manda `reconteo`.

**La recepción de compra valuaba el inventario a una fracción de lo pagado.** El
precio de la orden viene por unidad base, pero se pasaba a `registrarCompra` como
si fuera el precio del empaque, y ese método lo divide entre el factor. 120
piezas a $10 recibidas como «10 cajas de 12» entraban a **$0.83** la pieza: lote
de $100 en vez de $1,200. El costo promedio absorbía el error para siempre, toda
venta posterior mostraba utilidad inflada, y el inventario valuado se separaba
$1,100 de la cuenta contable. El asiento, además, multiplicaba empaques por
costo unitario: decía $100 donde la factura del proveedor decía $1,200. Ahora el
costo va en la misma unidad que la cantidad y el asiento en unidad base.

**El almacenista no podía recibir mercancía** — justo lo que da nombre al rol. La
recepción es un `PATCH` bajo `/compras/...`, y la plantilla da compras sólo en
consulta: veía la pantalla, capturaba todo con el camión enfrente y al guardar
recibía un 403. Se reclasificó la recepción al módulo de inventario, que es
donde pertenece por trabajo aunque cuelgue de esa ruta.

**Parámetros de SQL Server en consultas de PostgreSQL.** `@N` en vez de `$N` —y
con el índice corrido en uno— en la Declaración de IVA y en el estado de cuenta
del cliente. En PostgreSQL `@` es valor absoluto, así que las dos consultas
reventaban en cuanto se acotaba el periodo, que es como se usan siempre. Es la
misma familia del defecto que dejaba sin menú a los no administradores.

**El CFDI mandaba al PAC una tasa de IVA inventada.** Se deducía dividiendo el
impuesto entre el subtotal, los dos ya redondeados a dos decimales: en una venta
de $99.99 salía `0.160016`, y el catálogo del SAT sólo admite `0.160000`. El
timbrado se rechaza y el cliente se va sin factura. La tasa estaba guardada en la
partida; ahora se lee.

**Los pagos cancelados contaban como cobrados** en el estado de cuenta que se le
manda al cliente, en su saldo anterior y en el corte de caja. Se cancelaba un
cobro de $15,000: el saldo del crédito subía bien, pero el documento del cliente
seguía mostrando el abono y un saldo menor, y cobranza dejaba de perseguir esa
deuda.

### Lo que queda, ordenado por lo que cuesta

**Dinero que se entrega mal, hoy**

1. **El punto de venta cobra y da cambio con cifras del navegador.** El servidor
   recalcula precios contra el catálogo y devuelve `discrepanciasPrecio`; esa
   respuesta **no se lee en ninguna parte del frontend**. Si alguien cambia un
   precio mientras la caja tiene el carrito armado, el cajero entrega un cambio
   calculado sobre un total que no es el que se guardó. Con tarjeta pasa al
   revés: se cobra al TPV lo de la pantalla y la venta queda registrada por otro
   importe.
2. **Una devolución previa no se descuenta al facturar.** `timbrarVenta` arma las
   partidas con las cantidades originales sin restar lo devuelto, y sólo bloquea
   si la venta está ANULADA. Se factura por el total de una venta ya devuelta a
   medias, se traslada IVA que no se cobró, y como la devolución ocurrió antes de
   la factura nunca se generará la nota de crédito que lo corrija.
3. **Un timeout del PAC produce un segundo timbrado ante el SAT.** Reintentar
   manda el mismo payload sin preguntar antes si esa serie y folio ya existen.
   Quedan dos CFDI vivos por la misma operación y el ERP sólo conoce el segundo.
4. **La diferencia del arqueo de caja no llega a la contabilidad.** Se calcula, se
   exige una nota y ahí muere: ni tesorería ni el mayor se enteran. La caja
   física y la contable divergen un poco más en cada corte.
5. **Cancelar un movimiento de tesorería revierte el auxiliar pero no el mayor**, y
   la validación de «ya estaba cancelado» ocurre fuera de la transacción, así que
   un doble clic lo revierte dos veces.

**Cosas que se van a atorar en cuanto haya volumen**

6. **El cierre contable no se puede cerrar nunca**, por dos motivos
   independientes: ninguna cobranza guarda su `polizaId` —el generador de
   asientos de cobranza, venta, compra y pago a proveedor no devuelve la póliza,
   aunque sí la crea— y ningún camino del sistema marca un estado de cuenta
   bancario como CERRADA, que el control de bancos exige. Además un solo pago
   cancelado cuenta como «sin contabilizar» y bloquea el mes.
7. **Se puede cobrar con fecha dentro de un periodo cerrado**: el pago, el
   movimiento de tesorería y el de caja se confirman, y el asiento muere
   FALLIDO. El dinero queda en el auxiliar y no en el mayor de un mes firmado.
8. **Una orden de compra recibida de menos no se puede pagar ni cerrar**, y
   cancelarla no revierte lo ya recibido. No existe el paso de factura del
   proveedor: se paga contra el total de la cotización, nunca contra lo recibido
   ni contra un CFDI. Y cancelar una orden deja su requisición muerta, sin
   transición posible.
9. **El conteo compara contra una foto vieja.** La existencia teórica se congela
   al abrir el conteo y no se revalida al cerrarlo: lo que entre o salga mientras
   tanto se convierte en un ajuste falso. El conteo, cuya función es cuadrar,
   descuadra.
10. **Transferencias entre almacenes: el faltante en tránsito desaparece.** Lo
    enviado y no recibido no genera movimiento ni asiento, y la pantalla ni
    siquiera deja capturar faltantes: firma siempre que llegó todo.

**Concurrencia y conciliación**

11. **Conciliación bancaria sin bloqueo**: dos usuarios pueden aplicar el mismo
    movimiento a dos líneas distintas del estado de cuenta, y el reporte cuadra
    con un cargo real de menos. Y el «saldo según libros» del reporte se toma de
    una fila arbitraria, porque la consulta no lleva `ORDER BY`.
12. **Folios sin candado** en pólizas manuales, devoluciones y tesorería: dos
    usuarios simultáneos chocan contra el índice único y uno pierde la
    operación con un error de base de datos.
13. **Idempotencia con códigos de SQL Server** en compras: se comparan los
    números de error 2601/2627 contra una base PostgreSQL, que usa `23505`. El
    reintento no devuelve la respuesta idempotente: revienta con 500 y el
    usuario duplica la entrada de inventario.

**Errores que se ven como datos**

14. El historial de ventas, los conteos, las recepciones, las ubicaciones y las
    búsquedas del punto de venta muestran listas vacías cuando la llamada falla.
    Es el mismo patrón que en el panel y el corte de caja, ya corregidos: hay que
    barrerlo entero.
15. **El saldo a favor del cliente se ignora en silencio si su consulta falla**: la
    caja cobra el total completo y no queda rastro.
16. **Procesar una devolución no pide confirmación y no tiene vuelta atrás**: saca
    dinero de la caja, mueve inventario, toca el crédito y encola la póliza, al
    primer clic.

**Y una que no es un defecto sino una decisión que falta**

17. **Una lectura de precios escribe configuración**: si no hay lista
    predeterminada, la primera consulta de precio del día convierte en
    predeterminada a la primera lista por orden alfabético, sin que nadie lo
    decida ni quede en auditoría. Si esa lista es «Costo especial cliente X», el
    punto de venta empieza a cobrarle esa lista a todo el mundo.

### Nota sobre el método

Los hallazgos salen de lectura de código, no de ejecución. Los que se
corrigieron se confirmaron leyendo entidad, servicio, pantalla y configuración,
no por inferencia. `tsc --noEmit` queda limpio en backend y frontend después de
los cambios. Lo que **no** se puede afirmar todavía: que cada corrección se
comporte bien en vivo — hace falta recibir una compra con empaque, cerrar un
conteo y timbrar una venta cuyo subtotal no sea múltiplo de $0.25.
