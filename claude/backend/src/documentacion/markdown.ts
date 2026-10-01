/**
 * ============================================================================
 * Markdown → HTML, acotado a lo que estos documentos usan
 * ----------------------------------------------------------------------------
 * POR QUÉ NO UNA LIBRERÍA
 *
 * Se consideró `marked`. Se descartó por una razón concreta y no por gusto:
 * añadir una dependencia obliga a un `npm install` antes de arrancar, y si
 * alguien despliega sin correrlo el backend **no levanta** —el import falla en
 * el arranque—. Cambiar «la pantalla de ayuda no funciona» por «el ERP no
 * arranca» es un mal negocio.
 *
 * La contrapartida honesta: esto NO es un renderizador de Markdown de uso
 * general. Es el subconjunto que usan los seis documentos de `docs/`, que son
 * archivos del propio repositorio, no texto que nadie escriba desde fuera. La
 * prueba `documentacion/lo-que-se-publica.spec.ts` renderiza **los seis
 * documentos reales** y comprueba el resultado; el día que un documento use algo
 * que esto no entiende, la prueba lo dice.
 *
 * LO QUE ENTIENDE
 *
 *   # ## ### ####      encabezados (con ancla, para el índice lateral)
 *   ---                separador
 *   | a | b |          tablas, respetando las barras que van dentro de `código`
 *   - · 1.             listas, con un nivel de anidación
 *   - [ ] / - [x]      casillas
 *   >                  citas, que pueden contener listas y párrafos
 *   ```                bloques de código
 *   **negrita**  *cursiva*  `código`  [texto](destino)
 *
 * LO QUE NO ENTIENDE, A PROPÓSITO
 *
 *   · `_cursiva_` — el guión bajo aparece constantemente en nombres de
 *     variables (`APROVISIONAMIENTO_TOKEN`) y de archivos (`_uat-*.json`).
 *     Tratarlo como énfasis rompería justo lo que más se cita aquí.
 *   · HTML crudo — se escapa. Estos documentos no lo usan y dejarlo pasar sería
 *     abrir una puerta por costumbre.
 *
 * ── SEGURIDAD ──────────────────────────────────────────────────────────────
 *
 * Todo el texto se escapa ANTES de reconocer nada. Lo único que produce
 * etiquetas es este archivo. Un `<script>` en un documento sale en pantalla
 * como texto, que es lo que es.
 * ============================================================================
 */

export interface EntradaIndice {
  nivel: number;
  texto: string;
  ancla: string;
}

export interface DocumentoRenderizado {
  html: string;
  indice: EntradaIndice[];
}

/** Destinos internos que el renderizador sabe convertir en enlace. */
export interface EnlaceInterno {
  /** Nombre del archivo tal como aparece en el Markdown, p. ej. `03-manual-por-rol.md`. */
  archivo: string;
  /** A dónde lleva en el ERP. */
  href: string;
  /** Con qué se sustituye cuando el lector NO puede abrirlo. */
  titulo: string;
  /** Si este lector puede abrirlo. */
  visible: boolean;
}

const escapar = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function anclaDe(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Parte una fila de tabla por `|`, **sin** partir por las barras que van dentro
 * de un tramo de `código`. `` `A | B` `` en una celda es una sola celda, y sin
 * esto se convertía en dos y desplazaba la fila entera sin avisar.
 */
function celdasDe(linea: string): string[] {
  const celdas: string[] = [];
  let actual = '';
  let enCodigo = false;
  const cuerpo = linea.trim().replace(/^\|/, '').replace(/\|$/, '');
  for (const ch of cuerpo) {
    if (ch === '`') enCodigo = !enCodigo;
    if (ch === '|' && !enCodigo) {
      celdas.push(actual.trim());
      actual = '';
    } else {
      actual += ch;
    }
  }
  celdas.push(actual.trim());
  return celdas;
}

function enLinea(texto: string, enlaces: EnlaceInterno[]): string {
  // 1 · Los tramos de código se apartan enteros: dentro no se reconoce nada.
  const codigos: string[] = [];
  let t = texto.replace(/`([^`]+)`/g, (_, codigo: string) => {
    codigos.push(`<code>${escapar(codigo)}</code>`);
    return `\u0000${codigos.length - 1}\u0000`;
  });

  t = escapar(t);

  // 2 · Enlaces.
  t = t.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (todo: string, rotulo: string, destino: string) => {
      const interno = enlaces.find((e) => destino.startsWith(e.archivo));
      if (interno) {
        /*
         * Un enlace a un documento que este lector no puede abrir llevaría a
         * una negativa. Se deja el título en texto: la frase se sigue
         * entendiendo y nadie va a chocar contra una puerta cerrada.
         */
        return interno.visible
          ? `<a href="${escapar(interno.href)}">${rotulo}</a>`
          : `<em>${escapar(interno.titulo)}</em>`;
      }
      if (/^https?:\/\//i.test(destino)) {
        return `<a href="${escapar(destino)}" target="_blank" rel="noopener noreferrer">${rotulo}</a>`;
      }
      // Un destino que no sabemos a dónde lleva no se convierte en enlace.
      return rotulo;
    },
  );

  /*
   * 3 · Énfasis. Negrita antes que cursiva; el guión bajo no participa.
   *
   * La negrita admite asteriscos sueltos dentro, porque los documentos tienen
   * cursiva anidada: `**Un hallazgo que dice *cuáles*, no *cuántas***`. Con
   * `[^*]+` eso no casaba y los seis asteriscos salían impresos en la tabla.
   */
  t = t.replace(/\*\*((?:[^*]|\*(?!\*))+?)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\*([^*\s][^*]*?)\*/g, '<em>$1</em>');

  // 4 · Se devuelven los tramos de código.
  return t.replace(/\u0000(\d+)\u0000/g, (_, i: string) => codigos[Number(i)]);
}

function esSeparadorDeTabla(linea: string): boolean {
  return /^\s*\|?[\s:-]*-[\s|:-]*\|?\s*$/.test(linea) && linea.includes('-');
}

/** Renderiza un bloque de líneas que ya no contiene tablas ni código. */
function bloques(lineas: string[], enlaces: EnlaceInterno[], indice: EntradaIndice[]): string {
  const salida: string[] = [];
  /*
   * ==========================================================================
   * Dos secciones con el mismo título no pueden compartir ancla
   * --------------------------------------------------------------------------
   * `anclaDe()` sólo depende del texto, así que un documento con dos
   * encabezados iguales —«Los pasos», «¿Qué te va a negar el sistema?», que en
   * el manual de curso se repiten una vez por rol— producía el MISMO `id` dos
   * veces.
   *
   * El aviso que se ve en la consola del navegador —«Encountered two children
   * with the same key»— es el síntoma menor. El defecto es que **el índice
   * lateral miente**: `id` repetido es HTML inválido, el navegador salta
   * siempre al primero, y quien hace clic en «Los pasos» de Compras acaba
   * leyendo «Los pasos» de Ventas sin que nada le avise de que se movió de
   * sección. Un índice que lleva a otra parte es peor que no tener índice.
   *
   * El contador vive aquí, en el renderizado, porque es el único punto donde
   * el `id` del encabezado y la entrada del índice salen del MISMO valor. Si
   * se resolviera en la pantalla —poniendo la posición en la `key` de React—
   * el aviso desaparecería y los enlaces seguirían rotos.
   * ==========================================================================
   */
  const anclasUsadas = new Map<string, number>();
  const anclaUnica = (texto: string): string => {
    const base = anclaDe(texto);
    const vistas = anclasUsadas.get(base) ?? 0;
    anclasUsadas.set(base, vistas + 1);
    /* La primera conserva el ancla limpia: los enlaces que ya existan siguen sirviendo. */
    return vistas === 0 ? base : `${base}-${vistas + 1}`;
  };
  let i = 0;

  const cerrarLista = (pila: string[]) => {
    while (pila.length) salida.push(pila.pop()!);
  };

  while (i < lineas.length) {
    const linea = lineas[i];

    if (!linea.trim()) {
      i++;
      continue;
    }

    // ── Encabezado ──────────────────────────────────────────────────────────
    const enc = /^(#{1,6})\s+(.*)$/.exec(linea);
    if (enc) {
      const nivel = enc[1].length;
      const texto = enc[2].trim();
      const ancla = anclaUnica(texto);
      if (nivel <= 3) indice.push({ nivel, texto, ancla });
      salida.push(
        `<h${nivel} id="${escapar(ancla)}">${enLinea(texto, enlaces)}</h${nivel}>`,
      );
      i++;
      continue;
    }

    // ── Separador ───────────────────────────────────────────────────────────
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(linea)) {
      salida.push('<hr />');
      i++;
      continue;
    }

    // ── Cita ────────────────────────────────────────────────────────────────
    if (/^\s*>/.test(linea)) {
      const dentro: string[] = [];
      while (i < lineas.length && /^\s*>/.test(lineas[i])) {
        dentro.push(lineas[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      salida.push(`<blockquote>${bloques(dentro, enlaces, [])}</blockquote>`);
      continue;
    }

    // ── Listas ──────────────────────────────────────────────────────────────
    const vinieta = /^(\s*)([-*·]|\d+\.)\s+(.*)$/.exec(linea);
    if (vinieta) {
      /*
       * Cada punto se junta ENTERO —con sus líneas de continuación— antes de
       * pasar por `enLinea`. Renderizar línea a línea partía en dos cualquier
       * negrita que cruzara el salto, y los asteriscos salían impresos: los
       * documentos envuelven a 80 columnas, así que eso pasa constantemente.
       */
      const cierres: string[] = [];
      let sangriaBase = -1;
      let abierto: { texto: string; sangria: number } | null = null;

      const cerrarPunto = () => {
        if (!abierto) return;
        const casilla = /^\[([ xX])\]\s+([\s\S]*)$/.exec(abierto.texto);
        const contenido = casilla
          ? `<span class="casilla">${casilla[1].trim() ? '☑' : '☐'}</span> ${enLinea(casilla[2], enlaces)}`
          : enLinea(abierto.texto, enlaces);
        salida.push(`<li>${contenido}</li>`);
        abierto = null;
      };

      while (i < lineas.length) {
        const m = /^(\s*)([-*·]|\d+\.)\s+(.*)$/.exec(lineas[i]);
        if (!m) {
          // Una línea en blanco no cierra la lista si la siguiente sigue en ella.
          if (!lineas[i].trim()) {
            const siguiente = lineas[i + 1] ?? '';
            if (/^(\s*)([-*·]|\d+\.)\s+/.test(siguiente) || /^\s{2,}\S/.test(siguiente)) {
              i++;
              continue;
            }
            break;
          }
          // Texto sangrado: continúa el punto abierto.
          if (/^\s{2,}\S/.test(lineas[i]) && abierto) {
            abierto.texto += ' ' + lineas[i].trim();
            i++;
            continue;
          }
          break;
        }

        cerrarPunto();
        const sangria = m[1].length;
        const ordenada = /\d/.test(m[2]);
        if (sangriaBase === -1) sangriaBase = sangria;

        if (sangria > sangriaBase && cierres.length) {
          salida.push(ordenada ? '<ol>' : '<ul>');
          cierres.push(ordenada ? '</ol>' : '</ul>');
          sangriaBase = sangria;
        } else if (!cierres.length) {
          salida.push(ordenada ? '<ol>' : '<ul>');
          cierres.push(ordenada ? '</ol>' : '</ul>');
        } else if (sangria < sangriaBase && cierres.length > 1) {
          salida.push(cierres.pop()!);
          sangriaBase = sangria;
        }

        abierto = { texto: m[3], sangria };
        i++;
      }
      cerrarPunto();
      cerrarLista(cierres);
      continue;
    }

    // ── Párrafo ─────────────────────────────────────────────────────────────
    const parrafo: string[] = [];
    while (
      i < lineas.length &&
      lineas[i].trim() &&
      !/^(#{1,6})\s/.test(lineas[i]) &&
      !/^\s*>/.test(lineas[i]) &&
      !/^(\s*)([-*·]|\d+\.)\s+/.test(lineas[i]) &&
      !/^\s*(-{3,}|\*{3,})\s*$/.test(lineas[i])
    ) {
      parrafo.push(lineas[i].trim());
      i++;
    }
    if (parrafo.length) {
      salida.push(`<p>${enLinea(parrafo.join(' '), enlaces)}</p>`);
    }
  }

  return salida.join('\n');
}

export function renderizar(
  markdown: string,
  enlaces: EnlaceInterno[] = [],
): DocumentoRenderizado {
  const indice: EntradaIndice[] = [];
  const lineas = markdown.replace(/\r\n/g, '\n').split('\n');
  const partes: string[] = [];
  let sueltas: string[] = [];

  const vaciar = () => {
    if (sueltas.length) {
      partes.push(bloques(sueltas, enlaces, indice));
      sueltas = [];
    }
  };

  let i = 0;
  while (i < lineas.length) {
    // ── Bloque de código ────────────────────────────────────────────────────
    if (/^\s*```/.test(lineas[i])) {
      vaciar();
      const idioma = lineas[i].trim().replace(/^```/, '').trim();
      i++;
      const dentro: string[] = [];
      while (i < lineas.length && !/^\s*```/.test(lineas[i])) {
        dentro.push(lineas[i]);
        i++;
      }
      i++; // la línea de cierre
      partes.push(
        `<pre${idioma ? ` data-idioma="${escapar(idioma)}"` : ''}><code>${escapar(
          dentro.join('\n'),
        )}</code></pre>`,
      );
      continue;
    }

    // ── Tabla ───────────────────────────────────────────────────────────────
    if (
      lineas[i].trim().startsWith('|') &&
      i + 1 < lineas.length &&
      esSeparadorDeTabla(lineas[i + 1])
    ) {
      vaciar();
      const encabezado = celdasDe(lineas[i]);
      i += 2;
      const filas: string[][] = [];
      while (i < lineas.length && lineas[i].trim().startsWith('|')) {
        filas.push(celdasDe(lineas[i]));
        i++;
      }
      const th = encabezado
        .map((c) => `<th>${enLinea(c, enlaces)}</th>`)
        .join('');
      const tb = filas
        .map(
          (f) =>
            `<tr>${f
              .map((c) => `<td>${enLinea(c, enlaces)}</td>`)
              .join('')}</tr>`,
        )
        .join('');
      partes.push(
        `<div class="tabla"><table><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table></div>`,
      );
      continue;
    }

    sueltas.push(lineas[i]);
    i++;
  }
  vaciar();

  return { html: partes.join('\n'), indice };
}
