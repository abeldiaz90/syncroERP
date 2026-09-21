import { ENDPOINTS_POR_PROCESO } from './configuraciones-aprobacion.service';

/**
 * ============================================================================
 * Designar a un aprobador sin darle permiso de aprobar
 * ----------------------------------------------------------------------------
 * Ocurrió en vivo: se configuró a un contador como aprobador de requisiciones,
 * la requisición se le asignó, la vio en su bandeja… y al aprobar recibió un
 * 403, porque su rol no tenía el permiso del endpoint. Peor todavía: resolver
 * una aprobación exige ser la persona asignada, así que el documento quedó
 * atascado de forma permanente —ni el administrador podía desatascarlo—.
 *
 * El código ya concedía esos permisos automáticamente al guardar el flujo,
 * pero sólo para dos procesos. Estas pruebas impiden que un proceso operativo
 * se vuelva a quedar fuera de la lista.
 * ============================================================================
 */

/** Los que la propia pantalla declara operativos hoy. */
const PROCESOS_OPERATIVOS = [
  'REQUISICION',
  'COTIZACION',
  'CREDITO_CLIENTE',
  'HOTEL_CONVENIO',
];

describe('Permisos que se conceden al configurar un flujo de aprobación', () => {
  it('todo proceso operativo declara los endpoints que su aprobador necesita', () => {
    const sinDeclarar = PROCESOS_OPERATIVOS.filter(
      (proceso) => (ENDPOINTS_POR_PROCESO[proceso] ?? []).length === 0,
    );
    expect(sinDeclarar).toEqual([]);
  });

  it('cada proceso incluye la acción de resolver, no sólo la de consultar', () => {
    const sinResolver = Object.entries(ENDPOINTS_POR_PROCESO)
      .filter(([, endpoints]) =>
        !endpoints.some((e) => ['PATCH', 'POST', 'PUT'].includes(e.metodo)),
      )
      .map(([proceso]) => proceso);

    /*
     * Un aprobador que sólo puede LEER su bandeja está igual de atascado que
     * uno sin permisos: ve el documento y no puede moverlo.
     */
    expect(sinResolver).toEqual([]);
  });

  it('las rutas se declaran con el prefijo del controlador y sin el prefijo de la API', () => {
    const malFormadas = Object.values(ENDPOINTS_POR_PROCESO)
      .flat()
      .filter((e) => !e.ruta.startsWith('/') || e.ruta.startsWith('/api/'))
      .map((e) => `${e.metodo} ${e.ruta}`);

    /*
     * Es como las registra el sincronizador de endpoints. Una ruta con `/api`
     * no casa con ninguna fila y el flujo se rechaza al guardarse, diciendo
     * que faltan endpoints que en realidad existen.
     */
    expect(malFormadas).toEqual([]);
  });

  it('requisiciones incluye la bandeja y la resolución', () => {
    const requisicion = ENDPOINTS_POR_PROCESO.REQUISICION.map(
      (e) => `${e.metodo} ${e.ruta}`,
    );
    expect(requisicion).toContain('GET /compras/requisiciones/aprobaciones/pendientes');
    expect(requisicion).toContain('PATCH /compras/requisiciones/aprobaciones/:id');
  });

  it('cotizaciones incluye aprobar y rechazar', () => {
    const cotizacion = ENDPOINTS_POR_PROCESO.COTIZACION.map(
      (e) => `${e.metodo} ${e.ruta}`,
    );
    expect(cotizacion).toContain('PATCH /compras/cotizaciones/:id/aprobar');
    expect(cotizacion).toContain('PATCH /compras/cotizaciones/:id/rechazar');
  });
});
