/**
 * ============================================================================
 * Un hallazgo que dice CUÁNTAS no le ahorra el trabajo a nadie
 * ----------------------------------------------------------------------------
 * POR QUÉ EXISTE ESTA PRUEBA
 *
 * La verificación de integridad financiera encontraba «4 cuentas con saldo
 * contrario a su naturaleza» y mandaba a revisar la balanza. Cuatro entre
 * cientos de cuentas: dar con ellas a mano es media mañana de un contador.
 *
 * Y el sistema SABE cuáles son. Acaba de contarlas. Devolver sólo el número es
 * devolverle el trabajo ya hecho a quien menos tiempo tiene.
 *
 * Había además una pieza buena sin usar, que es el patrón de la casa: la
 * pantalla hermana —la verificación de esquema— ya pintaba una tabla de
 * ejemplos desde hacía tiempo, con su «se muestran 5 de 40» y todo. Era la
 * financiera la que nunca mandaba ninguno.
 *
 * LAS TRES REGLAS, y las tres por el mismo motivo: que esto ayude y no estorbe.
 *
 *  1. Sólo se pregunta cuando ya se sabe que hay algo. Una consulta más por
 *     comprobación, en una instalación limpia, es trabajo que no sirve a nadie.
 *  2. Se traen pocos y se dice cuántos faltan. Una lista de trescientos no es
 *     una lista: es otro número, y además tapa la pantalla.
 *  3. Si la consulta de los ejemplos falla, el hallazgo CONSERVA su cuenta.
 *     «No pude nombrarlos» no es «no hay», y confundir esas dos cosas aquí
 *     sería exactamente el error que estas comprobaciones existen para impedir.
 * ============================================================================
 */

import { IntegridadFinancieraService } from './services/integridad-financiera.service';

type Fila = Record<string, unknown>;

/**
 * Un doble de la base que distingue la consulta que CUENTA de la que NOMBRA,
 * para poder romper una sin romper la otra. Es lo que hace comprobable la
 * regla 3.
 */
function baseFalsa(opciones: {
  cuantas: number;
  nombres?: string[];
  nombrarRevienta?: boolean;
}) {
  const consultas: string[] = [];
  return {
    consultas,
    dataSource: {
      query: async (sql: string, _p: unknown[]): Promise<Fila[]> => {
        consultas.push(sql);
        const esConteo = /COUNT\(/i.test(sql);
        if (esConteo) {
          return /partidas_poliza/.test(sql) && /naturaleza/.test(sql)
            ? [{ cantidad: opciones.cuantas }]
            : [{ cantidad: 0 }];
        }
        if (opciones.nombrarRevienta) throw new Error('la consulta de ejemplos falló');
        return (opciones.nombres ?? []).map((etiqueta) => ({ etiqueta }));
      },
    },
  };
}

const delSaldoContrario = (d: { hallazgos: Array<{ codigo: string }> }) =>
  d.hallazgos.find((h) => h.codigo === 'CUENTA_CON_SALDO_CONTRARIO') as
    | {
        codigo: string;
        estado: string;
        cantidad: number;
        ejemplos?: string[];
        masSinNombrar?: number;
      }
    | undefined;

describe('un hallazgo dice cuáles, no sólo cuántas', () => {
  it('nombra las cuentas cuando las hay', async () => {
    const { dataSource } = baseFalsa({
      cuantas: 2,
      nombres: ['1020 · Bancos · saldo -4500.00', '1050 · Clientes · saldo -150.00'],
    });
    const servicio = new IntegridadFinancieraService(dataSource as never);
    const h = delSaldoContrario(await servicio.diagnosticar('e1'));

    expect(h?.estado).toBe('CON_HALLAZGOS');
    expect(h?.cantidad).toBe(2);
    expect(h?.ejemplos).toEqual([
      '1020 · Bancos · saldo -4500.00',
      '1050 · Clientes · saldo -150.00',
    ]);
    /* Están las dos: no falta ninguna por nombrar. */
    expect(h?.masSinNombrar).toBeUndefined();
  });

  it('cuando son muchas, dice cuántas quedan fuera', async () => {
    const { dataSource } = baseFalsa({
      cuantas: 40,
      nombres: Array.from({ length: 8 }, (_, i) => `cuenta ${i}`),
    });
    const servicio = new IntegridadFinancieraService(dataSource as never);
    const h = delSaldoContrario(await servicio.diagnosticar('e1'));

    expect(h?.ejemplos).toHaveLength(8);
    /*
     * Que falten 32 tiene que decirse. Quien ve ocho renglones y el contador
     * en cuarenta sabe que debe mirar la lista entera; quien ve sólo ocho cree
     * que corrigiendo esos ocho terminó.
     */
    expect(h?.masSinNombrar).toBe(32);
  });

  it('no pregunta por nombres cuando no hay nada que nombrar', async () => {
    const { dataSource, consultas } = baseFalsa({ cuantas: 0 });
    const servicio = new IntegridadFinancieraService(dataSource as never);
    const d = await servicio.diagnosticar('e1');

    /*
     * Una comprobación limpia NO aparece en la lista: `diagnosticar` devuelve
     * `[...conHallazgos, ...noMedibles]` y deja fuera lo que salió bien. Es
     * deliberado —la pantalla enseña lo que hay que atender, no un inventario
     * de todo lo que se miró— y aquí queda fijado, porque esa decisión es lo
     * que hace que el recuento de abajo signifique algo.
     */
    expect(delSaldoContrario(d)).toBeUndefined();
    expect(d.resumen.hallazgosActivos).toBe(0);

    /*
     * Lo que de verdad se está midiendo: ni UNA consulta de ejemplos. Todas
     * las que corrieron cuentan. En una instalación limpia esto son treinta y
     * tantas idas a la base que no sirven a nadie.
     */
    expect(consultas.length).toBeGreaterThan(10);
    expect(consultas.every((s) => /COUNT\(/i.test(s))).toBe(true);
  });

  it('LA REGLA QUE IMPORTA: si no se pueden nombrar, el hallazgo conserva su cuenta', async () => {
    const { dataSource } = baseFalsa({ cuantas: 4, nombrarRevienta: true });
    const servicio = new IntegridadFinancieraService(dataSource as never);
    const h = delSaldoContrario(await servicio.diagnosticar('e1'));

    /*
     * Aquí estaba la forma fácil de equivocarse: dejar que el fallo de la
     * consulta de ejemplos arrastrara al hallazgo entero y lo dejara en
     * «limpia» o en «no medible». Las cuatro cuentas existen; lo único que
     * falló fue poder decir sus nombres.
     */
    expect(h?.estado).toBe('CON_HALLAZGOS');
    expect(h?.cantidad).toBe(4);
    expect(h?.ejemplos).toBeUndefined();
    expect(h?.masSinNombrar).toBeUndefined();
  });

  it('LA PRUEBA DE LA PRUEBA: el doble distingue de verdad las dos consultas', async () => {
    /*
     * Si el doble contestara lo mismo a todo, las cuatro pruebas de arriba
     * pasarían sin medir nada. Esto comprueba que la consulta que cuenta y la
     * que nombra son distintas y que ambas llegan.
     */
    const { dataSource, consultas } = baseFalsa({ cuantas: 1, nombres: ['x'] });
    const servicio = new IntegridadFinancieraService(dataSource as never);
    await servicio.diagnosticar('e1');
    expect(consultas.some((s) => /COUNT\(/i.test(s))).toBe(true);
    expect(consultas.some((s) => /AS etiqueta/i.test(s))).toBe(true);
  });
});
