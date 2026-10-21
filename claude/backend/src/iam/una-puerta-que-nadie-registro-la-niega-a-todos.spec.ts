import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * Una puerta que nadie registró se la niega a todos menos al administrador
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * `verificarPermiso` niega una ruta que no esté en la tabla de endpoints, y eso
 * está bien: el valor seguro de una puerta desconocida es cerrada. La
 * consecuencia es la que no se ve: una ruta NUEVA queda vedada a los trece
 * roles hasta que la reconciliación la registre, y el administrador no lo nota
 * porque él entra a todo sin preguntar.
 *
 * MEDIDO el 21-oct-2026 contra la instalación, que lleva
 * `IAM_SYNC_AL_ARRANCAR=false`: el servidor servía 604 rutas y la tabla conocía
 * 514. Las que faltaban no eran cabos sueltos sino MÓDULOS ENTEROS construidos
 * en octubre —centros de costo, presupuestos, pedidos de venta, cierre anual,
 * impresoras del mostrador—, todos invisibles para cualquiera que no fuera
 * administrador. Contado por el propio servidor, excluyendo las que no piden
 * permiso: 66.
 *
 * Es, casi con seguridad, el mecanismo detrás de «los roles no abren nada» del
 * 15 de octubre.
 *
 * LO QUE YA ESTABA ESCRITO
 *
 * El propio servicio lo advierte, textual: «en una base nueva, o después de
 * agregar pantallas, los permisos y el menú salen de esta reconciliación.
 * Apagarla y no correrla deja el menú como estaba… Es un atajo para
 * desarrollar, no una configuración para producción.»
 *
 * Lo decía en una línea de log del arranque. Un aviso que sólo existe en el
 * arranque es un aviso que se lee una vez, el día que se monta la instalación,
 * y nunca más — justo cuando todavía no hay nada que avisar.
 *
 * QUÉ CUIDA ESTA PRUEBA
 *
 * Que el conteo exista, que sea de SÓLO LECTURA —reconciliar es una decisión
 * que alguien toma, no un efecto de mirar el tablero—, que no cuente las
 * rutas que no piden permiso, y que el tablero de pendientes lo publique.
 * ============================================================================
 */

const SRC = join(__dirname, '..');
const leer = (r: string) => readFileSync(join(SRC, r), 'utf8');

const SERVICIO = 'iam/services/permisos-dinamicos.service.ts';
const PENDIENTES = 'configuracion/services/operaciones-pendientes.service.ts';

/** El cuerpo de `contarRutasSinRegistrar`, y sólo ése. */
const cuerpoDelConteo = (() => {
  const fuente = leer(SERVICIO);
  const i = fuente.indexOf('async contarRutasSinRegistrar(');
  if (i < 0) return '';
  const j = fuente.indexOf('\n  async sincronizarControladoresYEndpoints(', i);
  return fuente.slice(i, j < 0 ? i + 4000 : j);
})();

describe('una puerta que nadie registró se la niega a todos', () => {
  it('el guard niega lo que no está registrado, que es el valor seguro', () => {
    /*
     * Toda esta prueba cuelga de esto. Si un día un endpoint desconocido
     * pasara a permitirse, el conteo dejaría de importar y habría algo mucho
     * peor que contar: una puerta abierta que nadie declaró.
     */
    const fuente = leer(SERVICIO);
    const i = fuente.indexOf('async verificarPermiso(');
    expect(i).toBeGreaterThan(-1);
    const trozo = fuente.slice(i, i + 2500);
    expect(trozo).toMatch(/if \(!endpoint\) \{[\s\S]{0,200}?return false;/);
  });

  it('el conteo existe', () => {
    expect(cuerpoDelConteo).not.toBe('');
  });

  it('y es de sólo lectura: mirar el tablero no reconcilia nada', () => {
    /*
     * La tentación es arreglarlo al vuelo —ya que lo detecto, lo registro—. No:
     * registrar endpoints cambia quién puede entrar a qué, y eso no puede
     * pasar porque alguien abrió una pantalla. Se cuenta y se dice; reconciliar
     * lo pide una persona.
     */
    for (const escritura of [
      '.save(',
      '.insert(',
      '.update(',
      '.delete(',
      '.remove(',
      '.upsert(',
    ]) {
      expect([escritura, cuerpoDelConteo.includes(escritura)]).toEqual([
        escritura,
        false,
      ]);
    }
  });

  it('salta exactamente lo mismo que salta la reconciliación', () => {
    /*
     * Lo público y lo que omite permisos no necesita renglón: a ninguna de las
     * dos la niega el guard. Y tiene que ser EXACTAMENTE el mismo criterio que
     * usa la reconciliación, o el conteo nunca llega a cero.
     *
     * MEDIDO el 21-oct-2026, las dos veces: la primera versión sólo miraba
     * `@SkipPermisos()` y contaba 66 donde la reconciliación iba a registrar
     * 40; después de reconciliar se quedó clavada en 24 —aprovisionamiento,
     * que entra con su propio token; salud; auth; los manuales—. Un aviso que
     * no se puede satisfacer deja de leerse, y arrastra consigo a los que sí
     * importan. Con las dos condiciones puestas, bajó a cero y el renglón
     * desapareció del tablero.
     */
    expect(cuerpoDelConteo).toMatch(/IS_PUBLIC_KEY/);
    expect(cuerpoDelConteo).toMatch(/SKIP_PERMISOS_KEY/);
    expect(cuerpoDelConteo).toMatch(/if \(esPublico \|\| omitePermisos\) continue;/);

    /*
     * Y se leen del MÉTODO y de la CLASE, como hace la reconciliación: un
     * `Reflect.getMetadata` sobre el handler no ve el decorador puesto en el
     * controlador, y los que lo declaran arriba se contarían de más.
     */
    expect(cuerpoDelConteo).toMatch(/getAllAndOverride[\s\S]{0,120}\[handler, metatype\]/);
  });

  it('compara contra los endpoints ACTIVOS, no contra todos', () => {
    /* Una fila desactivada no concede nada: contarla escondería el hueco. */
    expect(cuerpoDelConteo).toMatch(/activo.*:\s*activo/);
  });

  it('el tablero de pendientes lo publica, y manda a una pantalla que existe', () => {
    const tablero = leer(PENDIENTES);
    expect(tablero).toMatch(/PERMISOS_SIN_RECONCILIAR/);
    expect(tablero).toMatch(/contarRutasSinRegistrar\(\)/);

    const ruta = /codigo: 'PERMISOS_SIN_RECONCILIAR'[\s\S]{0,700}?ruta: '([^']+)'/.exec(
      tablero,
    )?.[1];
    expect(ruta).toBeDefined();

    const RAIZ = join(SRC, '..', '..');
    const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
      .map((n) => join(RAIZ, n))
      .find((r) => existsSync(join(r, 'app/dashboard/module-config.ts')));
    if (!FRONTEND) return;
    const archivo = join(
      FRONTEND,
      'app/dashboard',
      ruta!.replace(/^\/dashboard\//, ''),
      'page.tsx',
    );
    expect([ruta, existsSync(archivo)]).toEqual([ruta, true]);
  });

  it('y sólo se publica cuando hay algo que decir', () => {
    /*
     * En una instalación reconciliada el conteo es cero y el renglón no sale.
     * Un aviso permanente que dice «cero» es ruido, y el ruido es lo que hace
     * que nadie mire el tablero.
     */
    const tablero = leer(PENDIENTES);
    expect(tablero).toMatch(/if \(sinRegistrar > 0\)/);
  });
});
