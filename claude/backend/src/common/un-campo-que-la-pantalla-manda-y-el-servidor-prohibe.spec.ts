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

/** Las claves de primer nivel con el texto de su valor. */
function clavesConValor(cuerpo: string): Array<[string, string]> {
  const salida: Array<[string, string]> = [];
  for (const parte of partes(cuerpo)) {
    const limpia = parte.trim();
    if (!limpia || limpia.startsWith('...')) continue;
    const conValor = /^([a-zA-Z_]\w*)\s*:([\s\S]*)$/.exec(limpia);
    if (conValor) {
      salida.push([conValor[1], conValor[2].trim()]);
      continue;
    }
    const atajo = /^([a-zA-Z_]\w*)$/.exec(limpia);
    if (atajo) salida.push([atajo[1], atajo[1]]);
  }
  return salida;
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
  /** Los que el ValidationPipe exige: sin `@IsOptional()` y sin `?`. */
  obligatorios: Set<string>;
  /**
   * Los que rechazan la CADENA VACÍA aunque lleven `@IsOptional()`.
   *
   * `@IsOptional()` de class-validator sólo se salta la validación cuando el
   * valor es `null` o `undefined`. Una cadena vacía NO es ninguno de los dos:
   * entra al validador y lo revienta. Un `@IsOptional() @IsIn([...])` que
   * recibe `''` contesta «must be one of the following values».
   */
  rechazanVacio: Set<string>;
  padre: string | null;
}

/*
 * Validadores que una cadena vacía no pasa. Los `*Opcional` de la casa quedan
 * fuera a propósito: `@IsEmailOpcional()` y `@EsRfcOpcional()` existen
 * precisamente para tolerar el campo en blanco.
 */
const RECHAZAN_VACIO =
  /@(IsIn|IsEnum|IsDateString|IsDate|IsUUID|IsEmail|IsUrl|Matches|MinLength|Length|IsNumber|IsInt|IsPositive|IsNumberString|IsBoolean|IsSqlServerGuid|IsMongoId|IsPhoneNumber|IsJSON|ArrayMinSize|IsLatitude|IsLongitude|IsNotEmpty)\s*\(/;

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

    /*
     * Obligatorio es lo contrario de opcional, y opcional se declara de dos
     * maneras que hay que mirar sobre el texto CON decoradores: `@IsOptional()`
     * delante, o el `?` del propio campo. También se deja fuera lo que ya trae
     * valor por omisión (`pagina: number = 1`).
     */
    const obligatorios = new Set<string>();
    const declaraciones = /((?:@[\w.]+\s*(?:\([\s\S]*?\))?\s*)*)([a-zA-Z_]\w*)\s*([?!]?)\s*:([^;=]*)(=?)/g;
    let d: RegExpExecArray | null;
    while ((d = declaraciones.exec(cuerpo))) {
      const [, decoradores, nombre, interrogante, , igual] = d;
      if (!props.has(nombre)) continue;
      if (interrogante === '?' || igual === '=') continue;
      if (/@IsOptional\s*\(/.test(decoradores)) continue;
      if (!decoradores.trim()) continue; // sin validador no lo exige el pipe
      obligatorios.add(nombre);
    }

    const rechazanVacio = new Set<string>();
    declaraciones.lastIndex = 0;
    while ((d = declaraciones.exec(cuerpo))) {
      const [, decoradores, nombre] = d;
      if (!props.has(nombre)) continue;
      if (RECHAZAN_VACIO.test(decoradores)) rechazanVacio.add(nombre);
    }

    DTOS.set(m[1], { props, obligatorios, rechazanVacio, padre: m[2] ?? null });
  }
}

/** Los campos obligatorios de un DTO, incluidos los que hereda. */
function obligatoriosDe(nombre: string, vistos = new Set<string>()): Set<string> | null {
  if (vistos.has(nombre)) return new Set();
  vistos.add(nombre);
  const dto = DTOS.get(nombre);
  if (!dto) return null;
  const propios = new Set(dto.obligatorios);
  if (dto.padre) {
    const heredados = obligatoriosDe(dto.padre, vistos);
    if (!heredados) return null;
    heredados.forEach((p) => propios.add(p));
  }
  return propios;
}

/** Los campos que rechazan la cadena vacía, incluidos los heredados. */
function rechazanVacioDe(nombre: string, vistos = new Set<string>()): Set<string> {
  if (vistos.has(nombre)) return new Set();
  vistos.add(nombre);
  const dto = DTOS.get(nombre);
  if (!dto) return new Set();
  const propios = new Set(dto.rechazanVacio);
  if (dto.padre) rechazanVacioDe(dto.padre, vistos).forEach((p) => propios.add(p));
  return propios;
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


/* ── 3.a De dónde salen las claves de un `...spread` ─────────────────────── */

/**
 * La declaración que de verdad ve el sitio de la llamada: la ÚLTIMA que hay
 * antes de él.
 *
 * Un archivo puede declarar dos veces el mismo nombre en funciones distintas
 * —`AsistenteEmpleado.tsx` tiene un `const datos` para el empleado y otro para
 * el puesto—, y tomar siempre la primera hacía que esta prueba midiera una
 * llamada contra un objeto que no es el suyo: trece campos inventados y un
 * `nombre` que sí viajaba. Un falso positivo así es peor que no medir: enseña
 * a desconfiar de la prueba.
 */
function declaracionCercana(
  texto: string,
  patron: RegExp,
  posicion: number,
): RegExpExecArray | null {
  const global = new RegExp(patron.source, patron.flags.includes('g') ? patron.flags : patron.flags + 'g');
  let mejor: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = global.exec(texto))) {
    if (m.index > posicion) break;
    mejor = m;
  }
  return mejor;
}

/**
 * Resuelve un `...X` a sus claves y al texto de su valor inicial.
 *
 * Tres formas, y las tres aparecen en este frontend:
 *   1. `const [form, setForm] = useState({ a:'', b:0 })`  —literal en sitio
 *   2. `const [form, setForm] = useState(formVacio)`      —a un const de arriba
 *   3. `const { a, b, ...resto } = formData`              —el resto de otro
 *
 * La tercera es la que importa para lo que mide la prueba nueva: así se escribe
 * «manda todo MENOS estos tres campos», que es justo el arreglo correcto.
 */
function origenDeSpread(
  texto: string,
  nombre: string,
  posicion: number,
  vistos = new Set<string>(),
): Array<[string, string]> | null {
  if (vistos.has(nombre)) return null;
  vistos.add(nombre);

  const literalDe = (desde: number): Array<[string, string]> | null => {
    const cuerpo = bloque(texto, desde, '{', '}');
    return cuerpo.trim() ? clavesConValor(cuerpo) : null;
  };

  /* 1 y 2 · el estado del formulario. */
  const conEstado = declaracionCercana(
    texto,
    new RegExp(`\\[\\s*${nombre}\\s*,[^\\]]*\\]\\s*=\\s*useState\\s*(?:<[^>]*>)?\\s*\\(`),
    posicion,
  );
  if (conEstado) {
    const tras = conEstado.index + conEstado[0].length;
    const resto = texto.slice(tras);
    if (/^\s*\{/.test(resto)) return literalDe(tras);
    const alias = /^\s*([a-zA-Z_]\w*)\s*\)/.exec(resto)?.[1];
    if (alias) return origenDeSpread(texto, alias, posicion, vistos);
    return null;
  }

  /* 3 · el resto de otro objeto, quitando lo que se destructuró antes. */
  const destructura = declaracionCercana(
    texto,
    new RegExp(`(?:const|let)\\s*\\{([^{}]*\\.\\.\\.\\s*${nombre}\\s*)\\}\\s*=\\s*([a-zA-Z_]\\w*)`),
    posicion,
  );
  if (destructura) {
    const quitados = new Set(clavesDe(destructura[1].replace(/\.\.\.[\s\S]*$/, '')));
    const base = origenDeSpread(texto, destructura[2], posicion, vistos);
    if (!base) return null;
    return base.filter(([clave]) => !quitados.has(clave));
  }

  /* Un `const X = { … }` suelto, que es como se declara `formVacio`. */
  const cuerpo = literalDeConst(texto, nombre, posicion);
  return cuerpo ? clavesConValor(cuerpo) : null;
}

/** El texto del objeto literal del `const X = { … }` que ve esa posición. */
function literalDeConst(
  texto: string,
  nombre: string,
  posicion: number,
): string | null {
  const suelto = declaracionCercana(
    texto,
    new RegExp(`(?:const|let)\\s+${nombre}\\s*(?::\\s*[\\w<>\\[\\]|\\s]+)?=\\s*\\{`),
    posicion,
  );
  if (!suelto) return null;
  const cuerpo = bloque(texto, suelto.index + suelto[0].length - 1, '{', '}');
  return cuerpo.trim() ? cuerpo : null;
}

/** Un valor inicial que el servidor recibirá como cadena vacía. */
const esVacio = (valor: string) =>
  /^(''|""|``|null|undefined)$/.test(valor.trim());

/**
 * Los campos que la pantalla sólo PINTA BAJO CONDICIÓN.
 *
 * `{formData.tipoPersona === 'FISICA' && ( … name="fechaNacimiento" … )}` es
 * una promesa: ese dato no aplica cuando la condición es falsa. Un campo así
 * sigue existiendo en el estado del formulario, en blanco, y si el cuerpo se
 * arma con un `...formData` entero viaja igual —vacío— hacia un validador que
 * no lo tolera.
 */
function bajoGuardia(texto: string): Set<string> {
  /*
   * Sólo cuentan las condiciones que hablan de LOS DATOS del formulario.
   *
   * Casi todo formulario vive dentro de un `{modalAbierto && ( … )}`, y con eso
   * cualquier campo quedaría «bajo condición»: la prueba acusaría a la pantalla
   * de bancos por su clave obligatoria, que se valida antes de enviar y nunca
   * viaja en blanco. Lo que describe el defecto de verdad es otra cosa: una
   * condición sobre el propio estado —`formData.tipoPersona === 'FISICA'`—, que
   * es la pantalla diciendo «este dato no aplica a este tipo de cliente».
   */
  const estados = new Set<string>();
  const declara = /\[\s*([a-zA-Z_]\w*)\s*,[^\]]*\]\s*=\s*useState/g;
  let e: RegExpExecArray | null;
  while ((e = declara.exec(texto))) {
    const origen = origenDeSpread(texto, e[1], texto.length);
    if (origen && origen.length >= 3) estados.add(e[1]);
  }
  if (!estados.size) return new Set();
  const hablaDeLosDatos = new RegExp(`\\b(?:${[...estados].join('|')})\\s*[.?]`);

  const nombres = new Set<string>();
  const patron = /\{([^{}]{1,240}?)&&\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = patron.exec(texto))) {
    if (!hablaDeLosDatos.test(m[1])) continue;
    const cuerpo = bloque(texto, m.index + m[0].length - 1, '(', ')');
    const campos = /name=["']([a-zA-Z_]\w*)["']/g;
    let c: RegExpExecArray | null;
    while ((c = campos.exec(cuerpo))) nombres.add(c[1]);
  }
  return nombres;
}

/* ── 3.c El `fetch` a pelo, que también manda cuerpos ────────────────────── */

/**
 * No todas las pantallas escriben con el ayudante `api.post`. Varias —el alta
 * de clientes entre ellas— llaman a `fetch` directamente:
 *
 *   const url    = editId ? `${api}/clientes/${editId}` : `${api}/clientes`;
 *   const method = editId ? 'PATCH' : 'POST';
 *   const payload = { ...formData, … };
 *   await fetch(url, { method, headers: heads(true), body: JSON.stringify(payload) });
 *
 * Mientras esta prueba sólo miraba `api.post`, TODA esa familia de llamadas
 * quedaba sin medir, y ahí vivía el defecto que dio origen a la tercera
 * comprobación. Se resuelven la url y el método por su `const`, y el cuerpo por
 * el objeto que se serializa.
 */
function literalesDe(texto: string, expresion: string, patron: RegExp): string[] {
  const directo = expresion.match(patron);
  if (directo) return directo.map((x) => x.slice(1, -1));
  const nombre = /^([a-zA-Z_]\w*)$/.exec(expresion.trim())?.[1];
  if (!nombre) return [];
  const declara = new RegExp(`(?:const|let)\\s+${nombre}\\s*(?::[^=]*)?=([^;]*);`).exec(texto);
  if (!declara) return [];
  return (declara[1].match(patron) ?? []).map((x) => x.slice(1, -1));
}

/** Las rutas que puede tomar la url de un `fetch`, ya normalizadas. */
const rutasDeUrl = (texto: string, expresion: string) =>
  literalesDe(texto, expresion, /`[^`]*`/g)
    // `${api}/clientes/${id}` → la base se quita; lo interpolado es `:id`.
    .map((plantilla) => plantilla.replace(/^\$\{[^}]*\}/, ''))
    .filter((ruta) => ruta.startsWith('/'))
    .map((ruta) => normalizar(ruta.replace(/\$\{[^}]*\}/g, ':id')));

/** Los métodos de escritura que puede tomar un `fetch`. */
const metodosDeFetch = (texto: string, expresion: string) =>
  literalesDe(texto, expresion, /['"`](?:POST|PATCH|PUT|GET|DELETE)['"`]/g).filter((m) =>
    ['POST', 'PATCH', 'PUT'].includes(m),
  );

/* ── 3.d Lo que manda cada pantalla ─────────────────────────────────────── */

interface Llamada {
  archivo: string;
  metodo: string;
  ruta: string;
  claves: string[];
  /** Claves que viajan vacías y que la pantalla sólo pinta bajo condición. */
  vaciasCondicionales: string[];
}

function llamadas(): Llamada[] {
  if (!FRONTEND) return [];
  const encontradas: Llamada[] = [];

  for (const ruta of archivos(join(FRONTEND, 'app'), /\.tsx?$/)) {
    const texto = sinComentarios(readFileSync(ruta, 'utf8'));
    const condicionales = bajoGuardia(texto);
    let fallo = false;
    const archivo = relative(FRONTEND, ruta).split(sep).join('/');

    /** Resuelve un cuerpo literal a sus claves; `null` si hay que adivinar. */
    const resolver = (
      cuerpo: string,
      posicion: number,
    ): { claves: string[]; vaciasCondicionales: string[] } | null => {
      const claves = clavesDe(cuerpo);
      const vaciasCondicionales: string[] = [];

      /*
       * `{ ...formData, clasificacionHotelera: … }` son dos cosas a la vez, y
       * la que va DESPUÉS gana. Hay que saber en qué orden viene cada una para
       * no acusar de «viajar vacío» a un campo que el literal reescribe justo
       * a continuación.
       */
      const elementos = partes(cuerpo).map((x) => x.trim());
      const posicionDeClave = new Map<string, number>();
      elementos.forEach((parte, i) => {
        const clave = /^([a-zA-Z_]\w*)\s*[:,]?/.exec(parte)?.[1];
        if (clave && !parte.startsWith('...')) posicionDeClave.set(clave, i);
      });

      const marcarSiVacia = (clave: string, valor: string) => {
        if (esVacio(valor) && condicionales.has(clave)) vaciasCondicionales.push(clave);
      };

      for (const [clave, valor] of clavesConValor(cuerpo)) marcarSiVacia(clave, valor);

      /*
       * `{ ...form, cantidad }` es el patrón normal de React: el estado del
       * formulario se manda entero. Sin resolver el spread, esta prueba no
       * habría visto ninguno de los defectos que la hicieron nacer.
       */
      elementos.forEach((parte, i) => {
        const nombre = /^\.\.\.([a-zA-Z_]\w*)$/.exec(parte)?.[1];
        if (!nombre) return;
        const origen = origenDeSpread(texto, nombre, posicion);
        if (!origen) {
          fallo = true;
          return;
        }
        for (const [clave, valor] of origen) {
          claves.push(clave);
          const reescrito = posicionDeClave.get(clave);
          if (reescrito !== undefined && reescrito > i) continue;
          marcarSiVacia(clave, valor);
        }
      });

      if (fallo) {
        fallo = false;
        return null;
      }
      return claves.length ? { claves, vaciasCondicionales } : null;
    };

    /* a) El ayudante: `api.post('/ruta', { … })`. */
    const conAyudante = /api\.(post|patch|put)\s*(?:<[^>]*>)?\s*\(\s*([`'"])([^`'"]*)\2\s*,\s*\{/g;
    let m: RegExpExecArray | null;
    while ((m = conAyudante.exec(texto))) {
      const cuerpo = bloque(texto, m.index + m[0].length - 1, '{', '}');
      if (!cuerpo.trim()) continue;
      const resuelto = resolver(cuerpo, m.index);
      if (!resuelto) continue;
      encontradas.push({
        archivo,
        metodo: m[1].toUpperCase(),
        // La ruta puede llevar `${id}`: se normaliza a `:id`, como el controlador.
        ruta: normalizar(m[3].replace(/\$\{[^}]*\}/g, ':id')),
        ...resuelto,
      });
    }

    /* b) El `fetch` a pelo, con el cuerpo serializado. */
    const conFetch = /fetch\s*\(\s*([^,()]+?)\s*,\s*\{/g;
    while ((m = conFetch.exec(texto))) {
      const opciones = bloque(texto, m.index + m[0].length - 1, '{', '}');
      const serializa = /body\s*:\s*JSON\.stringify\s*\(\s*([a-zA-Z_]\w*)\s*\)/.exec(opciones);
      if (!serializa) continue;

      /*
       * El cuerpo se resuelve como cualquier otro literal —con sus spreads
       * dentro—, no como un simple objeto plano: `const payload = { ...formData,
       * clasificacionHotelera: … }` son dos cosas a la vez.
       */
      const literal = literalDeConst(texto, serializa[1], m.index);
      const resuelto = literal
        ? resolver(literal, m.index)
        : (() => {
            const origen = origenDeSpread(texto, serializa[1], m.index);
            if (!origen) return null;
            const claves: string[] = [];
            const vacias: string[] = [];
            for (const [clave, valor] of origen) {
              claves.push(clave);
              if (esVacio(valor) && condicionales.has(clave)) vacias.push(clave);
            }
            return claves.length ? { claves, vaciasCondicionales: vacias } : null;
          })();
      if (!resuelto) continue;

      const expresionMetodo = /(?:^|,)\s*method\s*(?::([^,}]*))?/.exec(opciones);
      if (!expresionMetodo) continue;
      const metodos = metodosDeFetch(texto, (expresionMetodo[1] ?? 'method').trim());
      const rutas = rutasDeUrl(texto, m[1]);
      /*
       * Una misma llamada puede ser alta o edición según haya `editId`, y la url
       * y el método salen los dos del mismo ternario. Se prueban todas las
       * parejas, y sólo se miden las que existen de verdad en un controlador:
       * `POST /clientes` y `PATCH /clientes/:id`, no las combinaciones que
       * nadie sirve.
       */
      for (const metodo of metodos) {
        for (const rutaApi of rutas) {
          if (!RUTAS.has(`${metodo} ${rutaApi}`)) continue;
          encontradas.push({ archivo, metodo, ruta: rutaApi, ...resuelto });
        }
      }
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

  it('ninguna pantalla se deja un campo que su DTO exige', () => {
    /*
     * La otra mitad de la misma moneda. Si el DTO declara un campo sin
     * `@IsOptional()` y sin `?`, el ValidationPipe lo exige: la pantalla que no
     * lo manda recibe «campo should not be empty» en CADA intento. Igual de
     * invisible por API —quien llama a mano manda el DTO entero— e igual de
     * fatal: el formulario no se puede guardar nunca.
     */
    const incompletas: string[] = [];

    for (const llamada of todas) {
      const dto = RUTAS.get(`${llamada.metodo} ${llamada.ruta}`);
      if (!dto) continue;
      const exigidos = obligatoriosDe(dto);
      if (!exigidos) continue;
      const faltan = [...exigidos].filter((campo) => !llamada.claves.includes(campo));
      if (faltan.length) {
        incompletas.push(
          `${llamada.archivo} → ${llamada.metodo} ${llamada.ruta} (${dto}) no manda ${faltan.sort().join(', ')}`,
        );
      }
    }

    expect(incompletas.sort()).toEqual([]);
  });

  it('ninguna pantalla manda vacío un campo que sólo pinta bajo condición', () => {
    /*
     * ── El tercer filo del mismo cuchillo ────────────────────────────────
     *
     * Medido el 26-sep-2026 en el alta de clientes. La pantalla oculta fecha de
     * nacimiento, género y CURP cuando el tipo de persona es MORAL —una
     * sociedad no nació ni tiene género— pero armaba el cuerpo con
     * `...formData` entero, así que los tres viajaban VACÍOS:
     *
     *   400 ["fechaNacimiento debe tener el formato aaaa-mm-dd",
     *        "genero must be one of the following values: FEMENINO, …"]
     *
     * Y `@IsOptional()` no salvaba nada: class-validator sólo se salta el
     * validador cuando el valor es `null` o `undefined`. La cadena vacía entra
     * y lo revienta.
     *
     * Consecuencia: NO SE PODÍA REGISTRAR NINGUNA PERSONA MORAL. Y eso cerraba
     * de golpe el City Ledger, porque un convenio hotelero sólo se firma con
     * una empresa o una agencia: la pantalla de convenios mandaba a registrarla
     * en Clientes y Clientes no dejaba registrarla.
     *
     * LA REGLA: un campo que la pantalla sólo pinta bajo condición se manda
     * bajo la misma condición. Si no aplica, no viaja —ni vacío—.
     */
    const culpables: string[] = [];

    for (const llamada of todas) {
      if (!llamada.vaciasCondicionales.length) continue;
      const dto = RUTAS.get(`${llamada.metodo} ${llamada.ruta}`);
      if (!dto) continue;
      const intolerantes = rechazanVacioDe(dto);
      const rotos = llamada.vaciasCondicionales.filter((c) => intolerantes.has(c));
      if (rotos.length) {
        culpables.push(
          `${llamada.archivo} → ${llamada.metodo} ${llamada.ruta} (${dto}) manda vacío ${[...new Set(rotos)].sort().join(', ')}`,
        );
      }
    }

    expect(culpables.sort()).toEqual([]);
  });
});
