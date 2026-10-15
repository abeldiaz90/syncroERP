/**
 * ============================================================================
 * UNA PANTALLA NO HABLA CON PARÉNTESIS
 * ----------------------------------------------------------------------------
 * MEDIDO el 15-oct-2026 abriendo «Qué le falta» de una empresa en la consola
 * SUMA: el renglón del catálogo decía «5 producto(s)».
 *
 * Lo interesante no es el paréntesis: es de dónde venía. La consola ya tenía
 * su pieza (`lib/conteo.ts`) y su trinquete desde esa misma mañana, y el
 * portal de Fineract el suyo desde el 14-oct. Las dos pantallas estaban
 * limpias. Pero esa frase no la escribe ninguna de las dos: la escribe el ERP
 * y las pantallas la enseñan tal cual. La regla estaba puesta en los dos
 * sitios donde se LEE y faltaba en el único donde se ESCRIBE.
 *
 * Es *la pieza buena existe y el camino real no la usa*, y por eso el
 * trinquete tiene que vivir aquí: limpiar las pantallas una por una deja el
 * defecto entero en pie y además lo esconde, porque la pantalla se ve bien.
 *
 * Barrido del 15-oct: 86 frases en 32 archivos. Las peores no eran logs —era
 * el correo de cobranza a un cliente final, que le decía «tu pago venció hace
 * 1 día(s)»—.
 *
 * El plural lo decide `plural` de `common/plural`, que es la misma función
 * que `plural` de `frontend/lib/format.ts`, con la misma firma a propósito.
 * ============================================================================
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

import { plural } from './plural';

const SRC = join(__dirname, '..');
const RAIZ = join(SRC, '..', '..');

/*
 * El mismo orden de candidatos que usan las demás pruebas que miran el
 * frontend. La regla se mide en los DOS árboles desde aquí, y no con un
 * trinquete en cada uno, porque la misma frase viaja del ERP a la pantalla y
 * de la pantalla a la consola: partirla en dos reglas es como no tenerla.
 */
const CANDIDATOS = ['claude/frontend', 'frontend', '../claude/frontend'];
const FRONTEND = CANDIDATOS.map((n) => join(RAIZ, n)).find((r) =>
  existsSync(join(r, 'app/dashboard/module-config.ts')),
);

/*
 * Los comentarios no se miden, y se blanquean en vez de borrarse para no
 * mover los números de línea. La nota de `plural.ts` lleva dentro los
 * ejemplos del defecto —«5 producto(s)»— y sin esto se denunciaría a sí
 * misma: el único sitio donde el defecto TIENE que poder escribirse es donde
 * se explica cuál es.
 */
const sinComentarios = (t: string) =>
  t
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

/*
 * Una palabra de verdad seguida de `(s)` o `(es)`.
 *
 * Exige tres letras antes para no atrapar una llamada —`map((s) => s)`,
 * `trim(s)`—, que es por donde se coló la primera versión de esta misma regla
 * en el portal. Y exige minúscula inicial por la misma razón: `new Date(s)` y
 * `fechaLarga(s)` son llamadas, y un sustantivo español en mitad de una frase
 * no va con mayúscula. Ocho falsos positivos del frontend salían de ahí.
 */
const PARENTESIS = /(?<![.\w])[a-záéíóúñ]{3,}\((?:e?s)\)(?!\s*(?:;|=>|\)))/g;

function fuentes(dir: string, acumulado: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === 'dist' || nombre.startsWith('.next')) continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) fuentes(ruta, acumulado);
    else if (/\.tsx?$/.test(nombre) && !/\.(spec|test)\.tsx?$/.test(nombre)) acumulado.push(ruta);
  }
  return acumulado;
}

/** Los dos árboles, con su nombre, para que el rojo diga en cuál está. */
function arboles(): { nombre: string; raiz: string }[] {
  const lista = [{ nombre: 'backend/src', raiz: SRC }];
  if (FRONTEND) {
    for (const carpeta of ['app', 'lib', 'components']) {
      const raiz = join(FRONTEND, carpeta);
      if (existsSync(raiz)) lista.push({ nombre: `frontend/${carpeta}`, raiz });
    }
  }
  return lista;
}

/** TRINQUETE. Sólo puede bajar. */
const DEUDA_MAXIMA = 0;

describe('una pantalla no habla con paréntesis', () => {
  it('encuentra los dos árboles, o no mide nada', () => {
    /*
     * El guardián. Sin esto, mover o renombrar el frontend deja la mitad de la
     * regla midiendo cero archivos y la prueba sigue verde: *una prueba que no
     * puede fallar es peor que no tenerla*.
     */
    expect(FRONTEND).toBeDefined();
    expect(fuentes(SRC).length).toBeGreaterThan(200);
    expect(arboles().length).toBe(4);
    expect(arboles().reduce((n, a) => n + fuentes(a.raiz).length, 0)).toBeGreaterThan(700);
  });

  it('la prueba de la prueba: distingue un plural perezoso de una llamada', () => {
    const halla = (t: string) => {
      PARENTESIS.lastIndex = 0;
      return PARENTESIS.test(t);
    };
    expect(halla('5 producto(s) sembrados')).toBe(true);
    expect(halla('tu pago venció hace 1 día(s)')).toBe(true);
    expect(halla('2 mes(es) de depreciación')).toBe(true);
    // Una llamada de función no es un plural.
    expect(halla('const x = trim(s);')).toBe(false);
    expect(halla('stocks.map((s) => s.total)')).toBe(false);
    // Una llamada con nombre en camello o pascal tampoco: no es un sustantivo.
    expect(halla('new Date(s).toLocaleDateString()')).toBe(false);
    expect(halla('{fechaLarga(s)}')).toBe(false);
    // Y un comentario que EXPLIQUE el defecto no cuenta como defecto.
    expect(halla(sinComentarios('/* ejemplo: 5 producto(s) */'))).toBe(false);
    expect(halla(sinComentarios('// «1 usuario(s)» está mal'))).toBe(false);
    // Pero sigue viéndose fuera del comentario, en la misma línea.
    expect(halla(sinComentarios("const t = `5 producto(s)`; // ojo"))).toBe(true);
    // Y blanquear no mueve los renglones.
    expect(sinComentarios('/* a\nb */\nreal').split('\n').length).toBe(3);
  });

  it('`plural` decide el plural, que es de lo que se trata', () => {
    expect(plural(1, 'registro')).toBe('1 registro');
    expect(plural(3, 'registro')).toBe('3 registros');
    expect(plural(1, 'acción', 'acciones')).toBe('1 acción');
    expect(plural(0, 'acción', 'acciones')).toBe('0 acciones');
    expect(plural(2, 'mes', 'meses')).toBe('2 meses');
    // El adjetivo concuerda con el sustantivo, así que viaja con él.
    expect(plural(2, 'cuota actualizada', 'cuotas actualizadas')).toBe('2 cuotas actualizadas');
  });

  it('ni el ERP ni sus pantallas hablan con paréntesis', () => {
    const fuera: string[] = [];
    for (const arbol of arboles()) {
      for (const ruta of fuentes(arbol.raiz)) {
        sinComentarios(readFileSync(ruta, 'utf8'))
          .split('\n')
          .forEach((linea, i) => {
            PARENTESIS.lastIndex = 0;
            for (const m of linea.matchAll(PARENTESIS)) {
              fuera.push(`${arbol.nombre}${ruta.replace(arbol.raiz, '')}:${i + 1}  ${m[0]}`);
            }
          });
      }
    }
    expect(
      `${fuera.length} · usa \`plural\` (backend: common/plural · frontend: @/lib/format):\n  ${fuera.join('\n  ')}`,
    ).toBe(
      `${DEUDA_MAXIMA} · usa \`plural\` (backend: common/plural · frontend: @/lib/format):\n  `,
    );
  });
});
