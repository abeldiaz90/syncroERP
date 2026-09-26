/**
 * ============================================================================
 * Un alias camelCase sin comillas es un `undefined` que nadie ve
 * ----------------------------------------------------------------------------
 * PostgreSQL pliega a minúsculas todo identificador que no venga
 * entrecomillado. Un `SELECT COUNT(1) totalPolizas` devuelve la llave
 * `totalpolizas`, así que `fila.totalPolizas` es `undefined` — y como casi
 * siempre viene rematado con `?? 0` o metido en un `Boolean(...)`, no explota:
 * produce un cero, un `false` o un blanco que parece un dato medido.
 *
 * Este proyecto lleva cuatro apariciones del mismo defecto, todas encontradas
 * de una en una y todas silenciosas:
 *
 *   · el diagnóstico del cierre informaba «totalPolizas: 0, cuadrada: true»
 *     sobre un mes con la nómina ya contabilizada (24-sep);
 *   · `empresa_identidad` era ilegible desde su nacimiento (24-sep);
 *   · la CADENA DE HASHES DE LA AUDITORÍA nunca encadenó: cada registro se
 *     guardaba con `hashAnterior = null` y el verificador acusaba de
 *     manipulación a una bitácora intacta (25-sep);
 *   · el auxiliar de tesorería de la conciliación inicial contestaba
 *     «no disponible» siempre, y ninguna cuenta bancaria salía «vinculada»
 *     (25-sep);
 *   · el diagnóstico histórico de City Ledger informaba 0 pólizas generadas y
 *     todo pendiente, dijeran lo que dijeran los datos (25-sep);
 *   · la verificación de preparación a producción de hotelería empujaba 19
 *     bloqueos fantasma de sus 26 comprobaciones (25-sep).
 *
 * Encontrarlos de uno en uno no escala: no fallan, no se registran en ningún
 * log y la pantalla enseña un número redondo. Esta prueba recorre el árbol
 * entero y los caza en el momento en que se escriben.
 *
 * REGLA: en una consulta cruda, todo alias con mayúsculas va entre comillas
 * dobles. Las REFERENCIAS a columnas van sin comillas —la columna real es
 * minúscula, por la estrategia de nombres— y eso está bien.
 * ============================================================================
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..');

function archivosTs(directorio: string): string[] {
  return readdirSync(directorio).flatMap((entrada) => {
    const ruta = join(directorio, entrada);
    if (statSync(ruta).isDirectory()) {
      // Las migraciones hablan con el esquema, no devuelven filas a JavaScript.
      if (entrada === 'migrations' || entrada === 'node_modules') return [];
      return archivosTs(ruta);
    }
    if (!entrada.endsWith('.ts') || entrada.endsWith('.spec.ts')) return [];
    return [ruta];
  });
}

type Consulta = { ruta: string; linea: number; sql: string };

function consultas(): Consulta[] {
  const encontradas: Consulta[] = [];
  for (const ruta of archivosTs(RAIZ)) {
    const texto = readFileSync(ruta, 'utf8');
    const patron = /\.query\(\s*(?:\/\*[\s\S]*?\*\/\s*|--[^\n]*\n\s*)*`([^`]*)`/g;
    let coincidencia: RegExpExecArray | null;
    while ((coincidencia = patron.exec(texto)) !== null) {
      encontradas.push({
        ruta: ruta.slice(RAIZ.length + 1).replace(/\\/g, '/'),
        linea: texto.slice(0, coincidencia.index).split('\n').length,
        sql: coincidencia[1],
      });
    }
  }
  return encontradas;
}

/** Quita comentarios y cadenas: ahí un `AS Algo` no es un alias. */
function sqlDesnudo(sql: string): string {
  return sql
    .replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''");
}

describe('SQL · los alias con mayúsculas van entre comillas', () => {
  const todas = consultas();

  it('encuentra las consultas del árbol (si no, no está midiendo nada)', () => {
    expect(todas.length).toBeGreaterThan(20);
  });

  it('ningún alias explícito (`AS algoAsi`) se queda sin comillas', () => {
    const culpables: string[] = [];
    for (const consulta of todas) {
      for (const m of sqlDesnudo(consulta.sql).matchAll(/\bAS\s+([A-Za-z_]\w*)/g)) {
        const alias = m[1];
        if (alias !== alias.toLowerCase()) {
          culpables.push(`${consulta.ruta}:${consulta.linea} → AS ${alias}`);
        }
      }
    }

    expect(culpables.sort()).toEqual([]);
  });

  it('ningún alias implícito (`COUNT(1) algoAsi`) se queda sin comillas', () => {
    /*
     * El implícito es el peligroso: se lee como si fuera parte de la expresión
     * y no salta a la vista. `CASE WHEN … END tieneCityLedger` fue justo éste.
     */
    const PALABRAS = new Set([
      'as', 'from', 'where', 'and', 'or', 'on', 'by', 'set', 'join', 'inner',
      'left', 'right', 'outer', 'group', 'order', 'having', 'when', 'then',
      'else', 'end', 'case', 'select', 'over', 'partition', 'union', 'all',
      'limit', 'offset', 'desc', 'asc', 'is', 'null', 'not', 'in', 'exists',
      'with', 'update', 'insert', 'into', 'values', 'delete', 'returning',
      'filter', 'distinct', 'using', 'cast', 'between', 'like', 'ilike',
    ]);
    /*
     * Palabras tras las cuales el identificador NO es un alias sino parte de la
     * cláusula: `GROUP BY clienteId`, `WHERE activo`, `FROM clientes`.
     *
     * `END` NO está aquí, y es deliberado: `CASE … END tieneCityLedger` es
     * justamente la forma peligrosa —el alias se lee como si fuera parte de la
     * expresión— y fue la que rompió el diagnóstico de City Ledger. Meter `END`
     * en esta lista dejaría la prueba verde sobre el defecto que vino a cazar.
     */
    const ANTES_NO_HAY_ALIAS = new Set([
      'by', 'where', 'and', 'or', 'on', 'set', 'from', 'into', 'select',
      'distinct', 'join', 'using', 'not', 'is', 'in', 'all', 'exists',
      'partition', 'order', 'group', 'having', 'when', 'then', 'else',
      'update', 'delete', 'values', 'returning', 'union', 'with', 'over',
    ]);
    const culpables: string[] = [];
    for (const consulta of todas) {
      const sql = sqlDesnudo(consulta.sql);
      if (!/\bSELECT\b/i.test(sql)) continue;
      for (const m of sql.matchAll(/(\w+|[)'"])\s+([a-z]+[A-Z]\w*)\s*(?=,\s*$|\s*$)/gm)) {
        const anterior = m[1];
        const alias = m[2];
        if (PALABRAS.has(alias.toLowerCase())) continue;
        /*
         * `GROUP BY clienteId` o `WHERE x` no son alias: el identificador
         * pertenece a la cláusula. Se mira la palabra inmediatamente anterior,
         * no un trozo de texto de longitud fija: la primera versión recortaba
         * a 40 caracteres terminando DENTRO del «BY» y no lo reconocía.
         */
        if (ANTES_NO_HAY_ALIAS.has(anterior.toLowerCase())) continue;
        culpables.push(`${consulta.ruta}:${consulta.linea} → ${alias}`);
      }
    }

    expect(culpables.sort()).toEqual([]);
  });
});

/**
 * ============================================================================
 * Y la segunda mitad de la regla, que descubrí tarde
 * ----------------------------------------------------------------------------
 * Las dos pruebas de arriba miran los ALIAS. Pero una columna **seleccionada
 * tal cual** tiene el mismo problema y no lleva alias que mirar:
 *
 *     SELECT cuentaContableId FROM cuentas_bancarias …
 *     rows[0].cuentaContableId   →  undefined
 *
 * La llave que devuelve PostgreSQL es `cuentacontableid`, y quien la lee desde
 * JavaScript la pide en camelCase. Lo encontré después de dar por cerrada la
 * primera tanda, y había NUEVE sitios más, entre ellos:
 *
 *   · el motor contable, que por eso mandaba a «Caja general» toda póliza que
 *     debía ir a la cuenta del banco o del TPV;
 *   · la declaración mensual de IVA, que informaba cero sobre un mes con
 *     movimientos;
 *   · el estado de cuenta del cliente, que LANZABA —`new Date(undefined)
 *     .toISOString()`— en cuanto el cliente tenía un pago;
 *   · la tarifa base de toda reservación de hotel, que nacía en cero;
 *   · los datos fiscales de la empresa en el diagnóstico, que salían
 *     «incompletos» estando completos.
 *
 * Así que la regla no es «los alias van entre comillas», es: **todo lo que
 * JavaScript vaya a leer por su nombre en camelCase tiene que salir de la
 * consulta con ese nombre, y para eso hay que entrecomillarlo.**
 *
 * Una columna que sólo se usa DENTRO del SQL —en un `GROUP BY`, en un `WHERE`
 * de la consulta exterior— no necesita nada, porque PostgreSQL pliega los dos
 * lados igual. Por eso la prueba mira sólo la lista del SELECT más externo.
 * ============================================================================
 */
describe('SQL · las columnas que lee JavaScript salen con su nombre', () => {
  const todas = consultas();

  /**
   * Consultas cuya lista de SELECT no la lee JavaScript: el resultado se usa
   * dentro del propio SQL (subconsultas, CTE) o sólo por su `length`. Cada una
   * con su razón, y la prueba avisa si sobra alguna.
   */
  const SOLO_DENTRO_DEL_SQL: Record<string, string> = {
    'configuracion/services/diagnostico-configuracion.service.ts':
      'Subconsultas de COUNT y GROUP BY; sólo se lee el total, que va en minúsculas.',
    'hoteleria/services/auditoria-nocturna.service.ts':
      'Sólo se usa `inconsistencia.length`: ninguna columna se lee por su nombre.',
    'hoteleria/services/city-ledger.service.ts':
      'La CTE de niveles se consume en el SELECT exterior, que sí lleva alias.',
  };

  it('ninguna columna camelCase se selecciona sin alias que la conserve', () => {
    const PALABRAS = new Set(['distinct', 'all', 'as']);
    const culpables: string[] = [];
    for (const consulta of todas) {
      const archivo = consulta.ruta;
      if (archivo in SOLO_DENTRO_DEL_SQL) continue;
      const sql = sqlDesnudo(consulta.sql).replace(/\s+/g, ' ');
      const lista = /\bSELECT\b(.*?)\bFROM\b/i.exec(sql)?.[1];
      if (!lista) continue;
      // Partir por comas de nivel cero: una función lleva las suyas dentro.
      const partes: string[] = [];
      let nivel = 0;
      let actual = '';
      for (const ch of lista) {
        if (ch === '(') nivel += 1;
        if (ch === ')') nivel -= 1;
        if (ch === ',' && nivel === 0) {
          partes.push(actual);
          actual = '';
        } else actual += ch;
      }
      partes.push(actual);

      for (const parte of partes) {
        const t = parte.trim();
        if (!t || t.includes('"')) continue;
        const m = /^(?:\w+\.)?([A-Za-z_]\w*)$/.exec(t);
        if (!m) continue;
        const columna = m[1];
        if (PALABRAS.has(columna.toLowerCase())) continue;
        if (columna !== columna.toLowerCase()) {
          culpables.push(`${archivo}:${consulta.linea} → ${t}`);
        }
      }
    }

    expect([...new Set(culpables)].sort()).toEqual([]);
  });

  it('no sobra ninguna excepción, y todas tienen motivo', () => {
    const archivos = new Set(todas.map((c) => c.ruta));
    const huerfanas = Object.keys(SOLO_DENTRO_DEL_SQL).filter(
      (ruta) => !archivos.has(ruta),
    );

    expect(huerfanas).toEqual([]);
    // Una excepción sin motivo escrito es una excepción que nadie revisó.
    const sinMotivo = Object.entries(SOLO_DENTRO_DEL_SQL)
      .filter(([, motivo]) => motivo.length <= 30)
      .map(([ruta]) => ruta);
    expect(sinMotivo).toEqual([]);
  });
});
