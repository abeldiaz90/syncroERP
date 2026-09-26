import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

/**
 * ============================================================================
 * Un BIGINT de PostgreSQL llega como texto, y «texto + 1» concatena
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ, medido el 26-sep-2026 contra la instalación
 *
 * El folio de los movimientos de tesorería se calculaba así:
 *
 *   .select('MAX(CAST(SUBSTRING(m.folio, 4, 12) AS BIGINT))', 'maximo')
 *   return `TM-${String((fila?.maximo ?? 0) + 1).padStart(8, '0')}`;
 *
 * `node-postgres` devuelve BIGINT como `string` —no cabe en un `number` de
 * JavaScript, así que no lo convierte—. Y en JavaScript `'1' + 1` no es 2: es
 * `'11'`. La progresión no sale mal de vez en cuando; se dispara y se queda
 * clavada:
 *
 *   TM-00000001 → '1'+1='11'   → TM-00000011
 *   TM-00000011 → '11'+1='111' → TM-00000111
 *   …
 *   TM-1111111111111 → '111111111111'+1 = '1111111111111' → el MISMO
 *
 * A partir de los trece unos `SUBSTRING(...,4,12)` corta a doce, se le pega un
 * uno y vuelve a salir trece: un punto fijo. Los doce movimientos de la cuenta
 * «Caja mostrador (UAT)» tenían el mismo folio, y el reporte de conciliación
 * los listaba como doce renglones con el mismo número de documento.
 *
 * POR QUÉ SÓLO ÉSE
 *
 * Los otros generadores de folio del sistema —activos `AF-`, oportunidades
 * `OPP-`, empleados— castean a `INT`, y `int4` sí llega como número. La
 * diferencia entre funcionar y no funcionar era la palabra BIGINT.
 *
 * QUÉ CUIDA ESTA PRUEBA
 *
 * Que ningún valor casteado a BIGINT —o a `numeric`, que llega igual— se use
 * sin pasar por `Number(...)` en la misma función. No mide estilo: mide la
 * diferencia entre sumar y concatenar.
 * ============================================================================
 */

const SRC = join(__dirname, '..');

function archivos(dir: string, acumulado: string[] = []): string[] {
  if (!existsSync(dir)) return acumulado;
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules') continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) archivos(ruta, acumulado);
    else if (/\.ts$/.test(nombre) && !/\.spec\.ts$/.test(nombre)) {
      acumulado.push(ruta);
    }
  }
  return acumulado;
}

const sinComentarios = (texto: string) =>
  texto.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

/** El cuerpo del método que contiene la posición `pos`, contando llaves. */
function metodoQueContiene(texto: string, pos: number): string {
  /* Se busca hacia atrás la apertura de bloque más cercana que no se haya
     cerrado antes de `pos`, y se avanza hasta su cierre. */
  let nivel = 0;
  let inicio = -1;
  for (let i = pos; i >= 0; i--) {
    if (texto[i] === '}') nivel++;
    else if (texto[i] === '{') {
      if (nivel === 0) {
        inicio = i;
        break;
      }
      nivel--;
    }
  }
  if (inicio < 0) return texto;
  let profundidad = 0;
  for (let i = inicio; i < texto.length; i++) {
    if (texto[i] === '{') profundidad++;
    else if (texto[i] === '}') {
      profundidad--;
      if (profundidad === 0) return texto.slice(inicio, i + 1);
    }
  }
  return texto.slice(inicio);
}

const CASTEO_GRANDE = /AS\s+BIGINT|::\s*bigint|AS\s+NUMERIC|::\s*numeric/gi;

describe('SQL · un BIGINT llega como texto', () => {
  const fuentes = archivos(SRC).map((ruta) => ({
    ruta: relative(SRC, ruta).split(sep).join('/'),
    texto: sinComentarios(readFileSync(ruta, 'utf8')),
  }));

  it('el barrido encuentra código que medir', () => {
    expect(fuentes.length).toBeGreaterThan(50);
  });

  it('ningún valor casteado a BIGINT se usa sin Number(...)', () => {
    const crudos: string[] = [];

    for (const { ruta, texto } of fuentes) {
      CASTEO_GRANDE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = CASTEO_GRANDE.exec(texto))) {
        const cuerpo = metodoQueContiene(texto, m.index);
        /*
         * Si el método no hace aritmética con el resultado, no hay nada que
         * romper: contar y comparar con `>` funciona igual sobre texto.
         * Lo que rompe es sumar, restar o incrementar.
         */
        const haceAritmetica = /\)\s*[+\-*]\s*\d|\?\?\s*0\)\s*\+|\+\s*1\s*\)|\breduce\s*\(/.test(
          cuerpo,
        );
        if (!haceAritmetica) continue;
        if (/Number\s*\(/.test(cuerpo)) continue;
        if (/parseInt\s*\(|parseFloat\s*\(/.test(cuerpo)) continue;
        crudos.push(`${ruta} → ${m[0]} sin Number(...) en el método que lo usa`);
      }
    }

    expect([...new Set(crudos)].sort()).toEqual([]);
  });
});
