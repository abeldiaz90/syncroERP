/**
 * ============================================================================
 * UNA `t` QUE NO ERA LA `t` DEL IDIOMA
 * ----------------------------------------------------------------------------
 * EL PEOR FALLO DE TODO ESTO, Y NO LO ENCONTRÓ NINGUNA DE MIS CUENTAS
 *
 * `TIPOS.map((t) => <option>{t(t.label)}</option>)`. La `t` de ese `map` es un
 * elemento del arreglo, no la función de traducir: el codemod escribió una
 * llamada a algo que no es una función, en un ámbito donde el nombre estaba
 * ocupado. En `inventario/transferencias` hay 19 casos en un solo archivo,
 * porque la variable del bucle se llama `t` y la fila se llama `t`.
 *
 * No es un error de tipos con un arreglo cosmético: es `t is not a function`
 * en el navegador, y el texto que quería traducir ya no se pinta. Lo que lo
 * delató fue `npx tsc --noEmit` —«This expression is not callable»—, es decir
 * el compilador, no yo: mis revisiones comprobaban que `t` EXISTIERA en el
 * ámbito, nunca que la `t` del ámbito fuera la del idioma. Una pregunta a
 * medias contestada con confianza entera.
 *
 * QUÉ HACE ESTA HERRAMIENTA
 *
 * Deshace el envoltorio donde la `t` más cercana no es la del idioma: devuelve
 * el literal como estaba. El texto se queda en español y pasa a la lista de
 * deuda, que es infinitamente mejor que una pantalla caída. Renombrar la
 * variable ajena sería tocar código que no es de la traducción.
 *
 *   node herramientas/idioma-desensombrar.mjs app,components           (ensayo)
 *   node herramientas/idioma-desensombrar.mjs app,components --aplica
 * ============================================================================
 */
import ts from 'typescript';
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RAICES = process.argv[2].split(',');
const APLICA = process.argv.includes('--aplica');

function archivos(dir, out = []) {
  const st = statSync(dir);
  if (!st.isDirectory()) { if (/\.tsx?$/.test(dir)) out.push(dir); return out; }
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '.next' || n === 'traducciones') continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) archivos(p, out);
    else if (/\.tsx?$/.test(n) && !/\.spec\./.test(n)) out.push(p);
  }
  return out;
}

/**
 * ¿La `t` que ve este nodo es la del idioma?
 *
 * ESTA FUNCIÓN YA ESTUVO MAL UNA VEZ, Y ASÍ PASÓ:
 *
 * La primera versión miraba, en una declaración, el nombre simple (`const t =`)
 * y el desestructurado de OBJETO (`const { t } = useI18n()`) — y se olvidó del
 * desestructurado de ARREGLO. En `savings-products` hay un
 * `const [p, t, m] = await Promise.all([...])`: `t` es una `Response`, y la
 * llamada `t("No fue posible consultar productos.")` se le escapó. La cazó
 * `next build` —«Type 'Response' has no call signatures»—, no esta herramienta.
 *
 * La causa de fondo no fue el olvido: fue que la MISMA pregunta estaba escrita
 * dos veces, aquí y en `tTapada` de las herramientas que envuelven, y sólo una
 * de las dos contemplaba el arreglo. Ahora las dos usan el mismo juego de
 * reglas, con los tres patrones: nombre simple, objeto y arreglo.
 */
function tapaElNombre(nombre) {
  if (ts.isIdentifier(nombre)) return nombre.text === 't';
  if (ts.isArrayBindingPattern(nombre)) {
    return nombre.elements.some((el) => !ts.isOmittedExpression(el) && ts.isIdentifier(el.name) && el.name.text === 't');
  }
  if (ts.isObjectBindingPattern(nombre)) {
    return nombre.elements.some((el) => ts.isIdentifier(el.name) && el.name.text === 't');
  }
  return false;
}

function tDelIdioma(nodo, fuente) {
  const esFuenteBuena = (ini) => {
    if (!ini) return false;
    const txt = ini.getText(fuente);
    return /use(?:T|I18n)\s*\(/.test(txt) || /tDelServidor\s*\(/.test(txt);
  };
  let p = nodo.parent;
  while (p) {
    if (ts.isFunctionDeclaration(p) || ts.isArrowFunction(p) || ts.isFunctionExpression(p) || ts.isMethodDeclaration(p)) {
      if (p.parameters.some((par) => tapaElNombre(par.name))) return false;
    }
    if (ts.isCatchClause(p) && p.variableDeclaration && tapaElNombre(p.variableDeclaration.name)) return false;
    if (ts.isBlock(p) || ts.isSourceFile(p)) {
      for (const st of p.statements ?? []) {
        if (!ts.isVariableStatement(st)) continue;
        for (const d of st.declarationList.declarations) {
          if (tapaElNombre(d.name)) return esFuenteBuena(d.initializer);
        }
      }
    }
    p = p.parent;
  }
  return false;
}

let desenvueltos = 0, archivosTocados = 0;
const casos = [];
for (const raiz of RAICES) for (const archivo of archivos(raiz)) {
  const original = readFileSync(archivo, 'utf8');
  if (!/\bt\(/.test(original)) continue;
  if (/components[\\/]I18nProvider\.tsx$/.test(archivo)) continue;
  const fuente = ts.createSourceFile(archivo, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  const visita = (n) => {
    /*
     * No sólo los literales. `idioma-render.mjs` envuelve SITIOS DE RENDER
     * —`{item.label}` → `{t(item.label)}`— y dentro de un `TIPOS.map((t) => …)`
     * eso produce `t(t.label)`: la peor de todas, porque parece una traducción
     * y es una llamada a un objeto. Aquí se deshace igual: vuelve el argumento.
     */
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 't'
        && n.arguments.length >= 1
        && !tDelIdioma(n, fuente)) {
      /*
       * Se devuelve SÓLO el primer argumento. Si la llamada llevaba datos de
       * marcadores —`t('Faltan {n0}', { n0: x })`— el literal con `{n0}` dentro
       * no se puede dejar suelto: eso se marca y se arregla a mano.
       */
      const literal = ts.isStringLiteral(n.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(n.arguments[0]);
      if (n.arguments.length > 1 || (literal && /\{n\d+\}/.test(n.arguments[0].text))) {
        casos.push(`A MANO   ${archivo}:${fuente.getLineAndCharacterOfPosition(n.getStart(fuente)).line + 1}  ${n.arguments[0].getText(fuente).slice(0, 60)}`);
        ts.forEachChild(n, visita);
        return;
      }
      edits.push({ ini: n.getStart(fuente), fin: n.getEnd(), texto: n.arguments[0].getText(fuente) });
      casos.push(`DESENVUELTO ${archivo}:${fuente.getLineAndCharacterOfPosition(n.getStart(fuente)).line + 1}  ${n.arguments[0].getText(fuente).slice(0, 60)}`);
      desenvueltos++;
    }
    ts.forEachChild(n, visita);
  };
  visita(fuente);
  if (!edits.length) continue;
  archivosTocados++;
  let salida = original;
  for (const e of edits.sort((a, b) => b.ini - a.ini)) salida = salida.slice(0, e.ini) + e.texto + salida.slice(e.fin);
  if (APLICA) writeFileSync(archivo, salida);
}
console.log(APLICA ? 'APLICADO' : 'ENSAYO', `${desenvueltos} desenvueltos en ${archivosTocados} archivos`);
if (casos.length) console.log(casos.join('\n'));

/*
 * En ensayo esto es una REVISIÓN: si encuentra una sola `t` tapada, falla. Es
 * la pregunta que ninguna de mis comprobaciones hacía, y la que tumbó pantallas.
 */
if (!APLICA && desenvueltos > 0) process.exitCode = 1;
