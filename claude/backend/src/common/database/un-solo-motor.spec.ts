/**
 * ============================================================================
 * Un solo motor de errores
 * ----------------------------------------------------------------------------
 * El ERP nació sobre SQL Server y hoy corre sobre PostgreSQL. `errores-sql.ts`
 * existe precisamente para que ningún servicio vuelva a preguntar por el
 * código crudo de un motor. Pero la migración se hizo archivo por archivo y
 * quedaron rezagados: `MarcaService.create` reconoce la clave duplicada con el
 * helper y `MarcaService.update`, diez líneas más abajo, seguía preguntando
 * `error.number === 2627`.
 *
 * El síntoma es el peor posible: no revienta. La comprobación simplemente es
 * siempre falsa sobre PostgreSQL, el `catch` cae al camino genérico y lo que
 * era una recuperación —«esta fila ya existe, úsala»— se convierte en un 500
 * por una operación que el motor rechazó por una razón perfectamente conocida.
 *
 * Esta prueba no mide un caso: barre el árbol. Si alguien escribe una
 * comprobación atada a un motor en cualquier servicio nuevo, aquí se cae.
 * ============================================================================
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..', '..');

/** Los únicos dos lugares donde un código de motor puede estar escrito. */
const PERMITIDOS = [
  join('common', 'database', 'errores-sql.ts'),
  join('common', 'filters', 'filtro-global-excepciones.ts'),
];

function archivosFuente(dir: string, acc: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      // Las migraciones son SQL de un motor concreto por definición.
      if (entrada === 'migrations' || entrada === 'node_modules') continue;
      archivosFuente(ruta, acc);
    } else if (entrada.endsWith('.ts') && !entrada.endsWith('.spec.ts')) {
      acc.push(ruta);
    }
  }
  return acc;
}

/** Códigos que sólo existen en SQL Server, y su equivalente en el helper. */
const CODIGOS_DE_MOTOR = [
  { patron: /\b2627\b/, helper: 'esViolacionUnicidad' },
  { patron: /\b2601\b/, helper: 'esViolacionUnicidad' },
  { patron: /\b547\b/, helper: 'esViolacionLlaveForanea' },
  { patron: /\b1205\b/, helper: 'esConflictoDeConcurrencia' },
  { patron: /\b23505\b/, helper: 'esViolacionUnicidad' },
  { patron: /\b23503\b/, helper: 'esViolacionLlaveForanea' },
];

describe('ningún servicio reconoce errores por el código crudo del motor', () => {
  const fuentes = archivosFuente(RAIZ);

  it('encuentra archivos que revisar', () => {
    expect(fuentes.length).toBeGreaterThan(100);
  });

  it('no queda ninguna comprobación atada a SQL Server ni a PostgreSQL', () => {
    const hallazgos: string[] = [];
    for (const ruta of fuentes) {
      const relativa = ruta.slice(RAIZ.length + 1);
      if (PERMITIDOS.some((p) => relativa.endsWith(p))) continue;
      const lineas = readFileSync(ruta, 'utf8').split('\n');
      lineas.forEach((linea, i) => {
        const limpia = linea.trim();
        if (limpia.startsWith('*') || limpia.startsWith('//')) return;
        for (const { patron, helper } of CODIGOS_DE_MOTOR) {
          if (patron.test(limpia)) {
            hallazgos.push(`${relativa}:${i + 1} → usa ${helper}(error)`);
          }
        }
      });
    }
    expect(hallazgos).toEqual([]);
  });
});
