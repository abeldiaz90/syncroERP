/* Deshace `t('X')` para claves que resultaron ser maquinaria, no texto. */
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const CLAVES = JSON.parse(readFileSync(process.argv[3], 'utf8'));
function archivos(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '.next') continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) archivos(p, out);
    else if (/\.tsx$/.test(n)) out.push(p);
  }
  return out;
}
let cambios = 0;
for (const raiz of process.argv[2].split(',')) for (const a of archivos(raiz)) {
  let s = readFileSync(a, 'utf8'); const antes = s;
  for (const clave of CLAVES) {
    const j = JSON.stringify(clave);
    const alt = `'${clave.replace(/'/g, "\\'")}'`;
    for (const lit of [j, alt]) {
      const conLlaves = `{t(${lit})}`;
      while (s.includes(conLlaves)) { s = s.replace(conLlaves, `{${lit}}`); cambios++; }
      const pelado = `t(${lit})`;
      while (s.includes(pelado)) { s = s.replace(pelado, lit); cambios++; }
    }
  }
  if (s !== antes) writeFileSync(a, s);
}
console.log('desenvueltos', cambios);
