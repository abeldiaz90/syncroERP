/* Saca los textos del mapa de navegación: nombre, desc y label de cada módulo
   e ítem. Sus sitios de llamada ya pasan por t(), así que sólo falta el
   diccionario. */
import ts from 'typescript';
import { readFileSync, writeFileSync } from 'node:fs';
const ruta = 'app/dashboard/module-config.ts';
const f = ts.createSourceFile(ruta, readFileSync(ruta, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const CLAVES = new Set(['nombre', 'desc', 'label', 'titulo', 'grupo', 'etiqueta', 'descripcion']);
const out = new Set();
const visita = (n) => {
  if (ts.isPropertyAssignment(n) && ts.isIdentifier(n.name) && CLAVES.has(n.name.text)
      && (ts.isStringLiteral(n.initializer) || ts.isNoSubstitutionTemplateLiteral(n.initializer))) {
    const v = n.initializer.text.trim().replace(/\s+/g, ' ');
    if (v && /[a-zA-Z]/.test(v)) out.add(v);
  }
  ts.forEachChild(n, visita);
};
visita(f);
writeFileSync(process.argv[2], JSON.stringify([...out], null, 0));
console.log('textos del menú:', out.size);
