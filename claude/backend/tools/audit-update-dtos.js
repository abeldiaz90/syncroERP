const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..', 'src');
const hallazgos = [];

function tieneDecoradorBody(parametro, sourceFile) {
  const texto = parametro.getFullText(sourceFile);
  return /@Body\s*\(/.test(texto);
}

function tipoInseguro(parametro, sourceFile) {
  if (!parametro.type) return 'sin tipo explícito';
  const tipo = parametro.type.getText(sourceFile);
  if (tipo === 'any') return 'any';
  if (tipo.startsWith('{')) return 'tipo inline';
  if (/^(Partial|Record|Pick|Omit)</.test(tipo)) return tipo;
  if (/^(string|number|boolean)$/.test(tipo)) return `primitivo ${tipo}`;
  return null;
}

function revisarArchivo(file) {
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  function visitar(node) {
    if (ts.isParameter(node) && tieneDecoradorBody(node, sf)) {
      const problema = tipoInseguro(node, sf);
      if (problema) {
        const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        hallazgos.push(`${path.relative(root, file)}:${pos.line + 1} (${problema})`);
      }
    }
    ts.forEachChild(node, visitar);
  }
  visitar(sf);
}

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.controller.ts')) revisarArchivo(p);
  }
}

walk(root);
if (hallazgos.length) {
  console.error('Controladores con @Body sin DTO validable en runtime:');
  hallazgos.forEach((x) => console.error(` - ${x}`));
  process.exitCode = 1;
} else {
  console.log('OK: todos los @Body usan clases DTO validables en runtime.');
}
