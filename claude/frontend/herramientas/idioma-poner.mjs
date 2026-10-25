/**
 * ============================================================================
 * METER PARES TRADUCIDOS EN EL DICCIONARIO
 * ----------------------------------------------------------------------------
 *   node herramientas/idioma-poner.mjs en-US pares.json
 *
 * `pares.json` es `{ "texto en español": "text in english" }`.
 *
 * LA FUENTE DE VERDAD ES EL `.json`, NO EL `.ts`
 *
 * La primera versión guardaba sólo el `.ts` y, para añadir pares, lo volvía a
 * leer con una expresión regular y `JSON.parse('"' + ... + '"')`. Reventó en
 * cuanto una traducción llevó comillas dentro —«Create the first one with the
 * \"New category\" button»—: el escape ya escapado se volvía a escapar.
 *
 * Ahora el diccionario vive en `_en-US.json`, que se lee con `JSON.parse` a
 * secas, y el `.ts` se GENERA de ahí. Un formato para guardar y otro para
 * compilar, y el de guardar no necesita que nadie lo vuelva a interpretar.
 * ============================================================================
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const idioma = process.argv[2];
const entrada = process.argv[3];
const almacen = `lib/traducciones/_${idioma}.json`;
const destino = `lib/traducciones/${idioma}.ts`;
const CONST = idioma.replace('-', '_').toUpperCase();

const actual = existsSync(almacen) ? JSON.parse(readFileSync(almacen, 'utf8')) : {};
const nuevos = JSON.parse(readFileSync(entrada, 'utf8'));

let nuevas = 0, cambiadas = 0;
for (const [es, en] of Object.entries(nuevos)) {
  const clave = es.trim().replace(/\s+/g, ' ');
  if (!clave || !en) continue;
  if (actual[clave] === undefined) nuevas++;
  else if (actual[clave] !== en) cambiadas++;
  actual[clave] = en;
}

const claves = Object.keys(actual).sort((a, b) => a.localeCompare(b, 'es'));
const ordenado = {};
for (const k of claves) ordenado[k] = actual[k];
writeFileSync(almacen, JSON.stringify(ordenado, null, 1) + '\n');

writeFileSync(
  destino,
  `/**\n` +
    ` * Diccionario ${idioma}. GENERADO desde \`_${idioma}.json\`: no se edita a mano.\n` +
    ` *\n` +
    ` * Se llena con \`node herramientas/idioma-poner.mjs ${idioma} pares.json\`. La\n` +
    ` * clave es el texto en español tal como aparece en pantalla; el porqué está\n` +
    ` * en \`lib/idioma.ts\`.\n` +
    ` *\n` +
    ` * Entradas: ${claves.length}\n` +
    ` */\n\n` +
    `export const ${CONST}: Record<string, string> = {\n` +
    claves.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(ordenado[k])},`).join('\n') +
    `\n};\n`,
);
console.log(`${claves.length} entradas (+${nuevas} nuevas, ${cambiadas} cambiadas)`);
