import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * EL NOMBRE DEL MÓDULO LLEVA A DONDE SE PUEDE ENTRAR
 * ----------------------------------------------------------------------------
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
 * QUÉ CUIDA ESTA PRUEBA
 *
 * Que las dos pantallas que pintan el nombre de un módulo —el menú lateral y
 * el panel— lo resuelvan con esa función, y no con `m.href` a secas. Si
 * mañana nace un tercer sitio que liste módulos, esta prueba no lo sabe; por
 * eso exige además que la función exista y que sea la única puerta.
 * ============================================================================
 */

const RAIZ = join(__dirname, '..', '..', '..');
const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
  .map((n) => join(RAIZ, n))
  .find((r) => existsSync(join(r, 'app/dashboard/module-config.ts')));

const leer = (...p: string[]) => readFileSync(join(FRONTEND!, ...p), 'utf8');

describe('el nombre del módulo lleva a donde se puede entrar', () => {
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

  it('y el menú sigue decidiendo qué módulos se ven con `puedeVerEnlace`', () => {
    /*
     * La prueba de la prueba. Si alguien «arreglara» esto filtrando los
     * módulos con `puedeEntrar`, el enlace dejaría de llevar a una negativa
     * —porque el módulo desaparecería— y el almacenista perdería de vista
     * «Operaciones pendientes», que sí puede abrir. El arreglo correcto era
     * cambiar el destino, no esconder el módulo.
     */
    const layout = leer('app/dashboard/layout.tsx');
    expect(layout).toMatch(/accesibles: m\.items\.filter\([\s\S]{0,160}puedeVerEnlace\(permisos, i\.href\)/);
  });
});
