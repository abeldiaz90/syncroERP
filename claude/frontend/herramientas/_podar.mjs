/**
 * PODA EL DICCIONARIO A LO QUE ESTA APLICACIÓN PIDE.
 *
 * NO LA CORRAS a la ligera. Se escribió una vez, para quitar del portal las
 * 4,537 entradas que se le sembraron del ERP y que ninguna pantalla pedía.
 * Cumplido eso, el riesgo de volver a correrla es mayor que el ahorro: su
 * lista de propiedades no es exactamente la de `idioma-tablas.mjs`, y lo que a
 * ella se le escape se borra en silencio. La prueba de que esto no es teórico
 * está abajo.
 *
 * CUIDADO, Y ESTO YA SE ROMPIÓ UNA VEZ: no todo lo que se pide llega como
 * literal. Los textos de las tablas del módulo se piden con una VARIABLE
 * —`t(grupo)`, `t(item.label)`— y una poda que sólo mira literales se los
 * lleva. Pasó el 23-oct-2026 en el portal: 96 de 165 traducciones de tabla
 * desaparecieron del diccionario sin que nada fallara, porque un texto sin
 * entrada se ve en español y no da error.
 *
 * Por eso aquí se unen las DOS fuentes: los literales de `t('…')` y los textos
 * de las tablas del módulo, los mismos que cuenta `idioma-tablas.mjs`.
 *
 * Sembrar el portal con las 4,730 entradas del ERP ahorró 193 traducciones y
 * metió 4,537 cadenas que ninguna pantalla del portal pide: eso viaja al
 * navegador en cada carga. El diccionario es dato, no librería: sólo lleva lo
 * que su propia aplicación usa.
 */
import ts from 'typescript';
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const idioma = process.argv[2] ?? 'en-US';
function archivos(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '.next' || n === 'traducciones') continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) archivos(p, out);
    else if (/\.tsx?$/.test(n) && !/\.spec\.|\.test\./.test(n)) out.push(p);
  }
  return out;
}
const pedidas = new Set();
for (const raiz of ['app', 'components', 'lib']) for (const a of archivos(raiz)) {
  const f = ts.createSourceFile(a, readFileSync(a, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const v = (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 't'
        && n.arguments.length && (ts.isStringLiteral(n.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(n.arguments[0]))) {
      pedidas.add(n.arguments[0].text);
    }
    ts.forEachChild(n, v);
  };
  v(f);
}
/* Y los textos de las tablas del módulo, que se piden con una variable. */
const PROPIEDADES = new Set([
  'label', 'etiqueta', 'nombre', 'titulo', 'subtitulo', 'descripcion', 'desc',
  'detalle', 'texto', 'leyenda', 'grupo', 'modulo', 'seccion', 'mensaje',
  'ayuda', 'resumen', 'encabezado', 'pie', 'que', 'queHacer', 'textoBoton',
]);
for (const raiz of ['app', 'components', 'lib']) for (const a of archivos(raiz)) {
  const f = ts.createSourceFile(a, readFileSync(a, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const v = (n) => {
    if (ts.isPropertyAssignment(n) && n.name && ts.isStringLiteral(n.initializer)
        && PROPIEDADES.has(n.name.getText(f))) pedidas.add(n.initializer.text.trim());
    ts.forEachChild(n, v);
  };
  v(f);
}

const ruta = `lib/traducciones/_${idioma}.json`;
const dic = JSON.parse(readFileSync(ruta, 'utf8'));
const podado = {};
for (const k of Object.keys(dic)) if (pedidas.has(k)) podado[k] = dic[k];
writeFileSync(ruta, JSON.stringify(podado, null, 1) + '\n');
console.log(`pide ${pedidas.size} · diccionario ${Object.keys(dic).length} → ${Object.keys(podado).length}`);
