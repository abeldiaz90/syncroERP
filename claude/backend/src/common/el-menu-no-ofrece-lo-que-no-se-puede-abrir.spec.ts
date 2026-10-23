import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * EL MENÚ NO OFRECE LO QUE NO SE PUEDE ABRIR
 * ----------------------------------------------------------------------------
 * Dos renglones del mismo defecto, medidos la misma mañana recorriendo los
 * trece roles con «Ver el ERP como otra persona».
 *
 * ── 1. EL NOMBRE DEL MÓDULO ────────────────────────────────────────────────
 * MEDIDO el 15-oct-2026 con «Ver el ERP como otra persona», rol almacenista:
 * el menú lateral y la tarjeta del panel ofrecían «Configuración», y al
 * pulsarla salía «Esta sección no está en tu perfil».
 *
 * De las diez pantallas de ese módulo el almacenista alcanza una
 * —«Operaciones pendientes»—, y con una basta para que el módulo se vea: eso
 * está bien. Lo que estaba mal es que el enlace apuntara siempre a la portada
 * declarada (`/dashboard/configuracion/centro`), que no alcanza.
 *
 * Es *un botón que lleva a una negativa*, que este proyecto ya corrigió dos
 * veces —en los accesos rápidos del panel y en los botones de acción de la
 * barra—. Faltaba el enlace que más se pulsa de todos: el nombre del módulo.
 *
 * LA REGLA
 *
 * `destinoDelModulo` devuelve la portada cuando se puede abrir —o cuando es un
 * contenedor, que se abre si se alcanza algo de dentro— y, si no, la primera
 * pantalla accesible del módulo.
 *
 * ── 2. LOS RENGLONES DE DENTRO ─────────────────────────────────────────────
 *
 * Cruzando las rutas REALES de los trece roles —`/admin/permisos/mis-rutas`,
 * pedidas una por una con la cabecera de suplantación— contra los 172
 * renglones del menú, salió uno repetido en siete roles: cobranza, contador,
 * crédito, finanzas, gobierno, rrhh y tesorería veían «Catálogo de productos»
 * y al pulsarlo salía la misma negativa.
 *
 * Lo veían porque alcanzan `/dashboard/productos/atributos`, que es
 * DESCENDIENTE de `/dashboard/productos`, y el menú filtraba los renglones con
 * `puedeVerEnlace`, que acepta esa relación. Esa permisividad es correcta para
 * decidir qué MÓDULOS se ven —un módulo debe verse si algo de dentro se
 * alcanza— y es la equivocada para los renglones, que son pantallas. Y
 * `/dashboard/productos` es a la vez una pantalla y el prefijo de otras, que
 * es justo donde la regla muerde.
 *
 * `puedeAbrirRenglon` pregunta «¿puedo abrirla?», salvo para las portadas y
 * los centros de trabajo, que el layout abre cuando se alcanza algo de dentro.
 *
 * COMPROBADO que ningún rol pierde un módulo por esto: antes y después, los
 * mismos diecisiete cajones; lo único que desaparece son los renglones que
 * contestaban que no.
 *
 * QUÉ CUIDA ESTA PRUEBA
 *
 * Que los cuatro sitios que pintan menú —el lateral, el panel, el centro de
 * trabajo y la barra del módulo— pasen por las dos funciones, y no por
 * `m.href` a secas ni por `puedeVerEnlace` en los renglones.
 * ============================================================================
 */

const RAIZ = join(__dirname, '..', '..', '..');
const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
  .map((n) => join(RAIZ, n))
  .find((r) => existsSync(join(r, 'app/dashboard/module-config.ts')));

const leer = (...p: string[]) => readFileSync(join(FRONTEND!, ...p), 'utf8');

describe('el menú no ofrece lo que no se puede abrir', () => {
  it('encuentra el frontend, o no mide nada', () => {
    expect(FRONTEND).toBeDefined();
  });

  it('la función existe y contempla los contenedores', () => {
    const config = leer('app/dashboard/module-config.ts');
    expect(config).toMatch(/export function destinoDelModulo\(/);
    /*
     * Los centros de trabajo y las portadas de módulo no se comprueban con el
     * permiso: el layout los abre cuando se alcanza algo de dentro. Si esta
     * función les aplicara `puedeEntrar`, mandaría a todo el mundo a la
     * primera pantalla suelta en vez de a su centro de trabajo.
     */
    expect(config).toMatch(/\/dashboard\/centros\//);
    expect(config).toMatch(/RUTAS_CONTENEDOR\.has\(modulo\.href\)/);
    expect(config).toMatch(/accesibles\[0\]\?\.href/);
  });

  it('el menú lateral la usa, y ya no enlaza la portada a secas', () => {
    const layout = leer('app/dashboard/layout.tsx');
    expect(layout).toMatch(/href=\{destinoDelModulo\(/);
    /* El enlace del módulo era `href={m.href}`. Que no vuelva. */
    expect(layout).not.toMatch(/href=\{m\.href\}/);
  });

  it('el panel la usa, y ya no enlaza la portada a secas', () => {
    const panel = leer('app/dashboard/page.tsx');
    expect(panel).toMatch(/destinoDelModulo\(/);
    expect(panel).not.toMatch(/const destino = m\.href;/);
  });

  it('la función de renglón existe y respeta portadas y centros', () => {
    const config = leer('app/dashboard/module-config.ts');
    expect(config).toMatch(/export function puedeAbrirRenglon\(/);
    /*
     * La excepción de las portadas y los centros de trabajo vive ahora en
     * `esContenedor`, y es la misma condición de siempre: se comprueba donde
     * está escrita, no donde estaba. Que `puedeAbrirRenglon` la USE —y que no
     * vuelva a preguntar `puedeEntrar` para un contenedor— se exige aparte.
     */
    expect(config).toMatch(
      /export function esContenedor[\s\S]{0,200}\/dashboard\/centros\/[\s\S]{0,120}RUTAS_CONTENEDOR\.has\(href\)/,
    );
    expect(config).toMatch(
      /puedeAbrirRenglon\([\s\S]{0,200}if \(esContenedor\(href\)\) return true;/,
    );
  });

  it('los cuatro sitios que pintan menú filtran por «se puede abrir»', () => {
    /*
     * Dos formas de la misma pregunta, y las dos valen aquí:
     *
     *  · `puedeAbrirRenglon` para LISTAR un renglón —un contenedor se lista,
     *    porque el layout lo abre cuando se alcanza algo de dentro—.
     *  · `pantallasAlcanzables` para CONTAR si hay algo que alcanzar —y ahí el
     *    contenedor no cuenta, porque se justificaría a sí mismo—.
     *
     * El panel principal sólo hace la segunda: no pinta renglones, pinta
     * cajones. Exigirle la primera por su nombre dejaba fuera el arreglo del
     * 22-oct-2026 en vez de medirlo.
     */
    for (const archivo of [
      'app/dashboard/layout.tsx',
      'app/dashboard/page.tsx',
      'app/dashboard/centros/[modulo]/page.tsx',
    ]) {
      const fuente = leer(archivo);
      expect({
        archivo,
        usa:
          /puedeAbrirRenglon\(/.test(fuente) ||
          /pantallasAlcanzables\(/.test(fuente),
      }).toEqual({ archivo, usa: true });
    }
  });

  it('y ninguno filtra renglones con `puedeVerEnlace`', () => {
    /*
     * La prueba de la prueba. `puedeVerEnlace` sigue existiendo y sigue siendo
     * correcta donde se usa —decidir si una SECCIÓN se ve—; lo que no puede
     * volver es a filtrar los renglones con ella. Se exige por el nombre de la
     * variable que se filtra, no por el del archivo: así vale para los cuatro.
     */
    for (const archivo of [
      'app/dashboard/layout.tsx',
      'app/dashboard/page.tsx',
      'app/dashboard/centros/[modulo]/page.tsx',
    ]) {
      const fuente = leer(archivo);
      expect({ archivo, mal: /items\.(filter|some)\([^)]{0,200}puedeVerEnlace/.test(fuente) }).toEqual(
        { archivo, mal: false },
      );
    }
  });

  /*
   * ── 3. UN CONTENEDOR NO SE CUENTA A SÍ MISMO ──────────────────────────────
   * MEDIDO el 22-oct-2026 suplantando al rol `cobranza`, que tiene veinticinco
   * pantallas y NINGUNA de almacén: el menú lateral le pintaba el cajón
   * «Almacenes» y el panel lo contaba entre sus módulos.
   *
   * La cuenta de «¿se alcanza algo de dentro?» se hacía con
   * `puedeAbrirRenglon`, que devuelve `true` sin preguntar para los centros de
   * trabajo y las portadas. `/dashboard/almacenes/centro` es un renglón de ese
   * mismo módulo, así que el módulo siempre tenía uno «accesible»: el
   * contenedor se abría porque el módulo se veía, y el módulo se veía porque el
   * contenedor se abría. Dentro no había nada que abrir.
   *
   * `pantallasAlcanzables` hace la misma cuenta dejando fuera los contenedores.
   */
  describe('un contenedor no justifica el módulo que lo contiene', () => {
    it('la función existe y excluye los contenedores', () => {
      const config = leer('app/dashboard/module-config.ts');
      expect(config).toMatch(/export function esContenedor\(/);
      expect(config).toMatch(/export function pantallasAlcanzables\(/);
      expect(config).toMatch(
        /pantallasAlcanzables[\s\S]{0,400}!esContenedor\(i\.href\)/,
      );
    });

    it('el menú lateral y el panel cuentan con ella, no con `puedeAbrirRenglon`', () => {
      for (const archivo of ['app/dashboard/layout.tsx', 'app/dashboard/page.tsx']) {
        const fuente = leer(archivo);
        expect({ archivo, usa: /accesibles:\s*pantallasAlcanzables\(/.test(fuente) }).toEqual({
          archivo,
          usa: true,
        });
        /*
         * La prueba de la prueba: ésta es la forma exacta que estaba antes. Si
         * vuelve, el contenedor vuelve a contarse.
         */
        expect({
          archivo,
          mal: /accesibles:\s*m\.items\.filter\(/.test(fuente),
        }).toEqual({ archivo, mal: false });
      }
    });

    it('la puerta de un contenedor se decide con la misma cuenta', () => {
      /*
       * `accesoDenegado` abre un contenedor cuando se alcanza algo de dentro.
       * Con la cuenta vieja se abría siempre, y por eso `/dashboard/almacenes/
       * centro` se podía teclear y respondía con un centro vacío.
       */
      const layout = leer('app/dashboard/layout.tsx');
      expect(
        (layout.match(/return !pantallasAlcanzables\(/g) ?? []).length,
      ).toBe(2);
    });

    it('el panel también filtra por lo contratado', () => {
      /*
       * La tercera puerta al mismo sitio. El menú lateral y los centros de
       * trabajo filtran por `contratado` desde el 15-oct-2026 —a quien sólo usa
       * el ERP no se le enseña la puerta del registro financiero externo— y el
       * panel no preguntaba.
       */
      const panel = leer('app/dashboard/page.tsx');
      expect(panel).toMatch(/useContratacion\(\)/);
      expect(panel).toMatch(/contratado\(plan, i\)/);
    });
  });

  /*
   * ── 4. LOS CENTROS ESCRITOS A MANO ────────────────────────────────────────
   * `/dashboard/almacenes/centro` no es el centro genérico: es una pantalla
   * propia con sus enlaces en el JSX. Sus seis «operaciones frecuentes» se
   * filtran por la ACCIÓN que disparan desde el 21-sep-2026, y los tres bloques
   * del pie —nueve enlaces— no se filtraban por nada.
   *
   * MEDIDO el 22-oct-2026 con `cobranza`: los nueve llevaban a «esta sección no
   * está en tu perfil». Para eso existe `useRutasPermitidas`, que nació del
   * mismo defecto en el centro de nómina.
   */
  it('el centro de almacenes filtra sus enlaces por el permiso de pantalla', () => {
    const centro = leer('app/dashboard/almacenes/centro/page.tsx');
    expect(centro).toMatch(/useRutasPermitidas\(\)/);
    /* Los tres bloques reciben la función, y el bloque vacío no se pinta. */
    expect((centro.match(/puedeAbrir=\{puedeAbrir\}/g) ?? []).length).toBe(3);
    expect(centro).toMatch(/links\.filter\(\(\[, h\]\) => puedeAbrir\(h\)\)/);
    expect(centro).toMatch(/if \(!visibles\.length\) return null;/);
  });
});
