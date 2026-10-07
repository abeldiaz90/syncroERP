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
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';

const RAIZ = join(__dirname, '..', '..', '..');
const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

const leer = (relativa: string) =>
  FRONTEND ? readFileSync(join(FRONTEND, relativa), 'utf8') : '';

/**
 * ----------------------------------------------------------------------------
 * Y no son tres: son todos
 * ----------------------------------------------------------------------------
 * MEDIDO EL 7-OCT-2026, por pantalla, viendo el ERP como el mostrador.
 *
 * Se arreglaron tres sitios nombrándolos a mano, y quedó una cuarta puerta
 * con el mismo atajo: el CENTRO DE TRABAJO. El menú lateral ofrecía UNA
 * sección de Tesorería y el centro ofrecía cinco —entre ellas «Cuentas
 * bancarias», que la plantilla del mostrador veda a propósito porque trae
 * CLABE y números de cuenta—, y cada clic aterrizaba en «esta sección no
 * está en tu perfil». Y una quinta: el guardia de la caja, que promete avisar
 * al abrir si el perfil no tiene ventas y dejaba entrar por ser administrador.
 *
 * Una lista escrita a mano sólo cubre lo que ya se encontró. Lo que sigue es
 * un barrido: **ninguna** llamada del front que pregunte si el rol DE LA
 * SESIÓN es administrador puede decidir sola. Si aparece una sexta puerta,
 * esto se pone rojo antes de que nadie la abra.
 *
 * No entra la pantalla de roles y permisos, que pregunta por el rol que se
 * está editando y no por el de quien mira. La distinción se hace por el
 * argumento, no por una excepción con el nombre del fichero: una excepción por
 * nombre tapa el día que esa pantalla sí pregunte por la sesión.
 */

/** Las llamadas cuyo argumento sale de la sesión de quien mira. */
const DE_LA_SESION =
  /esRolAdministrador\(\s*(?:sesion\??\.|s\??\.|obtenerRolLocal\(\))/;

describe('Ninguna pantalla se cree administrador mientras ve como otro', () => {
  const ficheros = (() => {
    if (!FRONTEND) return [] as Array<{ ruta: string; texto: string }>;
    const salida: Array<{ ruta: string; texto: string }> = [];
    const recorrer = (dir: string) => {
      for (const entrada of readdirSync(dir, { withFileTypes: true })) {
        if (entrada.name === 'node_modules' || entrada.name.startsWith('.')) continue;
        const camino = join(dir, entrada.name);
        if (entrada.isDirectory()) {
          recorrer(camino);
          continue;
        }
        if (!/\.tsx?$/.test(entrada.name)) continue;
        salida.push({
          ruta: relative(FRONTEND, camino),
          texto: readFileSync(camino, 'utf8'),
        });
      }
    };
    for (const carpeta of ['app', 'components', 'hooks', 'lib']) {
      const dir = join(FRONTEND, carpeta);
      if (existsSync(dir)) recorrer(dir);
    }
    return salida;
  })();

  it('el barrido encuentra el árbol del front', () => {
    expect(ficheros.length).toBeGreaterThan(50);
  });

  it('toda pregunta por el rol de la sesión mira antes la suplantación', () => {
    const sinGuardia: string[] = [];
    for (const { ruta, texto } of ficheros) {
      for (const linea of texto.split('\n')) {
        if (!DE_LA_SESION.test(linea)) continue;
        /* La guardia va en la misma expresión: `!verComoActual() && …`. */
        if (!/!verComoActual\(\)\s*&&/.test(linea) && !/suplantando/.test(linea)) {
          sinGuardia.push(`${ruta}: ${linea.trim()}`);
        }
      }
    }
    expect(sinGuardia.sort()).toEqual([]);
  });

  it('las puertas conocidas siguen cubiertas', () => {
    /* Por su nombre, para que el barrido no pase por mirar al sitio vacío. */
    expect(leer('app/dashboard/centros/[modulo]/page.tsx')).toMatch(
      /!verComoActual\(\) && esRolAdministrador/,
    );
    expect(leer('app/pos/layout.tsx')).toMatch(
      /!verComoActual\(\) && esRolAdministrador/,
    );
    /* Y el centro se vuelve a preguntar al cambiar de persona. */
    expect(leer('app/dashboard/centros/[modulo]/page.tsx')).toMatch(
      /\}, \[verComoId\]\)/,
    );
  });
});

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
