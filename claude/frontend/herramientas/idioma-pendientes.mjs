/**
 * Qué falta por traducir: las claves que `t(...)` ya pide y el diccionario no
 * tiene. Es la cuenta que decide si esto está terminado.
 *
 *   node herramientas/idioma-pendientes.mjs en-US              (sólo el número)
 *   node herramientas/idioma-pendientes.mjs en-US --listar 200  (las primeras N)
 *   node herramientas/idioma-pendientes.mjs en-US --json f.json (para traducir)
 */
import ts from 'typescript';
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const idioma = process.argv[2] ?? 'en-US';

/*
 * El diccionario se lee del `.json`, que es la fuente de verdad. La primera
 * versión lo sacaba del `.ts` con una expresión regular y se atragantaba con
 * las comillas escapadas; ver `idioma-poner.mjs`.
 */
const dic = new Set();
try {
  dic.clear();
  for (const k of Object.keys(JSON.parse(readFileSync(`lib/traducciones/_${idioma}.json`, 'utf8')))) dic.add(k);
} catch { /* sin diccionario, todo está pendiente */ }

function archivos(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '.next') continue;
    /* El diccionario GUARDA español: no es deuda, es la traducción. */
    if (n === 'traducciones') continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) archivos(p, out);
    else if (/\.tsx?$/.test(n) && !/\.spec\.|\.test\./.test(n)) out.push(p);
  }
  return out;
}

const pedidas = new Map();
for (const raiz of ['app', 'components', 'lib']) {
  for (const archivo of archivos(raiz)) {
    const texto = readFileSync(archivo, 'utf8');
    if (!/\bt\(/.test(texto)) continue;
    const f = ts.createSourceFile(archivo, texto, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visita = (n) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 't'
          && n.arguments.length && (ts.isStringLiteral(n.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(n.arguments[0]))) {
        const clave = n.arguments[0].text.trim().replace(/\s+/g, ' ');
        pedidas.set(clave, (pedidas.get(clave) ?? 0) + 1);
      }
      ts.forEachChild(n, visita);
    };
    visita(f);
  }
}

const faltan = [...pedidas.entries()].filter(([k]) => !dic.has(k)).sort((a, b) => b[1] - a[1]);
console.log(`${idioma}: pide ${pedidas.size} claves · traducidas ${pedidas.size - faltan.length} · FALTAN ${faltan.length}`);
const iL = process.argv.indexOf('--listar');
if (iL > 0) console.log(faltan.slice(0, Number(process.argv[iL + 1] ?? 50)).map(([k, n]) => `${n}\t${k}`).join('\n'));
const iJ = process.argv.indexOf('--json');
if (iJ > 0) {
  const cuantas = Number(process.argv[iJ + 2] ?? faltan.length);
  writeFileSync(process.argv[iJ + 1], JSON.stringify(faltan.slice(0, cuantas).map(([k]) => k), null, 0));
  console.log(`escritas ${Math.min(cuantas, faltan.length)} claves en ${process.argv[iJ + 1]}`);
}

/*
 * ============================================================================
 * Y QUE LOS MARCADORES CUADREN.
 * ----------------------------------------------------------------------------
 * Una frase partida se traduce en UNA clave con marcadores —`t('Faltan {n0} de
 * {n1}', { n0, n1 })`— justamente para que el inglés pueda colocar el número
 * donde le toque. El precio de esa libertad es que la traducción TIENE que
 * llevar los mismos marcadores: si el inglés se come un `{n1}`, el valor
 * desaparece de la pantalla sin un solo error en consola, y nadie lo nota hasta
 * que un cliente pregunta por el número que falta.
 *
 * Son 229 claves con marcadores en el ERP. A mano no se revisan; aquí sí.
 * ============================================================================
 */
let desigualesGlobal = 0;
{
  const marcadores = (s) => [...String(s).matchAll(/\{(n\d+|[a-zA-Z]+)\}/g)].map((m) => m[1]).sort().join(',');
  let desiguales = 0, conMarcador = 0;
  try {
    const dicc = JSON.parse(readFileSync(`lib/traducciones/_${idioma}.json`, 'utf8'));
    for (const [clave, valor] of Object.entries(dicc)) {
      const a = marcadores(clave);
      if (!a) continue;
      conMarcador++;
      if (a !== marcadores(valor)) {
        desiguales++;
        if (desiguales <= 10) console.log(`MARCADORES  ES[${a}]  EN[${marcadores(valor)}]  ${clave.slice(0, 64)}`);
      }
    }
  } catch { /* sin diccionario no hay nada que cruzar */ }
  console.log(`${idioma}: ${conMarcador} claves con marcadores · ${desiguales} con marcadores desiguales`);
  desigualesGlobal = desiguales;
}

/*
 * CÓDIGO DE SALIDA.
 *
 * Una cuenta que sólo se imprime se lee cuando alguien se acuerda. Con salida
 * distinta de cero, «FALTAN 0» se puede exigir: `npm run idioma:revisar` falla
 * y nadie puede decir «completo» sin que la cuenta lo respalde.
 */
if (faltan.length > 0 || desigualesGlobal > 0) process.exitCode = 1;
