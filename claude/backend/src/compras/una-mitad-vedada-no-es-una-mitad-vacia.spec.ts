import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { PLANTILLAS_PERMISOS } from '../iam/data/plantillas-permisos';
import { ENDPOINTS_NAVEGABLES } from '../iam/data/endpoints-navegables';

/**
 * ============================================================================
 * UNA MITAD VEDADA NO ES UNA MITAD VACÍA
 * ----------------------------------------------------------------------------
 * `/dashboard/compras/aprobaciones` es UNA pantalla con DOS bandejas: las
 * requisiciones que esperan autorización y las cotizaciones que esperan
 * adjudicación. Son dos autoridades distintas y hay perfiles que tienen una y
 * no la otra: el comprador adjudica y no autoriza.
 *
 * De ahí salieron dos defectos, los dos medidos el 22-oct-2026 recorriendo los
 * once roles operativos con «Ver el ERP como otra persona» y leyendo los
 * códigos de respuesta reales de cada pantalla.
 *
 * ── 1. EL VACÍO QUE AFIRMABA SOBRE LO QUE NO MIRÓ ──────────────────────────
 * Con una mitad en 403 y la otra vacía, la pantalla concluía «Todo al día · No
 * tienes requisiciones ni adjudicaciones pendientes de aprobar». Nombraba como
 * vacía una bandeja que nunca pudo consultar. El propio archivo ya había
 * corregido este razonamiento para el caso de la consulta CAÍDA —«Todo al día
 * es una conclusión, no un estado vacío»— y dejó fuera el caso del 403, que es
 * el que de verdad ocurre todos los días, porque es el normal.
 *
 * Es el mismo defecto en la pestaña de historial: «Aquí van a quedar las
 * requisiciones y adjudicaciones que apruebes o rechaces» promete un rastro de
 * algo que esta persona no puede firmar.
 *
 * LA REGLA: se guarda qué mitad contestó 403 y sólo se habla de las que
 * contestaron. La mitad vedada no se nombra como vacía; se nombra como ajena.
 *
 * ── 2. LA OTRA PUERTA A LA MISMA PANTALLA ──────────────────────────────────
 * El almacenista tenía vedadas las dos acciones de la mitad de requisiciones
 * —«quien pide no se autoriza»— y seguía viendo el renglón «Aprobaciones» en
 * su centro de trabajo. El menú se arma con las rutas concedidas y la mitad de
 * cotizaciones seguía viva por la consulta del módulo `compras`: basta UNA
 * mitad para que la pantalla se liste.
 *
 * Vedar media pantalla no quita la pantalla. Adjudicar tampoco le toca —en el
 * almacén se solicita y en compras se adjudica—, así que se vedan las cuatro y
 * el renglón desaparece, que es lo que la veda de requisiciones quiso decir.
 * ============================================================================
 */

const RAIZ = join(__dirname, '..', '..', '..');
const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
  .map((n) => join(RAIZ, n))
  .find((r) => existsSync(join(r, 'app/dashboard/module-config.ts')));

const PANTALLA = 'app/dashboard/compras/aprobaciones/page.tsx';
const texto = () => readFileSync(join(FRONTEND!, PANTALLA), 'utf8');

const PANTALLA_BANDEJA = '/dashboard/compras/aprobaciones';
const CONTROLADORES = [
  'compras/controllers/requisiciones.controller.ts',
  'compras/controllers/cotizaciones.controller.ts',
];

/**
 * Las acciones que un controlador declara `@Navegable` hacia una pantalla.
 *
 * Se lee del archivo porque el decorador no deja rastro consultable sin
 * levantar Nest, y lo que importa es la DECLARACIÓN: el prefijo del
 * `@Controller`, el verbo más cercano y su sufijo.
 */
function accionesNavegablesDe(archivo: string, pantalla: string): string[] {
  const fuente = readFileSync(join(__dirname, '..', archivo), 'utf8');
  const prefijo = (
    /@Controller\(\s*'([^']*)'/.exec(fuente)?.[1] ?? ''
  ).replace(/^\/+|\/+$/g, '');
  const salida: string[] = [];
  const lineas = fuente.split('\n');
  lineas.forEach((linea, i) => {
    if (!linea.includes(`@Navegable('${pantalla}'`)) return;
    /* El verbo puede ir unas líneas más abajo: el decorador va encima. */
    for (const siguiente of lineas.slice(i, i + 8)) {
      const m = /@(Get|Post|Patch|Put|Delete)\(\s*(?:'([^']*)')?\s*\)/.exec(
        siguiente,
      );
      if (!m) continue;
      /*
       * La barra inicial se pone aparte. Iba como primer elemento de este
       * arreglo y el `filter` que quita los vacíos se la llevaba, así que las
       * rutas salían `compras/requisiciones/…` y no casaban con ninguna veda:
       * la prueba contestaba «te faltan dos puertas» sobre dos que estaban
       * vedadas. Lo peor es cómo se escapó: la comprobé con un script que
       * construía la ruta de otra manera, o sea que comprobé otra cosa.
       */
      const ruta = `/${[prefijo, m[2] ?? '']
        .filter((p) => p !== '')
        .join('/')}`.replace(/\/+/g, '/');
      salida.push(`${m[1].toUpperCase()} ${ruta}`);
      break;
    }
  });
  return salida;
}

/** Las cuatro acciones de la bandeja de adjudicación de cotizaciones. */
const MITAD_COTIZACIONES = [
  'GET /compras/cotizaciones/aprobaciones/pendientes',
  'GET /compras/cotizaciones/aprobaciones/historial',
  'PATCH /compras/cotizaciones/:id/aprobar',
  'PATCH /compras/cotizaciones/:id/rechazar',
];

/**
 * Las de la bandeja de requisiciones. Las dos primeras estaban vedadas antes
 * de esta prueba; el HISTORIAL es la tercera puerta a la misma pantalla —lleva
 * su propio `@Navegable` con la misma ruta, porque es la otra pestaña— y
 * faltaba. Medido el 22-oct-2026 después de sincronizar: con las otras seis
 * vedadas, el renglón seguía en el menú por ésta.
 */
const MITAD_REQUISICIONES = [
  'GET /compras/requisiciones/aprobaciones/pendientes',
  'GET /compras/requisiciones/aprobaciones/historial',
  'PATCH /compras/requisiciones/aprobaciones/:id',
];

describe('una mitad vedada no es una mitad vacía', () => {
  it('encuentra el frontend, o no mide nada', () => {
    expect(FRONTEND).toBeDefined();
  });

  describe('la pantalla sólo afirma sobre lo que consultó', () => {
    it('guarda qué mitad contestó 403, en las dos pestañas', () => {
      const t = texto();
      /* Pendientes e historial: dos cargas, dos registros. */
      expect(
        t.match(/setVedadas(?:Hist)?\(\{\s*req:\s*r\.status === 403,\s*adj:\s*ra\.status === 403\s*\}\)/g)
          ?.length ?? 0,
      ).toBe(2);
    });

    it('la frase del vacío se decide con esas banderas y contempla los cuatro casos', () => {
      const t = texto();
      for (const f of ['frasesDelVacio', 'frasesDelHistorialVacio']) {
        expect({ f, existe: new RegExp(`export function ${f}\\(`).test(t) }).toEqual({
          f,
          existe: true,
        });
        /*
         * Cuatro salidas: las dos vedadas, cada una por separado, y ninguna.
         * Con menos, alguna combinación vuelve a caer en la frase plana.
         */
        const cuerpo = t.slice(t.indexOf(`export function ${f}(`));
        const hasta = cuerpo.indexOf('\n}\n');
        const trozo = cuerpo.slice(0, hasta);
        expect({ f, retornos: (trozo.match(/return '/g) ?? []).length }).toEqual({
          f,
          retornos: 4,
        });
        expect({ f, ambas: /vedadas\.req && vedadas\.adj/.test(trozo) }).toEqual({
          f,
          ambas: true,
        });
      }
    });

    it('ninguna de las dos frases planas se pinta ya sin condición', () => {
      const t = texto();
      /*
       * LA PRUEBA DE LA PRUEBA. Las dos frases siguen existiendo —son la
       * respuesta correcta cuando NADA está vedado— pero sólo pueden vivir
       * dentro de su función, como una rama entre cuatro. Si vuelven al JSX,
       * el vacío vuelve a afirmar sobre lo que no mira.
       *
       * Se mide por la forma: la frase aparece una sola vez en todo el
       * archivo, y el JSX no la escribe: llama a la función.
       */
      for (const frase of [
        'No tienes requisiciones ni adjudicaciones pendientes de aprobar.',
        'Aquí van a quedar las requisiciones y adjudicaciones que apruebes o rechaces.',
      ]) {
        expect({ frase, veces: t.split(frase).length - 1 }).toEqual({
          frase,
          veces: 1,
        });
        /* Y esa única vez es un `return` de la función, no un nodo pintado. */
        const i = t.indexOf(frase);
        const renglon = t.slice(t.lastIndexOf('\n', i) + 1, i);
        expect({ frase, esRetorno: /return '$/.test(renglon) }).toEqual({
          frase,
          esRetorno: true,
        });
      }
      /* El JSX pide las frases a las funciones. */
      expect(t).toMatch(/\{frasesDelVacio\(vedadas\)\}/);
      expect(t).toMatch(/\{frasesDelHistorialVacio\(vedadas\)\}/);
    });

    it('cuando las dos mitades son ajenas, el titular no dice «Todo al día»', () => {
      const t = texto();
      expect(t).toMatch(/vedadas\.req && vedadas\.adj\s*\?\s*'Esta bandeja no es de tu perfil'/);
    });
  });

  describe('vedar media pantalla no deja la pantalla a la vista', () => {
    const almacenista = PLANTILLAS_PERMISOS.find((p) => p.rol === 'almacenista');

    it('el almacenista existe como plantilla', () => {
      expect(almacenista).toBeDefined();
    });

    it('tiene vedadas LAS DOS mitades de la bandeja, no una', () => {
      const vedadas = almacenista!.accionesVedadas ?? [];
      for (const accion of [...MITAD_REQUISICIONES, ...MITAD_COTIZACIONES]) {
        expect({ accion, vedada: vedadas.includes(accion) }).toEqual({
          accion,
          vedada: true,
        });
      }
    });

    it('el barrido devuelve rutas con su barra inicial', () => {
      /*
       * LA PRUEBA DE LA PRUEBA, y la lección: la primera versión de esta
       * función devolvía `compras/requisiciones/…` sin barra, no casaba con
       * ninguna acción vedada, y la comprobación de abajo acusaba en falso.
       * Se mide la FORMA de lo que devuelve antes de usarla para acusar.
       */
      const puertas = CONTROLADORES.flatMap((archivo) =>
        accionesNavegablesDe(archivo, PANTALLA_BANDEJA),
      );
      expect(puertas.length).toBeGreaterThan(0);
      for (const accion of puertas) {
        expect({ accion, bienFormada: /^(?:GET|POST|PATCH|PUT|DELETE) \/\S+$/.test(accion) })
          .toEqual({ accion, bienFormada: true });
      }
    });

    it('no queda NINGUNA ruta que vuelva a poner la pantalla en su menú', () => {
      /*
       * La prueba de la prueba, y la que aguanta la próxima pestaña. En vez de
       * fiarse de una lista escrita a mano, se recorre el diccionario de
       * pantallas y los decoradores: toda acción que conceda
       * `/dashboard/compras/aprobaciones` tiene que estar vedada para este rol.
       *
       * Si mañana nace una tercera pestaña con su `@Navegable`, esto falla sin
       * que nadie tenga que acordarse de venir a añadirla.
       */
      const vedadas = almacenista!.accionesVedadas ?? [];
      const porDiccionario = Object.entries(ENDPOINTS_NAVEGABLES)
        .filter(([, meta]) => meta.rutaFrontend === PANTALLA_BANDEJA)
        .map(([accion]) => accion);
      const porDecorador = CONTROLADORES.flatMap((archivo) =>
        accionesNavegablesDe(archivo, PANTALLA_BANDEJA),
      );
      const puertas = [...new Set([...porDiccionario, ...porDecorador])];
      /*
       * Si el barrido no encuentra puertas, no está midiendo nada. Hoy son
       * dos, las dos de requisiciones: `pendientes` —que además tiene entrada
       * en el diccionario— y `historial`. La mitad de cotizaciones NO concede
       * la pantalla, y por eso el renglón sobrevivió a su veda: lo sostenía el
       * historial. Se exige el mínimo, no el número exacto, para que una
       * pestaña nueva entre a la cuenta en vez de romper la prueba.
       */
      expect(puertas.length).toBeGreaterThanOrEqual(2);
      expect(puertas.filter((a) => !vedadas.includes(a)).sort()).toEqual([]);
    });

    it('a quien sí adjudica no se le quita su mitad', () => {
      /*
       * El comprador adjudica cotizaciones: la mitad de requisiciones le
       * contesta 403 y eso es correcto. Esta prueba existe para que el arreglo
       * de arriba no se aplique de más —quitarle la bandeja al comprador sería
       * dejar las cotizaciones sin quién las firme—.
       */
      const comprador = PLANTILLAS_PERMISOS.find((p) => p.rol === 'comprador');
      expect(comprador).toBeDefined();
      const vedadas = comprador!.accionesVedadas ?? [];
      for (const accion of MITAD_COTIZACIONES) {
        expect({ accion, vedada: vedadas.includes(accion) }).toEqual({
          accion,
          vedada: false,
        });
      }
    });
  });
});
