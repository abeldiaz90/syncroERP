/**
 * ============================================================================
 * ENVOLVER EL SITIO DONDE SE PINTA UN TEXTO DE TABLA
 * ----------------------------------------------------------------------------
 * `app/dashboard/module-config.ts` declara 770 textos en constantes del módulo
 * —`grupo: "Estados financieros"`, `label: "Centro de configuración"`— y el
 * menú los pintaba con `{grupo}`. El diccionario YA tenía la traducción; lo que
 * faltaba era la llamada. Resultado: el ERP en inglés con «ESTADOS
 * FINANCIEROS» y «FISCAL» en español, y una cuenta que decía «faltan 0».
 *
 * Declararlos no es pintarlos: una constante del módulo no puede usar un hook.
 * El sitio que sí puede es el render, y ahí es donde esta herramienta pone la
 * llamada: `{grupo}` → `{t(grupo)}`, `{item.label}` → `{t(item.label)}`.
 *
 * QUÉ ENVUELVE, Y POR QUÉ ES SEGURO
 *
 *  · Sólo expresiones cuyo nombre final es de una lista corta de propiedades
 *    que SIEMPRE llevan texto de pantalla (`label`, `nombre`, `titulo`,
 *    `descripcion`, `grupo`…). No toca `id`, `clave`, `ruta` ni `estado`.
 *  · Sólo dentro de un componente, donde hay enganche.
 *  · `traducir` devuelve tal cual lo que no sea cadena, así que si por esa
 *    propiedad llega un número o un nodo, pasa de largo. Eso se arregló en
 *    `lib/idioma.ts` antes de escribir esto, no después.
 *
 *   node herramientas/idioma-render.mjs app,components           (ensayo)
 *   node herramientas/idioma-render.mjs app,components --aplica
 * ============================================================================
 */
import ts from 'typescript';
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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

/* Propiedades que llevan texto que una persona lee. Lista corta a propósito. */
const PROPIEDADES = new Set([
  'label', 'etiqueta', 'nombre', 'titulo', 'subtitulo', 'descripcion', 'desc',
  'detalle', 'texto', 'leyenda', 'grupo', 'modulo', 'seccion', 'mensaje',
  'ayuda', 'resumen', 'encabezado', 'pie', 'que', 'queHacer', 'textoBoton',
  /*
   * Y EL TEXTO DE ERROR.
   *
   * Lo que el core rechaza llega a la pantalla como una variable —`{error}`,
   * `{aviso}`— no como un literal, así que ningún codemod de textos lo veía.
   * En el portal eso importa el doble: `lib/fineract-error.ts` reescribe en
   * ESPAÑOL los mensajes del core, que vienen en inglés, de modo que con el
   * portal en inglés esos avisos no es que se quedaran sin traducir: es que se
   * traducían al revés.
   *
   * Envolverlos es seguro porque `traducir` devuelve tal cual lo que no está
   * en el diccionario: un mensaje del core en inglés pasa de largo, y las
   * reescrituras del portal —que sí están— vuelven al inglés.
   */
  'error', 'aviso', 'mensajeError', 'avisoError', 'motivo', 'razon',
]);
/* Atributos JSX cuyo valor se lee; en los demás no se toca nada. */
const ATRIBUTOS_VISIBLES = new Set([
  'title', 'placeholder', 'alt', 'label', 'etiqueta', 'titulo', 'descripcion',
  'desc', 'mensaje', 'texto', 'ayuda', 'leyenda', 'subtitulo', 'aria-label',
]);

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

const resumen = { archivos: 0, envueltos: 0, enganches: 0, tapadas: 0 };
/*
 * ── UNA TAPADA QUE NO SE NOMBRA ES UN HUECO QUE NADIE PUEDE CERRAR ────────
 *
 * Cuando la variable del bucle se llama `t`, esta herramienta NO envuelve: ahí
 * `t('texto')` llamaría a un objeto. Decide bien, pero antes sólo las contaba
 * —«tapadas: 17»— y un número no se puede arreglar. Quedaban sitios que se
 * pintan en español con el ERP en inglés, nadie sabía cuáles, y la cuenta de
 * pendientes decía 0: la clave existe en el diccionario, así que desde su lado
 * no falta nada.
 */
const tapadas = [];
/*
 * ── LO QUE NO SE TRADUCE PORQUE NO ES TEXTO DE PANTALLA ───────────────────
 *
 * MEDIDO EL 25-OCT-2026, al destapar las 17 `t` de bucle. Con la función de
 * traducir visible, este codemod se ofreció a envolver NUEVE sitios más… y
 * ninguno debía envolverse:
 *
 *   {tipo.nombre}                → el nombre del tipo de habitación lo pone el
 *                                  hotel. Es su dato.
 *   {doc.almacenOrigen?.nombre}  → el nombre del almacén, igual.
 *   {pestana.label}              → ya viene de `t("…")`, traducido.
 *
 * La heurística de propiedades es buena para las tablas del módulo —`label`,
 * `nombre`, `titulo` ahí SIEMPRE son texto de pantalla— y es ciega para lo que
 * llega de la base: un `nombre` de empresa buscado en el diccionario no rompe
 * nada (`traducir` devuelve lo que no encuentra) pero es una llamada que miente
 * sobre lo que es ese dato.
 *
 * Decidirlo solo es indecidible, así que se marca a mano y aquí se respeta. Lo
 * que importa de esto no es la marca: es que este codemod se pueda volver a
 * correr con `--aplica` sin revisar nueve sitios cada vez. Un codemod que nadie
 * se atreve a correr es un codemod que no existe.
 */
const MARCA_DE_NO_TRADUCIR = 'no-se-traduce';
const saltados = [];
/** ¿La línea del render, o la de arriba, lleva la marca? */
const marcadoANoTraducir = (e, fuente) => {
  const texto = fuente.getFullText();
  const lineas = texto.split('\n');
  const linea = fuente.getLineAndCharacterOfPosition(e.getStart(fuente)).line;
  return [lineas[linea], lineas[linea - 1], lineas[linea - 2]]
    .filter(Boolean)
    .some((l) => l.includes(MARCA_DE_NO_TRADUCIR));
};
const muestra = [];

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
  const dentroDeT = (n) => {
    let p = n.parent;
    while (p) { if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && p.expression.text === 't') return true; p = p.parent; }
    return false;
  };
  /** El nombre final de la expresión, si es un identificador o un acceso. */
  const nombreFinal = (e) => {
    if (ts.isIdentifier(e)) return e.text;
    if (ts.isPropertyAccessExpression(e)) return e.name.text;
    if (ts.isNonNullExpression(e) || ts.isParenthesizedExpression(e)) return nombreFinal(e.expression);
    return null;
  };

  const envuelve = (e) => {
    edits.push({ ini: e.getStart(fuente), fin: e.getEnd(), texto: `t(${e.getText(fuente)})` });
    resumen.envueltos++;
    if (muestra.length < 25) muestra.push(`${archivo}:${fuente.getLineAndCharacterOfPosition(e.getStart(fuente)).line + 1}  {${e.getText(fuente)}}`);
    const c = componenteDe(e); if (c) componentes.add(c);
  };

  const visita = (n) => {
    if (ts.isJsxExpression(n) && n.expression && !dentroDeT(n)) {
      const e = n.expression;
      const nom = nombreFinal(e);
      const padre = n.parent;
      /* Dentro de un atributo sólo si ese atributo se lee. */
      const esAtributo = padre && ts.isJsxAttribute(padre);
      const atributoOk = !esAtributo || ATRIBUTOS_VISIBLES.has(padre.name.getText(fuente));
      if (nom && PROPIEDADES.has(nom) && atributoOk && componenteDe(e)) {
        const linea = fuente.getLineAndCharacterOfPosition(e.getStart(fuente)).line + 1;
        if (tTapada(e, fuente)) {
          resumen.tapadas++;
          tapadas.push(`${archivo}:${linea}  ${e.getText(fuente)}`);
        } else if (marcadoANoTraducir(e, fuente)) {
          saltados.push(`${archivo}:${linea}  ${e.getText(fuente)}`);
        } else envuelve(e);
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
console.log(APLICA ? 'APLICADO' : 'ENSAYO', JSON.stringify(resumen, null, 1));
if (muestra.length) { console.log('\n--- muestra:'); console.log(muestra.join('\n')); }
if (saltados.length) {
  console.log(`\n--- saltados (${saltados.length}): marcados \`${MARCA_DE_NO_TRADUCIR}\``);
  console.log('    No son texto de pantalla: son datos de la empresa, o ya vienen traducidos.');
  console.log(saltados.join('\n'));
}
if (tapadas.length) {
  console.log(`\n--- tapadas (${tapadas.length}): la variable del bucle se llama \`t\``);
  console.log('    Se quedan SIN traducir. Hay que renombrar la variable del bucle a mano');
  console.log('    y volver a correr esto; envolver aquí llamaría a un objeto.');
  console.log(tapadas.join('\n'));
  /*
   * ── Y ESTO SALE CON ERROR, NO CON UN AVISO ───────────────────────────────
   *
   * Durante semanas esto imprimió «tapadas: 17» y salió con 0. Diecisiete
   * sitios en español con el ERP en inglés, y tres cuentas en verde:
   * `idioma:pendientes` decía 0 porque la clave existe y nadie la pide, las
   * tablas del módulo decían 0 porque desde su lado está traducida, y esto
   * contaba y se iba contento.
   *
   * Un reporte que no falla es un reporte que nadie atiende. Si la revisión no
   * se pone roja, la deuda se queda — y ésta se quedó.
   *
   * Sólo al MIRAR: en `--aplica` la cuenta es de lo que no se pudo arreglar y
   * el comando ya dijo qué hizo.
   */
  if (!APLICA) process.exitCode = 1;
}
