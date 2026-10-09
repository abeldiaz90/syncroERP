import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * El saldo según libros no es un renglón cualquiera
 * ----------------------------------------------------------------------------
 * EL CASO
 *
 * La conciliación bancaria compara lo que dice el banco con lo que dicen los
 * libros, y si no coinciden se niega a cerrar. La cifra de los libros salía de
 * aquí:
 *
 *     const movimientos = await this.movimientos.find({ where: { … } });
 *     const saldoLibrosCent = movimientos.length
 *       ? aCent(movimientos[movimientos.length - 1].saldoPosterior)
 *       : 0;
 *
 * **Un `find()` sin `order`.** SQL no promete ningún orden sin `ORDER BY`, y
 * Postgres devuelve las filas como le conviene: el orden del montón, que cambia
 * cuando una fila se actualiza. Así que «el último» era un movimiento
 * cualquiera del mes, y su saldo corrido una cifra cualquiera del mes.
 *
 * Lo que se ve desde fuera: la conciliación se niega sobre cuentas que cuadran,
 * o firma un descuadre; y dos corridas seguidas pueden contestar cosas
 * distintas sin que nada haya cambiado. Nada de eso apunta a esta línea.
 *
 * TRES DEFECTOS EN EL MISMO RENGLÓN
 *
 *  1. **Sin orden** — arriba.
 *  2. **Excluía los cancelados**, pero `recalcularSaldos` no los excluye al
 *     calcular `saldoPosterior`. Leer el último de una lista filtrada es leer
 *     el saldo de un movimiento que no es el último.
 *  3. **Un mes sin movimientos daba cero.** Una cuenta quieta con saldo no
 *     tiene cero en libros: tiene lo que traía. Y un cero ahí hace cuadrar lo
 *     que no cuadra.
 *
 * POR QUÉ ESTA PRUEBA LEE EL FUENTE
 *
 * Porque lo que falla es una propiedad del SQL —que haya `ORDER BY` y cuál—, y
 * eso no se puede provocar con dobles: un repositorio de mentira devuelve lo
 * que se le diga, en el orden que se le diga, y pasaría igual con el defecto
 * dentro. Lo que sí se comprueba con datos es la ARITMÉTICA, que va abajo
 * reproducida contra la misma regla.
 * ============================================================================
 */

const FUENTE = readFileSync(
  join(__dirname, 'services/tesoreria.service.ts'),
  'utf8',
);

/**
 * El tramo de `generarReporteConciliacion`, para no mirar todo el archivo.
 *
 * Se ancla en el CÓDIGO y no en la primera aparición del nombre: la
 * explicación de arriba cita el renglón viejo entero, así que buscar
 * `saldoLibrosCent` a secas caía dentro del comentario y la prueba miraba la
 * historia en vez del código. Es el mismo error que vigila: un ancla ambigua
 * no avisa de que se movió, contesta otra cosa.
 */
const tramo = (() => {
  const desde = FUENTE.indexOf('const delMes = await this.movimientos.find(');
  if (desde < 0) throw new Error('No se encontró la consulta del mes.');
  return FUENTE.slice(desde, desde + 2000);
})();

describe('el saldo según libros no es un renglón cualquiera', () => {
  it('la consulta del mes pide orden explícito', () => {
    expect(tramo).toMatch(/order:\s*\{\s*fecha:\s*'ASC',\s*fechaCreacion:\s*'ASC'\s*\}/);
  });

  it('y es el MISMO orden con el que se calcula el saldo corrido', () => {
    /*
     * `recalcularSaldos` recorre por `fecha ASC, fechaCreacion ASC` y va
     * escribiendo `saldoPosterior`. Leerlo con otro orden es leer otra cosa.
     * Si alguien cambia uno de los dos, esto lo dice.
     */
    const recalculo = FUENTE.slice(FUENTE.indexOf('const posteriores = await repo.find('));
    expect(recalculo.slice(0, 200)).toMatch(
      /order:\s*\{\s*fecha:\s*'ASC',\s*fechaCreacion:\s*'ASC'\s*\}/,
    );
  });

  it('ya no se toma el último de una lista sin orden', () => {
    expect(tramo).not.toMatch(
      /movimientos\[movimientos\.length - 1\]\.saldoPosterior/,
    );
  });

  it('el saldo de libros se lee de todos los movimientos, cancelados incluidos', () => {
    /*
     * El filtro de cancelados se aplica DESPUÉS, y sólo para lo que sí depende
     * de que el movimiento siga vivo —lo que está en tránsito—.
     */
    expect(tramo).toMatch(/const delMes = await this\.movimientos\.find\(/);
    expect(tramo).toMatch(/const movimientos = delMes\.filter\(\(m\) => !m\.cancelado\)/);
    /* Y la consulta del mes ya no lleva el filtro dentro. */
    const consulta = tramo.slice(
      tramo.indexOf('const delMes'),
      tramo.indexOf('const movimientos ='),
    );
    expect(consulta).not.toMatch(/cancelado:\s*false/);
  });

  it('un mes sin movimientos arrastra el saldo anterior, no cero', () => {
    expect(tramo).toMatch(/anteriorAlMes/);
    expect(tramo).toMatch(/m\.fecha < :desde/);
    expect(tramo).toMatch(/\(ultimoDelMes \?\? anteriorAlMes\)\?\.saldoPosterior \?\? 0/);
  });

  describe('la aritmética, con datos', () => {
    /*
     * La misma regla, reproducida: de una lista ordenada, el saldo de libros es
     * el `saldoPosterior` del último, estén cancelados o no; y si el mes está
     * vacío, el del último anterior al mes.
     */
    const saldoDeLibros = (
      delMes: Array<{ saldoPosterior: number; cancelado: boolean }>,
      anterior: { saldoPosterior: number } | null,
    ) => (delMes.length ? delMes[delMes.length - 1] : anterior)?.saldoPosterior ?? 0;

    it('toma el último del mes aunque esté cancelado', () => {
      const mes = [
        { saldoPosterior: 1000, cancelado: false },
        { saldoPosterior: 1500, cancelado: false },
        { saldoPosterior: 1000, cancelado: true },
      ];
      expect(saldoDeLibros(mes, null)).toBe(1000);
      /*
       * Y con el defecto —filtrando cancelados primero— habría dicho 1500: un
       * descuadre de 500 que la conciliación habría echado en cara al banco.
       */
      expect(
        saldoDeLibros(
          mes.filter((m) => !m.cancelado),
          null,
        ),
      ).toBe(1500);
    });

    it('un mes quieto conserva el saldo que traía', () => {
      expect(saldoDeLibros([], { saldoPosterior: 8200 })).toBe(8200);
    });

    it('sin nada en absoluto, cero es la respuesta correcta', () => {
      expect(saldoDeLibros([], null)).toBe(0);
    });

    it('el orden importa: la misma lista barajada da otra cifra', () => {
      /*
       * Es el defecto entero en dos renglones. Sin `ORDER BY`, la lista que
       * llega es ésta en cualquiera de sus órdenes, y cada uno contesta una
       * cosa distinta.
       */
      const ordenada = [
        { saldoPosterior: 100, cancelado: false },
        { saldoPosterior: 700, cancelado: false },
        { saldoPosterior: 250, cancelado: false },
      ];
      const barajada = [ordenada[2], ordenada[0], ordenada[1]];
      expect(saldoDeLibros(ordenada, null)).toBe(250);
      expect(saldoDeLibros(barajada, null)).toBe(700);
    });
  });
});
