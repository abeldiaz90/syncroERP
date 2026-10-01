/**
 * ============================================================================
 * Ningún evento se queda sin destino
 * ----------------------------------------------------------------------------
 * El outbox es el único camino por el que el ERP y el mayor externo se
 * mantienen iguales. Un tipo de evento que se emite y que el despachador no
 * sabe atender cae en el `default`:
 *
 *     throw new ErrorIntegracionExterna(`Evento desconocido: ...`, false)
 *
 * `false` significa «no reintentar». O sea: el evento nace, se marca FALLIDO
 * para siempre, y los dos libros quedan distintos sin que nada vuelva a
 * intentarlo. Es exactamente la clase de divergencia de la que nadie se entera,
 * y la que obligó a crear el control `ESPEJO_CONTABLE` del cierre mensual.
 *
 * Añadir un miembro al enum es una línea. Acordarse de añadir su `case` es
 * memoria. Esta prueba sustituye la memoria: se pone roja al añadir el tipo,
 * no al perder el asiento.
 *
 * Se lee el archivo en vez de ejercitar el `switch` a propósito: para
 * ejercitarlo haría falta levantar el despachador entero con su cliente HTTP
 * contra Fineract, y lo que se quiere comprobar aquí no es qué contesta el core
 * sino que el ERP tenga algo que decirle de cada evento que emite.
 * ============================================================================
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  EVENTOS_DE_CARTERA,
  EVENTOS_DE_CONTABILIDAD,
  TipoEventoIntegracion,
} from './integracion.constants';

const despachador = readFileSync(
  join(__dirname, 'services', 'integracion-despachador.service.ts'),
  'utf8',
);
const sinComentarios = despachador
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** El cuerpo de `aplicar`, que es donde se reparte el trabajo. */
const cuerpoDeAplicar = (() => {
  const inicio = sinComentarios.indexOf('switch (evento.tipo) {');
  expect(inicio).toBeGreaterThan(-1);
  const fin = sinComentarios.indexOf('default:', inicio);
  return sinComentarios.slice(inicio, fin);
})();

describe('Cada tipo de evento tiene a dónde ir', () => {
  const todos = Object.values(TipoEventoIntegracion);

  it('hay tipos que comprobar (la prueba no se aprueba sola)', () => {
    expect(todos.length).toBeGreaterThanOrEqual(11);
  });

  it.each(todos)('%s aparece como caso del despachador', (tipo) => {
    expect(cuerpoDeAplicar).toContain(`case TipoEventoIntegracion.${tipo}:`);
  });

  it('el `default` sigue siendo el que no reintenta', () => {
    /*
     * Si algún día el default pasara a reintentar, un evento desconocido daría
     * vueltas para siempre en vez de detenerse a la vista. Ninguna de las dos
     * es buena, pero la que hay es la que esta prueba da por supuesta.
     */
    expect(sinComentarios).toMatch(
      /default:\s*throw new ErrorIntegracionExterna\(\s*`Evento desconocido: \$\{evento\.tipo\}`,\s*false,/,
    );
  });

  it('LINEA_REVOCADA se declara sin equivalente, que no es lo mismo que olvidarla', () => {
    /*
     * El único tipo que no viaja al core. Está dicho con todas sus letras y con
     * su motivo: allá no existe un objeto «línea de crédito» que revocar. Un
     * evento sin destino declarado es una decisión; uno que cae al `default`
     * es un olvido, y desde fuera se ven igual.
     */
    expect(cuerpoDeAplicar).toContain(
      'case TipoEventoIntegracion.LINEA_REVOCADA:',
    );
    expect(sinComentarios).toMatch(
      /no tiene equivalente en el registro externo\. Descártalo\./,
    );
  });
});

describe('Cada tipo pertenece a un dueño, y sólo a uno', () => {
  it('contabilidad y cartera parten el enum sin dejar huecos ni solapes', () => {
    const union = [...EVENTOS_DE_CONTABILIDAD, ...EVENTOS_DE_CARTERA].sort();
    expect(union).toEqual(Object.values(TipoEventoIntegracion).sort());
    for (const tipo of EVENTOS_DE_CONTABILIDAD) {
      expect(EVENTOS_DE_CARTERA).not.toContain(tipo);
    }
  });

  it('la póliza es del contador, y es lo único que lo es', () => {
    expect(EVENTOS_DE_CONTABILIDAD).toEqual([
      TipoEventoIntegracion.POLIZA_REGISTRADA,
    ]);
  });
});

describe('Toda póliza que nace queda encolada, venga de donde venga', () => {
  /*
   * El enganche es un suscriptor de TypeORM sobre `Poliza`, no una llamada en
   * cada servicio: el ERP crea pólizas desde el motor contable, la captura
   * manual, la captura en transacción, las reversas y el cierre. Una lista de
   * puntos de enganche es una lista que alguien olvida ampliar.
   */
  const suscriptor = readFileSync(
    join(__dirname, 'services', 'poliza-espejo.subscriber.ts'),
    'utf8',
  );

  it('escucha la entidad Póliza, no una ruta ni un servicio', () => {
    expect(suscriptor).toMatch(/listenTo\(\)\s*\{\s*return Poliza;/);
    expect(suscriptor).toMatch(/async afterInsert\(/);
  });

  it('el evento nace dentro de la MISMA transacción que la póliza', () => {
    /*
     * Con su propio `EntityManager`, una póliza podría quedar guardada y su
     * espejo perdido si la transacción se deshace después. Aquí viajan juntos.
     */
    expect(suscriptor).toMatch(/evento\.manager,/);
  });
});
