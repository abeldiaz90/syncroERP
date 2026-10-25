/**
 * ============================================================================
 * UNA OPCIÓN QUE ES SU PROPIO VALOR
 * ----------------------------------------------------------------------------
 * `<option>TRANSFERENCIA</option>` se lee en pantalla Y se manda al servidor:
 * sin atributo `value`, el navegador usa el texto. Por eso ningún barrido lo
 * podía envolver — traducirlo mandaría «TRANSFER» al backend, que espera
 * «TRANSFERENCIA» — y por eso se quedó en español con el ERP en inglés.
 *
 * La separación es el arreglo, no el envoltorio:
 *
 *     <option value="TRANSFERENCIA">{t('TRANSFERENCIA')}</option>
 *
 * El valor queda fijo y el texto se traduce. Lo que viaja al servidor no
 * cambia, y la clave del diccionario es el propio enum, así que la traducción
 * se escribe una vez y vale para todas las pantallas.
 *
 *   node herramientas/idioma-opciones.mjs app,components           (ensayo)
 *   node herramientas/idioma-opciones.mjs app,components --aplica
 * ============================================================================
 */
import ts from 'typescript';
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const RAICES = process.argv[2].split(',');
const APLICA = process.argv.includes('--aplica');
function archivos(dir, out = []) {
  const st = statSync(dir);
  if (!st.isDirectory()) { if (/\.tsx$/.test(dir)) out.push(dir); return out; }
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '.next' || n === 'traducciones') continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) archivos(p, out);
    else if (/\.tsx$/.test(n) && !/\.spec\./.test(n)) out.push(p);
  }
  return out;
}
let tocados = 0, archivosTocados = 0;
const claves = new Set();
for (const raiz of RAICES) for (const archivo of archivos(raiz)) {
  const original = readFileSync(archivo, 'utf8');
  if (!/<option>/.test(original)) continue;
  const fuente = ts.createSourceFile(archivo, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  const visita = (n) => {
    if (ts.isJsxElement(n) && n.openingElement.tagName.getText(fuente) === 'option'
        && n.openingElement.attributes.properties.length === 0
        && n.children.length === 1 && ts.isJsxText(n.children[0])) {
      const texto = n.children[0].text.trim();
      /* Sólo lo que de verdad se lee: una palabra con letras, no un número. */
      if (texto && /[A-Za-zÁÉÍÓÚÑ]/.test(texto)) {
        edits.push({
          ini: n.getStart(fuente),
          fin: n.getEnd(),
          texto: `<option value=${JSON.stringify(texto)}>{t(${JSON.stringify(texto)})}</option>`,
        });
        claves.add(texto);
        tocados++;
      }
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
console.log(APLICA ? 'APLICADO' : 'ENSAYO', `${tocados} opciones en ${archivosTocados} archivos`);
console.log([...claves].sort().join('\n'));
