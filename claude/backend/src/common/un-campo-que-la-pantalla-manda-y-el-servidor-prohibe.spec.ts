import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

/**
 * ============================================================================
 * Un campo que la pantalla manda y el servidor prohíbe
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ, medido el 26-sep-2026
 *
 * La pantalla de reubicaciones internas pide un «Motivo» obligatorio, de al
 * menos cinco caracteres, y lo valida antes de enviar. El DTO del endpoint no
 * declaraba `motivo`. Y `main.ts` levanta el ValidationPipe así:
 *
 *     whitelist: true,
 *     forbidNonWhitelisted: true,
 *
 * o sea: cualquier campo no declarado NO se ignora, se rechaza. El formulario
 * completo y correcto contestaba
 *
 *     400 «motivo: property motivo should not exist»
 *
 * en cada intento. La pantalla no funcionaba nunca. No es que fallara a veces
 * ni en un caso raro: no se podía guardar una sola reubicación desde que la
 * pantalla existe, y por API no se ve porque quien llama al endpoint a mano
 * manda justo los campos del DTO.
 *
 * LA REGLA
 *
 * Lo que una pantalla envía y lo que el DTO acepta son la misma lista. Si el
 * formulario pide un dato, el DTO lo declara; si el DTO no lo quiere, la
 * pantalla no lo manda.
 *
 * QUÉ CUIDA ESTA PRUEBA
 *
 * Recorre las llamadas de escritura del frontend con cuerpo literal, resuelve
 * el DTO por la ruta del controlador y compara las claves. Sólo mide lo que
 * puede resolver sin adivinar: si la ruta no cae en un controlador conocido, o
 * el cuerpo lleva un `...spread`, esa llamada no se mide. Lo que sí mide, lo
 * mide de verdad.
 * ============================================================================
 */

const SRC = join(__dirname, '..');
const RAIZ = join(SRC, '..', '..');
const FRONTEND = ['syncro-erp-frontend', 'frontend', '../syncro-erp-frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

function archivos(dir: string, patron: RegExp, acumulado: string[] = []): string[] {
  if (!existsSync(dir)) return acumulado;
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === '.next') continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) archivos(ruta, patron, acumulado);
    else if (patron.test(nombre)) acumulado.push(ruta);
  }
  return acumulado;
}

const sinComentarios = (texto: string) =>
  texto.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

/** El texto entre el delimitador de apertura y su pareja, contando niveles. */
function bloque(texto: string, desde: number, abre: string, cierra: string): string {
  const inicio = texto.indexOf(abre, desde);
  if (inicio < 0) return '';
  let nivel = 0;
  for (let i = inicio; i < texto.length; i++) {
    if (texto[i] === abre) nivel++;
    else if (texto[i] === cierra) {
      nivel--;
      if (nivel === 0) return texto.slice(inicio + 1, i);
    }
  }
  return '';
}

/** Trocea un objeto literal en sus elementos de primer nivel. */
function partes(cuerpo: string): string[] {
  const salida: string[] = [];
  let nivel = 0;
  let actual = '';
  for (const c of cuerpo) {
    if ('([{'.includes(c)) nivel++;
    else if (')]}'.includes(c)) nivel--;
    if (c === ',' && nivel === 0) {
      salida.push(actual);
      actual = '';
      continue;
    }
    actual += c;
  }
  if (actual.trim()) salida.push(actual);
  return salida;
}

/** Las claves de primer nivel de un objeto literal, atajo `{ x }` incluido. */
function clavesDe(cuerpo: string): string[] {
  const claves: string[] = [];
  for (const parte of partes(cuerpo)) {
    const limpia = parte.trim();
    if (!limpia || limpia.startsWith('...')) continue;
    const conValor = /^([a-zA-Z_]\w*)\s*:/.exec(limpia);
    if (conValor) {
      claves.push(conValor[1]);
      continue;
    }
    // `{ cantidad }` es `cantidad: cantidad`.
    const atajo = /^([a-zA-Z_]\w*)$/.exec(limpia);
    if (atajo) claves.push(atajo[1]);
  }
  return claves;
}

/** Los identificadores esparcidos con `...X` en el primer nivel. */
function spreadsDe(cuerpo: string): string[] {
  return partes(cuerpo)
    .map((parte) => /^\.\.\.([a-zA-Z_]\w*)$/.exec(parte.trim())?.[1])
    .filter((x): x is string => Boolean(x));
}

/** Quita los decoradores `@Algo(...)` de un cuerpo de clase. */
function sinDecoradores(cuerpo: string): string {
  let salida = '';
  for (let i = 0; i < cuerpo.length; i++) {
    if (cuerpo[i] !== '@') {
      salida += cuerpo[i];
      continue;
    }
    let j = i + 1;
    while (j < cuerpo.length && /[\w.]/.test(cuerpo[j])) j++;
    while (j < cuerpo.length && /\s/.test(cuerpo[j])) j++;
    if (cuerpo[j] === '(') {
      let nivel = 0;
      for (; j < cuerpo.length; j++) {
        if (cuerpo[j] === '(') nivel++;
        else if (cuerpo[j] === ')') {
          nivel--;
          if (nivel === 0) {
            j++;
            break;
          }
        }
      }
    }
    salida += '\n';
    i = j - 1;
  }
  return salida;
}

/* ── 1. Los DTO y sus campos ─────────────────────────────────────────────── */

interface Dto {
  props: Set<string>;
  padre: string | null;
}

const DTOS = new Map<string, Dto>();

for (const ruta of archivos(SRC, /\.dto\.ts$/)) {
  const texto = sinComentarios(readFileSync(ruta, 'utf8'));
  const clases = /(?:export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = clases.exec(texto))) {
    const cuerpo = bloque(texto, m.index + m[0].length - 1, '{', '}');
    const props = new Set<string>();
    /*
     * Primero fuera los decoradores. Un `@EsJustificacion({ cuandoFalta: '…' })`
     * lleva dentro dos puntos y comas, y cualquier patrón que busque
     * `nombre: tipo` sobre el texto crudo se traga la propiedad que viene
     * detrás: así fue como la primera versión de esta prueba «no encontró»
     * `motivo` en `AnularVentaDto`, que lo declara con todas sus letras.
     */
    const campos = /(?:^|\n)\s*(?:readonly\s+)?([a-zA-Z_]\w*)\s*[?!]?\s*[:=]/g;
    let c: RegExpExecArray | null;
    const limpio = sinDecoradores(cuerpo);
    while ((c = campos.exec(limpio))) props.add(c[1]);
    DTOS.set(m[1], { props, padre: m[2] ?? null });
  }
}

/** Los campos de un DTO, incluidos los que hereda. */
function camposDe(nombre: string, vistos = new Set<string>()): Set<string> | null {
  if (vistos.has(nombre)) return new Set();
  vistos.add(nombre);
  const dto = DTOS.get(nombre);
  if (!dto) return null;
  const propios = new Set(dto.props);
  if (dto.padre) {
    const heredados = camposDe(dto.padre, vistos);
    if (!heredados) return null; // padre desconocido: no se mide a ciegas
    heredados.forEach((p) => propios.add(p));
  }
  return propios;
}

/* ── 2. Las rutas de escritura y el DTO de cada una ──────────────────────── */

const normalizar = (ruta: string) =>
  ('/' + ruta.replace(/^\/+|\/+$/g, ''))
    .replace(/\/:[^/]+/g, '/:id')
    .replace(/\/+/g, '/');

const RUTAS = new Map<string, string>(); // 'POST /catalogo/wms/reubicaciones' → 'ReubicarStockWmsDto'

for (const ruta of archivos(SRC, /\.controller\.ts$/)) {
  const texto = sinComentarios(readFileSync(ruta, 'utf8'));
  const prefijo = /@Controller\(\s*['"`]([^'"`]*)['"`]/.exec(texto)?.[1] ?? '';
  const metodos = /@(Post|Patch|Put)\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)([\s\S]{0,600}?)\{/g;
  let m: RegExpExecArray | null;
  while ((m = metodos.exec(texto))) {
    const firma = m[3];
    // `@Body('campo')` recibe un solo valor: no hay DTO que comparar.
    if (/@Body\(\s*['"`]/.test(firma)) continue;
    const dto = /@Body\(\s*\)\s*\w+\s*:\s*(\w+)/.exec(firma)?.[1];
    if (!dto) continue;
    RUTAS.set(`${m[1].toUpperCase()} ${normalizar(`${prefijo}/${m[2] ?? ''}`)}`, dto);
  }
}

/* ── 3. Lo que manda cada pantalla ───────────────────────────────────────── */

interface Llamada {
  archivo: string;
  metodo: string;
  ruta: string;
  claves: string[];
}

function llamadas(): Llamada[] {
  if (!FRONTEND) return [];
  const encontradas: Llamada[] = [];
  for (const ruta of archivos(join(FRONTEND, 'app'), /\.tsx?$/)) {
    const texto = sinComentarios(readFileSync(ruta, 'utf8'));
    const patron = /api\.(post|patch|put)\s*(?:<[^>]*>)?\s*\(\s*([`'"])([^`'"]*)\2\s*,\s*\{/g;
    let m: RegExpExecArray | null;
    while ((m = patron.exec(texto))) {
      const cuerpo = bloque(texto, m.index + m[0].length - 1, '{', '}');
      if (!cuerpo.trim()) continue;
      const claves = clavesDe(cuerpo);
      const spread = spreadsDe(cuerpo);
      /*
       * `api.post(ruta, { ...form, cantidad })` es el patrón normal de React:
       * el estado del formulario se manda entero. Las claves del spread se
       * buscan en el `useState({...})` de ese mismo archivo, que es donde se
       * declara el formulario. Sin eso, esta prueba no habría visto el defecto
       * que la hizo nacer: el `motivo` de las reubicaciones viajaba dentro de
       * un `...form`.
       */
      if (spread.length) {
        let resuelto = true;
        for (const nombre of spread) {
          const declara = new RegExp(
            `\\[\\s*${nombre}\\s*,[^\\]]*\\]\\s*=\\s*useState\\s*(?:<[^>]*>)?\\s*\\(`,
          ).exec(texto);
          if (!declara) {
            resuelto = false;
            break;
          }
          const inicial = bloque(texto, declara.index + declara[0].length - 1, '{', '}');
          if (!inicial.trim()) {
            resuelto = false;
            break;
          }
          for (const c of clavesDe(inicial)) claves.push(c);
        }
        if (!resuelto) continue;
      }
      // La ruta puede llevar `${id}`: se normaliza a `:id`, como el controlador.
      const rutaApi = normalizar(m[3].replace(/\$\{[^}]*\}/g, ':id'));
      if (!claves.length) continue;
      encontradas.push({
        archivo: relative(FRONTEND, ruta).split(sep).join('/'),
        metodo: m[1].toUpperCase(),
        ruta: rutaApi,
        claves,
      });
    }
  }
  return encontradas;
}

describe('Formularios · un campo que la pantalla manda y el servidor prohíbe', () => {
  if (!FRONTEND) {
    it('sin frontend en el árbol, no hay nada que comprobar', () => {
      expect(true).toBe(true);
    });
    return;
  }

  const todas = llamadas();

  it('hay llamadas de escritura que medir', () => {
    // Si el extractor deja de encontrar nada, la prueba pasaría en falso.
    expect(todas.length).toBeGreaterThan(20);
  });

  it('los DTO del backend se leyeron', () => {
    expect(DTOS.size).toBeGreaterThan(20);
    expect(RUTAS.size).toBeGreaterThan(20);
  });

  it('ninguna pantalla envía un campo que su DTO no declara', () => {
    const rechazados: string[] = [];

    for (const llamada of todas) {
      const dto = RUTAS.get(`${llamada.metodo} ${llamada.ruta}`);
      if (!dto) continue; // ruta no resuelta: no se mide a ciegas
      const campos = camposDe(dto);
      if (!campos) continue; // DTO con un padre que no está en el árbol
      const sobran = llamada.claves.filter((clave) => !campos.has(clave));
      if (sobran.length) {
        rechazados.push(
          `${llamada.archivo} → ${llamada.metodo} ${llamada.ruta} (${dto}) manda ${sobran.join(', ')}`,
        );
      }
    }

    expect(rechazados.sort()).toEqual([]);
  });
});
