/**
 * ============================================================================
 * Cancelar no es dejar sin contabilidad
 * ----------------------------------------------------------------------------
 * Encontrado el 1-oct-2026 yendo a corregir una póliza mal fechada: el camino
 * para corregirla no existía, y el agujero era más grande que la fecha.
 *
 * Una póliza nacida de un documento —una recepción, una venta, un cobro— tiene
 * su asiento en `asientos_pendientes`, marcado GENERADO y apuntando a ella.
 * Al cancelarla, ese asiento seguía diciendo «Generado» y apuntando a una
 * póliza muerta. Resultado: el documento se quedaba sin contabilidad viva —con
 * el inventario o la cartera ya movidos— y **nada lo decía**. Ni la pantalla,
 * ni la respuesta del servidor, ni la bandeja de asientos pendientes, que
 * seguía mostrándolo como resuelto.
 *
 * Y la salida de emergencia tampoco servía: `reintentarAhora` ve el estado
 * GENERADO y contesta «ya estaba generado, no se duplicó la póliza», que es lo
 * más parecido a no tener botón.
 *
 * Dos arreglos, y el segundo importa tanto como el primero:
 *
 *   · Se puede pedir que el asiento vuelva a la cola y la póliza se rehaga.
 *   · Cuando NO se pide, la respuesta NOMBRA el documento que se queda sin
 *     póliza. Un sistema que te deja a medias sin avisar es peor que uno que
 *     no te deja.
 * ============================================================================
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { existsSync } from 'fs';

import { EstadoAsiento } from './entities/asiento-pendiente.entity';

const servicio = readFileSync(
  join(__dirname, 'services', 'polizas.service.ts'),
  'utf8',
);
const sinComentarios = servicio
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** El cuerpo de `cancelarPoliza`, que es donde vive todo esto. */
const cancelar = (() => {
  const inicio = sinComentarios.indexOf('async cancelarPoliza(');
  expect(inicio).toBeGreaterThan(-1);
  const siguiente = sinComentarios
    .slice(inicio + 1)
    .search(/\n  (async |private |public )/);
  return siguiente > -1
    ? sinComentarios.slice(inicio, inicio + 1 + siguiente)
    : sinComentarios.slice(inicio);
})();

describe('El asiento del documento vuelve a la cola cuando se pide', () => {
  it('se busca el asiento que produjo esta póliza', () => {
    expect(cancelar).toMatch(
      /qr\.manager\.findOne\(AsientoPendiente, \{\s*where: \{ empresaId, polizaId: original\.id \}/,
    );
  });

  it('vuelve a PENDIENTE y se desliga de la póliza muerta', () => {
    /*
     * Las dos cosas juntas. Dejarlo PENDIENTE pero apuntando a la póliza
     * cancelada haría que el círculo de auditoría señalara a un documento
     * contable que ya no vale.
     */
    expect(cancelar).toMatch(/estado: EstadoAsiento\.PENDIENTE,/);
    expect(cancelar).toMatch(/polizaId: null,/);
  });

  it('se le reinician los intentos y se le pone turno inmediato', () => {
    /*
     * Un asiento que agotó reintentos en su vida anterior volvería a la cola
     * ya agotado, y el motor lo pasaría por alto para siempre.
     */
    expect(cancelar).toMatch(/intentos: 0,/);
    expect(cancelar).toMatch(/ultimoError: null,/);
    expect(cancelar).toMatch(/proximoIntento: new Date\(\),/);
  });

  it('queda escrito por qué se reabrió', () => {
    expect(cancelar).toMatch(
      /notaResolucion:\s*`Reabierto al cancelar \$\{original\.folio\}: \$\{motivo\}`/,
    );
  });

  it('todo dentro de la misma transacción de la cancelación', () => {
    /*
     * Con `qr.manager`: si la cancelación se deshace, el asiento no se queda
     * reabierto reclamando una póliza que nunca se canceló.
     */
    expect(cancelar).toMatch(/qr\.manager\.update\(AsientoPendiente,/);
    const antesDelCommit = cancelar.slice(0, cancelar.indexOf('commitTransaction'));
    expect(antesDelCommit).toMatch(/AsientoPendiente/);
  });

  it('el estado al que vuelve es uno que el motor sí reintenta', () => {
    /*
     * `reintentarAhora` sólo reclama filas en PENDIENTE o FALLIDO. Devolverlo
     * a cualquier otro estado lo dejaría en la bandeja sin que nadie lo tome.
     */
    const pendientes = readFileSync(
      join(__dirname, 'services', 'asientos-pendientes.service.ts'),
      'utf8',
    );
    expect(pendientes).toMatch(
      /estado: In\(\[EstadoAsiento\.PENDIENTE, EstadoAsiento\.FALLIDO\]\)/,
    );
    expect(EstadoAsiento.PENDIENTE).toBe('PENDIENTE');
  });
});

describe('Y cuando no se pide, se dice en voz alta qué se queda sin póliza', () => {
  it('se nombra el documento, no se calla', () => {
    expect(cancelar).toMatch(
      /documentoSinPoliza = asiento\.folioDocumento \?\? asiento\.tipo;/,
    );
  });

  it('las dos salidas viajan en la respuesta', () => {
    expect(cancelar).toMatch(/\s+regenerada,/);
    expect(cancelar).toMatch(/\s+documentoSinPoliza,/);
  });

  it('una póliza manual no inventa un documento que no existe', () => {
    /*
     * Sin asiento ligado —captura manual— no hay nada que rehacer ni nada que
     * advertir. `documentoSinPoliza` se queda en null, que es la verdad.
     */
    expect(cancelar).toMatch(/let documentoSinPoliza: string \| null = null;/);
    expect(cancelar).toMatch(/} else if \(asiento\) \{/);
  });

  it('rehacer es opcional: no se fuerza desde el servidor', () => {
    /*
     * A veces se cancela porque esa póliza no debía existir. Rehacerla
     * automáticamente sería justo lo contrario de lo que se pide.
     */
    expect(cancelar).toMatch(/if \(asiento && datos\.regenerar\) \{/);
  });
});

describe('La pantalla ofrece la decisión y repite lo que contestó el servidor', () => {
  const RAIZ = join(__dirname, '..', '..', '..');
  const FRONTEND = ['syncro-erp-frontend', 'frontend', '../syncro-erp-frontend']
    .map((nombre) => join(RAIZ, nombre))
    .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));
  const ruta = FRONTEND
    ? join(FRONTEND, 'app/dashboard/finanzas/polizas/page.tsx')
    : '';
  const hay = Boolean(ruta && existsSync(ruta));
  const pantalla = hay ? readFileSync(ruta, 'utf8') : '';

  it('la casilla existe y viaja al servidor', () => {
    if (!hay) return;
    expect(pantalla).toMatch(/body: JSON\.stringify\(\{ motivo, regenerar \}\)/);
  });

  it('viene encendida: corregir es lo normal, dejar sin póliza es lo raro', () => {
    if (!hay) return;
    expect(pantalla).toMatch(/useState\(true\);/);
    expect(pantalla).toMatch(/setRegenerar\(true\);/);
  });

  it('el aviso de éxito dice qué pasó con el documento', () => {
    if (!hay) return;
    expect(pantalla).toMatch(/data\.regenerada/);
    expect(pantalla).toMatch(/data\.documentoSinPoliza/);
    expect(pantalla).toMatch(/se queda sin póliza vigente/);
  });
});
