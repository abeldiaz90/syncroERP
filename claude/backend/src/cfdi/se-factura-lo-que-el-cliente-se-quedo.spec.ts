/**
 * ============================================================================
 * Se factura lo que el cliente se quedó, no lo que devolvió
 * ----------------------------------------------------------------------------
 * `timbrarVenta` armaba las partidas con `detalle.cantidad` —la cantidad
 * ORIGINAL— sin restar `cantidadDevuelta`, y sólo rechazaba la venta ANULADA.
 *
 * El orden natural del mostrador —facturar y después devolver— estaba bien
 * resuelto: la devolución encuentra el CFDI timbrado, lo relaciona y genera
 * sola la nota de crédito (tipo 01), dejando vigente la factura original, que
 * es lo que manda el SAT.
 *
 * El orden inverso no, y ocurre mucho: el cliente regresa la mercancía el
 * martes y pide su factura el viernes. Esa devolución NO encontró factura que
 * relacionar —`facturaOrigenId` se queda nulo—, así que no habrá nota de
 * crédito, y al timbrar se emitía un CFDI por mercancía que ya había vuelto al
 * almacén, sin ningún egreso que lo compensara.
 *
 * Verificado leyendo el código el 30-sep-2026.
 * ============================================================================
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const sinComentarios = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const codigo = sinComentarios(
  readFileSync(join(__dirname, 'cfdi.service.ts'), 'utf8'),
);

/* ── El cálculo del renglón, EXTRAÍDO DEL FUENTE y ejecutado ─────────────── */

type Detalle = { cantidad: number; cantidadDevuelta?: number; subtotal: number; descuento?: number };

/*
 * Esto NO es una copia de la lógica. La primera versión de esta prueba sí lo
 * era, y tres mutantes sobrevivieron: mutar `cfdi.service.ts` no tocaba nada
 * porque la prueba ejecutaba su propia copia. Es exactamente la trampa contra
 * la que advierte `lo-que-se-publica.spec.ts`: «una prueba que medía una copia
 * del código en el propio archivo de prueba daba verde con el servicio roto».
 *
 * Ahora el cuerpo se recorta del archivo que se despliega y se ejecuta. Si
 * alguien cambia el cálculo, cambia lo que aquí corre.
 */
function calculoDelFuente(): (d: Detalle) => {
  cantidad: number;
  precioUnitario: number;
  bruto: number;
  descuento: number;
} {
  const inicio = codigo.indexOf('const cantidadOriginal = Number(detalle.cantidad);');
  const marca = 'const subtotal = Number((bruto - descuento).toFixed(2));';
  const fin = codigo.indexOf(marca);
  if (inicio < 0 || fin < 0) {
    throw new Error('No se encontró el cálculo del renglón en cfdi.service.ts');
  }
  const cuerpo = codigo.slice(inicio, fin + marca.length);
  return new Function(
    'detalle',
    `${cuerpo} return { cantidad, precioUnitario, bruto, descuento };`,
  ) as (d: Detalle) => {
    cantidad: number;
    precioUnitario: number;
    bruto: number;
    descuento: number;
  };
}

const renglon = calculoDelFuente();

describe('El renglón se factura por lo que queda', () => {
  it('sin devolución, nada cambia', () => {
    const r = renglon({ cantidad: 10, subtotal: 1000 });
    expect(r.cantidad).toBe(10);
    expect(r.precioUnitario).toBe(100);
    expect(r.bruto).toBe(1000);
  });

  it('con media devolución, se factura la mitad al mismo precio', () => {
    const r = renglon({ cantidad: 10, cantidadDevuelta: 5, subtotal: 1000 });
    expect(r.cantidad).toBe(5);
    expect(r.precioUnitario).toBe(100);
    expect(r.bruto).toBe(500);
  });

  it('el precio unitario NO se recalcula sobre el neto', () => {
    /*
     * Es la trampa de este cálculo: dividir el subtotal ya recortado entre la
     * cantidad que queda da el mismo número sólo por casualidad cuando no hay
     * descuento. Con descuento, no. El precio unitario es el del catálogo y no
     * cambia porque el cliente devuelva piezas.
     */
    const r = renglon({ cantidad: 10, cantidadDevuelta: 7, subtotal: 900, descuento: 100 });
    expect(r.precioUnitario).toBe(100);
    expect(r.cantidad).toBe(3);
    expect(r.bruto).toBe(300);
    expect(r.descuento).toBe(30);
  });

  it('el descuento se prorratea, no se conserva entero', () => {
    const r = renglon({ cantidad: 4, cantidadDevuelta: 3, subtotal: 360, descuento: 40 });
    expect(r.cantidad).toBe(1);
    expect(r.descuento).toBe(10);
    expect(r.bruto).toBe(100);
  });

  it('una cantidad fraccionaria no se descuadra', () => {
    const r = renglon({ cantidad: 2.5, cantidadDevuelta: 0.5, subtotal: 250 });
    expect(r.cantidad).toBe(2);
    expect(r.bruto).toBe(200);
  });
});

/* ── Las dos guardas ─────────────────────────────────────────────────────── */

describe('Las guardas del timbrado', () => {
  it('se filtran los renglones devueltos por completo', () => {
    expect(codigo).toMatch(/const renglonesFacturables = venta\.detalles\.filter/);
    expect(codigo).toMatch(
      /Number\(d\.cantidad\) - Number\(d\.cantidadDevuelta \?\? 0\) > 0\.0001/,
    );
  });

  it('las partidas se arman sobre los facturables, no sobre todos', () => {
    expect(codigo).toMatch(/const partidas = renglonesFacturables\.map/);
    expect(codigo).not.toMatch(/const partidas = venta\.detalles\.map/);
  });

  it('una venta devuelta completa se niega, y dice por qué', () => {
    /*
     * La condición Y el mensaje. Medir sólo el texto deja pasar un
     * `if (false)`, que fue el mutante que sobrevivió a la primera versión.
     */
    expect(codigo).toMatch(/if \(!renglonesFacturables\.length\) \{/);
    expect(codigo).toMatch(/se devolvió completa: no queda nada que facturar/);
    expect(codigo).toMatch(/tenía que timbrarse\s*'?\s*\+?\s*'?\s*antes de la devolución/);
  });

  it('la venta anulada sigue sin poder facturarse', () => {
    expect(codigo).toContain('No se puede facturar una venta anulada.');
  });

  it('la cantidad de la partida sale del neto', () => {
    expect(codigo).toMatch(/const cantidad = Number\(\(cantidadOriginal - devuelta\)\.toFixed\(4\)\)/);
  });
});

describe('La tasa de respaldo usa los importes originales', () => {
  it('se le pasa el subtotal original, no el prorrateado', () => {
    /*
     * `tasaDePartida` deduce la tasa como `impuestoMonto / subtotal` cuando la
     * partida no trae porcentaje. `impuestoMonto` es el de la venta completa;
     * dividirlo entre un subtotal ya recortado daría una tasa inflada y el PAC
     * rechaza cualquier valor fuera de `c_TasaOCuota`.
     */
    expect(codigo).toMatch(/this\.tasaDePartida\(detalle, subtotalOriginal\)/);
    /*
     * Acotado a `timbrarVenta`. La primera versión prohibía
     * `tasaDePartida(detalle, subtotal)` en TODO el archivo y marcaba en rojo un
     * segundo sitio que está bien: en `crearNotaCreditoDesdeDevolucion` el
     * `detalle` es el de la DEVOLUCIÓN, así que su subtotal y su impuestoMonto
     * son del mismo trozo y dividirlos es correcto. Una prueba que mira todo el
     * archivo acaba prohibiendo código sano.
     */
    const desde = codigo.indexOf('const renglonesFacturables');
    const hasta = codigo.indexOf('const esCredito');
    expect(desde).toBeGreaterThan(-1);
    expect(hasta).toBeGreaterThan(desde);
    expect(codigo.slice(desde, hasta)).not.toMatch(
      /this\.tasaDePartida\(detalle, subtotal\)/,
    );
  });

  it('y la deducción sólo se usa cuando no hay porcentaje guardado', () => {
    expect(codigo).toMatch(/Number\.isFinite\(porcentaje\) && porcentaje >= 0/);
  });
});
