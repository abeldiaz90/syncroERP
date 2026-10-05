import { BadRequestException } from '@nestjs/common';
import { RequisicionesService } from './services/requisiciones.service';
import { ConfiguracionesAprobacionService } from './services/configuraciones-aprobacion.service';

/**
 * ============================================================================
 * ENTRE MÁS CARA, MENOS FIRMAS
 * ----------------------------------------------------------------------------
 * EL CASO
 *
 * La ruta de aprobación de una requisición se elige filtrando la matriz por
 * rango: `montoDesde <= importe <= montoHasta`. Cuando ninguna fila aplica, el
 * servicio concluía «el monto quedó por debajo de lo que exige firma» y la
 * requisición nacía lista para cotizar.
 *
 * Esa conclusión es cierta por un lado y falsa por el otro. La lista también
 * vuelve vacía cuando el importe queda **por encima** del tope del último
 * nivel, y entonces el control se invierte:
 *
 *     Matriz del departamento Almacén: un nivel, de 0 a 50,000.
 *     («arriba de 50 mil ya lo ve Dirección», que todavía no se capturó.)
 *
 *     Requisición de 300,000 → ninguna banda aplica → CERO FIRMAS.
 *
 * Es la misma familia que el departamento sin matriz, cerrado el 28-sep: la
 * ausencia de un dato leída como una decisión. Allí faltaba la matriz entera;
 * aquí falta un tramo, y el silencio es idéntico.
 *
 * Segunda vía de disparo, más probable que la primera: un primer nivel con
 * `montoDesde = 5000` («abajo de 5 mil no se firma») y productos recién dados
 * de alta, cuyo `precioCompra` es 0 por omisión → importe estimado 0 → sin
 * firmas aunque sean diez mil piezas. Ésa es benigna por diseño y así se queda:
 * la requisición nace sin firma porque el importe conocido está por debajo del
 * umbral, y queda en el expediente con su importe.
 *
 * EL ARREGLO TIENE DOS MITADES
 *
 *  · **Al guardar la matriz**: el último nivel no puede llevar tope. La regla
 *    ya existía con ese mismo mensaje —«para que ningún importe quede fuera de
 *    la matriz»— pero vivía dentro de la rama de los procesos financieros
 *    centrales, y REQUISICION y COTIZACION no pasaban por ahí. Ahora es de
 *    todos los procesos, porque el razonamiento no depende del proceso.
 *
 *  · **Al capturar**: si el importe supera el tope más alto de la matriz
 *    guardada, se niega. Hace falta además de lo anterior porque hay matrices
 *    ya guardadas con el hueco dentro, y porque caer al nivel más alto sería
 *    inventar una firma sobre un importe que nadie declaró.
 * ============================================================================
 */

/**
 * El mismo armado que `un-departamento-sin-matriz-no-es-una-excepcion.spec.ts`,
 * que ya ejercita `crear` con éxito. Se reutiliza a propósito: dos armados
 * distintos del mismo método acaban divergiendo y uno de los dos deja de medir
 * el camino real.
 */
function servicioCon(configuraciones: unknown[], costoUnitario: number) {
  const s = Object.create(RequisicionesService.prototype) as Record<string, unknown>;

  s.usuarioRepo = {
    findOne: async () => ({
      id: 'u1',
      empresaId: 'e1',
      activo: true,
      departamentoId: 'd1',
      departamento: { id: 'd1', nombre: 'Almacén' },
    }),
    find: async () => [{ id: 'ana', activo: true, rol: 'gerencia' }],
  };
  s.productoRepo = {
    createQueryBuilder: () => ({
      select: () => ({
        where: () => ({
          andWhere: () => ({
            getRawMany: async () => [{ id: 'p1', costo: costoUnitario }],
          }),
        }),
      }),
      where: () => ({
        andWhere: () => ({ andWhere: () => ({ getCount: async () => 1 }) }),
      }),
    }),
  };
  s.configAprobacionRepo = {
    find: async () => configuraciones,
  };
  const CORTE = 'CORTE-TRAS-LA-RUTA';
  s.dataSource = {
    transaction: async () => {
      throw new Error(CORTE);
    },
  };
  return { servicio: s as unknown as RequisicionesService, CORTE };
}

const DTO = { detalles: [{ productoId: 'p1', cantidadSolicitada: 10 }] } as never;

/** Un nivel de 0 a 50,000: el tramo de arriba no lo cubre nadie. */
const MATRIZ_CON_TECHO = [
  { orden: 1, montoDesde: 0, montoHasta: 50_000, usuarioId: 'ana', rolAprobador: null },
];
/** La misma matriz bien formada: el último nivel sin tope. */
const MATRIZ_SIN_TECHO = [
  { orden: 1, montoDesde: 0, montoHasta: null, usuarioId: 'ana', rolAprobador: null },
];

describe('una requisición cuyo importe no cae en ninguna banda', () => {
  it('se niega cuando queda POR ENCIMA del tope del último nivel', async () => {
    /* 10 × 30,000 = 300,000 contra una matriz que llega a 50,000. */
    const { servicio } = servicioCon(MATRIZ_CON_TECHO, 30_000);
    const error = await servicio.crear(DTO, 'e1', 'u1').catch((e: Error) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(String((error as Error).message)).toMatch(/supera el tope/i);
  });

  it('y el «no» dice qué configurar y dónde', async () => {
    /* Un rechazo que no dice cómo salir deja la requisición parada y a quien
       la capturó sin saber a quién pedirle nada. */
    const { servicio } = servicioCon(MATRIZ_CON_TECHO, 30_000);
    const error = await servicio.crear(DTO, 'e1', 'u1').catch((e: Error) => e);
    const mensaje = String((error as Error).message);
    expect(mensaje).toMatch(/nivel sin tope/i);
    expect(mensaje).toMatch(/Configuracion de aprobaciones/i);
  });

  it('con el último nivel sin tope, el importe grande sí encuentra firma', async () => {
    /*
     * La mitad que importa: el arreglo no puede parar las requisiciones
     * legítimas. Con la matriz bien formada, 300,000 cae en el último nivel y
     * el camino sigue adelante —se reconoce porque llega a la transacción—.
     */
    const { servicio, CORTE } = servicioCon(MATRIZ_SIN_TECHO, 30_000);
    const error = await servicio.crear(DTO, 'e1', 'u1').catch((e: Error) => e);
    expect((error as Error).message).toBe(CORTE);
  });

  it('un importe por DEBAJO del primer tramo sigue naciendo sin firma', async () => {
    /*
     * El caso benigno, que no se toca: ésa es la razón de ser de un umbral. La
     * requisición no se vuelve invisible — queda en el expediente con su
     * importe estimado.
     */
    const matrizDesde5000 = [
      { orden: 1, montoDesde: 5_000, montoHasta: null, usuarioId: 'ana', rolAprobador: null },
    ];
    const { servicio, CORTE } = servicioCon(matrizDesde5000, 10);
    const error = await servicio.crear(DTO, 'e1', 'u1').catch((e: Error) => e);
    expect((error as Error).message).toBe(CORTE);
  });
});

describe('la matriz de aprobación, al guardarse', () => {
  function servicioConfiguraciones() {
    const servicio = Object.create(
      ConfiguracionesAprobacionService.prototype,
    ) as ConfiguracionesAprobacionService;
    Object.assign(servicio, {
      repo: {
        find: async () => [],
        delete: async () => undefined,
        create: (x: unknown) => x,
        save: async (x: unknown) => x,
      },
      usuarios: {
        find: async () => [
          { id: 'ana', rol: 'gerencia' },
          { id: 'luis', rol: 'direccion' },
        ],
      },
      departamentos: {
        findOne: async () => ({ id: 'dep1', empresaId: 'e1', activo: true }),
      },
      permisosDinamicos: { invalidar: async () => undefined },
      ds: {
        transaction: async (cb: (m: unknown) => unknown) =>
          cb({
            delete: async () => undefined,
            create: (_e: unknown, x: unknown) => x,
            save: async (x: unknown) => x,
            find: async () => [],
            getRepository: () => ({
              delete: async () => undefined,
              create: (x: unknown) => x,
              save: async (x: unknown) => x,
              find: async () => [],
            }),
          }),
      },
    });
    return servicio;
  }

  const dto = (aprobadores: Array<Record<string, unknown>>) => ({
    proceso: 'REQUISICION',
    departamentoId: 'dep1',
    aprobadores,
  });

  it('rechaza una matriz de requisición cuyo último nivel lleva tope', async () => {
    /*
     * El arreglo de raíz: con esto no se puede volver a crear el hueco. La
     * regla existía con este mismo mensaje, sólo que no se aplicaba a este
     * proceso.
     */
    const servicio = servicioConfiguraciones();
    await expect(
      servicio.crear(
        dto([{ orden: 1, usuarioId: 'ana', montoDesde: 0, montoHasta: 50_000 }]) as never,
        'e1',
      ),
    ).rejects.toThrow(/último nivel debe quedar sin tope/i);
  });

  it('no rechaza por esta regla la misma matriz con el último nivel sin tope', async () => {
    /*
     * Se comprueba que el rechazo **no sea el de la cobertura de bandas**, no
     * que el guardado llegue hasta el final: montar todos los colaboradores del
     * guardado —endpoints, permisos dinámicos, repositorios de la transacción—
     * mediría el armado del doble y no la regla. Lo que importa aquí es que una
     * matriz bien formada pase esta puerta.
     */
    const servicio = servicioConfiguraciones();
    const error = await servicio
      .crear(
        dto([{ orden: 1, usuarioId: 'ana', montoDesde: 0, montoHasta: null }]) as never,
        'e1',
      )
      .then(() => null)
      .catch((e: Error) => e);
    if (error) {
      expect(String(error.message)).not.toMatch(/sin tope|tope de autoridad/i);
    }
  });

  it('y sigue exigiendo tope en los niveles que no son el último', async () => {
    const servicio = servicioConfiguraciones();
    await expect(
      servicio.crear(
        dto([
          { orden: 1, usuarioId: 'ana', montoDesde: 0, montoHasta: null },
          { orden: 2, usuarioId: 'luis', montoDesde: 0, montoHasta: null },
        ]) as never,
        'e1',
      ),
    ).rejects.toThrow(/necesita un tope de autoridad/i);
  });
});

describe('la regla vive donde la ven todos los procesos', () => {
  it('no está encerrada en la rama de los procesos financieros', () => {
    /*
     * Estructural y con motivo: el defecto no era que la regla no existiera,
     * era que estaba **dentro** de `if (esProcesoFinancieroCentral(...))`. Si
     * alguien la vuelve a meter ahí, requisiciones y cotizaciones pierden otra
     * vez la cobertura de bandas y no habría error, sólo requisiciones sin
     * firma.
     */
    const fuente = require('fs').readFileSync(
      require('path').join(
        __dirname,
        'services',
        'configuraciones-aprobacion.service.ts',
      ),
      'utf8',
    ) as string;
    const posicionRegla = fuente.indexOf('El último nivel debe quedar sin tope');
    const posicionRamaFinanciera = fuente.indexOf(
      'if (esProcesoFinancieroCentral(dto.proceso))',
    );
    expect(posicionRegla).toBeGreaterThan(0);
    expect(posicionRamaFinanciera).toBeGreaterThan(0);
    /* La regla tiene que estar ANTES de la rama, es decir fuera de ella. */
    expect(posicionRegla).toBeLessThan(posicionRamaFinanciera);
  });

  it('y el servicio de requisiciones niega el importe fuera de la matriz', () => {
    const fuente = require('fs').readFileSync(
      require('path').join(__dirname, 'services', 'requisiciones.service.ts'),
      'utf8',
    ) as string;
    expect(fuente).toContain('supera el tope del ultimo nivel');
    expect(fuente).toContain('importeEstimado > topeMaximo');
  });
});
