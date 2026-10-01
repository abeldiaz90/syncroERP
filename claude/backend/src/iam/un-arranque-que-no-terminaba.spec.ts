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
    return {
      servicio,
      avisos,
      reconciliaciones: () => veces,
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
    expect(avisos[0]).toContain('/api/admin-permisos/sincronizar');
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
