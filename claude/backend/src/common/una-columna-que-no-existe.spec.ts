/**
 * ============================================================================
 * Una columna que no existe
 * ----------------------------------------------------------------------------
 * `alias-sql-en-camello.spec.ts` caza el defecto silencioso: el alias que
 * vuelve en minúsculas y se lee como `undefined`. Esta prueba caza el ruidoso:
 * la consulta cruda que nombra una columna que la entidad no tiene.
 *
 * Es ruidoso pero no siempre se oye. `hoteleria` guarda sus columnas en
 * minúsculas por la estrategia de nombres, `importaciones_inventario` las
 * guarda con guion bajo (`empresa_id`, `estado_contable`) y las dos formas
 * conviven en el mismo archivo de consultas. Equivocarse de convención da un
 * `column ... does not exist` — y varios de estos `SELECT` viven dentro de un
 * `.catch(...)` que devuelve lista vacía, así que el error se convierte en
 * «no hay nada pendiente» y un control del cierre pasa sin haber medido nada.
 *
 * Lo que se comprueba: en toda consulta cruda cuyas tablas son todas
 * entidades conocidas, cada referencia `alias.columna` corresponde a una
 * columna declarada. No se revisan las referencias sin calificar porque no
 * pueden distinguirse de los alias de salida sin un analizador de SQL.
 * ============================================================================
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..');

function archivosTs(directorio: string, soloEntidades = false): string[] {
  return readdirSync(directorio).flatMap((entrada) => {
    const ruta = join(directorio, entrada);
    if (statSync(ruta).isDirectory()) {
      if (entrada === 'migrations' || entrada === 'node_modules') return [];
      return archivosTs(ruta, soloEntidades);
    }
    if (!entrada.endsWith('.ts') || entrada.endsWith('.spec.ts')) return [];
    if (soloEntidades && !entrada.endsWith('.entity.ts')) return [];
    return [ruta];
  });
}

/** tabla → columnas reales, leídas de los decoradores de cada entidad. */
function catalogoDeColumnas(): Map<string, Set<string>> {
  const mapa = new Map<string, Set<string>>();
  const decorador =
    /@(?:Column|PrimaryGeneratedColumn|PrimaryColumn|CreateDateColumn|UpdateDateColumn|DeleteDateColumn|VersionColumn)\(/g;

  for (const ruta of archivosTs(RAIZ, true)) {
    const fuente = readFileSync(ruta, 'utf8');
    const entidades = [...fuente.matchAll(/@Entity\(\s*'([^']+)'/g)];
    entidades.forEach((entidad, i) => {
      const desde = entidad.index! + entidad[0].length;
      const hasta =
        i + 1 < entidades.length ? entidades[i + 1].index! : fuente.length;
      const bloque = fuente.slice(desde, hasta);
      const columnas = mapa.get(entidad[1].toLowerCase()) ?? new Set<string>();

      decorador.lastIndex = 0;
      let d: RegExpExecArray | null;
      while ((d = decorador.exec(bloque))) {
        // Argumentos del decorador, con paréntesis equilibrados.
        let i2 = d.index + d[0].length;
        let profundidad = 1;
        while (i2 < bloque.length && profundidad > 0) {
          if (bloque[i2] === '(') profundidad++;
          else if (bloque[i2] === ')') profundidad--;
          i2++;
        }
        const argumentos = bloque.slice(d.index + d[0].length, i2 - 1);
        // Puede haber otros decoradores (@Index()) entre éste y la propiedad.
        const cola = bloque.slice(i2, i2 + 400);
        const propiedad = cola.match(
          /(?:\s|@[A-Za-z]+\([^)]*\)|@[A-Za-z]+)*\s*([A-Za-z_][A-Za-z0-9_]*)\s*[!?]?\s*:/,
        );
        if (!propiedad) continue;
        const nombre = argumentos.match(/name:\s*'([^']+)'/);
        columnas.add((nombre ? nombre[1] : propiedad[1]).toLowerCase());
      }
      for (const j of bloque.matchAll(/@JoinColumn\(\{\s*name:\s*'([^']+)'/g)) {
        columnas.add(j[1].toLowerCase());
      }
      mapa.set(entidad[1].toLowerCase(), columnas);
    });
  }
  return mapa;
}

const PALABRAS_SQL = new Set(
  `select from where and or not in is null as join left right inner outer full on group by
   order having limit offset union all distinct case when then else end count sum avg min max
   coalesce cast int date timestamp timestamptz numeric decimal varchar text boolean uuid true
   false insert into values update set delete exists between like ilike abs round extract
   interval current_timestamp current_date now lateral with returning conflict do nothing over
   partition row_number rank string_agg array_agg jsonb json to_char to_date nullif greatest
   least length trim upper lower concat substring position cross using natural only for share
   of skip locked first last nulls filter asc desc`
    .split(/\s+/)
    .filter(Boolean),
);

describe('ninguna consulta cruda nombra una columna inexistente', () => {
  const catalogo = catalogoDeColumnas();

  it('reconoce el catálogo de entidades del proyecto', () => {
    expect(catalogo.size).toBeGreaterThan(100);
    expect(catalogo.get('registros_auditoria')).toContain('hashregistro');
    expect(catalogo.get('importaciones_inventario')).toContain('estado_contable');
  });

  const revisadas: string[] = [];
  const hallazgos: string[] = [];
  let referencias = 0;

  for (const ruta of archivosTs(RAIZ)) {
    const fuente = readFileSync(ruta, 'utf8');
    for (const bloque of fuente.matchAll(/`([^`]*)`/g)) {
      const sql = bloque[1];
      if (!/\bSELECT\b[\s\S]*\bFROM\b/i.test(sql)) continue;
      // Las consultas al catálogo del motor y las armadas por interpolación
      // no se pueden comprobar contra las entidades.
      if (/information_schema|pg_catalog|\$\{/i.test(sql)) continue;

      const tablas = [
        ...sql.matchAll(/\b(?:FROM|JOIN|UPDATE|INTO)\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi),
      ].map((t) => t[1].toLowerCase());
      const conocidas = tablas.filter((t) => catalogo.has(t));
      // Sólo se juzga la consulta cuando TODAS sus tablas son entidades: si
      // alguna es un CTE o una tabla sin entidad, el universo de columnas
      // estaría incompleto y cualquier hallazgo sería falso.
      if (!conocidas.length || conocidas.length !== tablas.length) continue;

      const universo = new Set<string>();
      for (const t of conocidas) {
        for (const c of catalogo.get(t)!) universo.add(c);
      }
      const alias = new Set(
        [
          ...sql.matchAll(
            /\b(?:FROM|JOIN)\s+"?[a-zA-Z_][a-zA-Z0-9_]*"?\s+(?:AS\s+)?([a-zA-Z_][a-zA-Z0-9_]*)/gi,
          ),
        ]
          .map((a) => a[1].toLowerCase())
          .filter((a) => !PALABRAS_SQL.has(a)),
      );

      const limpio = sql.replace(/--[^\n]*/g, '').replace(/'[^']*'/g, ' ');
      const linea = fuente.slice(0, bloque.index!).split('\n').length;
      revisadas.push(`${ruta}:${linea}`);

      for (const r of limpio.matchAll(
        /\b([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)\b/g,
      )) {
        const prefijo = r[1].toLowerCase();
        const columna = r[2].toLowerCase();
        if (!alias.has(prefijo) && !catalogo.has(prefijo)) continue;
        if (PALABRAS_SQL.has(columna)) continue;
        referencias++;
        if (!universo.has(columna)) {
          hallazgos.push(
            `${ruta.slice(RAIZ.length + 1)}:${linea} → ${r[1]}.${r[2]} no es una columna de ${conocidas.join(', ')}`,
          );
        }
      }
    }
  }

  it('revisa un número significativo de consultas', () => {
    // Si un cambio rompe el reconocimiento de tablas, la prueba se volvería
    // verde por no mirar nada. Estos mínimos lo impiden.
    expect(revisadas.length).toBeGreaterThanOrEqual(80);
    expect(referencias).toBeGreaterThanOrEqual(300);
  });

  it('no encuentra ninguna referencia a una columna que no existe', () => {
    expect(hallazgos).toEqual([]);
  });
});
