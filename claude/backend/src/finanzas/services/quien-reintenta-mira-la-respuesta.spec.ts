/**
 * ============================================================================
 * Quien reintenta un asiento mira la respuesta
 * ----------------------------------------------------------------------------
 * `reintentarAhora` no lanza cuando el asiento falla. Atrapa el error, deja el
 * registro en FALLIDO y devuelve `{ generado: false, mensaje }`. Es el contrato
 * correcto: la operación de negocio —la venta, la recepción, la corrida de
 * depreciación— ya está confirmada, y no debe caerse porque a la contabilidad
 * le falte una cuenta.
 *
 * Pero ese contrato tiene una trampa: envolverlo en `try/catch` y dar por
 * bueno el camino sin excepción equivale a declarar «GENERADO» siempre. Le
 * pasó a la corrida de depreciación, que informaba la póliza como generada con
 * el asiento FALLIDO esperando en la bandeja.
 *
 * Esta prueba no mide un caso: exige que **todo** el que llame a
 * `reintentarAhora` use lo que devuelve. Nueve de los diez sitios ya lo hacían;
 * el décimo es la razón de que esta prueba exista.
 * ============================================================================
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..', '..');

/** El servicio que lo define y el controlador que lo expone tal cual. */
const PROPIETARIOS = [
  join('finanzas', 'services', 'asientos-pendientes.service.ts'),
  join('finanzas', 'controllers', 'asientos-pendientes.controller.ts'),
];

function archivosTs(directorio: string): string[] {
  return readdirSync(directorio).flatMap((entrada) => {
    const ruta = join(directorio, entrada);
    if (statSync(ruta).isDirectory()) {
      if (entrada === 'migrations' || entrada === 'node_modules') return [];
      return archivosTs(ruta);
    }
    if (!entrada.endsWith('.ts') || entrada.endsWith('.spec.ts')) return [];
    return [ruta];
  });
}

describe('nadie da por generado un asiento sin mirar la respuesta', () => {
  const llamadas: Array<{ archivo: string; linea: number; usaRespuesta: boolean }> =
    [];

  for (const ruta of archivosTs(RAIZ)) {
    const relativa = ruta.slice(RAIZ.length + 1);
    if (PROPIETARIOS.some((p) => relativa.endsWith(p))) continue;
    const lineas = readFileSync(ruta, 'utf8').split('\n');
    lineas.forEach((linea, i) => {
      if (!/\breintentarAhora\s*\(/.test(linea)) return;
      /*
       * Usar la respuesta significa recogerla: `const x = await …`,
       * `x = await …`, `? await …`, o devolverla. Lo que no vale es
       * `await this.asientos.reintentarAhora(...)` a secas, que descarta el
       * `{ generado: false }` y deja al llamador creyendo que salió bien.
       */
      const usaRespuesta = /(=|return|\?|:)\s*(await\s+)?[\w.]*reintentarAhora\s*\(/.test(
        linea,
      );
      llamadas.push({ archivo: relativa, linea: i + 1, usaRespuesta });
    });
  }

  it('encuentra las llamadas que hay que revisar', () => {
    // Si el reconocimiento se rompe, la prueba se volvería verde por vacía.
    expect(llamadas.length).toBeGreaterThanOrEqual(8);
  });

  it('todas recogen lo que devuelve', () => {
    const aCiegas = llamadas
      .filter((l) => !l.usaRespuesta)
      .map(
        (l) =>
          `${l.archivo}:${l.linea} descarta la respuesta; lee \`generado\` en vez de confiar en que no lanzó`,
      );

    expect(aCiegas).toEqual([]);
  });
});
