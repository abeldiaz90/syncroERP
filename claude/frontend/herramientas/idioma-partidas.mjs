/**
 * ============================================================================
 * LAS FRASES PARTIDAS, EN UNA SOLA CLAVE
 * ----------------------------------------------------------------------------
 * `<p>Faltan {n} productos</p>` llega al AST como tres hijos: «Faltan», una
 * expresión y «productos». El codemod las dejó aparte a propósito, porque
 * envolver los trozos por separado produce dos claves que NO SE PUEDEN
 * TRADUCIR: en inglés el número va en otro sitio y el orden de las palabras no
 * es el mismo. Dos claves sueltas dan «Missing 3 products» por casualidad y
 * «Left 3 to ship» mal en cuanto la frase es un poco más larga.
 *
 * La forma que sí traduce es UNA clave con marcadores:
 *
 *     t('Faltan {n0} productos', { n0: n })
 *
 * Así el diccionario recibe la frase completa y el inglés puede colocar el
 * número donde le toque. Eso es lo que hace esta herramienta.
 *
 * QUÉ NO TOCA
 *
 * Si entre los hijos hay una ETIQUETA con texto —`<b>`, `<a>`, `<span>`— la
 * frase sigue dentro de ella y no cabe en una cadena: ésas se listan y se
 * hacen a mano. Aplastarlas perdería el enlace o la negrita.
 *
 *   node herramientas/idioma-partidas.mjs app,components           (ensayo)
 *   node herramientas/idioma-partidas.mjs app,components --aplica
 * ============================================================================
 */
import ts from 'typescript';
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
/* La regla de qué es texto se escribe UNA vez, en _texto-visible.mjs. */
import { esTextoVisible } from './_texto-visible.mjs';

const RAICES = process.argv[2].split(',');

/**
 * ¿ESTÁ `t` TAPADA EN ESTE ÁMBITO?
 *
 * `TIPOS.map((t) => …)`, `transferencias.map(t => …)`, `(t: Transferencia) => …`:
 * cuando la variable del bucle se llama `t`, escribir `t('texto')` ahí no
 * traduce nada — llama a un objeto, y el navegador contesta
 * `t is not a function`. Fueron 43 sitios en el ERP, 19 en un solo archivo, y
 * los encontró `tsc --noEmit` («This expression is not callable»), no yo: mis
 * revisiones comprobaban que `t` EXISTIERA en el ámbito, nunca que la `t` del
 * ámbito fuera la del idioma. Una pregunta a medias contestada con confianza
 * entera.
 *
 * Aquí se contesta entera: se sube el ámbito y, si la primera declaración de
 * `t` que aparece no viene de `useT()`, `useI18n()` ni `tDelServidor()`, no se
 * envuelve nada. El texto se queda en español y se cuenta como deuda, que es
 * infinitamente mejor que una pantalla caída.
 */
function tTapada(nodo, fuente) {
  const esDelIdioma = (ini) => {
    if (!ini) return false;
    const txt = ini.getText(fuente);
    return /use(?:T|I18n)\s*\(/.test(txt) || /tDelServidor\s*\(/.test(txt);
  };
  const tapaElNombre = (nombre) => {
    if (ts.isIdentifier(nombre)) return nombre.text === 't';
    if (ts.isArrayBindingPattern(nombre)) {
      return nombre.elements.some((el) => !ts.isOmittedExpression(el) && ts.isIdentifier(el.name) && el.name.text === 't');
    }
    if (ts.isObjectBindingPattern(nombre)) {
      return nombre.elements.some((el) => ts.isIdentifier(el.name) && el.name.text === 't');
    }
    return false;
  };
  let p = nodo.parent;
  while (p) {
    if (ts.isFunctionDeclaration(p) || ts.isArrowFunction(p) || ts.isFunctionExpression(p) || ts.isMethodDeclaration(p)) {
      if (p.parameters.some((par) => tapaElNombre(par.name))) return true;
    }
    if (ts.isCatchClause(p) && p.variableDeclaration && tapaElNombre(p.variableDeclaration.name)) return true;
    if (ts.isBlock(p) || ts.isSourceFile(p)) {
      for (const st of p.statements ?? []) {
        if (!ts.isVariableStatement(st)) continue;
        for (const d of st.declarationList.declarations) {
          if (tapaElNombre(d.name)) return !esDelIdioma(d.initializer);
        }
      }
    }
    p = p.parent;
  }
  return false;
}

const APLICA = process.argv.includes('--aplica');
const VOLCADO = (process.argv.find((a) => a.startsWith('--volcar=')) ?? '').slice(9);


function archivos(dir, out = []) {
  const st = statSync(dir);
  if (!st.isDirectory()) { if (/\.tsx$/.test(dir)) out.push(dir); return out; }
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '.next' || n === 'traducciones') continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) archivos(p, out);
    else if (/\.tsx$/.test(n) && !/\.spec\.|\.test\./.test(n)) out.push(p);
  }
  return out;
}

const resumen = { archivos: 0, unidas: 0, aMano: 0, enganches: 0, tapadas: 0 };
const aMano = [];
const volcado = [];

for (const raiz of RAICES) for (const archivo of archivos(raiz)) {
  const original = readFileSync(archivo, 'utf8');
  const cliente = /^\s*['"]use client['"]/m.test(original);
  const servidor = /tDelServidor\(\)/.test(original);
  if (!cliente && !servidor) continue;

  const fuente = ts.createSourceFile(archivo, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  const componentes = new Set();

  const componenteDe = (n) => {
    let p = n.parent;
    while (p) {
      if ((ts.isFunctionDeclaration(p) || ts.isArrowFunction(p) || ts.isFunctionExpression(p)) && p.body && ts.isBlock(p.body)) {
        const nombre = ts.isFunctionDeclaration(p) && p.name ? p.name.text
          : (p.parent && ts.isVariableDeclaration(p.parent) && ts.isIdentifier(p.parent.name) ? p.parent.name.text : '');
        if (/^[A-Z]/.test(nombre) || (ts.isFunctionDeclaration(p) && !nombre)) return p;
      }
      p = p.parent;
    }
    return null;
  };

  const INLINE = new Set(['b','strong','em','i','u','span','a','code','small','mark','abbr','label']);

  const visita = (n) => {
    if (ts.isJsxElement(n)) {
      const hijos = n.children;
      const textos = hijos.filter((c) => ts.isJsxText(c) && esTextoVisible(c.text));
      const expresiones = hijos.filter((c) => ts.isJsxExpression(c) && c.expression);
      const elementos = hijos.filter((c) => ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c));
      const yaTraducido = hijos.some((c) => ts.isJsxExpression(c) && c.expression
        && ts.isCallExpression(c.expression) && ts.isIdentifier(c.expression.expression)
        && c.expression.expression.text === 't');

      if (textos.length && expresiones.length && !yaTraducido && tTapada(n, fuente)) {
        resumen.tapadas++;
      } else if (textos.length && expresiones.length && !yaTraducido) {
        /* Una etiqueta inline con texto: la frase sigue dentro. No cabe en una cadena. */
        const inlineConTexto = elementos.some((c) => ts.isJsxElement(c)
          && INLINE.has(c.openingElement.tagName.getText(fuente))
          && c.children.some((h) => (ts.isJsxText(h) && h.text.trim() !== '') || ts.isJsxExpression(h)));
        /* Un componente propio o un ícono entre los hijos: tampoco se aplasta. */
        const otroElemento = elementos.length > 0;
        /*
         * Y UNA EXPRESIÓN QUE DEVUELVE JSX. `{cond && <span/>}` entre dos
         * textos parece un valor, pero al meterlo en `{ n0: … }` se interpola
         * con `String(valor)` y un elemento de React se imprime
         * «[object Object]». La frase queda traducida y la pantalla, rota.
         */
        const expresionConJsx = expresiones.some((c) => {
          let tieneJsx = false;
          const mira = (x) => {
            if (ts.isJsxElement(x) || ts.isJsxSelfClosingElement(x) || ts.isJsxFragment(x)) tieneJsx = true;
            ts.forEachChild(x, mira);
          };
          mira(c.expression);
          return tieneJsx;
        });
        if (inlineConTexto || otroElemento || expresionConJsx) {
          aMano.push(`${archivo}:${fuente.getLineAndCharacterOfPosition(n.getStart(fuente)).line + 1}  ${n.children.map((c) => (ts.isJsxText(c) ? c.text : '{…}')).join('').trim().replace(/\s+/g, ' ').slice(0, 72)}`);
          resumen.aMano++;
        } else {
          /* Se puede unir: sólo texto y expresiones. */
          let plantilla = '';
          const datos = [];
          for (const c of hijos) {
            if (ts.isJsxText(c)) plantilla += c.text;
            else if (ts.isJsxExpression(c) && c.expression) {
              const i = datos.length;
              datos.push(c.expression.getText(fuente));
              plantilla += `{n${i}}`;
            }
          }
          plantilla = plantilla.replace(/\s+/g, ' ').trim();
          if (plantilla && /[a-zA-Z]/.test(plantilla.replace(/\{n\d+\}/g, ''))) {
            const obj = datos.map((d, i) => `n${i}: ${d}`).join(', ');
            edits.push({
              ini: hijos[0].getStart(fuente),
              fin: hijos[hijos.length - 1].getEnd(),
              texto: `{t(${JSON.stringify(plantilla)}, { ${obj} })}`,
            });
            resumen.unidas++;
            if (VOLCADO) volcado.push(plantilla);
            const c = componenteDe(n); if (c) componentes.add(c);
          }
        }
      }
    }
    ts.forEachChild(n, visita);
  };
  visita(fuente);

  if (!edits.length) continue;
  resumen.archivos++;
  for (const c of componentes) {
    const cuerpo = c.body.getText(fuente);
    const suyo = /\bconst\s+t\s*=\s*use(?:T|I18n)\(/.test(cuerpo)
      || /\{[^}]*\bt\b[^}]*\}\s*=\s*useI18n\(/.test(cuerpo)
      || /\bconst\s+t\s*=\s*await\s+tDelServidor\(/.test(cuerpo);
    if (suyo) continue;
    const pos = c.body.getStart(fuente) + 1;
    edits.push({ ini: pos, fin: pos, texto: `\n  const t = useT();` });
    resumen.enganches++;
  }
  let salida = original;
  for (const e of edits.sort((a, b) => b.ini - a.ini)) salida = salida.slice(0, e.ini) + e.texto + salida.slice(e.fin);
  if (cliente && !/from ['"]@\/components\/I18nProvider['"]/.test(salida)) {
    /*
     * EL IMPORT VA ARRIBA, NO DETRÁS DEL ÚLTIMO.
     *
     * La versión anterior lo colocaba tras el último `import` del archivo, en
     * `getEnd() + 1`. Ese `+1` da por hecho que lo que sigue es un salto de
     * línea, y en dos archivos del ERP el último import terminaba en
     * `…ProtectedElement"; // ← NUEVO`: el corte cayó dentro del comentario y el
     * import acabó DENTRO del cuerpo del componente —«An import declaration can
     * only be used at the top level of a module»—. Lo encontró `tsc`, no yo.
     *
     * Un import puede ir en cualquier parte del nivel superior, así que ponerlo
     * de PRIMERO —justo después de la directiva `'use client'`, que sí tiene que
     * ser la primera instrucción— es válido siempre y no depende de adivinar
     * dónde termina el último.
     */
    const directiva = /^\s*['"]use client['"];?[^\n]*\n/.exec(salida);
    const corte = directiva ? directiva[0].length : 0;
    salida = salida.slice(0, corte) + `import { useT } from '@/components/I18nProvider';\n` + salida.slice(corte);
  } else if (cliente && !/\buseT\b/.test(salida.split('\n').filter((l) => l.includes('I18nProvider')).join(''))) {
    salida = salida.replace(/import \{([^}]*)\} from '@\/components\/I18nProvider'/, (_, g) => `import {${g.trimEnd()}, useT } from '@/components/I18nProvider'`);
  }
  if (APLICA) writeFileSync(archivo, salida);
}
if (VOLCADO) writeFileSync(VOLCADO, volcado.join('\n') + '\n');
console.log(APLICA ? 'APLICADO' : 'ENSAYO', JSON.stringify(resumen, null, 1));
if (aMano.length) { console.log(`\n--- a mano (${aMano.length}), con etiqueta u otro elemento dentro:`); console.log(aMano.slice(0, 15).join('\n')); }
