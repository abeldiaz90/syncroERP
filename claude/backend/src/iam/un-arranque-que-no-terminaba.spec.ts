/**
 * ============================================================================
 * Un arranque que no terminaba
 * ----------------------------------------------------------------------------
 * LO QUE PASÓ
 *
 * El 1-oct-2026 el ERP de Abel dejó de arrancar: la consola se quedaba callada
 * y el navegador «pensando». Ese mismo día, su registro de arranque mostraba
 * consultas sencillas tardando dos segundos.
 *
 * `PermisosDinamicosService.sincronizarControladoresYEndpoints()` corre en cada
 * arranque y reconcilia los 561 handlers del sistema **con una consulta por
 * endpoint** —`findOne` por ruta—, y después `aplicarContratoDeRoles()` recorre
 * cada empresa por cada rol haciendo lo propio. Son cientos de idas y vueltas
 * en serie, siempre, aunque nada haya cambiado. Con la base respondiendo en
 * milisegundos apenas se nota; a dos segundos por consulta, el arranque no
 * termina.
 *
 * QUÉ ARREGLA ESTO Y QUÉ NO
 *
 * El arreglo de fondo es que la reconciliación no haga una consulta por
 * endpoint: leer de una vez y comparar en memoria, como se corrigió en el
 * catálogo geográfico. Eso es cirugía sobre el servicio más delicado del
 * sistema —equivocarse deja gente fuera del ERP— y queda pendiente, a
 * propósito, para hacerse sin prisa.
 *
 * Esto es lo inmediato, y son dos cosas:
 *
 *   1. `IAM_SYNC_AL_ARRANCAR=false` permite arrancar sin pagar la
 *      reconciliación. Por omisión sigue encendida, de modo que una
 *      instalación que no configure nada se comporta igual que siempre.
 *   2. El tiempo se mide y se informa, y si pasa de cinco segundos el arranque
 *      lo dice con una advertencia. El costo existía y no aparecía en ninguna
 *      parte, que es como un arranque lento pasa un año sin que nadie lo mire.
 *
 * LO QUE VIGILA ESTA PRUEBA
 *
 * Que la bandera sólo apague con el valor exacto `'false'`. Una bandera que se
 * apaga por accidente —con la cadena vacía, con `0`, con `'FALSE'` mal
 * leído— es peor que no tenerla: dejaría una instalación de producción sin
 * menú y sin permisos, en silencio.
 * ============================================================================
 */
import { PermisosDinamicosService } from './services/permisos-dinamicos.service';

describe('IAM_SYNC_AL_ARRANCAR', () => {
  const valorOriginal = process.env.IAM_SYNC_AL_ARRANCAR;

  /** Un servicio sin dependencias reales: sólo nos interesa el arranque. */
  const nuevoServicio = () => {
    const servicio = Object.create(
      PermisosDinamicosService.prototype,
    ) as PermisosDinamicosService;
    const avisos: string[] = [];
    (servicio as any).logger = {
      log: () => undefined,
      warn: (m: string) => avisos.push(m),
      error: () => undefined,
    };
    let veces = 0;
    (servicio as any).sincronizarControladoresYEndpoints = async () => {
      veces += 1;
    };
    /*
     * El censo de pantallas libres es lo único del arranque que corre SIEMPRE,
     * atajo o no, y aquí se cuenta en vez de ejecutarse: lo que mide esta
     * prueba es la bandera. Que el censo haga su trabajo lo fija
     * `una-pantalla-libre-que-dependia-de-la-base.spec.ts`.
     */
    let censos = 0;
    (servicio as any).censarPantallasSinPermiso = () => {
      censos += 1;
      return 0;
    };
    return {
      servicio,
      avisos,
      reconciliaciones: () => veces,
      censos: () => censos,
    };
  };

  afterEach(() => {
    if (valorOriginal === undefined) delete process.env.IAM_SYNC_AL_ARRANCAR;
    else process.env.IAM_SYNC_AL_ARRANCAR = valorOriginal;
  });

  it('sin configurar nada, el arranque reconcilia como siempre', async () => {
    delete process.env.IAM_SYNC_AL_ARRANCAR;
    const { servicio, reconciliaciones, avisos } = nuevoServicio();
    await servicio.onApplicationBootstrap();
    expect(reconciliaciones()).toBe(1);
    expect(avisos).toEqual([]);
  });

  it('el censo de pantallas libres corre aunque el atajo salte', async () => {
    /*
     * MEDIDO el 15-oct-2026: con la bandera apagada, «Ayuda y documentación»
     * desaparecía del menú de los trece roles y `/dashboard/ayuda` contestaba
     * «esta sección no está en tu perfil». El conjunto de pantallas que no
     * piden permiso se llenaba DENTRO de la reconciliación, y el atajo se la
     * saltaba entera.
     *
     * Qué pantallas son libres lo dice un decorador: es del código, no de la
     * base, y por eso se cuenta siempre.
     */
    process.env.IAM_SYNC_AL_ARRANCAR = 'false';
    const { servicio, reconciliaciones, censos } = nuevoServicio();
    await servicio.onApplicationBootstrap();
    expect(reconciliaciones()).toBe(0);
    expect(censos()).toBe(1);
  });

  it('con `false` no reconcilia, y dice cómo hacerlo a mano', async () => {
    process.env.IAM_SYNC_AL_ARRANCAR = 'false';
    const { servicio, reconciliaciones, avisos } = nuevoServicio();
    await servicio.onApplicationBootstrap();
    expect(reconciliaciones()).toBe(0);
    /*
     * El aviso no es decorativo: quien apaga esto tiene que saber que el menú
     * se queda como esté en la base y por dónde reconciliarlo.
     */
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain('IAM_SYNC_AL_ARRANCAR=false');
    /*
     * La ruta, tal cual la sirve el controlador.
     *
     * Decía `/api/admin-permisos/sincronizar` —con guion— en los tres sitios
     * donde el servicio explica cómo reconciliar a mano, y el controlador
     * está en `@Controller('admin/permisos')`. Quien siguiera la instrucción
     * del aviso recibía un 404, justo en el momento en que el sistema le
     * acaba de decir que los permisos se quedaron como estaban.
     *
     * Medido el 21-oct-2026. Una instrucción equivocada en un aviso es peor
     * que no dar instrucción: manda a probar y a dudar de uno mismo.
     */
    expect(avisos[0]).toContain('/api/admin/permisos/sincronizar');
  });

  it('con `true` reconcilia', async () => {
    process.env.IAM_SYNC_AL_ARRANCAR = 'true';
    const { servicio, reconciliaciones } = nuevoServicio();
    await servicio.onApplicationBootstrap();
    expect(reconciliaciones()).toBe(1);
  });

  it.each(['', '0', 'no', 'FALSE', 'False', ' false', 'false ', 'off'])(
    'con %p NO se apaga: sólo apaga el valor exacto `false`',
    async (valor) => {
      /*
       * Ésta es la prueba que importa de verdad. Una bandera de apagado que
       * acepta variantes se apaga por accidente —una línea mal copiada en un
       * `.env`— y deja una instalación sin menú y sin permisos sin que nadie
       * haya pedido eso.
       */
      process.env.IAM_SYNC_AL_ARRANCAR = valor;
      const { servicio, reconciliaciones } = nuevoServicio();
      await servicio.onApplicationBootstrap();
      expect(reconciliaciones()).toBe(1);
    },
  );
});
