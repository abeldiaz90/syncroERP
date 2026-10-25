/* Lleva el diccionario del .ts al .json una sola vez, leyéndolo con el AST
   para que los escapes se interpreten como los interpreta TypeScript. */
import ts from 'typescript';
import { readFileSync, writeFileSync } from 'node:fs';
const ruta = process.argv[2];
const f = ts.createSourceFile(ruta, readFileSync(ruta, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const salida = {};
const visita = (n) => {
  if (ts.isPropertyAssignment(n) && (ts.isStringLiteral(n.name) || ts.isIdentifier(n.name))
      && ts.isStringLiteral(n.initializer)) {
    salida[ts.isStringLiteral(n.name) ? n.name.text : n.name.text] = n.initializer.text;
  }
  ts.forEachChild(n, visita);
};
visita(f);
writeFileSync(process.argv[3], JSON.stringify(salida, null, 1) + '\n');
console.log('migradas', Object.keys(salida).length);
