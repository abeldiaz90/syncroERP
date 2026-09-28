import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * Lo que la pantalla no manda y el servidor exige
 * ----------------------------------------------------------------------------
 * LA FAMILIA
 *
 * Es el defecto que más veces ha aparecido en este proyecto, siempre con otro
 * disfraz y siempre igual por dentro: **el servidor pide un dato que la
 * pantalla no tiene dónde escribir**. Y no falla a medias — falla SIEMPRE, con
 * cualquier rol, en el camino más transitado:
 *
 *  · Mover una oportunidad a «perdida» contestaba 400 con cualquier usuario,
 *    porque el servidor exige el motivo de la pérdida y el tablero mandaba
 *    sólo `{ etapaId }`. Perder oportunidades es más frecuente que ganarlas:
 *    era el camino más usado del módulo y estaba cerrado.
 *  · El alta de clientes, igual.
 *  · El rechazo de una limpieza, igual.
 *
 * Los tres se encontraron a mano, uno por uno, pulsando botones. Esta prueba
 * los busca todos a la vez, y lo hace ANTES de que nadie pulse nada.
 *
 * CÓMO
 *
 * Cruza dos cosas que hoy viven separadas:
 *
 *  1. Los DTO del backend. Una propiedad con decoradores de validación y sin
 *     `@IsOptional()` —y sin `?`— es obligatoria: el `ValidationPipe` global
 *     rechaza el cuerpo que no la traiga.
 *  2. Las llamadas del frontend con cuerpo literal: `api.post('/ruta', { … })`.
 *
 * Y se queda callada donde no puede afirmar nada: si el cuerpo trae un
 * `...spread`, si la URL casa con más de una ruta, o si el manejador no tipa
 * con una clase DTO, no se revisa. Una prueba que grita en falso es una prueba
 * que alguien acaba borrando, y entonces no protege de nada.
 *
 * Medida el 28-sep-2026: 40 pares cruzados, ninguno incompleto. Lo que fija es
 * que siga siendo así.
 * ============================================================================
 */

const BACK = join(__dirname, '..');
const RAIZ = join(BACK, '..', '..');
const FRONTEND = ['syncro-erp-frontend', 'frontend', '../syncro-erp-frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

function archivos(dir: string, acepta: (n: string) => boolean, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === '.next') continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) archivos(ruta, acepta, acc);
    else if (acepta(nombre)) acc.push(ruta);
  }
  return acc;
}

/**
 * Las propiedades que un DTO exige.
 *
 * Se recorre LÍNEA A LÍNEA y no con una expresión sobre el bloque entero. La
 * primera versión buscaba `nombre: tipo` en cualquier parte y se tragaba las
 * opciones de los propios decoradores —el `message` de un `@IsString({message:
 * …})`, el `maxDecimalPlaces` de un `@IsNumber(…)`, la `o` de una arrow—, con
 * lo que inventó cuatro obligatorias que no existen y produjo cuatro hallazgos
 * falsos. Se anota porque es la trampa de este tipo de prueba.
 */
function dtosDelBackend(): Map<string, string[]> {
  const dtos = new Map<string, string[]>();
  for (const archivo of archivos(BACK, (n) => n.endsWith('.dto.ts'))) {
    const texto = readFileSync(archivo, 'utf8');
    for (const bloque of texto.split(/export class /).slice(1)) {
      const nombre = bloque.match(/^(\w+)/)?.[1];
      if (!nombre) continue;
      const cuerpo = bloque.slice(bloque.indexOf('{') + 1);
      const obligatorias: string[] = [];
      let decoradores = '';
      let nivel = 0;
      for (const linea of cuerpo.split('\n')) {
        const abre = (linea.match(/[({[]/g) ?? []).length;
        const cierra = (linea.match(/[)}\]]/g) ?? []).length;
        const veniaAbierto = nivel > 0;
        nivel += abre - cierra;
        if (veniaAbierto || /^\s*@/.test(linea)) {
          decoradores += `${linea}\n`;
          continue;
        }
        const m = linea.match(/^\s*(?:readonly\s+)?(\w+)\s*([?!])?\s*:\s*\S/);
        if (!m) {
          if (linea.trim()) decoradores = '';
          continue;
        }
        const opcional = m[2] === '?' || /@IsOptional\(/.test(decoradores);
        const validada = /@Is|@Type|@Validate|@Min|@Max|@Length|@Matches/.test(decoradores);
        decoradores = '';
        if (validada && !opcional) obligatorias.push(m[1]);
      }
      dtos.set(nombre, obligatorias);
    }
  }
  return dtos;
}

type Ruta = { metodo: string; patron: string; dto: string };

function rutasConCuerpo(): Ruta[] {
  const rutas: Ruta[] = [];
  for (const archivo of archivos(BACK, (n) => n.endsWith('.controller.ts'))) {
    const texto = readFileSync(archivo, 'utf8');
    const prefijo = texto.match(/@Controller\(\s*'([^']*)'/)?.[1] ?? '';
    const lineas = texto.split('\n');
    for (let i = 0; i < lineas.length; i += 1) {
      const m = lineas[i].match(/@(Post|Patch|Put)\(\s*(?:'([^']*)')?\s*\)/);
      if (!m) continue;
      let dto: string | null = null;
      for (let j = i + 1; j < Math.min(i + 26, lineas.length); j += 1) {
        if (/@(Post|Patch|Put|Get|Delete)\(/.test(lineas[j])) break;
        const b = lineas[j].match(/@Body\(\s*\)\s*\w+\s*[?!]?\s*:\s*(\w+Dto)/);
        if (b) {
          dto = b[1];
          break;
        }
      }
      if (!dto) continue;
      rutas.push({
        metodo: m[1].toUpperCase(),
        patron: `/${[prefijo, m[2] ?? ''].filter(Boolean).join('/')}`.replace(/\/+/g, '/'),
        dto,
      });
    }
  }
  return rutas;
}

/** Las llaves de primer nivel de un objeto literal, o null si no se puede. */
function llavesDe(texto: string, desde: number): { nombres: string[]; spread: boolean } | null {
  let nivel = 0;
  let i = desde;
  for (; i < texto.length; i += 1) {
    const c = texto[i];
    if (c === '{' || c === '[' || c === '(') nivel += 1;
    else if (c === '}' || c === ']' || c === ')') {
      nivel -= 1;
      if (nivel === 0) break;
    }
  }
  if (nivel !== 0) return null;
  const interior = texto.slice(desde + 1, i);
  const trozos: string[] = [];
  let actual = '';
  let n = 0;
  for (const c of interior) {
    if (c === '{' || c === '[' || c === '(') n += 1;
    else if (c === '}' || c === ']' || c === ')') n -= 1;
    if (c === ',' && n === 0) {
      trozos.push(actual);
      actual = '';
    } else actual += c;
  }
  trozos.push(actual);
  return {
    nombres: trozos
      .map((x) => x.trim().match(/^([A-Za-z_]\w*)\s*[:,]?/)?.[1])
      .filter((x): x is string => !!x),
    spread: interior.includes('...'),
  };
}

describe('lo que la pantalla no manda y el servidor exige', () => {
  if (!FRONTEND) {
    it('se salta: el frontend no está junto al backend', () => {
      expect(true).toBe(true);
    });
    return;
  }

  const dtos = dtosDelBackend();
  const rutas = rutasConCuerpo();
  const incompletas: string[] = [];
  let cruzados = 0;

  for (const archivo of [
    ...archivos(join(FRONTEND, 'app'), (n) => /\.tsx?$/.test(n)),
    ...archivos(join(FRONTEND, 'components'), (n) => /\.tsx?$/.test(n)),
  ]) {
    const texto = readFileSync(archivo, 'utf8');
    const re = /api\.(post|patch|put)\s*<?[^(]*\(\s*([`'])([^`']*)\2\s*,\s*\{/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(texto))) {
      const metodo = m[1].toUpperCase();
      const url = m[3];
      const cuerpo = llavesDe(texto, re.lastIndex - 1);
      // Con un spread no se sabe qué llaves acaban dentro: no se afirma nada.
      if (!cuerpo || cuerpo.spread) continue;

      const segmentos = url.replace(/\$\{[^}]*\}/g, '*').split('/').filter(Boolean);
      const candidatas = rutas.filter((r) => {
        if (r.metodo !== metodo) return false;
        const suyos = r.patron.split('/').filter(Boolean);
        if (suyos.length !== segmentos.length) return false;
        return suyos.every((s, k) => s.startsWith(':') || s === segmentos[k] || segmentos[k] === '*');
      });
      // Ambigua o desconocida: tampoco se afirma nada.
      if (candidatas.length !== 1) continue;
      const obligatorias = dtos.get(candidatas[0].dto);
      if (!obligatorias) continue;

      cruzados += 1;
      const faltan = obligatorias.filter((p) => !cuerpo.nombres.includes(p));
      if (faltan.length) {
        incompletas.push(
          `${archivo.slice(FRONTEND.length + 1)} · ${metodo} ${url} → ${candidatas[0].dto} ` +
            `exige ${faltan.join(', ')} y la pantalla manda ${cuerpo.nombres.join(', ') || 'nada'}`,
        );
      }
    }
  }

  it('cruza pantallas con rutas de verdad (si no, la prueba no prueba nada)', () => {
    /*
     * El número importa: si un cambio de estilo en el frontend —otro
     * ayudante, otra forma de escribir la llamada— dejara de casar, esta
     * prueba se volvería verde por vacía y nadie lo notaría.
     */
    expect(cruzados).toBeGreaterThanOrEqual(30);
  });

  it('ninguna pantalla manda un cuerpo al que le falta lo obligatorio', () => {
    expect(incompletas).toEqual([]);
  });
});
