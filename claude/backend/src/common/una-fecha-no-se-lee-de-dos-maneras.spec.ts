import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * UNA FECHA NO SE LEE DE DOS MANERAS EN LA MISMA PANTALLA
 * ----------------------------------------------------------------------------
 * MEDIDO el 15-oct-2026 en «Reportes → Ventas», con diez ventas de prueba:
 *
 *   POR DÍA    06 oct 2026 · 9 ventas · $2,560.00
 *   DETALLE    #00010, #00009, #00008 … con fecha «07 oct 2026»
 *
 * El mismo reporte, la misma venta, dos días distintos. Y la suma del
 * desglose cuadraba con el total, así que nada avisaba: las ventas estaban
 * completas y puestas en el día equivocado, que es peor que descuadrar.
 *
 * Las dos lecturas convivían a seis líneas de distancia:
 *
 *   const k = v.fechaVenta?.split('T')[0]     ← el día en UTC
 *   new Date(v.fechaVenta).toLocaleDateString ← el día local
 *
 * Partir por la «T» no es recortar una fecha: es quedarse con el día en UTC,
 * que a este lado del meridiano es el de ayer durante buena parte de la
 * jornada.
 *
 * Y la pieza buena ya existía: `lib/fechas.ts` nació el 1-oct precisamente de
 * este huso, con su nota explicando que las fechas se arman con las partes
 * locales del reloj y nunca con `toISOString()`. Lo que faltaba era que el
 * camino real la usara —*la pieza buena existe y el camino real no la usa*—.
 *
 * El mismo defecto estaba en «Finanzas → Pólizas», donde el filtro de fechas
 * comparaba el día UTC contra el rango mientras la fila enseñaba el local: una
 * póliza podía quedar fuera de un rango al que la pantalla la ponía dentro.
 *
 * QUÉ CUIDA ESTA PRUEBA
 *
 * Que ninguna pantalla vuelva a sacar el día de una fecha partiendo la cadena.
 * `diaDe` de `lib/fechas` hace eso mismo bien, y es una sola llamada.
 * ============================================================================
 */

const SRC = join(__dirname, '..');
const RAIZ = join(SRC, '..', '..');
const CANDIDATOS = ['claude/frontend', 'frontend', '../claude/frontend'];
const FRONTEND = CANDIDATOS.map((n) => join(RAIZ, n)).find((r) =>
  existsSync(join(r, 'app/dashboard/module-config.ts')),
);

/*
 * Se blanquean los comentarios en vez de borrarlos para no mover los números
 * de línea. La nota de `lib/fechas.ts` lleva dentro el defecto escrito —es
 * donde se explica cuál es— y sin esto se denunciaría a sí misma.
 */
const sinComentarios = (t: string) =>
  t
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** `algo.split('T')[0]` — con comillas simples o dobles. */
const PARTIR_LA_FECHA = /\.split\(\s*(['"])T\1\s*\)\s*\[\s*0\s*\]/g;

function fuentes(dir: string, acumulado: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre.startsWith('.next')) continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) fuentes(ruta, acumulado);
    else if (/\.tsx?$/.test(nombre) && !/\.(spec|test)\.tsx?$/.test(nombre))
      acumulado.push(ruta);
  }
  return acumulado;
}

function arboles(): { nombre: string; raiz: string }[] {
  const lista: { nombre: string; raiz: string }[] = [];
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

describe('una fecha no se lee de dos maneras', () => {
  it('encuentra el árbol del frontend, o no mide nada', () => {
    expect(FRONTEND).toBeDefined();
    expect(arboles().length).toBe(3);
    expect(arboles().reduce((n, a) => n + fuentes(a.raiz).length, 0)).toBeGreaterThan(150);
  });

  it('la prueba de la prueba: reconoce el defecto y no confunde otros splits', () => {
    const halla = (t: string) => {
      PARTIR_LA_FECHA.lastIndex = 0;
      return PARTIR_LA_FECHA.test(t);
    };
    expect(halla("const k = v.fechaVenta?.split('T')[0];")).toBe(true);
    expect(halla('const k = p.fecha.split("T")[0]')).toBe(true);
    expect(halla("new Date().toISOString().split('T')[0]")).toBe(true);
    // Partir por otra cosa, o quedarse con otra parte, no es esto.
    expect(halla("nombre.split(',')[0]")).toBe(false);
    expect(halla("fecha.split('T')[1]")).toBe(false);
    // Y el comentario que EXPLICA el defecto no cuenta como defecto.
    expect(halla(sinComentarios("/* mal: f.split('T')[0] */"))).toBe(false);
    expect(sinComentarios('/* a\nb */\nreal').split('\n').length).toBe(3);
  });

  it('`diaDe` existe y sale del mismo análisis que lo que se enseña', () => {
    const fechas = readFileSync(join(FRONTEND!, 'lib/fechas.ts'), 'utf8');
    expect(fechas).toMatch(/export function diaDe\(/);
    /*
     * Lo que hace que las dos lecturas no puedan separarse: `diaDe` arma su
     * clave con `aFecha` —el mismo análisis que usa `fechaCorta` para
     * enseñarla— y con `diaISO`, que construye el día con las partes locales.
     */
    expect(fechas).toMatch(/diaDe[\s\S]{0,200}aFecha\(valor\)[\s\S]{0,120}diaISO\(d\)/);
  });

  it('ninguna pantalla saca el día de una fecha partiendo la cadena', () => {
    const fuera: string[] = [];
    for (const arbol of arboles()) {
      for (const ruta of fuentes(arbol.raiz)) {
        sinComentarios(readFileSync(ruta, 'utf8'))
          .split('\n')
          .forEach((linea, i) => {
            PARTIR_LA_FECHA.lastIndex = 0;
            if (PARTIR_LA_FECHA.test(linea)) {
              fuera.push(`${arbol.nombre}${ruta.replace(arbol.raiz, '')}:${i + 1}`);
            }
          });
      }
    }
    expect(
      `${fuera.length} · usa \`diaDe\` de @/lib/fechas:\n  ${fuera.join('\n  ')}`,
    ).toBe(`${DEUDA_MAXIMA} · usa \`diaDe\` de @/lib/fechas:\n  `);
  });
});
