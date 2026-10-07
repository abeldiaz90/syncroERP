/**
 * ============================================================================
 * «Ver como» cambiaba lo que el servidor permite, no lo que la pantalla ofrece
 * ----------------------------------------------------------------------------
 * «Ver el ERP como otra persona» existe para comprobar qué ve y qué puede hacer
 * cada rol sin entrar trece veces. El guardia del servidor está bien acotado y
 * tiene su propia prueba —`guards/ver-el-erp-como-otro.spec.ts`—.
 *
 * LO QUE FALTABA, medido en vivo el 7-oct-2026 viendo el ERP como «Almacen
 * Prueba»:
 *
 *   · `GET /auth/mis-permisos` CON la cabecera devuelve 514 permisos concretos
 *     y `*` en falso: el servidor contesta como el almacenista.
 *   · El letrero decía «Estás viendo el ERP como Almacen Prueba».
 *   · Y el menú seguía enseñando Finanzas, Recursos humanos, Tesorería,
 *     Administración y Hotelería, y el panel los diez módulos.
 *
 * Tres sitios decidían qué OFRECER, y los tres miraban el rol del JWT —el de
 * quien mira, no el de quien se mira—:
 *
 *   1. `PermisosContext`, que además pedía los permisos con `fetch` a pelo,
 *      SIN la cabecera, y luego hacía `adminPorSesion || adminPorRespuesta`.
 *   2. El menú lateral de `dashboard/layout.tsx`.
 *   3. El panel principal de `dashboard/page.tsx`.
 *
 * POR QUÉ IMPORTA MÁS DE LO QUE PARECE
 *
 * La clase de defecto que más aparece en este ERP es «un botón que lleva a un
 * no»: la pantalla ofrece algo que el servidor va a negar. Esa clase SÓLO se ve
 * cuando la pantalla ofrece lo del rol que se está probando. Con el atajo del
 * administrador puesto, la herramienta hecha para encontrar esos defectos era
 * justo la que los escondía: se prueba un rol, todo abre, y se concluye que
 * está bien.
 *
 * Verificado por pantalla después: el menú del almacenista queda en Panel,
 * Configuración, Compras, Productos, Almacenes y Reportes, y el panel dice
 * «5 de 17 disponibles con tu perfil».
 * ============================================================================
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..', '..', '..');
const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

const leer = (relativa: string) =>
  FRONTEND ? readFileSync(join(FRONTEND, relativa), 'utf8') : '';

describe('Los tres sitios que deciden qué se ofrece miran a quién se está viendo', () => {
  it('el árbol que se mide es el que está vivo', () => {
    expect(Boolean(FRONTEND)).toBe(true);
  });

  it('el contexto de permisos manda la cabecera de suplantación', () => {
    /*
     * Pedía con `fetch` a pelo y sin cabecera, así que recibía los permisos del
     * administrador aunque se estuviera viendo como otro.
     */
    const ctx = leer('app/context/PermisosContext.tsx');
    expect(ctx).toMatch(/\[CABECERA_SUPLANTACION\]: suplantando\.id/);
  });

  it('y no deja que el rol del JWT devuelva el mando mientras se suplanta', () => {
    const ctx = leer('app/context/PermisosContext.tsx');
    expect(ctx).toMatch(/const adminPorSesion = !suplantando && esRolAdministrador\(obtenerRolLocal\(\)\)/);
  });

  it('y no guarda en el navegador los permisos del suplantado', () => {
    /*
     * `syncro_permisos` vive en `localStorage` y sobrevive al cierre de la
     * pestaña, que es justo donde TERMINA la suplantación: el administrador se
     * encontraría al día siguiente con los permisos del almacenista.
     */
    const ctx = leer('app/context/PermisosContext.tsx');
    expect(ctx).toMatch(/if \(suplantando\) localStorage\.removeItem\('syncro_permisos'\)/);
  });

  it('el menú lateral pregunta en vez de dar por hecho', () => {
    const layout = leer('app/dashboard/layout.tsx');
    expect(layout).toMatch(/if \(!verComoActual\(\) && esRolAdministrador\(s!\.rol\)\)/);
  });

  it('y el panel principal también', () => {
    const panel = leer('app/dashboard/page.tsx');
    expect(panel).toMatch(/if \(!verComoActual\(\) && esRolAdministrador\(s\.rol\)\)/);
  });

  it('los tres se vuelven a preguntar al cambiar de persona', () => {
    /*
     * Sin esto hay que recargar a mano, y lo que se ve entre medias son los
     * permisos de la persona equivocada —que es peor que no cambiar nada—.
     */
    expect(leer('app/context/PermisosContext.tsx')).toMatch(
      /window\.addEventListener\(EVENTO_VER_COMO, alCambiar\)/,
    );
    expect(leer('app/dashboard/layout.tsx')).toMatch(/\}, \[router, verComo\?\.id\]\)/);
    expect(leer('app/dashboard/page.tsx')).toMatch(/\}, \[verComoId\]\)/);
  });
});
