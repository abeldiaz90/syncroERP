/**
 * ============================================================================
 * EL TEXTO QUE VIVE EN UNA TABLA DEL MÓDULO
 * ----------------------------------------------------------------------------
 * «ESTADOS FINANCIEROS», «CONFIGURACIÓN», «REGISTRO», «FISCAL»: los
 * encabezados del menú seguían en español con el ERP en inglés, y la
 * traducción YA ESTABA en el diccionario. Lo que faltaba no era traducir: era
 * llamar a `t()` donde se pinta.
 *
 * Esos textos viven en constantes del módulo —`app/dashboard/module-config.ts`,
 * `grupo: "Estados financieros"`— fuera de cualquier componente, donde no hay
 * hook que los envuelva. El codemod los cuenta como «sueltas» y no los toca,
 * con razón: declararlos no es pintarlos. Pero contarlos y dejarlos ahí es
 * exactamente *un vacío afirmado que no se comprobó*, porque el número decía
 * «faltan 384» y nadie sabía cuáles se veían en pantalla.
 *
 * Esta herramienta los lista: archivo, constante, propiedad y texto. Con eso
 * se envuelve el SITIO DE RENDER —`{t(grupo)}`— que es donde sí hay hook.
 *
 *   node herramientas/idioma-tablas.mjs app,components,lib
 * ============================================================================
 */
import ts from 'typescript';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const ACENTOS = /[áéíóúñÁÉÍÓÚÑ¿¡]/;
const PALABRAS = /\b(de|la|el|los|las|que|para|con|sin|por|una|un|del|al|se|no|su|más|este|esta|cuando|todo|toda|cada|ya|si|lo|le|es|son|hay|y|o|pero|como|desde|hasta|sobre)\b/i;
const esTexto = (t) => {
  t = t.trim();
  if (t.length < 3 || !/[a-zA-Z]/.test(t)) return false;
  if (/[{}]/.test(t) || /^https?:|^\/|^@\/|^#/.test(t)) return false;
  if (!/\s/.test(t) && /^[a-z][a-zA-Z0-9_]*$/.test(t)) return false;
  if (/^(?:GET|POST|PATCH|PUT|DELETE)\s+\//.test(t)) return false;
  return true;
};
const PROPIEDADES = new Set([
  'grupo', 'modulo', 'nombre', 'label', 'etiqueta', 'titulo', 'title',
  'descripcion', 'desc', 'detalle', 'texto', 'subtitulo', 'leyenda', 'seccion',
  'mensaje', 'ayuda', 'resumen', 'encabezado', 'pie', 'que', 'queHacer',
]);
function archivos(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '.next' || n === 'traducciones') continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) archivos(p, out);
    else if (/\.tsx?$/.test(n) && !/\.spec\.|\.test\./.test(n)) out.push(p);
  }
  return out;
}
const porPropiedad = new Map();
const todos = new Set();
let total = 0;
for (const raiz of process.argv[2].split(',')) for (const a of archivos(raiz)) {
  const f = ts.createSourceFile(a, readFileSync(a, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  /* Sólo lo que está FUERA de toda función: eso es una tabla del módulo. */
  const enFuncion = (n) => {
    let p = n.parent;
    while (p) {
      if (ts.isFunctionDeclaration(p) || ts.isArrowFunction(p) || ts.isFunctionExpression(p) || ts.isMethodDeclaration(p)) return true;
      p = p.parent;
    }
    return false;
  };
  const dentroDeT = (n) => {
    let p = n.parent;
    while (p) { if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && p.expression.text === 't') return true; p = p.parent; }
    return false;
  };
  const visita = (n) => {
    if (ts.isPropertyAssignment(n) && n.name && ts.isStringLiteral(n.initializer)
        && PROPIEDADES.has(n.name.getText(f)) && esTexto(n.initializer.text)
        && !enFuncion(n) && !dentroDeT(n.initializer)) {
      const clave = `${a}  ·  ${n.name.getText(f)}`;
      const v = porPropiedad.get(clave) ?? new Set();
      v.add(n.initializer.text.trim());
      porPropiedad.set(clave, v);
      todos.add(n.initializer.text.trim());
      total++;
    }
    ts.forEachChild(n, visita);
  };
  visita(f);
}
for (const [k, v] of [...porPropiedad].sort((a, b) => b[1].size - a[1].size)) {
  console.log(`${String(v.size).padStart(4)}  ${k}`);
  console.log(`      ${[...v].slice(0, 6).join(' | ')}`);
}
console.log(`\nTOTAL ${total} textos en ${porPropiedad.size} tablas del módulo`);

/*
 * Y LOS QUE NO TIENEN ENTRADA EN EL DICCIONARIO.
 *
 * Es la cuenta que `idioma-pendientes.mjs` NO puede dar: ahí la clave llega
 * como variable —`t(grupo)`— y una variable no se puede leer sin ejecutar el
 * programa. Por eso esta cuenta se saca del otro lado: de la tabla.
 */
const idioma = (process.argv.find((a) => /^--faltan=/.test(a)) ?? '').slice(9);
if (idioma) {
  const dic = JSON.parse(readFileSync(`lib/traducciones/_${idioma}.json`, 'utf8'));
  const faltan = [...todos].filter((k) => !(k in dic));
  console.log(`\n${idioma}: ${todos.size} textos de tabla · ${todos.size - faltan.length} traducidos · FALTAN ${faltan.length}`);
  if (process.argv.includes('--listar')) for (const k of faltan) console.log(k);
}
