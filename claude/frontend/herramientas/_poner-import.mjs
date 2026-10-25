import ts from 'typescript';
import { readFileSync, writeFileSync } from 'node:fs';
for (const archivo of process.argv.slice(2)) {
  const texto = readFileSync(archivo, 'utf8');
  if (/from ['"]@\/components\/I18nProvider['"]/.test(texto)) { console.log('ya tenía', archivo); continue; }
  const f = ts.createSourceFile(archivo, texto, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const imps = f.statements.filter((s) => ts.isImportDeclaration(s));
  const corte = imps.length ? imps[imps.length - 1].getEnd() + 1 : 0;
  writeFileSync(archivo, texto.slice(0, corte) + `import { useT } from '@/components/I18nProvider';\n` + texto.slice(corte));
  console.log('puesto', archivo);
}
