/**
 * ============================================================================
 * ENVOLVER EN `t(...)` LO QUE UNA PERSONA LEE
 * ----------------------------------------------------------------------------
 * Recorre el AST de TypeScript —no el texto— y envuelve en `t(...)` los textos
 * visibles, añadiendo el enganche `const t = useT();` al componente y el import.
 *
 *   node herramientas/idioma-envolver.mjs app/dashboard/clientes          (ensayo)
 *   node herramientas/idioma-envolver.mjs app/dashboard/clientes --aplica
 *
 * LO QUE NO TOCA, Y POR QUÉ
 *
 *  · LAS FRASES PARTIDAS. `<p>Faltan {n} productos</p>` llega al AST como dos
 *    textos distintos —«Faltan» y «productos»— con una expresión en medio.
 *    Envolverlos por separado produce dos claves que NO SE PUEDEN TRADUCIR: el
 *    orden de las palabras cambia entre idiomas y en inglés el número va en
 *    otro sitio. Esas se listan aparte y se hacen a mano con
 *    `t('Faltan {n} productos', { n })`, que es la forma que sí traduce.
 *
 *    QUÉ PARTE UNA FRASE, Y QUÉ NO. La primera versión de esta regla llamaba
 *    partida a todo texto que compartiera padre con otro elemento, y marcó 581
 *    —entre ellas «Atrás» y «Guardar y continuar»—. No lo eran: eran botones
 *    con un ícono al lado. Un ícono no parte una frase; la parten
 *    · una EXPRESIÓN adyacente —ahí va un valor en medio de las palabras—, y
 *    · una etiqueta inline CON TEXTO dentro (`<b>`, `<strong>`, `<span>`,
 *      `<a>`, `<code>`), porque la frase sigue dentro de ella.
 *    Un componente propio autocerrado —`<Icono />`— no parte nada.
 *
 *    Importa afinarlo: un trinquete que marca de más enseña a ignorarlo.
 *
 *  · LAS PANTALLAS DE SERVIDOR. Sin `use client` no hay contexto de React. Se
 *    listan aparte: ésas se traducen con `traducir(texto, idiomaDeCookies(...))`.
 *
 *  · LAS CADENAS SUELTAS DE CÓDIGO. Un `avisar('Guardado')` dentro de una
 *    función sí se ve, pero puede estar fuera de un componente, donde no hay
 *    hook. Se cuentan y se hacen después, no a ciegas.
 *
 * LO QUE SÍ TOCA DENTRO DE UNA EXPRESIÓN JSX
 *
 * `{activo ? 'Activo' : 'Inactivo'}` es texto que se lee y vive en el mismo
 * ámbito, así que se envuelve. Pero dentro de una expresión JSX también viven
 * cosas que NO se leen y que traducidas rompen la pantalla: clases de CSS,
 * rutas, claves de catálogo, colores, variantes. Se excluyen por tres filtros:
 *
 *   · el ATRIBUTO que las contiene —`className`, `href`, `ruta`, `color`…—;
 *   · la FORMA de la cadena —parece CSS, parece ruta, es MAYÚSCULAS_CON_GUION—;
 *   · el SITIO —a un lado de un `===`, dentro de un `case`, como clave de un
 *     objeto, o dentro de `includes(...)`: comparar no es mostrar—.
 *
 * Traducir una comparación cambia el comportamiento del programa, no su
 * idioma. Ésa es la línea.
 * ============================================================================
 */
import ts from 'typescript';
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
/*
 * La regla de qué es texto y qué es maquinaria estaba aquí Y en
 * idioma-partidas.mjs, y las dos copias ya habían divergido. Ahora se escribe
 * una sola vez; el porqué de cada filtro está en ese archivo.
 */
import { esTextoVisible, esTextoEnCadena, PARECE_CSS } from './_texto-visible.mjs';

const RAICES = process.argv[2].split(',');

/**
 * ¿ESTÁ `t` TAPADA EN ESTE ÁMBITO?
 *
 * `TIPOS.map((t) => …)`, `transferencias.map(t => …)`, `(t: Transferencia) => …`:
 * cuando la variable del bucle se llama `t`, escribir `t('texto')` ahí no
 * traduce nada — llama a un objeto, y el navegador contesta
 * `t is not a function`. Fueron 43 sitios en el ERP, 19 en un solo archivo, y
 * los encontró `tsc --noEmit` («This expression is not callable»), no yo: mis
 * revisiones comprobaban que `t` EXISTIERA en el ámbito, nunca que la `t` del
 * ámbito fuera la del idioma. Una pregunta a medias contestada con confianza
 * entera.
 *
 * Aquí se contesta entera: se sube el ámbito y, si la primera declaración de
 * `t` que aparece no viene de `useT()`, `useI18n()` ni `tDelServidor()`, no se
 * envuelve nada. El texto se queda en español y se cuenta como deuda, que es
 * infinitamente mejor que una pantalla caída.
 */
function tTapada(nodo, fuente) {
  const esDelIdioma = (ini) => {
    if (!ini) return false;
    const txt = ini.getText(fuente);
    return /use(?:T|I18n)\s*\(/.test(txt) || /tDelServidor\s*\(/.test(txt);
  };
  const tapaElNombre = (nombre) => {
    if (ts.isIdentifier(nombre)) return nombre.text === 't';
    if (ts.isArrayBindingPattern(nombre)) {
      return nombre.elements.some((el) => !ts.isOmittedExpression(el) && ts.isIdentifier(el.name) && el.name.text === 't');
    }
    if (ts.isObjectBindingPattern(nombre)) {
      return nombre.elements.some((el) => ts.isIdentifier(el.name) && el.name.text === 't');
    }
    return false;
  };
  let p = nodo.parent;
  while (p) {
    if (ts.isFunctionDeclaration(p) || ts.isArrowFunction(p) || ts.isFunctionExpression(p) || ts.isMethodDeclaration(p)) {
      if (p.parameters.some((par) => tapaElNombre(par.name))) return true;
    }
    if (ts.isCatchClause(p) && p.variableDeclaration && tapaElNombre(p.variableDeclaration.name)) return true;
    if (ts.isBlock(p) || ts.isSourceFile(p)) {
      for (const st of p.statements ?? []) {
        if (!ts.isVariableStatement(st)) continue;
        for (const d of st.declarationList.declarations) {
          if (tapaElNombre(d.name)) return !esDelIdioma(d.initializer);
        }
      }
    }
    p = p.parent;
  }
  return false;
}

const APLICA = process.argv.includes('--aplica');
/*
 * EL HUECO QUE NO SE CONTABA.
 *
 * `esEspanol` pide acentos o palabras de función para no confundir una clase de
 * CSS con una frase. Eso es correcto para una CADENA SUELTA, donde hay que
 * adivinar. Pero una cadena DENTRO DE JSX —`{activo ? 'Activo' : 'Inactivo'}`—
 * o el valor de un `title=` no hay que adivinarlos: están en un sitio que se
 * lee. Pedirles acentos dejó fuera «Fineract operativo», «Verificando»,
 * «Persona Moral» y «Ambos», y lo grave no es que no se tradujeran: es que
 * tampoco se CONTARON como deuda. Un vacío afirmado que no se comprobó.
 *
 * Con `--permisivo` esos dos sitios usan la misma prueba que un nodo de texto:
 * tiene letras y no es maquinaria. Los filtros de `seLee` siguen intactos, que
 * son los que distinguen mostrar de comparar.
 */
const PERMISIVO = process.argv.includes('--permisivo');
/*
 * `--sueltas` ENVUELVE LAS CADENAS QUE NO ESTÁN EN JSX.
 *
 * Son los avisos, los mensajes de validación y los textos de los diálogos:
 * 1,381 en el ERP, medidas el 23-oct-2026, y lo que una persona ve cuando algo
 * sale mal. Se dejaron para el final porque fuera de JSX no hay un sitio que
 * delate si la cadena se lee o se compara.
 *
 * Dos condiciones, y las dos tienen que cumplirse:
 *
 *  · que la cadena esté DENTRO DE UN COMPONENTE, porque el enganche `t` es un
 *    hook y no existe en el ámbito del módulo. Las 65 de arreglos y las 65 de
 *    `label:` que viven en constantes de módulo se quedan contadas y sin tocar:
 *    ésas se traducen donde se pintan, no donde se declaran.
 *
 *  · que no sea un argumento de maquinaria. `new Intl.NumberFormat('es-MX')`
 *    tiene acento y palabras y es una ETIQUETA DE IDIOMA: traducirla cambia el
 *    formato de todos los importes. Son 38, y basta una para que el modo no se
 *    pueda aprobar sin esta lista.
 */
const SUELTAS = process.argv.includes('--sueltas');
const LLAMADAS_DE_MAQUINARIA = [
  'Intl', 'console', 'JSON', 'localStorage', 'sessionStorage', 'fetch', 'api',
  'require', 'URL', 'URLSearchParams', 'Date', 'document', 'window', 'navigator',
];
/**
 * TRES SITIOS DONDE UN LITERAL NO SE PUEDE ENVOLVER, PASE LO QUE PASE.
 *
 * Medidos el 23-oct-2026, al aplicar `--sueltas` al ERP: cinco pantallas sin
 * compilar, una por cada uno de estos sitios.
 *
 *  1. UNA ANOTACIÓN DE TIPO. `tipo: 'almacén' | 'lista de precios'` son tipos
 *     literales, no texto. `t("almacén") | t("lista de precios")` no es
 *     TypeScript válido y tumba el archivo entero.
 *
 *  2. EL VALOR POR OMISIÓN DE UN PARÁMETRO. `mensaje = 'No tienes permiso'` se
 *     evalúa al entrar a la función, antes de que corra el hook: ahí `t` no
 *     existe todavía. Un valor por omisión no puede depender de un hook.
 *
 *  3. UN ATRIBUTO JSX SIN LLAVES. `textoVacio="— Sin categoría —"` necesita
 *     quedar `textoVacio={t("…")}`; sin las llaves, `textoVacio=t("…")` no es
 *     JSX. Ése no se salta: se envuelve bien, con llaves.
 */
const esSitioProhibido = (n) => {
  let p = n.parent;
  while (p) {
    if (ts.isLiteralTypeNode(p) || ts.isUnionTypeNode(p) || ts.isTypeAliasDeclaration(p)
        || ts.isTypeReferenceNode(p) || ts.isIndexedAccessTypeNode(p)) return true;
    if (ts.isParameter(p)) return true;
    if (ts.isJsxElement(p) || ts.isJsxSelfClosingElement(p) || ts.isBlock(p)) break;
    p = p.parent;
  }
  return false;
};

/** El atributo JSX del que este literal es el valor directo, si lo es. */
const atributoDeLiteral = (n) => {
  const padre = n.parent;
  const abuelo = padre ? padre.parent : null;
  if (padre && ts.isJsxAttribute(padre) && padre.initializer === n) return padre;
  if (padre && ts.isJsxExpression(padre) && padre.expression === n
      && abuelo && ts.isJsxAttribute(abuelo) && abuelo.initializer === padre) return abuelo;
  return null;
};

const esLlamadaDeMaquinaria = (n, fuente) => {
  let p = n.parent;
  while (p) {
    if (ts.isCallExpression(p) || ts.isNewExpression(p)) {
      const raiz = p.expression.getText(fuente).split(/[.(]/)[0];
      if (LLAMADAS_DE_MAQUINARIA.includes(raiz)) return true;
      if (/^toLocale/.test(p.expression.getText(fuente).split('.').pop() ?? '')) return true;
    }
    if (ts.isJsxElement(p) || ts.isJsxSelfClosingElement(p)) break;
    p = p.parent;
  }
  return false;
};
/*
 * `--volcar=archivo` escribe lo que SE ENVOLVERÍA, uno por renglón, con el
 * sitio. Sin esto, aprobar un modo permisivo es firmar a ciegas: la diferencia
 * entre envolver 1,347 frases y envolver 1,347 claves de catálogo no se ve en
 * el resumen, se ve en la lista.
 */
const VOLCADO = (process.argv.find((a) => a.startsWith('--volcar=')) ?? '').slice(9);
const volcado = [];

const ATRIBUTOS_VISIBLES = new Set([
  'title','placeholder','alt','label','etiqueta','titulo','descripcion','desc',
  'mensaje','texto','ayuda','leyenda','subtitulo','pie','detalle','textoBoton',
  'textoConfirmar','textoCancelar','aria-label','encabezado','resumen',
]);
const ACENTOS = /[áéíóúñÁÉÍÓÚÑ¿¡]/;
const PALABRAS = /\b(de|la|el|los|las|que|para|con|sin|por|una|un|del|al|se|no|su|más|este|esta|cuando|todo|toda|cada|ya|si|lo|le|es|son|hay|tu|tus|y|o|pero|como|desde|hasta|sobre|aún|todavía)\b/i;
/**
 * DOS PREGUNTAS DISTINTAS, Y CONFUNDIRLAS DEJA HUECOS.
 *
 * Para una CADENA SUELTA hay que adivinar si es texto de pantalla o una clave
 * del programa, y para eso sirven los acentos y las palabras de función: una
 * cadena con «de», «que» o «ñ» casi nunca es una clase de CSS.
 *
 * Para un NODO DE TEXTO JSX no hay nada que adivinar: está entre dos etiquetas,
 * o sea que se lee. Exigirle acentos ahí dejó sin envolver «Persona Moral»,
 * «Ambos» y «Housekeeping» —medido el 23-oct-2026 en el directorio de
 * proveedores—, que son exactamente lo que hay que traducir.
 */
const esEspanol = (s) => {
  const t = s.trim();
  if (t.length < 3 || !/[a-zA-Z]/.test(t)) return false;
  if (PARECE_CSS(t)) return false;
  if (/^[a-z-]+$/.test(t) && !t.includes(' ')) return false;
  if (/^https?:|^\/|^@\/|^#/.test(t)) return false;
  if (/^[A-Z0-9_]+$/.test(t)) return false;
  return ACENTOS.test(t) || PALABRAS.test(t);
};

/**
 * HOJA DE ESTILO DENTRO DE JSX.
 *
 * `<style>{'@media print { @page{margin:10mm} }'}</style>` está dentro de JSX y
 * tiene letras, así que la prueba permisiva lo tomaría por texto de pantalla.
 * Traducirlo no cambia el idioma de nada: rompe la impresión del ticket. Son
 * seis cadenas en el ERP, medidas el 23-oct-2026, y bastan para que la lista
 * permisiva no se pueda aprobar sin este filtro.
 */
function archivos(dir, out = []) {
  const st = statSync(dir);
  if (!st.isDirectory()) { if (/\.tsx$/.test(dir)) out.push(dir); return out; }
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '.next') continue;
    /* El diccionario GUARDA español: no es deuda, es la traducción. */
    if (n === 'traducciones') continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) archivos(p, out);
    else if (/\.tsx$/.test(n) && !/\.spec\.|\.test\./.test(n)) out.push(p);
  }
  return out;
}

const resumen = { archivos: 0, envueltos: 0, partidas: 0, servidor: 0, sueltas: 0, enganches: 0, tapadas: 0 };
const partidas = [];
const servidor = [];

for (const raiz of RAICES) for (const archivo of archivos(raiz)) {
  const original = readFileSync(archivo, 'utf8');
  const fuente = ts.createSourceFile(archivo, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  if (!/^\s*['"]use client['"]/m.test(original)) {
    let visibles = 0;
    const cuenta = (n) => { if (ts.isJsxText(n) && esEspanol(n.text)) visibles++; ts.forEachChild(n, cuenta); };
    cuenta(fuente);
    if (visibles) { servidor.push(`${archivo} (${visibles})`); resumen.servidor += visibles; }
    continue;
  }

  /*
   * LOS TEXTOS QUE ESTE ARCHIVO USA COMO TIPO.
   *
   * `cambiarContextoVenta(tipo: 'almacén' | 'lista de precios', …)` declara dos
   * valores que el programa compara, y la llamada los pasa tal cual:
   * `cambiarContextoVenta('almacén', id)`. En la declaración el literal está en
   * una anotación y se salta; en la LLAMADA no, y ahí `t('almacén')` devuelve
   * «warehouse» en inglés y rompe la función. Medido el 23-oct-2026 en el POS.
   *
   * No hay forma de saber desde el AST qué espera una función sin resolver
   * tipos, pero sí de saber qué textos este archivo trata como tipo: ésos no se
   * envuelven en ninguna parte del archivo. Es una regla por archivo, estrecha
   * y suficiente.
   */
  const textosDeTipo = new Set();
  const recogeTipos = (n) => {
    if (ts.isLiteralTypeNode(n) && ts.isStringLiteral(n.literal)) textosDeTipo.add(n.literal.text);
    ts.forEachChild(n, recogeTipos);
  };
  recogeTipos(fuente);

  const edits = [];           // { ini, fin, texto }
  const componentes = new Set();
  /*
   * ¿Este archivo ya tiene `t` a mano? Las DOS formas cuentan:
   *
   *     const t = useT();
   *     const { idioma, cambiarIdioma, t } = useI18n();
   *
   * La primera versión sólo miraba la primera, y el layout del ERP —que usa la
   * segunda desde que existe el selector— recibió un segundo `t`: «the name `t`
   * is defined multiple times», y el área de trabajo entera dejó de pintar. Una
   * pantalla en blanco por una regla que acertaba en 166 de 167 archivos.
   */
  /* (La pregunta por archivo se quedó sin uso: el enganche se decide por
     componente, más abajo. Se deja el porqué escrito ahí.) */

  /** El componente de React que contiene este nodo, para colgarle el enganche. */
  const componenteDe = (n) => {
    let p = n.parent;
    while (p) {
      if ((ts.isFunctionDeclaration(p) || ts.isArrowFunction(p) || ts.isFunctionExpression(p)) && p.body && ts.isBlock(p.body)) {
        const nombre = ts.isFunctionDeclaration(p) && p.name ? p.name.text
          : (p.parent && ts.isVariableDeclaration(p.parent) && ts.isIdentifier(p.parent.name) ? p.parent.name.text : '');
        if (/^[A-Z]/.test(nombre) || (ts.isFunctionDeclaration(p) && !nombre)) return p;
      }
      p = p.parent;
    }
    return null;
  };

  /** ¿Ya va dentro de una llamada a `t(...)`? Entonces no se vuelve a envolver. */
  const yaTraducido = (n) => {
    let p = n.parent;
    while (p) {
      if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && p.expression.text === 't') return true;
      p = p.parent;
    }
    return false;
  };

  /**
   * ¿Esta cadena se LEE en pantalla, o es maquinaria?
   *
   * Tres preguntas, en orden de lo más barato a lo más costoso de equivocarse.
   */
  const ATRIBUTOS_DE_MAQUINARIA = new Set([
    'className', 'class', 'style', 'key', 'id', 'href', 'ruta', 'metodo', 'name',
    'type', 'value', 'color', 'bg', 'border', 'icono', 'Icono', 'variante',
    'tipo', 'clave', 'codigo', 'campo', 'accion', 'to', 'src', 'htmlFor', 'role',
  ]);
  const PARECE_MAQUINARIA =
    /^(?:[a-z0-9]+[-:/][a-z0-9[\]./-]*)+$/i.test.bind(
      /^(?:[a-z0-9]+[-:/][a-z0-9[\]./-]*)+$/i,
    );
  const seLee = (n) => {
    const texto = n.text.trim();
    /* 2. La FORMA. */
    if (/^[A-Z0-9_]+$/.test(texto)) return false;                  // CLAVE_DE_ENUM
    if (/^[/#]/.test(texto)) return false;                         // ruta o ancla
    if (PARECE_MAQUINARIA(texto) && !texto.includes(' ')) return false; // clase, mime, slug
    /* 1. El ATRIBUTO que la contiene. 3. El SITIO donde aparece. */
    let p = n.parent, anterior = n;
    while (p) {
      if (ts.isJsxAttribute(p) && ATRIBUTOS_DE_MAQUINARIA.has(p.name.getText(fuente))) return false;
      if (ts.isPropertyAssignment(p) && p.name && ATRIBUTOS_DE_MAQUINARIA.has(p.name.getText(fuente))
          && p.initializer === anterior) return false;
      /* Comparar no es mostrar. */
      if (ts.isBinaryExpression(p)
          && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
              ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken]
             .includes(p.operatorToken.kind)) return false;
      if (ts.isCaseClause(p)) return false;
      if (ts.isComputedPropertyName(p)) return false;
      /* Clave de un objeto —`{ 'Activo': 1 }`— no es texto de pantalla. */
      if (ts.isPropertyAssignment(p) && p.name === anterior) return false;
      /* `['a','b'].includes(x)` y `x.split('de')`: argumento de lógica. */
      if (ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression)
          && ['includes', 'indexOf', 'startsWith', 'endsWith', 'split', 'replace', 'replaceAll', 'match', 'test', 'localeCompare']
             .includes(p.expression.name.text)) return false;
      if (ts.isJsxElement(p) || ts.isJsxSelfClosingElement(p) || ts.isReturnStatement(p)) break;
      anterior = p;
      p = p.parent;
    }
    return true;
  };

  const marcaPartida = (n, texto) => {
    partidas.push(`${archivo}:${fuente.getLineAndCharacterOfPosition(n.getStart(fuente)).line + 1}  ${texto.trim().replace(/\s+/g, ' ').slice(0, 70)}`);
    resumen.partidas++;
  };

  const visita = (n) => {
    if (ts.isJsxElement(n)) {
      /*
       * UN SALTO DE LÍNEA TERMINA LA FRASE.
       *
       * `<div>Estado<br/><b>{pago.estado}</b></div>` es una ETIQUETA y un VALOR,
       * no una frase partida: el `<br/>` los separa. La regla anterior miraba
       * todos los hermanos del elemento, veía un `<b>` con una expresión dentro
       * y lo clasificaba como frase partida, así que ni se envolvía ni se unía
       * —caía entre las dos herramientas—. Abel lo encontró en
       * `rrhh/pagos`: «Estado», «Total», «Aplicado» y «Saldo» en español con el
       * ERP en inglés, y las dos cuentas diciendo cero.
       *
       * Los hijos se parten por los `<br/>`, y la regla de frase partida se
       * aplica DENTRO del tramo donde vive cada texto. Un texto solo en su
       * tramo se envuelve; uno que convive con un valor sigue yendo a mano.
       */
      const tramos = [[]];
      for (const c of n.children) {
        const esSalto = (ts.isJsxSelfClosingElement(c) || ts.isJsxElement(c))
          && (ts.isJsxSelfClosingElement(c) ? c.tagName : c.openingElement.tagName).getText(fuente) === 'br';
        if (esSalto) tramos.push([]);
        else tramos[tramos.length - 1].push(c);
      }
      const tramoDe = (hijo) => tramos.find((t) => t.includes(hijo)) ?? n.children;

      const conTexto = n.children.filter((c) => ts.isJsxText(c) && esTextoVisible(c.text));
      /* Una expresión vacía —`{/* comentario *\/}`— no lleva valor y no parte nada. */
      const expresiones = n.children.filter((c) => ts.isJsxExpression(c) && c.expression);
      /* Etiqueta inline con texto dentro: la frase continúa ahí. */
      const INLINE = new Set(['b','strong','em','i','u','span','a','code','small','mark','abbr','label']);
      for (const hijo of conTexto) {
        if (tTapada(hijo, fuente)) { resumen.tapadas++; continue; }
        /* La vecindad que cuenta es el tramo del texto, no todo el elemento. */
        const tramo = tramoDe(hijo);
        const expresionesCerca = tramo.filter((c) => ts.isJsxExpression(c) && c.expression);
        const inlineCerca = tramo.filter(
          (c) => ts.isJsxElement(c)
            && INLINE.has(c.openingElement.tagName.getText(fuente))
            && c.children.some((h) => (ts.isJsxText(h) && h.text.trim() !== '') || ts.isJsxExpression(h)),
        );
        if (expresionesCerca.length > 0 || inlineCerca.length > 0) {
          marcaPartida(hijo, hijo.text);
          continue;
        }
        const bruto = hijo.text;
        const limpio = bruto.trim().replace(/\s+/g, ' ');
        const iniRel = bruto.indexOf(bruto.trim()[0]);
        const antes = bruto.slice(0, iniRel);
        const despues = bruto.slice(iniRel + bruto.trim().length);
        edits.push({
          ini: hijo.getStart(fuente),
          fin: hijo.getEnd(),
          texto: `${antes}{t(${JSON.stringify(limpio)})}${despues}`,
        });
        resumen.envueltos++;
        if (VOLCADO) volcado.push(`jsx\t${archivo}\t${limpio}`);
        const c = componenteDe(hijo); if (c) componentes.add(c);
      }
    }
    if (ts.isJsxAttribute(n) && n.initializer && ATRIBUTOS_VISIBLES.has(n.name.getText(fuente))) {
      const v = n.initializer;
      const lit = ts.isStringLiteral(v) ? v
        : (ts.isJsxExpression(v) && v.expression && ts.isStringLiteral(v.expression) ? v.expression : null);
      if (lit && (PERMISIVO ? esTextoEnCadena(lit.text) : esEspanol(lit.text)) && !tTapada(lit, fuente)) {
        const limpio = lit.text.trim().replace(/\s+/g, ' ');
        edits.push({ ini: v.getStart(fuente), fin: v.getEnd(), texto: `{t(${JSON.stringify(limpio)})}` });
        resumen.envueltos++;
        if (VOLCADO) volcado.push(`atributo\t${archivo}\t${limpio}`);
        const c = componenteDe(lit); if (c) componentes.add(c);
      }
    }
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n))
        && (PERMISIVO ? esTextoEnCadena(n.text) : esEspanol(n.text))) {
      if (yaTraducido(n)) { /* ya está */ }
      else if (!seLee(n)) { /* maquinaria: ni se cuenta como deuda ni se toca */ }
      else {
        /*
         * EL MISMO TEXTO, ENVUELTO DOS VECES.
         *
         * `title="Formatos de cuenta"` cae en la rama de atributos visibles
         * —que lo deja en `title={t("…")}`— y caería otra vez aquí, porque
         * también es un literal de cadena dentro de un atributo visible. Las
         * dos ediciones se solapan en el mismo tramo del archivo y el
         * resultado es `title=t("Formatos")ta")}`: 59 pantallas del portal sin
         * compilar de una sola corrida, medido el 23-oct-2026.
         *
         * El ERP no lo enseñó porque allá los atributos visibles ya venían
         * escritos entre llaves con algo que no era un literal. Dos casas, la
         * misma regla, un hueco visible sólo en una: por eso la revisión de
         * sintaxis corre siempre después de aplicar, y no sólo antes.
         */
        const atributoDirecto = atributoDeLiteral(n);
        if (tTapada(n, fuente)) { resumen.tapadas++; ts.forEachChild(n, visita); return; }
        if (esSitioProhibido(n) || textosDeTipo.has(n.text)) {
          ts.forEachChild(n, visita);
          return;
        }
        if (atributoDirecto && ATRIBUTOS_VISIBLES.has(atributoDirecto.name.getText(fuente))) {
          ts.forEachChild(n, visita);
          return;
        }

        let p = n.parent, dentroDeJsx = false, atributo = null;
        while (p) {
          if (ts.isJsxAttribute(p)) { atributo = p.name.getText(fuente); break; }
          if (ts.isJsxExpression(p)) { dentroDeJsx = true; break; }
          p = p.parent;
        }
        if (dentroDeJsx || (atributo && ATRIBUTOS_VISIBLES.has(atributo))) {
          const limpio = n.text.trim().replace(/\s+/g, ' ');
          edits.push({ ini: n.getStart(fuente), fin: n.getEnd(), texto: `t(${JSON.stringify(limpio)})` });
          resumen.envueltos++;
          if (VOLCADO) volcado.push(`cadena\t${archivo}\t${limpio}`);
          const c = componenteDe(n); if (c) componentes.add(c);
        } else if (SUELTAS && esEspanol(n.text) && componenteDe(n) && !esLlamadaDeMaquinaria(n, fuente)) {
          const limpio = n.text.trim().replace(/\s+/g, ' ');
          /* `textoVacio="…"` tiene que quedar `textoVacio={t("…")}`: en un
             atributo JSX, sin llaves no es JSX. */
          const envuelto = atributoDirecto && atributoDirecto.initializer === n
            ? `{t(${JSON.stringify(limpio)})}`
            : `t(${JSON.stringify(limpio)})`;
          edits.push({ ini: n.getStart(fuente), fin: n.getEnd(), texto: envuelto });
          resumen.envueltos++;
          if (VOLCADO) volcado.push(`suelta\t${archivo}\t${limpio}`);
          const c = componenteDe(n); if (c) componentes.add(c);
        } else if (!PERMISIVO || esEspanol(n.text)) {
          /* Fuera de JSX no hay sitio que delate: sin acentos ni palabras de
             función, una cadena suelta es tan probablemente una clave como una
             frase, y contarla infla la deuda con ruido. */
          resumen.sueltas++;
        }
      }
    }
    ts.forEachChild(n, visita);
  };
  visita(fuente);

  if (!edits.length) continue;
  resumen.archivos++;

  /*
   * El enganche, una vez por componente que lo necesite.
   *
   * ANTES ESTO PREGUNTABA POR ARCHIVO, y eso tumbó cinco pantallas del ERP el
   * 23-oct-2026. `components/ui/index.tsx` tiene varios componentes; uno ya
   * traía `const t = useT()`, así que `yaTieneT` salía verdadero y NINGUNO de
   * los demás recibía enganche —entre ellos `Cargando`, que acababa de recibir
   * `t("Cargando")`—. El navegador tiraba `t is not defined` mientras la
   * revisión, que preguntaba lo mismo por archivo, contestaba «sin enganche 0».
   *
   * El ámbito de un hook es el componente. La pregunta tiene que ser la misma.
   */
  for (const c of componentes) {
    const cuerpo = c.body.getText(fuente);
    const suyo = /\bconst\s+t\s*=\s*use(?:T|I18n)\(/.test(cuerpo)
      || /\{[^}]*\bt\b[^}]*\}\s*=\s*useI18n\(/.test(cuerpo);
    if (suyo) continue;
    const pos = c.body.getStart(fuente) + 1;
    edits.push({ ini: pos, fin: pos, texto: `\n  const t = useT();` });
    resumen.enganches++;
  }

  let salida = original;
  for (const e of edits.sort((a, b) => b.ini - a.ini)) {
    salida = salida.slice(0, e.ini) + e.texto + salida.slice(e.fin);
  }
  if (!/from '@\/components\/I18nProvider'/.test(salida)) {
    /*
     * El import va DESPUÉS del último import de verdad, y ése lo dice el AST.
     *
     * La primera versión lo buscaba con `/^import[\s\S]*?;/m`, y ese
     * `[\s\S]*?` se comía renglones hasta el primer `;` que encontrara: en dos
     * archivos cayó dentro de una `interface` —entre `id: string;` y
     * `nombre: string;`— y los dejó sin compilar. Con 167 archivos, una regla
     * que acierta el 99 % deja dos pantallas muertas.
     */
    const linea = `import { useT } from '@/components/I18nProvider';\n`;
    /*
     * EL IMPORT VA ARRIBA, NO DETRÁS DEL ÚLTIMO.
     *
     * La versión anterior lo colocaba tras el último `import`, en
     * `getEnd() + 1`. Ese `+1` da por hecho que lo que sigue es un salto de
     * línea, y en dos archivos del ERP el último import terminaba en
     * `…ProtectedElement"; // ← NUEVO`: el corte cayó dentro del comentario y el
     * import acabó DENTRO del cuerpo del componente. Lo encontró `tsc`, no yo.
     *
     * Un import puede ir en cualquier parte del nivel superior, así que de
     * PRIMERO —tras la directiva `'use client'`, que sí tiene que ir primera—
     * es válido siempre y no depende de adivinar dónde termina el último.
     */
    const directiva = /^\s*['"]use client['"];?[^\n]*\n/.exec(salida);
    const corte = directiva ? directiva[0].length : 0;
    salida = salida.slice(0, corte) + linea + salida.slice(corte);
  } else if (!/\buseT\b/.test(salida.split('\n').filter((l) => l.includes('I18nProvider')).join(''))) {
    salida = salida.replace(/import \{([^}]*)\} from '@\/components\/I18nProvider'/, (_, g) => `import {${g.trimEnd()}, useT } from '@/components/I18nProvider'`);
  }

  if (APLICA) writeFileSync(archivo, salida);
}

if (VOLCADO) writeFileSync(VOLCADO, volcado.join('\n') + '\n');
console.log(APLICA ? 'APLICADO' : 'ENSAYO', JSON.stringify(resumen, null, 1));
if (partidas.length) { console.log(`\n--- frases partidas (${partidas.length}), a mano:`); console.log(partidas.slice(0, 25).join('\n')); }
if (servidor.length) { console.log(`\n--- pantallas de servidor (${servidor.length}):`); console.log(servidor.join('\n')); }
