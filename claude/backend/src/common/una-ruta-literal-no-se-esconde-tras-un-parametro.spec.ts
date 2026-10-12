import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

/**
 * ============================================================================
 * UNA RUTA LITERAL NO SE ESCONDE DETRÁS DE UNA CON PARÁMETRO
 * ----------------------------------------------------------------------------
 * EL CASO, DOS VECES
 *
 * Nest resuelve las rutas POR ORDEN DE REGISTRO. Si un controlador declara
 * `@Get(':id')` y otro declara `@Get()` bajo el mismo prefijo, el que se
 * registre primero gana:
 *
 *     @Controller('ventas')         @Get(':id')     ← registrado antes
 *     @Controller('ventas/pedidos') @Get()          ← nunca se alcanza
 *
 *     GET /ventas/pedidos  →  cae en /ventas/:id con id = «pedidos»  →  400
 *
 * Ya había mordido una vez dentro de un mismo controlador —`para-venta` contra
 * `:id` en almacenes, que se arregló moviendo el método arriba y dejando el
 * porqué escrito—. Volvió a morder el 12-oct-2026 ENTRE DOS CONTROLADORES, que
 * es la variante que ningún comentario podía prevenir.
 *
 * Y lo caro no fue el 400: la pantalla de pedidos cargaba entera, con todos
 * sus desplegables vacíos, porque ese 400 tumbaba el `Promise.all` que también
 * traía clientes, almacenes y productos. Una pantalla completa en la que no se
 * podía capturar nada. *Un hueco que se cree puesto.*
 *
 * CÓMO MIDE
 *
 * Lee el prefijo de cada `@Controller(...)` y, cuando un prefijo es hijo de
 * otro —`ventas/pedidos` bajo `ventas`—, comprueba que el HIJO esté declarado
 * antes que el padre en el array `controllers` de su módulo. No mira el texto
 * de la ruta: mira el orden real que Nest va a usar.
 * ============================================================================
 */

const SRC = join(__dirname, '..');

function archivos(dir: string, sufijo: string, hallados: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) archivos(p, sufijo, hallados);
    else if (n.endsWith(sufijo)) hallados.push(p);
  }
  return hallados;
}

/** Clase de controlador → su prefijo de ruta. */
const prefijoPorClase = new Map<string, string>();
/** Clase de controlador → ¿declara alguna ruta con parámetro en la raíz? */
const conParametroEnLaRaiz = new Set<string>();

for (const ruta of archivos(SRC, '.controller.ts')) {
  const texto = readFileSync(ruta, 'utf8');
  const decl = /@Controller\(\s*['"`]([^'"`]*)['"`]\s*\)\s*export\s+class\s+(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = decl.exec(texto))) {
    const prefijo = m[1].replace(/^\/+|\/+$/g, '');
    const clase = m[2];
    prefijoPorClase.set(clase, prefijo);
    /*
     * Sólo cuenta el parámetro en el PRIMER segmento: `@Get(':id')` se come
     * `/ventas/pedidos`, pero `@Get(':id/devoluciones')` no, porque exige dos
     * segmentos y el hijo sólo trae uno.
     */
    if (/@(Get|Patch|Put|Delete|Post)\(\s*['"`]:[\w]+['"`]\s*\)/.test(texto)) {
      conParametroEnLaRaiz.add(clase);
    }
  }
}

/** Módulo → controladores en el orden en que los registra. */
function ordenDeControladores(texto: string): string[] {
  const m = /controllers:\s*\[([\s\S]*?)\]/.exec(texto);
  if (!m) return [];
  return m[1]
    /* Los comentarios se quitan: un nombre citado dentro de una explicación
       no es un registro, y contarlo movería el orden medido. */
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .split(',')
    .map((x) => x.trim())
    .filter((x) => /^[A-Z]\w*$/.test(x));
}

describe('una ruta literal no se esconde detrás de una con parámetro', () => {
  const modulos = archivos(SRC, '.module.ts');

  it('el barrido encuentra de verdad los controladores y los módulos', () => {
    /* Sin esto, un cambio de forma en los decoradores dejaría la lista de
       culpables vacía y la prueba verde sin haber mirado nada. */
    expect(prefijoPorClase.size).toBeGreaterThan(40);
    expect(modulos.length).toBeGreaterThan(10);
  });

  it('cada controlador hijo se registra antes que el padre que lo taparía', () => {
    const culpables: string[] = [];

    for (const ruta of modulos) {
      const orden = ordenDeControladores(readFileSync(ruta, 'utf8'));
      if (orden.length < 2) continue;

      for (let i = 0; i < orden.length; i++) {
        const padre = orden[i];
        const prefijoPadre = prefijoPorClase.get(padre);
        if (!prefijoPadre || !conParametroEnLaRaiz.has(padre)) continue;

        for (let j = i + 1; j < orden.length; j++) {
          const hijo = orden[j];
          const prefijoHijo = prefijoPorClase.get(hijo);
          if (!prefijoHijo) continue;
          /*
           * El hijo queda tapado cuando su prefijo es el del padre más UN
           * segmento: ése es el que `:id` se come. Con dos o más segmentos la
           * ruta con parámetro ya no casa.
           */
          const sobra = prefijoHijo.startsWith(prefijoPadre + '/')
            ? prefijoHijo.slice(prefijoPadre.length + 1)
            : null;
          if (sobra && !sobra.includes('/')) {
            culpables.push(
              `${relative(SRC, ruta).split(sep).join('/')}: ${hijo} ` +
                `(«${prefijoHijo}») se registra DESPUÉS de ${padre} («${prefijoPadre}»), ` +
                `que tiene una ruta con parámetro y se comería «${sobra}»`,
            );
          }
        }
      }
    }

    expect(culpables.sort()).toEqual([]);
  });
});
