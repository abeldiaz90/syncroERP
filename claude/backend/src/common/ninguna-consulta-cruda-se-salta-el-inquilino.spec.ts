import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * Ninguna consulta cruda se salta el inquilino
 * ----------------------------------------------------------------------------
 * POR QUÉ ESTO Y NO OTRA COSA
 *
 * El aislamiento entre empresas lo sostiene, en casi todo el ERP, el `where`
 * que TypeORM arma con `empresaId`. Hay un sitio donde ese sostén no existe:
 * **el SQL escrito a mano**. `repo.query(...)` va directo a Postgres, y si el
 * texto no nombra la empresa, devuelve las filas de todas.
 *
 * Un fallo así no da error, no aparece en ninguna pantalla roja y no lo caza
 * ninguna prueba de las que comprueban que una operación hace lo que dice:
 * hace lo que dice, y además de más. Se descubre el día que un cliente ve en un
 * reporte un dato que no es suyo, y ese día ya no hay vuelta atrás.
 *
 * Barrido del 10-oct-2026: **86 tablas con `empresaId`**, y todo el SQL crudo
 * que toca alguna nombra la empresa, salvo las excepciones de abajo, que son
 * legítimas y están explicadas una por una. Esta prueba existe para que ese
 * resultado siga siendo cierto mañana.
 *
 * CÓMO LO MIDE
 *
 * Las tablas con inquilino no se escriben a mano: se leen de las entidades que
 * declaran `empresaId`. Una lista paralela envejece, y el día que nazca la
 * tabla 87 nadie se acordaría de añadirla aquí — que es exactamente cuando
 * haría falta.
 * ============================================================================
 */

const RAIZ = join(__dirname, '..');

/**
 * SQL crudo que toca una tabla con inquilino y NO nombra la empresa, a
 * propósito. Cada entrada lleva su razón: sin razón escrita, una excepción es
 * un agujero con permiso.
 */
const JUSTIFICADAS: Record<string, string> = {
  'integracion/services/alta-empresas.service.ts':
    'La reserva de inquilinos del core es un almacén COMÚN de la instalación, no de ' +
    'una empresa: son los tenants libres que todavía no se le han asignado a nadie. ' +
    'Filtrar por empresa aquí devolvería siempre vacío y el alta no encontraría ' +
    'ninguno que entregar.',
};

function archivos(dir: string, salida: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      /* Las migraciones y los sembradores de demo no atienden peticiones. */
      if (['node_modules', 'migrations', 'commands'].includes(entrada)) continue;
      archivos(ruta, salida);
      continue;
    }
    if (!entrada.endsWith('.ts') || entrada.endsWith('.spec.ts')) continue;
    salida.push(ruta);
  }
  return salida;
}

const TODOS = archivos(RAIZ);

/** Las tablas que pertenecen a una empresa, leídas de las entidades. */
const TABLAS_CON_INQUILINO: string[] = (() => {
  const tablas = new Set<string>();
  for (const ruta of TODOS) {
    if (!ruta.endsWith('.entity.ts')) continue;
    const texto = readFileSync(ruta, 'utf8');
    if (!/empresaId\s*[!?]?\s*:/.test(texto)) continue;
    const m = texto.match(/@Entity\(\s*['"]([^'"]+)['"]/);
    if (m) tablas.add(m[1].toLowerCase());
  }
  return [...tablas];
})();

describe('ninguna consulta cruda se salta el inquilino', () => {
  it('las tablas con inquilino se leen de las entidades, no de una lista', () => {
    /*
     * Si esto bajara de golpe, el detector de abajo dejaría de mirar casi nada
     * y seguiría en verde: una prueba que no puede fallar es peor que no
     * tenerla.
     */
    expect(TABLAS_CON_INQUILINO.length).toBeGreaterThanOrEqual(80);
  });

  it('todo el SQL escrito a mano sobre una tabla de empresa nombra la empresa', () => {
    const culpables: string[] = [];

    for (const ruta of TODOS) {
      const relativa = ruta.slice(RAIZ.length + 1).replace(/\\/g, '/');
      const texto = readFileSync(ruta, 'utf8');

      for (const m of texto.matchAll(/\.query\(\s*`([\s\S]{0,4000}?)`/g)) {
        const sql = m[1];
        const bajo = sql.toLowerCase();
        if (bajo.includes('empresa')) continue;

        const tocadas = TABLAS_CON_INQUILINO.filter((tabla) =>
          new RegExp(`\\b(from|join|update|into)\\s+"?${tabla}"?\\b`).test(bajo),
        );
        if (tocadas.length === 0) continue;
        if (JUSTIFICADAS[relativa]) continue;

        const linea = texto.slice(0, m.index).split('\n').length;
        culpables.push(`${relativa}:${linea} → ${tocadas.slice(0, 3).join(', ')}`);
      }
    }

    expect(culpables).toEqual([]);
  });

  it('cada excepción sigue existiendo y sigue explicada', () => {
    /*
     * Una excepción que sobrevive al archivo que la justificaba es una regla
     * relajada sin que nadie lo decidiera.
     */
    for (const [relativa, razon] of Object.entries(JUSTIFICADAS)) {
      expect(TODOS.some((r) => r.endsWith(relativa.replace(/\//g, require('path').sep))))
        .toBe(true);
      expect(razon.length).toBeGreaterThan(80);
    }
  });

  describe('la prueba de la prueba', () => {
    it('una consulta cruda sin empresa sobre una tabla de empresa se detecta', () => {
      const tabla = TABLAS_CON_INQUILINO[0];
      const conElDefecto = `SELECT * FROM ${tabla} WHERE activo = true`.toLowerCase();
      expect(conElDefecto.includes('empresa')).toBe(false);
      expect(
        new RegExp(`\\b(from|join|update|into)\\s+"?${tabla}"?\\b`).test(conElDefecto),
      ).toBe(true);
    });

    it('y la misma con el filtro puesto, no', () => {
      const tabla = TABLAS_CON_INQUILINO[0];
      const buena = `SELECT * FROM ${tabla} WHERE "empresaId" = $1`.toLowerCase();
      expect(buena.includes('empresa')).toBe(true);
    });
  });
});
