import { SaldosFavorService } from './services/saldos-favor.service';
import {
  SaldoFavorClienteMovimiento,
  TipoMovimientoSaldoFavor,
} from './entities/saldo-favor-cliente.entity';

/**
 * ============================================================================
 * EL SALDO A FAVOR VUELVE AL CLIENTE CUANDO SE ANULA LA VENTA
 * ----------------------------------------------------------------------------
 * EL CASO, Y DE QUIÉN ES LA CULPA
 *
 * Hasta el 5-oct-2026 anular una venta pagada con saldo a favor estaba
 * **prohibido**, y el manual del sistema lo documentaba con su motivo:
 *
 *     «Anularla dejaría ese saldo sin restituir y la cuenta de cobro
 *      descuadrada. Regístralo como devolución total.»
 *
 * Ese día se levantó el bloqueo, porque la póliza de reversión pasó a espejar
 * la de la venta y el pasivo con el cliente ya se restituye en el MAYOR.
 *
 * Pero el auxiliar —`saldos_favor`, la tabla que dice cuánto le queda al
 * cliente— no se tocaba. El mayor decía que se le devolvió y el auxiliar que
 * no: **el cliente perdía ese dinero** y los dos libros divergían por ese
 * importe exacto. Es el mismo descuadre que el bloqueo evitaba, sólo que ahora
 * sin aviso y con la operación permitida.
 *
 * El manual tenía razón. Lo que faltaba era hacer las dos mitades, no quitar la
 * advertencia y dejar media.
 *
 * POR QUÉ UN MÉTODO APARTE Y NO `abonar`
 *
 * `abonar` identifica el abono por `devolucionId`, que es su clave de
 * idempotencia. Una anulación no tiene devolución —ésa es justo la diferencia
 * entre las dos operaciones—, y pasarle el id de la venta por ese campo dejaría
 * el auxiliar afirmando que hubo una devolución que nunca existió.
 * ============================================================================
 */

type Guardado = Record<string, unknown>;

function servicioCon(movimientosPrevios: Guardado[] = []) {
  const guardados: Guardado[] = [];
  const servicio = Object.create(SaldosFavorService.prototype) as Record<
    string,
    unknown
  >;

  const em = {
    query: async () => [],
    getRepository: (_e: unknown) => ({
      findOne: async ({ where }: { where: Record<string, unknown> }) =>
        movimientosPrevios.find(
          (m) =>
            m.ventaId === where.ventaId &&
            m.tipo === where.tipo &&
            m.empresaId === where.empresaId,
        ) ?? null,
      create: (x: Guardado) => x,
      save: async (x: Guardado) => {
        guardados.push(x);
        return x;
      },
    }),
    createQueryBuilder: () => {
      const qb: Record<string, unknown> = {};
      const devolver = () => qb;
      Object.assign(qb, {
        select: devolver,
        addSelect: devolver,
        where: devolver,
        andWhere: devolver,
        getRawOne: async () => ({ saldo: 120 }),
      });
      return qb;
    },
  };

  return { servicio: servicio as unknown as SaldosFavorService, em, guardados };
}

const datos = {
  empresaId: 'e1',
  clienteId: 'cli-1',
  ventaId: 'v-77',
  importe: 50,
  concepto: 'Restitución por anulación de la venta #301: el cliente se arrepintió.',
  usuarioId: 'u1',
};

describe('abonar el saldo a favor al anular una venta', () => {
  it('le devuelve al cliente exactamente lo que la venta le consumió', async () => {
    const { servicio, em, guardados } = servicioCon();
    await servicio.abonarPorAnulacionDeVenta(em as never, datos);

    expect(guardados).toHaveLength(1);
    expect(guardados[0].importe).toBe(50);
    expect(guardados[0].tipo).toBe(TipoMovimientoSaldoFavor.ABONO);
    expect(guardados[0].clienteId).toBe('cli-1');
  });

  it('lo enlaza a la venta anulada y NO inventa una devolución', async () => {
    /*
     * `devolucionId` es el campo con el que el auxiliar afirma que hubo una
     * devolución. Usarlo aquí para colar el id de la venta dejaría el libro
     * diciendo algo que no pasó, y además chocaría con la idempotencia de
     * `abonar`.
     */
    const { servicio, em, guardados } = servicioCon();
    await servicio.abonarPorAnulacionDeVenta(em as never, datos);

    expect(guardados[0].ventaId).toBe('v-77');
    expect(guardados[0].devolucionId).toBeNull();
  });

  it('deja el saldo posterior sumado al que había', async () => {
    const { servicio, em, guardados } = servicioCon();
    await servicio.abonarPorAnulacionDeVenta(em as never, datos);

    expect(guardados[0].saldoPosterior).toBe(170);
  });

  it('no abona dos veces la misma anulación', async () => {
    /*
     * Una venta se anula una vez. Si un proceso a medias se reintenta, el
     * cliente no puede acabar con el saldo duplicado. No hay índice único que
     * lo cubra —el de la tabla es sólo para el CARGO—, así que se comprueba en
     * código dentro del candado por cliente.
     */
    const { servicio, em, guardados } = servicioCon([
      { empresaId: 'e1', ventaId: 'v-77', tipo: TipoMovimientoSaldoFavor.ABONO },
    ]);
    await servicio.abonarPorAnulacionDeVenta(em as never, datos);

    expect(guardados).toHaveLength(0);
  });

  it('un cargo previo de la misma venta no se confunde con un abono', () => {
    /*
     * La tabla guarda el CARGO de cuando la venta consumió el saldo, con el
     * mismo `ventaId`. Si la idempotencia mirara sólo el id, el abono nunca se
     * escribiría y el defecto seguiría exactamente igual.
     */
    const { servicio, em, guardados } = servicioCon([
      { empresaId: 'e1', ventaId: 'v-77', tipo: TipoMovimientoSaldoFavor.CARGO },
    ]);
    return servicio
      .abonarPorAnulacionDeVenta(em as never, datos)
      .then(() => expect(guardados).toHaveLength(1));
  });

  it('un importe cero o negativo no escribe nada', async () => {
    const { servicio, em, guardados } = servicioCon();
    await servicio.abonarPorAnulacionDeVenta(em as never, { ...datos, importe: 0 });
    await servicio.abonarPorAnulacionDeVenta(em as never, { ...datos, importe: -5 });

    expect(guardados).toHaveLength(0);
  });
});

describe('la anulación de venta lo llama de verdad', () => {
  /*
   * ESTRUCTURAL, Y CON MOTIVO MEDIDO. El método puede estar perfecto y no
   * servir de nada si la anulación no lo llama: eso es exactamente lo que pasó
   * entre que se quitó el bloqueo y hoy. Montar `AnulacionVentasService` entero
   * —transacción, inventario, crédito, tesorería, caja, CFDI— mediría el armado
   * del doble y no esto.
   */
  const fuente = require('fs').readFileSync(
    require('path').join(__dirname, 'services', 'anulacion-ventas.service.ts'),
    'utf8',
  ) as string;

  it('restituye el saldo antes de armar la reversión contable', () => {
    expect(fuente).toContain('abonarPorAnulacionDeVenta');
    const posicionAbono = fuente.indexOf('abonarPorAnulacionDeVenta');
    const posicionReversion = fuente.indexOf('const datosReversion');
    expect(posicionAbono).toBeGreaterThan(0);
    expect(posicionAbono).toBeLessThan(posicionReversion);
  });

  it('sólo cuando la venta aplicó saldo y tiene cliente', () => {
    expect(fuente).toContain('saldoFavorAplicado > 0 && venta.clienteId');
  });

  it('y el bloqueo sigue retirado, que es lo que esto hace seguro', () => {
    /*
     * Las dos mitades van juntas: si alguien repone el bloqueo, esta
     * restitución deja de tener sentido; si alguien la quita, el bloqueo tiene
     * que volver. Quedan atadas por esta prueba.
     */
    expect(fuente).not.toMatch(
      /de saldo a favor del cliente\. Anularla dejaría ese saldo sin restituir/,
    );
  });
});

describe('el cargo que consume el saldo, que tampoco estaba vigilado', () => {
  /*
   * HALLAZGO COLATERAL DE UN MUTANTE MAL DIRIGIDO.
   *
   * Al intentar mutar el abono, el patrón coincidió primero con `aplicar` —el
   * CARGO que consume el saldo al vender— y lo mutó sin que **ninguna prueba se
   * pusiera roja**. Intercambiar ahí `ventaId` por `devolucionId` no es
   * cosmético: la tabla tiene el índice único
   *
   *     UX_saldo_favor_venta_cargo  (empresaId, ventaId)  where tipo = 'CARGO'
   *
   * que es lo único que impide aplicar dos veces el mismo saldo a la misma
   * venta. Con `ventaId` en nulo ese índice no cubre nada, porque los índices
   * parciales de Postgres ignoran los nulos, y un reintento duplicaría el
   * consumo.
   *
   * El mutante estaba mal dirigido y aun así encontró un hueco real. Queda
   * tapado.
   */
  const fuente = require('fs').readFileSync(
    require('path').join(__dirname, 'services', 'saldos-favor.service.ts'),
    'utf8',
  ) as string;

  it('el cargo se enlaza por ventaId, que es lo que sostiene el índice único', () => {
    const inicio = fuente.indexOf('async aplicar(');
    const fin = fuente.indexOf('async abonar(');
    expect(inicio).toBeGreaterThan(0);
    expect(fin).toBeGreaterThan(inicio);
    const cuerpo = fuente.slice(inicio, fin);
    /*
     * Sobre el bloque que ESCRIBE, no sobre el que consulta. La primera versión
     * de esta prueba buscaba `ventaId: datos.ventaId` suelto y lo encontraba en
     * el `findOne` de la idempotencia, que el mutante no toca: pasaba en verde
     * con el movimiento guardándose sin `ventaId`.
     */
    expect(cuerpo).toMatch(
      /ventaId: datos\.ventaId,\s*\n\s*devolucionId: null,\s*\n\s*tipo: TipoMovimientoSaldoFavor\.CARGO/,
    );
  });

  it('y el índice sigue existiendo en la entidad, con su condición', () => {
    const entidad = require('fs').readFileSync(
      require('path').join(
        __dirname,
        'entities',
        'saldo-favor-cliente.entity.ts',
      ),
      'utf8',
    ) as string;
    expect(entidad).toContain('UX_saldo_favor_venta_cargo');
    expect(entidad).toMatch(/ventaId IS NOT NULL AND tipo = 'CARGO'/);
  });
});
