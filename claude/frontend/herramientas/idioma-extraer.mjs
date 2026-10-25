import ts from 'typescript';
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RAICES = process.argv[2].split(',');
const SALIDA = process.argv[3];

/* Atributos JSX cuyo valor LEE una persona. Lo demás es maquinaria. */
const ATRIBUTOS_VISIBLES = new Set([
  'title','placeholder','alt','label','etiqueta','titulo','descripcion','desc',
  'mensaje','texto','ayuda','leyenda','subtitulo','pie','detalle','textoBoton',
  'textoConfirmar','textoCancelar','aria-label','nombre','encabezado','resumen',
]);

const ACENTOS = /[áéíóúñÁÉÍÓÚÑ¿¡]/;
const PALABRAS = /\b(de|la|el|los|las|que|para|con|sin|por|una|un|del|al|se|no|su|más|este|esta|cuando|todo|toda|cada|ya|si|lo|le|es|son|hay|tu|tus|y|o|pero|como|desde|hasta|sobre|entre|aún|todavía)\b/i;

const esEspanol = (s) => {
  const t = s.trim();
  if (t.length < 3) return false;
  if (!/[a-zA-Z]/.test(t)) return false;
  if (/^[a-z-]+$/.test(t) && !t.includes(' ')) return false;      // clases css, claves
  if (/^https?:|^\/|^@\/|^#|^\w+\/\w+$/.test(t)) return false;    // rutas y urls
  if (/^[A-Z0-9_]+$/.test(t)) return false;                        // constantes
  return ACENTOS.test(t) || PALABRAS.test(t);
};

function archivos(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '.next') continue;
    /* El diccionario GUARDA español: no es deuda, es la traducción. */
    if (n === 'traducciones') continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) archivos(p, out);
    else if (/\.(tsx|ts)$/.test(n) && !/\.spec\.|\.test\./.test(n)) out.push(p);
  }
  return out;
}

const catalogo = new Map();
const apunta = (texto, archivo, tipo, linea) => {
  const clave = texto.trim().replace(/\s+/g, ' ');
  if (!catalogo.has(clave)) catalogo.set(clave, { texto: clave, tipo, sitios: [] });
  catalogo.get(clave).sitios.push(`${archivo}:${linea}`);
};

let envueltos = 0;
for (const raiz of RAICES) {
  for (const archivo of archivos(raiz)) {
    const fuente = ts.createSourceFile(
      archivo, readFileSync(archivo, 'utf8'), ts.ScriptTarget.Latest, true,
      archivo.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const linea = (n) => fuente.getLineAndCharacterOfPosition(n.getStart(fuente)).line + 1;
    /* ¿Ya va dentro de una llamada a t(...)? Entonces no es deuda. */
    const yaTraducido = (n) => {
      let p = n.parent;
      while (p) {
        if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && p.expression.text === 't') return true;
        p = p.parent;
      }
      return false;
    };
    const visita = (n) => {
      if (ts.isJsxText(n) && esEspanol(n.text)) {
        apunta(n.text, archivo, 'jsx', linea(n));
      } else if (ts.isJsxAttribute(n) && n.initializer) {
        const nombre = n.name.getText(fuente);
        if (ATRIBUTOS_VISIBLES.has(nombre)) {
          const v = n.initializer;
          const lit = ts.isStringLiteral(v) ? v
            : (ts.isJsxExpression(v) && v.expression && ts.isStringLiteral(v.expression) ? v.expression : null);
          if (lit && esEspanol(lit.text)) {
            if (yaTraducido(lit)) envueltos++; else apunta(lit.text, archivo, 'atributo:' + nombre, linea(lit));
          }
        }
      } else if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && esEspanol(n.text)) {
        /* Cadena suelta en código: sólo cuenta si está dentro de JSX o si ya la envuelve t(). */
        if (yaTraducido(n)) { envueltos++; }
        else {
          let p = n.parent, dentroDeJsx = false;
          while (p) { if (ts.isJsxExpression(p) || ts.isJsxElement(p) || ts.isJsxSelfClosingElement(p)) { dentroDeJsx = true; break; } p = p.parent; }
          apunta(n.text, archivo, dentroDeJsx ? 'cadena-en-jsx' : 'cadena', linea(n));
        }
      }
      ts.forEachChild(n, visita);
    };
    visita(fuente);
  }
}

const lista = [...catalogo.values()].sort((a, b) => b.sitios.length - a.sitios.length);
writeFileSync(SALIDA, JSON.stringify({
  generado: new Date().toISOString().slice(0, 10),
  distintos: lista.length,
  apariciones: lista.reduce((n, e) => n + e.sitios.length, 0),
  yaEnvueltos: envueltos,
  entradas: lista,
}, null, 2));
console.log('distintos', lista.length, '| apariciones', lista.reduce((n, e) => n + e.sitios.length, 0), '| ya envueltos', envueltos);
const porTipo = {};
for (const e of lista) porTipo[e.tipo.split(':')[0]] = (porTipo[e.tipo.split(':')[0]] ?? 0) + 1;
console.log(porTipo);
