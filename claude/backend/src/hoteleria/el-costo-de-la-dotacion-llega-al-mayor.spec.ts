import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * El costo de la dotación llega al mayor
 * ----------------------------------------------------------------------------
 * EL CASO
 *
 * Las amenidades que se dejan en la habitación al hacer el check-in —jabón,
 * café, agua— salen del almacén en `descontarDotacion`. La salida se registraba
 * contra la HABITACIÓN:
 *
 *     { id: habitacion.id, tipo: 'HOTEL_DOTACION' }
 *
 * y el asiento de hospedaje, al cerrar el folio, suma el costo de las salidas
 * ligadas al FOLIO:
 *
 *     .andWhere('m.documentoId = :folioId', { folioId: folio.id })
 *
 * Dos documentos distintos, así que el costo de la dotación no entraba en
 * ninguna suma: **la existencia bajaba y la cuenta de Inventario no se
 * acreditaba nunca**. El inventario físico y el contable divergen por el costo
 * de las amenidades de cada estancia, de forma permanente y creciente, y la
 * utilidad queda inflada mes a mes.
 *
 * No lo caza un balance: la póliza de hospedaje **cuadra igual**. Lo que falta
 * no está mal repartido, es que no está.
 *
 * POR QUÉ NO LO VIO LA PRUEBA QUE EXISTÍA
 *
 * `coherencia.spec.ts` comprueba que el asiento de hospedaje «incluye el costo
 * de los consumos» así:
 *
 *     expect(cuerpo).toContain('costoConsumos');
 *     expect(hotel).toContain('costoConsumos');
 *
 * Las dos cosas eran ciertas con el defecto dentro. La palabra estaba en los
 * dos archivos; lo que no coincidía era **el documento por el que cada lado
 * pregunta**, y eso una búsqueda de texto no lo mide. Una prueba que afirma que
 * algo está vigilado y no puede fallar es peor que no tenerla.
 *
 * LO QUE ESTA PRUEBA MIDE
 *
 * Que los dos lados nombren el MISMO documento. No que exista una palabra: que
 * lo que se escribe y lo que se lee sean lo mismo. Si alguien cambia uno de los
 * dos, esto se pone rojo.
 * ============================================================================
 */

const FUENTE = readFileSync(
  join(__dirname, 'services/operacion-hotel.service.ts'),
  'utf8',
);

/*
 * Sin comentarios. La explicación del arreglo cita el renglón viejo —con
 * `habitacion.id` dentro—, así que buscar sobre el archivo entero encontraría
 * la historia y no el código. Es el mismo error que esta prueba vigila, un piso
 * más arriba.
 */
const HOTEL = FUENTE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** El cuerpo de `descontarDotacion`, que es quien registra la salida. */
const DOTACION = (() => {
  const desde = HOTEL.indexOf('private async descontarDotacion(');
  if (desde < 0) throw new Error('No se encontró `descontarDotacion`.');
  const hasta = HOTEL.indexOf('async agregarConsumo(', desde);
  return HOTEL.slice(desde, hasta > 0 ? hasta : desde + 4000);
})();

/** El tramo que suma el costo al cerrar el folio. */
const SUMA = (() => {
  const desde = HOTEL.indexOf('const costoConsumos = money(');
  if (desde < 0) throw new Error('No se encontró la suma del costo.');
  return HOTEL.slice(desde, desde + 900);
})();

describe('el costo de la dotación llega al mayor', () => {
  it('la dotación se registra contra el folio, no contra la habitación', () => {
    expect(DOTACION).toMatch(/\{ id: folioId, tipo: 'HOTEL_DOTACION' \}/);
    expect(DOTACION).not.toMatch(/\{ id: habitacion\.id, tipo: 'HOTEL_DOTACION' \}/);
  });

  it('y el folio le llega de quien lo acaba de crear', () => {
    /*
     * El folio existe cuando esto corre —se crea unas líneas más arriba, en el
     * mismo check-in—, así que no hay que inventarse nada ni diferir el apunte.
     */
    expect(HOTEL).toMatch(/descontarDotacion\(\s*manager,[\s\S]{0,200}?folio\.id,\s*\)/);
    expect(DOTACION).toMatch(/folioId: string,/);
  });

  it('la suma del costo sigue preguntando por el folio', () => {
    expect(SUMA).toMatch(/m\.documentoId = :folioId/);
    expect(SUMA).toMatch(/tipo: 'SALIDA'/);
  });

  /*
   * El que ata los dos lados. Lo que se escribe y lo que se lee tienen que ser
   * el mismo documento; si alguien mueve uno, esto lo dice.
   */
  it('lo que escribe la dotación y lo que lee el asiento son el mismo documento', () => {
    const escribe = /\{ id: ([\w.]+), tipo: 'HOTEL_DOTACION' \}/.exec(DOTACION);
    const lee = /documentoId = :(\w+)', \{ (\w+): ([\w.]+) \}/.exec(SUMA);

    expect(escribe).not.toBeNull();
    expect(lee).not.toBeNull();

    /* `folioId` en la dotación; `folio.id` en la suma: la misma cosa. */
    const loQueEscribe = escribe![1].replace(/^folioId$/, 'folio.id');
    const loQueLee = lee![3];
    expect(loQueEscribe).toBe(loQueLee);
  });

  describe('la prueba de la prueba', () => {
    it('una búsqueda de texto no podía ver este defecto', () => {
      /*
       * Se reconstruye aquí lo que comprobaba `coherencia.spec.ts`, con el
       * código defectuoso, para dejar escrito por qué pasaba en verde. No es
       * una curiosidad: es el motivo por el que esta prueba existe aparte en
       * vez de añadir un `toContain` más allá.
       */
      const conElDefecto = `
        { id: habitacion.id, tipo: 'HOTEL_DOTACION' }
        const costoConsumos = money(...)
      `;
      expect(conElDefecto).toContain('costoConsumos'); // pasaba
      expect(conElDefecto).toContain('HOTEL_DOTACION'); // pasaba

      /* Y lo que sí lo ve: comparar los dos lados. */
      const escribe = /\{ id: ([\w.]+), tipo: 'HOTEL_DOTACION' \}/.exec(
        conElDefecto,
      )![1];
      expect(escribe).not.toBe('folioId');
    });

    it('nadie más depende de que la dotación cuelgue de la habitación', () => {
      /*
       * Antes de mover el documento había que saber si alguien lo leía así. No:
       * `HOTEL_DOTACION` aparece en un solo sitio del backend, el que lo
       * escribe. Si mañana nace un lector, este número sube y obliga a mirarlo.
       */
      const enElServicio = (HOTEL.match(/HOTEL_DOTACION/g) ?? []).length;
      expect(enElServicio).toBe(1);
      /* Y tampoco lo lee nadie por el identificador de la habitación. */
      expect(HOTEL).not.toMatch(/documentoId[^\n]*habitacion/);
    });
  });
});
