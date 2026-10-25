/**
 * ============================================================================
 * EL ENGANCHE QUE FALTABA, COMPONENTE POR COMPONENTE
 * ----------------------------------------------------------------------------
 * QUÉ SE ROMPIÓ, Y POR QUÉ LA REVISIÓN DIJO QUE TODO ESTABA BIEN
 *
 * `components/ui/index.tsx` tiene varios componentes. Uno de ellos ya traía
 * `const t = useT()` desde antes. El codemod preguntaba «¿este ARCHIVO ya tiene
 * `t`?», la respuesta era sí, y por eso no le puso enganche a NINGUNO de los
 * demás —entre ellos `Cargando`, que acababa de recibir `t("Cargando")`—.
 *
 * `idioma-revisar.mjs` preguntaba lo mismo, también por archivo, y por eso
 * contestó «sin enganche 0» mientras la pantalla tiraba
 * `ReferenceError: t is not defined` en el navegador. Una prueba que mira el
 * archivo cuando el ámbito es el componente no es una prueba: es un permiso.
 *
 * MEDIDO el 23-oct-2026 en el ERP con el servidor levantado: cinco pantallas
 * caídas, todas por el mismo componente compartido.
 *
 * QUÉ HACE ESTA HERRAMIENTA
 *
 * Recorre el AST, busca cada llamada a `t(`, sube hasta el componente que la
 * contiene y le pone `const t = useT();` si ni él ni ningún ámbito que lo
 * envuelve declara `t`. Es un arreglo, no un envoltorio: no toca textos.
 *
 *   node herramientas/idioma-enganchar.mjs app,components            (ensayo)
 *   node herramientas/idioma-enganchar.mjs app,components --aplica
 * ============================================================================
 */
import ts from 'typescript';
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RAICES = process.argv[2].split(',');
const APLICA = process.argv.includes('--aplica');

function archivos(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '.next' || n === 'traducciones') continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) archivos(p, out);
    else if (/\.tsx$/.test(n) && !/\.spec\.|\.test\./.test(n)) out.push(p);
  }
  return out;
}

/** ¿Este bloque declara `t`, de cualquiera de las dos formas? */
function declaraT(bloque, fuente) {
  let encontrado = false;
  for (const st of bloque.statements ?? []) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && d.name.text === 't') encontrado = true;
      if (ts.isObjectBindingPattern(d.name)
          && d.name.elements.some((el) => ts.isIdentifier(el.name) && el.name.text === 't')) encontrado = true;
    }
  }
  return encontrado;
}

let arreglados = 0, archivosTocados = 0;
for (const raiz of RAICES) for (const archivo of archivos(raiz)) {
  const original = readFileSync(archivo, 'utf8');
  if (!/\bt\(["'`]/.test(original)) continue;
  /* El proveedor DEFINE `t`; las pantallas de servidor lo sacan de `tDelServidor`. */
  if (/components[\\/]I18nProvider\.tsx$/.test(archivo)) continue;
  if (!/^\s*['"]use client['"]/m.test(original)) continue;

  const fuente = ts.createSourceFile(archivo, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const faltantes = new Set();

  const visita = (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 't'
        && n.arguments.length && (ts.isStringLiteral(n.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(n.arguments[0]))) {
      /* Sube el ámbito: si CUALQUIER bloque que lo envuelve declara `t`, está servido. */
      let p = n.parent, componente = null, servido = false;
      while (p) {
        if (ts.isBlock(p) && declaraT(p, fuente)) { servido = true; break; }
        if (ts.isSourceFile(p) && declaraT(p, fuente)) { servido = true; break; }
        if (!componente
            && (ts.isFunctionDeclaration(p) || ts.isArrowFunction(p) || ts.isFunctionExpression(p))
            && p.body && ts.isBlock(p.body)) {
          const nombre = ts.isFunctionDeclaration(p) && p.name ? p.name.text
            : (p.parent && ts.isVariableDeclaration(p.parent) && ts.isIdentifier(p.parent.name) ? p.parent.name.text : '');
          if (/^[A-Z]/.test(nombre) || (ts.isFunctionDeclaration(p) && !nombre)) componente = p;
        }
        p = p.parent;
      }
      if (!servido && componente) faltantes.add(componente);
      if (!servido && !componente) console.log(`FUERA DE COMPONENTE ${archivo}:${fuente.getLineAndCharacterOfPosition(n.getStart(fuente)).line + 1}`);
    }
    ts.forEachChild(n, visita);
  };
  visita(fuente);

  if (!faltantes.size) continue;
  archivosTocados++;
  let salida = original;
  const cortes = [...faltantes].map((c) => c.body.getStart(fuente) + 1).sort((a, b) => b - a);
  for (const pos of cortes) {
    salida = salida.slice(0, pos) + `\n  const t = useT();` + salida.slice(pos);
    arreglados++;
    console.log(`ENGANCHE ${archivo}`);
  }
  if (!/from ['"]@\/components\/I18nProvider['"]/.test(salida)) {
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
    salida = salida.slice(0, corte) + `import { useT } from '@/components/I18nProvider';\n` + salida.slice(corte);
  } else if (!/\buseT\b/.test(salida.split('\n').filter((l) => l.includes('I18nProvider')).join(''))) {
    salida = salida.replace(/import \{([^}]*)\} from '@\/components\/I18nProvider'/, (_, g) => `import {${g.trimEnd()}, useT } from '@/components/I18nProvider'`);
  }
  if (APLICA) writeFileSync(archivo, salida);
}
console.log(APLICA ? 'APLICADO' : 'ENSAYO', `enganches ${arreglados} en ${archivosTocados} archivos`);
