import { readFileSync } from 'fs';
import { join } from 'path';

import { OrdenesCompraService } from './services/ordenes-compra.service';

/**
 * ============================================================================
 * UNA DEVOLUCIÓN QUE DEJABA LA ORDEN DEBIENDO PARA SIEMPRE
 * ----------------------------------------------------------------------------
 * EL CASO
 *
 * `saldoPendiente`, `estadoPago` y `estado` de una orden de compra se derivan
 * de tres cosas: lo que vale, lo que ya se pagó y lo que se devolvió. La resta
 * de lo devuelto se añadió en su día con este motivo escrito en el código:
 *
 *     «Sin la resta, una orden con devolución no llegaba nunca a PAGADA: el
 *      proveedor no va a cobrar la parte devuelta, así que `saldoPendiente` se
 *      quedaba en el importe de la nota de crédito para siempre.»
 *
 * La fórmula era correcta. Lo que estaba mal es DÓNDE vivía: dentro de
 * `pagarOrden`, así que sólo se ejecutaba **cuando entraba un pago**.
 *
 *     Orden de 11,600. Pagados 9,600 → PARCIAL, debe 2,000.
 *     Se devuelven al proveedor esos 2,000.
 *     → Ya no hay nada que pagar, así que NO va a entrar otro pago.
 *     → Nadie vuelve a derivar el saldo.
 *     → La orden se queda en PARCIAL para siempre, debiendo 2,000 que nadie va
 *       a cobrar ni a saldar, y la cuenta por pagar del proveedor arrastra ese
 *       importe muerto.
 *
 * Es el mismo defecto que la resta venía a resolver, por el otro lado: el
 * comentario describía el síntoma exacto que seguía ocurriendo.
 *
 * EL ARREGLO
 *
 * La regla se sacó a `recalcularCobranzaDeLaOrden`, que es ahora su único
 * dueño, y la llaman los dos caminos: el pago y la devolución. Tener dos copias
 * es exactamente cómo este cálculo acabó aplicándose en uno solo.
 * ============================================================================
 */

const ordenes = readFileSync(
  join(__dirname, 'services', 'ordenes-compra.service.ts'),
  'utf8',
);
const devoluciones = readFileSync(
  join(__dirname, 'services', 'devoluciones-proveedor.service.ts'),
  'utf8',
);

/** Un doble de EntityManager que recuerda lo que se guardó. */
function managerCon(orden: Record<string, unknown> | null, devuelto: number) {
  const guardados: Array<Record<string, unknown>> = [];
  return {
    guardados,
    em: {
      findOne: async () => orden,
      query: async () => [{ devuelto: String(devuelto) }],
      save: async (x: Record<string, unknown>) => {
        guardados.push({ ...x });
        return x;
      },
    } as never,
  };
}

function servicio() {
  return Object.create(
    OrdenesCompraService.prototype,
  ) as OrdenesCompraService;
}

const ordenDe = (extra: Record<string, unknown> = {}) => ({
  id: 'oc-1',
  empresaId: 'e1',
  total: 11600,
  totalPagado: 9600,
  estado: 'PARCIALMENTE_PAGADA',
  estadoRecepcion: 'COMPLETA',
  estadoPago: 'PARCIAL',
  saldoPendiente: 2000,
  ...extra,
});

describe('devolver lo que faltaba por pagar salda la orden', () => {
  it('el caso exacto: 11,600 con 9,600 pagados y 2,000 devueltos queda PAGADA', async () => {
    const { em, guardados } = managerCon(ordenDe(), 2000);

    await servicio().recalcularCobranzaDeLaOrden(em, 'e1', 'oc-1');

    expect(guardados).toHaveLength(1);
    expect(guardados[0].saldoPendiente).toBe(0);
    expect(guardados[0].estadoPago).toBe('PAGADA');
    expect(guardados[0].estado).toBe('PAGADA');
  });

  it('y no se queda en PARCIAL, que es lo que pasaba antes', async () => {
    const { em, guardados } = managerCon(ordenDe(), 2000);

    await servicio().recalcularCobranzaDeLaOrden(em, 'e1', 'oc-1');

    expect(guardados[0].estadoPago).not.toBe('PARCIAL');
    expect(guardados[0].saldoPendiente).not.toBe(2000);
  });

  it('una devolución parcial baja el saldo sin saldarlo', async () => {
    const { em, guardados } = managerCon(ordenDe(), 500);

    await servicio().recalcularCobranzaDeLaOrden(em, 'e1', 'oc-1');

    expect(guardados[0].saldoPendiente).toBe(1500);
    expect(guardados[0].estadoPago).toBe('PARCIAL');
  });

  it('sin devoluciones el saldo es simplemente lo que falta por pagar', async () => {
    const { em, guardados } = managerCon(ordenDe(), 0);

    expect(await servicio().recalcularCobranzaDeLaOrden(em, 'e1', 'oc-1')).toBeTruthy();
    expect(guardados[0].saldoPendiente).toBe(2000);
    expect(guardados[0].estadoPago).toBe('PARCIAL');
  });

  it('una orden sin un solo peso pagado queda PENDIENTE, no PARCIAL', async () => {
    /*
     * `estadoPago` se decide por `totalPagado`, no por el saldo: una orden a la
     * que se le devolvió TODO y nunca se le pagó nada no está «parcialmente
     * pagada», está sin pagar. El matiz importa porque PARCIAL es lo que la
     * pantalla de pagos usa para ofrecer «completar el pago».
     */
    const { em, guardados } = managerCon(
      ordenDe({ totalPagado: 0, estadoPago: 'PENDIENTE', saldoPendiente: 11600 }),
      3000,
    );

    await servicio().recalcularCobranzaDeLaOrden(em, 'e1', 'oc-1');

    expect(guardados[0].saldoPendiente).toBe(8600);
    expect(guardados[0].estadoPago).toBe('PENDIENTE');
  });

  it('el saldo nunca se va a negativo', async () => {
    /*
     * Devolver más de lo que quedaba por pagar es posible —se devuelve
     * mercancía ya pagada— y lo que sale de ahí es un saldo A FAVOR, que no
     * vive en este campo: vive en la nota de crédito del proveedor. Un
     * `saldoPendiente` negativo se leería como «el proveedor me debe» en una
     * columna que significa lo contrario.
     */
    const { em, guardados } = managerCon(
      ordenDe({ totalPagado: 11600, estadoPago: 'PAGADA', saldoPendiente: 0 }),
      3000,
    );

    await servicio().recalcularCobranzaDeLaOrden(em, 'e1', 'oc-1');

    expect(guardados[0].saldoPendiente).toBe(0);
  });

  it('una orden cancelada no se toca', async () => {
    /*
     * CANCELADA es terminal y `estadoDerivadoOC` la respeta, pero igualmente no
     * tiene sentido reescribirle el saldo: no se va a pagar ni a cobrar.
     */
    const { em, guardados } = managerCon(
      ordenDe({ estado: 'CANCELADA' }),
      2000,
    );

    await servicio().recalcularCobranzaDeLaOrden(em, 'e1', 'oc-1');

    expect(guardados).toHaveLength(0);
  });

  it('una orden de otra empresa no existe para este cálculo', async () => {
    const { em, guardados } = managerCon(null, 2000);

    expect(
      await servicio().recalcularCobranzaDeLaOrden(em, 'e1', 'oc-ajena'),
    ).toBeNull();
    expect(guardados).toHaveLength(0);
  });
});

describe('y los dos caminos llaman a la misma regla', () => {
  /*
   * ESTRUCTURAL, Y ES LA MITAD QUE IMPORTA. El método puede estar perfecto y no
   * servir de nada si la devolución no lo llama: eso es exactamente lo que
   * pasaba. Montar `DevolucionesProveedorService.crear` entero —transacción,
   * inventario por lotes, folios, outbox contable— mediría el armado del doble.
   */
  it('la devolución lo llama, dentro de su transacción', () => {
    expect(devoluciones).toMatch(
      /await this\.ordenes\.recalcularCobranzaDeLaOrden\(\s*\n\s*manager,/,
    );
  });

  it('y lo hace DESPUÉS de guardar el total de la devolución', () => {
    /*
     * El recálculo suma los totales de las devoluciones vigentes de la orden.
     * Llamarlo antes de escribir el total de ésta la contaría en cero y el
     * saldo saldría sin descontar nada: verde en la prueba, defecto intacto.
     */
    const guardarTotal = devoluciones.indexOf('guardada.total = Math.round');
    const recalculo = devoluciones.indexOf('recalcularCobranzaDeLaOrden(');
    expect(guardarTotal).toBeGreaterThan(0);
    expect(recalculo).toBeGreaterThan(guardarTotal);
  });

  it('el pago ya no tiene su propia copia del cálculo', () => {
    /*
     * Mientras `pagarOrden` conservara la suya, cambiar la regla obligaría a
     * acordarse de dos sitios — y el segundo es el que se olvida. Es, palabra
     * por palabra, cómo nació este defecto.
     */
    const cuerpo = ordenes.slice(ordenes.indexOf('async pagarOrden('));
    expect(cuerpo).not.toMatch(/oc\.saldoPendiente = Math\.max\(/);
    expect(cuerpo).toMatch(/this\.recalcularCobranzaDeLaOrden\(em, empresaId, id\)/);
  });

  it('la regla existe una sola vez en todo el servicio', () => {
    const veces = (ordenes.match(/oc\.saldoPendiente =\s*\n?\s*Math\.max\(/g) ?? [])
      .length;
    expect(veces).toBe(1);
  });

  it('y la salida de inventario de la devolución deja nombre', () => {
    /*
     * De paso: `registrarSalida` recibe `usuarioId` desde el 5-oct y aquí se
     * sabe quién es. Una devolución a proveedor saca mercancía del almacén.
     */
    const bloque = devoluciones.slice(
      devoluciones.indexOf('await this.inventario.registrarSalida('),
    );
    expect(bloque.slice(0, 600)).toMatch(
      /\{ id: guardada\.id, tipo: 'DEVOLUCION_PROVEEDOR' \},[\s\S]{0,200}usuarioId,/,
    );
  });
});
