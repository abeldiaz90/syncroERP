/**
 * Revisión rápida de lo que dejó el codemod, sin esperar a `tsc`:
 *  1. que cada archivo siga siendo sintácticamente válido;
 *  2. que donde se usa `t(` exista el enganche y el import;
 *  3. que no haya quedado un `t(` fuera de un componente (sin enganche visible).
 */
import ts from 'typescript';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function archivos(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '.next') continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) archivos(p, out);
    else if (/\.tsx$/.test(n)) out.push(p);
  }
  return out;
}

let roto = 0, sinEnganche = 0, sinImport = 0, duplicados = 0, revisados = 0;
for (const raiz of process.argv[2].split(',')) for (const archivo of archivos(raiz)) {
  const texto = readFileSync(archivo, 'utf8');
  if (!/\bt\(["'`]/.test(texto)) continue;
  /* El proveedor DEFINE `t`: no lo importa ni lo engancha, y está bien así. */
  if (/components[\\/]I18nProvider\.tsx$/.test(archivo)) continue;
  revisados++;
  const fuente = ts.createSourceFile(archivo, texto, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const diags = fuente.parseDiagnostics ?? [];
  if (diags.length) {
    roto++;
    const d = diags[0];
    const { line } = fuente.getLineAndCharacterOfPosition(d.start ?? 0);
    console.log(`SINTAXIS ${archivo}:${line + 1} ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
  }
  /*
   * DOS CAMINOS AL MISMO DICCIONARIO, Y HAY QUE ACEPTAR LOS DOS.
   *
   * Una pantalla de cliente engancha `t` con `useT()` desde el proveedor; una
   * de servidor no puede —no hay contexto de React— y la saca de
   * `await tDelServidor()`. En el portal de Fineract 29 de 111 pantallas son de
   * servidor, asi que mirar solo el camino del cliente convierte el acierto en
   * dos falsos «SIN ENGANCHE» y ensena a ignorar la revision.
   */
  if (!/from ['"]@\/components\/I18nProvider['"]/.test(texto)
      && !/from ['"]@\/lib\/idioma-servidor['"]/.test(texto)) { sinImport++; console.log('SIN IMPORT', archivo); }
  /*
   * EL ENGANCHE SE MIRA POR COMPONENTE, NO POR ARCHIVO.
   *
   * Esta misma linea preguntaba «¿el ARCHIVO tiene `t`?» y por eso dijo «sin
   * enganche 0» mientras cinco pantallas del ERP tiraban
   * `ReferenceError: t is not defined` en el navegador: en
   * `components/ui/index.tsx` un componente ya traia el hook y los otros
   * cuatro, recien envueltos, no. El ambito de un hook es el componente; una
   * prueba que mira el archivo no prueba nada, solo da permiso.
   *
   * Ahora sube el ambito desde cada llamada a `t(`: basta con que CUALQUIER
   * bloque que la envuelve declare `t`.
   */
  const declaraT = (bloque) => {
    for (const st of bloque.statements ?? []) {
      if (!ts.isVariableStatement(st)) continue;
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.name.text === 't') return true;
        if (ts.isObjectBindingPattern(d.name)
            && d.name.elements.some((el) => ts.isIdentifier(el.name) && el.name.text === 't')) return true;
      }
    }
    return false;
  };
  let huerfanas = 0;
  const busca = (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 't'
        && n.arguments.length
        && (ts.isStringLiteral(n.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(n.arguments[0]))) {
      let p = n.parent, servido = false;
      while (p) {
        if ((ts.isBlock(p) || ts.isSourceFile(p)) && declaraT(p)) { servido = true; break; }
        p = p.parent;
      }
      if (!servido) huerfanas++;
    }
    ts.forEachChild(n, busca);
  };
  busca(fuente);
  if (huerfanas) {
    sinEnganche++;
    console.log(`SIN ENGANCHE ${archivo} (${huerfanas} llamadas a t sin t en su ambito)`);
  }
  /*
   * Y DOS ENGANCHES EN EL MISMO ÁMBITO, que es peor que ninguno: no compila y
   * la pantalla sale en blanco. Pasó en `app/dashboard/layout.tsx`, que ya
   * sacaba `t` desestructurando `useI18n()` y recibió además un `useT()`.
   * Se cuenta por componente, no por archivo: un archivo puede tener varios.
   */
  const porComponente = new Map();
  const visita = (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === 't') {
      let p = n.parent;
      while (p && !(ts.isBlock(p) || ts.isSourceFile(p))) p = p.parent;
      porComponente.set(p, (porComponente.get(p) ?? 0) + 1);
    }
    if (ts.isVariableDeclaration(n) && ts.isObjectBindingPattern(n.name)
        && n.name.elements.some((el) => ts.isIdentifier(el.name) && el.name.text === 't')) {
      let p = n.parent;
      while (p && !(ts.isBlock(p) || ts.isSourceFile(p))) p = p.parent;
      porComponente.set(p, (porComponente.get(p) ?? 0) + 1);
    }
    ts.forEachChild(n, visita);
  };
  visita(fuente);
  for (const [, cuantos] of porComponente) {
    if (cuantos > 1) { duplicados++; console.log(`DOS ENGANCHES ${archivo} (${cuantos} en el mismo ámbito)`); break; }
  }
}
console.log(`revisados ${revisados} | sintaxis rota ${roto} | sin import ${sinImport} | sin enganche ${sinEnganche} | dos enganches ${duplicados}`);
