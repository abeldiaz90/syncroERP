import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * Toda tabla de empresa tiene su índice
 * ----------------------------------------------------------------------------
 * LO QUE SE MIDIÓ
 *
 * El 10-oct-2026, contra la base real: **21 tablas con `empresaId` y ningún
 * índice por esa columna**, `clientes` entre ellas. Es la columna por la que
 * filtra absolutamente todo en un sistema multiempresa: la lista de clientes de
 * una empresa recorría las filas de todas y descartaba las que no eran suyas.
 * Y **118 claves foráneas sin índice**.
 *
 * Hoy no duele —las tablas están casi vacías— y ése es justamente el problema:
 * un recorrido secuencial sobre cien filas tarda lo mismo que un índice, así
 * que nada avisa. Duele el día que hay muchas EMPRESAS, y para entonces el
 * síntoma —«va lento»— no apunta a ninguna línea de código.
 *
 * `1790860000000-LosIndicesQueNuncaSePusieron` los crea todos.
 *
 * QUÉ VIGILA ESTA PRUEBA
 *
 * Que la tabla 22 no nazca sin él. La lista de tablas no se escribe a mano: se
 * deduce de las entidades que declaran `empresaId`, y se comprueba que cada una
 * aparezca en alguna migración con un índice por esa columna. Una lista
 * paralela envejecería, y envejecería en silencio.
 * ============================================================================
 */

const RAIZ = join(__dirname, '..');
const MIGRACIONES = join(__dirname, 'migrations');

function archivos(dir: string, salida: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      if (entrada === 'node_modules') continue;
      archivos(ruta, salida);
      continue;
    }
    if (entrada.endsWith('.ts')) salida.push(ruta);
  }
  return salida;
}

/**
 * Tablas que pertenecen a una empresa, leídas de las entidades, y si la propia
 * entidad ya declara el índice.
 *
 * Las dos vías valen y hay que mirar las dos: un `@Index(['empresaId', …])` en
 * la entidad produce el índice igual que un `CREATE INDEX` en una migración.
 * Mirar sólo las migraciones daría sesenta falsos positivos, y una prueba que
 * grita sin motivo acaba silenciada — que es peor que no tenerla.
 */
const TABLAS_DE_EMPRESA: { tabla: string; indiceEnLaEntidad: boolean }[] = (() => {
  const salida = new Map<string, boolean>();
  for (const ruta of archivos(RAIZ)) {
    if (!ruta.endsWith('.entity.ts')) continue;
    const texto = readFileSync(ruta, 'utf8');
    if (!/empresaId\s*[!?]?\s*:/.test(texto)) continue;
    const m = texto.match(/@Entity\(\s*['"]([^'"]+)['"]/);
    if (!m) continue;

    /*
     * La primera columna es la que decide. Tres formas producen el mismo
     * índice y las tres cuentan: `@Index([...])`, `@Index('nombre', [...])` y
     * `@Unique([...])` — una restricción de unicidad crea su índice, y seis
     * tablas dependían sólo de eso.
     */
    const empiezaPorEmpresa = /\(\s*(['"][^'"]*['"]\s*,\s*)?\[\s*['"]empresaId['"]/;
    const porDecorador = [...texto.matchAll(/@(Index|Unique)\s*\(/g)].some((m) =>
      empiezaPorEmpresa.test(texto.slice(m.index, m.index + 160)),
    );

    /*
     * Y dos formas más que también producen el índice, y que costaron tres
     * vueltas de falsos positivos hasta que se las preguntó a la base en vez
     * de suponerlas:
     *
     *   · `@Column({ unique: true })` sobre `empresaId` — tablas de una fila
     *     por empresa, como la configuración fiscal.
     *   · `@PrimaryColumn()` sobre `empresaId` — clave primaria compuesta que
     *     empieza por la empresa, como las secuencias de folio.
     */
    const porColumna =
      /@Column\(\s*\{[^}]*unique:\s*true[^}]*\}\s*\)\s*\n\s*empresaId/.test(texto) ||
      /@PrimaryColumn\([^)]*\)\s*\n\s*empresaId/.test(texto);

    salida.set(m[1].toLowerCase(), porDecorador || porColumna);
  }
  return [...salida.entries()]
    .map(([tabla, indiceEnLaEntidad]) => ({ tabla, indiceEnLaEntidad }))
    .sort((a, b) => a.tabla.localeCompare(b.tabla));
})();

/** Todo el SQL de todas las migraciones, en minúsculas y en un solo texto. */
const SQL_DE_MIGRACIONES: string = archivos(MIGRACIONES)
  .map((r) => readFileSync(r, 'utf8'))
  .join('\n')
  .toLowerCase();

describe('toda tabla de empresa tiene su índice', () => {
  it('hay tablas que mirar', () => {
    /* Si el barrido no encontrara nada, lo de abajo pasaría vacío. */
    expect(TABLAS_DE_EMPRESA.length).toBeGreaterThanOrEqual(80);
    expect(TABLAS_DE_EMPRESA.map((t) => t.tabla)).toContain('clientes');
  });

  it('cada una tiene un índice por la columna del inquilino', () => {
    /*
     * Se acepta cualquier índice que empiece por `empresaid` —solo o como
     * primera columna de uno compuesto—, que es lo que Postgres puede usar
     * para filtrar por empresa.
     */
    const sinIndice = TABLAS_DE_EMPRESA.filter(({ tabla, indiceEnLaEntidad }) => {
      if (indiceEnLaEntidad) return false;
      const porIndice = new RegExp(
        `create\\s+(unique\\s+)?index[^;\`]*on\\s+"?${tabla}"?\\s*\\(\\s*"?empresaid"?`,
      );
      /* Una restricción de unicidad crea su índice igual que un CREATE INDEX. */
      const porUnicidad = new RegExp(
        `"?${tabla}"?[\\s\\S]{0,400}?unique\\s*\\(\\s*"?empresaid"?`,
      );
      return !porIndice.test(SQL_DE_MIGRACIONES) && !porUnicidad.test(SQL_DE_MIGRACIONES);
    }).map((t) => t.tabla);

    expect(sinIndice).toEqual([]);
  });

  it('el camino caliente del guardia de permisos está indexado', () => {
    /*
     * Es el único que corre en CADA petición. `rol_endpoint_permisos` crece
     * como empresas × roles × endpoints, así que es el primero que se degrada
     * al vender clientes — y el último sitio donde uno mira.
     */
    expect(SQL_DE_MIGRACIONES).toMatch(/on\s+"?endpoints"?\s*\(\s*"?metodo"?/);
    expect(SQL_DE_MIGRACIONES).toMatch(
      /on\s+"?rol_endpoint_permisos"?\s*\(\s*"?empresaid"?\s*,\s*"?endpoint_id"?/,
    );
  });

  it('dos permisos para el mismo rol sobre el mismo endpoint no pueden existir', () => {
    /*
     * Esto no es velocidad: dos filas son dos respuestas posibles a la misma
     * pregunta, y cuál gana depende del orden en que Postgres las devuelva.
     * Comprobado antes de crearlo que no había ninguna duplicada.
     */
    expect(SQL_DE_MIGRACIONES).toMatch(
      /create\s+unique\s+index[^;`]*on\s+"?rol_endpoint_permisos"?\s*\(\s*"?empresaid"?\s*,\s*"?rol"?\s*,\s*"?endpoint_id"?/,
    );
  });

  describe('la prueba de la prueba', () => {
    it('una tabla nueva sin índice se vería', () => {
      const patron = new RegExp(
        `create\\s+(unique\\s+)?index[^;\`]*on\\s+"?tabla_que_no_existe"?\\s*\\(\\s*"?empresaid"?`,
      );
      expect(patron.test(SQL_DE_MIGRACIONES)).toBe(false);
    });

    it('y la lista sale de las entidades, no de aquí', () => {
      const nombres = TABLAS_DE_EMPRESA.map((t) => t.tabla);
      expect(nombres).not.toContain('tabla_que_no_existe');
      expect(nombres.every((t) => /^[a-z0-9_]+$/.test(t))).toBe(true);
      /* Y las dos vías aparecen de verdad, no es una rama muerta. */
      expect(TABLAS_DE_EMPRESA.some((t) => t.indiceEnLaEntidad)).toBe(true);
      expect(TABLAS_DE_EMPRESA.some((t) => !t.indiceEnLaEntidad)).toBe(true);
    });
  });
});
