/**
 * ============================================================================
 * Una sentencia por consulta cuando hay parámetros
 * ----------------------------------------------------------------------------
 * LO QUE PASÓ
 *
 *   PATCH /api/clientes/<id>/estado
 *   → 500 «No se pudo completar la operación en la base de datos.»
 *
 * Desactivar un cliente era imposible. Cualquier cliente, tuviera convenios o
 * no. La causa estaba en un `manager.query(...)` con DOS `UPDATE` separados por
 * `;` y parámetros `$1..$4`:
 *
 * PostgreSQL, en cuanto la consulta lleva parámetros, usa el protocolo
 * extendido, y ése admite UNA sentencia por mensaje. Contesta «cannot insert
 * multiple commands into a prepared statement» y TypeORM lo envuelve en un 500
 * genérico. El motivo sólo se veía en el log del contenedor de Postgres —igual
 * que el `bind message supplies 2 parameters` del cierre contable—, así que
 * desde el ERP el defecto era mudo.
 *
 * En SQL Server ese mismo código funciona. Por eso sobrevivió a la mudanza, y
 * por eso esto no es una prueba de dos sitios sino de una regla: mientras
 * queden restos de SQL Server en el árbol, la regla los encuentra sola.
 *
 * MIDE EL ÁRBOL ENTERO. Si mañana alguien escribe dos sentencias con
 * parámetros en otro servicio, esta prueba se pone roja antes de que un usuario
 * se encuentre el 500.
 * ============================================================================
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..');

function archivosTs(directorio: string): string[] {
  return readdirSync(directorio).flatMap((entrada) => {
    const ruta = join(directorio, entrada);
    if (statSync(ruta).isDirectory()) {
      // Las migraciones se ejecutan sin parámetros y usan bloques `DO $$`.
      if (entrada === 'migrations' || entrada === 'node_modules') return [];
      return archivosTs(ruta);
    }
    if (!entrada.endsWith('.ts') || entrada.endsWith('.spec.ts')) return [];
    return [ruta];
  });
}

/** Cada `…query(`…`)` del árbol, con su archivo y su línea. */
function consultasLiterales() {
  const encontradas: { ruta: string; linea: number; sql: string }[] = [];
  for (const ruta of archivosTs(RAIZ)) {
    const texto = readFileSync(ruta, 'utf8');
    const patron = /\.query\(\s*(?:\/\*[\s\S]*?\*\/\s*)*`([^`]*)`/g;
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

/**
 * Quita lo que puede contener un `;` sin ser un separador de sentencias:
 * cadenas, comentarios y bloques con comillas de dólar (`$$ … $$`).
 */
function sinFalsosPuntoYComa(sql: string): string {
  return sql
    .replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''");
}

describe('SQL · una sentencia por consulta cuando hay parámetros', () => {
  const consultas = consultasLiterales();

  it('encuentra las consultas del árbol (si no, no está midiendo nada)', () => {
    // Sin esto, un cambio en el patrón dejaría la prueba verde sin leer nada.
    expect(consultas.length).toBeGreaterThan(20);
  });

  it('ninguna consulta con parámetros lleva dos sentencias', () => {
    const culpables = consultas
      .filter((c) => /\$\d/.test(c.sql))
      .filter((c) => sinFalsosPuntoYComa(c.sql).trim().replace(/;+$/, '').includes(';'))
      .map((c) => `${c.ruta}:${c.linea}`);

    expect(culpables).toEqual([]);
  });

  it('ninguna consulta empieza con el `;WITH` de SQL Server', () => {
    /*
     * `;WITH` es idiomático en SQL Server y aquí convierte la consulta en dos
     * sentencias: una vacía y el WITH. Rompía el diagnóstico de City Ledger.
     */
    const culpables = consultas
      .filter((c) => /^\s*;/.test(c.sql))
      .map((c) => `${c.ruta}:${c.linea}`);

    expect(culpables).toEqual([]);
  });
});
