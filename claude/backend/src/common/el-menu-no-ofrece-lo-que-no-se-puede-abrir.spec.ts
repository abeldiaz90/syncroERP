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
    expect(config).toMatch(
      /puedeAbrirRenglon[\s\S]{0,400}\/dashboard\/centros\/[\s\S]{0,120}RUTAS_CONTENEDOR\.has\(href\)/,
    );
  });

  it('los cuatro sitios que pintan menú filtran por «se puede abrir»', () => {
    for (const archivo of [
      'app/dashboard/layout.tsx',
      'app/dashboard/page.tsx',
      'app/dashboard/centros/[modulo]/page.tsx',
    ]) {
      expect({ archivo, usa: /puedeAbrirRenglon\(/.test(leer(archivo)) }).toEqual({
        archivo,
        usa: true,
      });
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
});
