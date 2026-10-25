/* Une una rebanada de la lista de pendientes con su traducción, por posición.
   Las anclas son la prueba de la prueba: si la lista se desfasó, lo dice antes
   de escribir cientos de traducciones en el sitio equivocado. */
import { readFileSync, writeFileSync } from 'node:fs';
const [esF, enF, desde, salida, ...anclas] = process.argv.slice(2);
const es = readFileSync(esF, 'utf8').replace(/\n$/, '').split('\n').slice(Number(desde) - 1);
const en = readFileSync(enF, 'utf8').replace(/\n$/, '').split('\n');
if (es.length < en.length) { console.error('la rebanada es más corta que la traducción', es.length, en.length); process.exit(1); }
for (const a of anclas) {
  const [n, v] = a.split('=');
  if (es[Number(n) - 1] !== v) { console.error('ancla', n, 'esperaba', JSON.stringify(v), 'trajo', JSON.stringify(es[Number(n) - 1])); process.exit(1); }
}
const o = {};
en.forEach((v, i) => { o[es[i]] = v; });
writeFileSync(salida, JSON.stringify(o, null, 1));
console.log('anclas ok · pares', Object.keys(o).length);
