/* Todo texto de pantalla que esta pantalla NO pasa por t(), sea del idioma que sea. */
import ts from 'typescript';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const PARECE_CSS = (t) => /[{}]/.test(t) || /^@(?:media|keyframes|page)\b/.test(t)
  || /\b(?:rgb|rgba|hsl|var|calc|url)\(/.test(t) || /^[\d.]+(?:px|rem|em|vh|vw|%)\b/.test(t);
const esVisible = (s) => {
  const t = s.trim();
  if (t.length < 2 || !/[a-zA-Z]/.test(t)) return false;
  if (PARECE_CSS(t)) return false;
  if (/^https?:|^\/\/|^@\/|^#[0-9a-f]{3,8}$/i.test(t)) return false;
  if (!/\s/.test(t) && /^[a-z][a-zA-Z0-9_]*$/.test(t)) return false;
  if (!/[A-ZÁÉÍÓÚÑ]/.test(t) && t.split(/\s+/).every((w) => /[-:]/.test(w))) return false;
  return true;
};
function archivos(dir, out = []) {
  const st = statSync(dir);
  if (!st.isDirectory()) { out.push(dir); return out; }
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) archivos(p, out);
    else if (/\.tsx?$/.test(n)) out.push(p);
  }
  return out;
}
const VISIBLES = new Set(['title','placeholder','alt','label','aria-label','etiqueta','titulo','descripcion','texto','mensaje','ayuda','leyenda','subtitulo']);
for (const a of archivos(process.argv[2])) {
  const src = readFileSync(a, 'utf8');
  const f = ts.createSourceFile(a, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const dentroDeT = (n) => { let p = n.parent; while (p) { if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && p.expression.text === 't') return true; p = p.parent; } return false; };
  const linea = (n) => f.getLineAndCharacterOfPosition(n.getStart(f)).line + 1;
  const v = (n) => {
    if (ts.isJsxText(n) && esVisible(n.text) && !dentroDeT(n))
      console.log(`${a}:${linea(n)}  JSX      ${n.text.trim().replace(/\s+/g,' ').slice(0,80)}`);
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && esVisible(n.text) && !dentroDeT(n)) {
      /* ¿está en un sitio que se lee? atributo visible, dentro de JSX, o argumento de aviso */
      let p = n.parent, sitio = null;
      while (p) {
        if (ts.isJsxAttribute(p)) { sitio = VISIBLES.has(p.name.getText(f)) ? 'ATRIBUTO' : null; break; }
        if (ts.isJsxExpression(p)) { sitio = 'EN-JSX'; break; }
        if (ts.isTypeNode(p) || ts.isImportDeclaration(p)) { sitio = null; break; }
        if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && /^(avisar|toast|mostrarToast|setError|setErr|setMensaje|setAviso|alert|confirmarElegante|solicitarTexto)$/.test(p.expression.text)) { sitio = 'AVISO'; break; }
        p = p.parent;
      }
      if (sitio) console.log(`${a}:${linea(n)}  ${sitio.padEnd(8)} ${n.text.trim().replace(/\s+/g,' ').slice(0,80)}`);
    }
    ts.forEachChild(n, v);
  };
  v(f);
}
