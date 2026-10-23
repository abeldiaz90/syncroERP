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
 * Y UNA TERCERA VEZ, el 22-oct-2026, con la variante que esta prueba no podía
 * ver: dos controladores con el MISMO prefijo.
 *
 *     @Controller('ventas') class VentasController          @Get(':id')
 *     @Controller('ventas') class ImpresionTicketsController @Get('impresoras')
 *
 *     GET /ventas/impresoras → cae en /ventas/:id con id = «impresoras» → 400
 *
 * `ImpresionTicketsController` no es hijo de nadie: comparte prefijo. La
 * comprobación de abajo sólo miraba «prefijo del hijo = prefijo del padre + un
 * segmento», así que este par no entraba en la cuenta y la prueba pasaba sin
 * haber mirado el caso. Se rompía la pantalla de impresoras para TODOS los
 * perfiles, administrador incluido, y ninguna prueba lo decía.
 *
 * Y lo caro no fue el 400: la pantalla de pedidos cargaba entera, con todos
 * sus desplegables vacíos, porque ese 400 tumbaba el `Promise.all` que también
 * traía clientes, almacenes y productos. Una pantalla completa en la que no se
 * podía capturar nada. *Un hueco que se cree puesto.*
 *
 * CÓMO MIDE
 *
 * Lee el prefijo de cada `@Controller(...)` y el orden real del array
 * `controllers` de cada módulo —el que Nest va a usar— y persigue las dos
 * formas del mismo defecto:
 *
 *  · El HIJO —`ventas/pedidos` bajo `ventas`— declarado después del padre.
 *  · El HERMANO de mismo prefijo cuyas rutas LITERALES de un solo segmento
 *    —`@Get('impresoras')`— quedan detrás del `:id` del otro.
 *
 * En los dos casos lo que decide es el orden de registro, no el texto.
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
/**
 * Clase de controlador → sus rutas LITERALES de un solo segmento.
 *
 * Son las que un `:id` de la raíz se come cuando las dos clases comparten
 * prefijo. `@Get('aprobaciones/pendientes')` no entra: son dos segmentos y
 * `:id` exige uno.
 */
const literalesDeUnSegmento = new Map<string, string[]>();

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
    const literales = new Set<string>();
    const decoradores =
      /@(?:Get|Patch|Put|Delete|Post)\(\s*['"`]([^'"`:]+)['"`]\s*\)/g;
    let d: RegExpExecArray | null;
    while ((d = decoradores.exec(texto))) {
      const sufijo = d[1].replace(/^\/+|\/+$/g, '');
      if (sufijo !== '' && !sufijo.includes('/')) literales.add(sufijo);
    }
    literalesDeUnSegmento.set(clase, [...literales]);
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
    /*
     * Y que se hayan leído rutas literales: si el patrón de los decoradores
     * dejara de casar, la segunda comprobación pasaría sin mirar nada, que es
     * exactamente cómo este defecto llegó a producción la tercera vez.
     */
    expect(
      [...literalesDeUnSegmento.values()].reduce((n, l) => n + l.length, 0),
    ).toBeGreaterThan(50);
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
          /*
           * EL HERMANO DE MISMO PREFIJO. Aquí no sobra ningún segmento: lo que
           * el `:id` se come son las rutas literales de un segmento del otro
           * controlador, una por una.
           */
          if (prefijoHijo === prefijoPadre) {
            for (const literal of literalesDeUnSegmento.get(hijo) ?? []) {
              culpables.push(
                `${relative(SRC, ruta).split(sep).join('/')}: ${hijo} ` +
                  `(«${prefijoHijo}») se registra DESPUÉS de ${padre} (mismo prefijo), ` +
                  `que tiene una ruta con parámetro y se comería «${literal}»`,
              );
            }
          }
        }
      }
    }

    expect(culpables.sort()).toEqual([]);
  });
});
