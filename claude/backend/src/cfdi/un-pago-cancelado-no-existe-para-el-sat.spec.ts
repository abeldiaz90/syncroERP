import { EstadoFiscalCobranza } from '../credito/entities/pago-cobranza.entity';
import { CfdiService } from './cfdi.service';

/**
 * ============================================================================
 * UN PAGO CANCELADO NO EXISTE PARA EL SAT
 * ----------------------------------------------------------------------------
 * EL CASO
 *
 * El complemento de pago (REP) se arma leyendo **todos** los pagos del crédito
 * para decidir tres cosas: si hay un pago anterior sin REP, cuánto se había
 * aplicado antes, y qué número de parcialidad toca.
 *
 * Esa lista no filtraba `cancelado`. Y `CobranzaService.cancelarPago` conserva
 * `montoCapital` a propósito —su póliza de reversa lo necesita—, así que el
 * importe sigue ahí para quien no mire la bandera. Tres consecuencias, de peor
 * a menos:
 *
 *  1. **Se timbra al SAT un cobro que no existe.** Un pago que quedó en
 *     `ERROR_REP` y después se canceló seguía en la cola de
 *     `generarComplementosPendientes`, que no filtraba nada.
 *  2. **El REP del pago bueno queda bloqueado para siempre.** El pago
 *     cancelado contaba como «pago anterior sin complemento», y nunca va a
 *     tener uno: el mensaje es «los REP deben generarse en orden cronológico»
 *     y no hay forma de avanzar.
 *  3. **Los importes declarados salen por debajo.** `aplicadoAnterior` sumaba
 *     el cancelado, así que el saldo anterior y el saldo insoluto del CFDI
 *     eran menores que los reales, y la parcialidad quedaba corrida en uno.
 *
 * Y había un cuarto defecto, el que alimentaba al primero: cancelar un pago no
 * tocaba su `estadoFiscal`, de modo que seguía en la cola de pendientes.
 *
 * LO QUE NO SE HACE, Y ES DELIBERADO
 *
 * Si el pago **ya tiene complemento timbrado**, cancelarlo no lo marca
 * `NO_REQUERIDO`: ese CFDI está en los libros del SAT y lo que hace falta es
 * cancelarlo allá. Marcarlo aquí escondería justo eso.
 * ============================================================================
 */

type Pago = {
  id: string;
  creditoId: string;
  empresaId: string;
  montoCapital: number;
  cancelado?: boolean;
  estadoFiscal?: EstadoFiscalCobranza;
  complementoPagoId?: string | null;
  fechaPago?: string;
};

describe('la lista de pagos con la que se arma el REP', () => {
  /**
   * Monta el servicio con un repositorio que registra el `where` recibido. Lo
   * que se mide es **qué le pide a la base**, que es donde estaba el defecto:
   * una lista mal pedida produce un complemento mal armado sin que nada falle.
   */
  function servicioQueRegistraConsultas() {
    const consultas: Array<Record<string, unknown>> = [];
    const servicio = Object.create(CfdiService.prototype) as CfdiService;
    const repo = {
      find: async (opciones: { where: unknown }) => {
        consultas.push(opciones.where as Record<string, unknown>);
        return [];
      },
    };
    Object.assign(servicio, {
      dataSource: { getRepository: () => repo },
    });
    return { servicio, repo, consultas };
  }

  it('la cola de complementos pendientes excluye los pagos cancelados', async () => {
    const { servicio, consultas } = servicioQueRegistraConsultas();
    await servicio.generarComplementosPendientes('e1');

    /* El `where` es un arreglo de dos ramas: PENDIENTE_REP y ERROR_REP. */
    const ramas = consultas[0] as unknown as Array<Record<string, unknown>>;
    expect(Array.isArray(ramas)).toBe(true);
    expect(ramas).toHaveLength(2);
    for (const rama of ramas) {
      expect(rama.cancelado).toBe(false);
    }
    /* Y sigue mirando las dos: filtrar cancelados no puede perder la rama de
       los que fallaron al timbrar. */
    expect(ramas.map((r) => r.estadoFiscal).sort()).toEqual(
      [EstadoFiscalCobranza.ERROR_REP, EstadoFiscalCobranza.PENDIENTE_REP].sort(),
    );
  });
});

describe('la lista con la que se arma un complemento concreto', () => {
  /*
   * Esta prueba mide **qué le pide el servicio a la base**, no una copia de la
   * regla. La primera versión reimplementaba `aplicadoAnterior` y
   * `anteriorSinRep` dentro del propio test y comprobaba la copia: habría
   * pasado igual con el defecto dentro, que es exactamente el antipatrón que
   * este barrido encontró en `cobranza-regularizacion.spec.ts`.
   *
   * Lo que de verdad decide los importes y el bloqueo es el `where` de esa
   * consulta. Si pide los cancelados, el complemento sale mal; si no, bien.
   */
  it('pide sólo los pagos vigentes del crédito', async () => {
    const wheres: Array<Record<string, unknown>> = [];
    const PAGO = {
      id: 'p2',
      empresaId: 'e1',
      creditoId: 'c1',
      montoCapital: 5000,
      complementoPagoId: null,
      credito: { ventaId: 'v1' },
    };
    const CORTE = 'CORTE-TRAS-LA-CONSULTA';

    const servicio = Object.create(CfdiService.prototype) as CfdiService;
    Object.assign(servicio, {
      dataSource: {
        getRepository: () => ({
          findOne: async () => PAGO,
          update: async () => undefined,
          find: async (opciones: { where: Record<string, unknown> }) => {
            wheres.push(opciones.where);
            /* Se corta aquí: lo que se mide es la consulta, no el resto del
               armado del CFDI. */
            throw new Error(CORTE);
          },
        }),
      },
      facturaRepo: {
        findOne: async () => ({
          id: 'f1',
          uuid: 'UUID-1',
          /* PPD: un comprobante de pago en una sola exhibición no lleva REP y
             el camino termina antes de la consulta. */
          metodoPago: 'PPD',
          total: 11600,
          partidas: [],
        }),
      },
    });

    const error = await servicio
      .crearComplementoPagoDesdeCobranza('p2', 'e1')
      .then(() => null)
      .catch((e: Error) => e);

    /* Si no cortó en la consulta, el camino murió antes y la prueba no mediría
       nada: eso también tiene que fallar, no pasar en silencio. */
    /* Si no cortó en la consulta, el camino murió antes y la prueba no mediría
       nada: eso también tiene que fallar, no pasar en silencio. */
    expect(error).not.toBeNull();
    expect((error as Error).message).toBe(CORTE);
    expect(wheres).toHaveLength(1);
    expect(wheres[0]).toMatchObject({
      empresaId: 'e1',
      creditoId: 'c1',
      cancelado: false,
    });
  });
});

describe('cancelar un pago y su estado fiscal', () => {
  /*
   * El cuarto defecto, y el que alimentaba al peor: `cancelarPago` no tocaba
   * `estadoFiscal`, así que un pago cancelado seguía en la cola de
   * complementos pendientes. Aun con el filtro de arriba, dejarlo ahí sería
   * guardar un dato que contradice al documento.
   *
   * Se mide sobre la regla tal como está escrita en el servicio, aplicada a los
   * dos casos que se tratan distinto. La distinción es la que importa: un REP ya
   * timbrado **no** se marca como no requerido, porque ese CFDI está en los
   * libros del SAT y lo que hace falta es cancelarlo allá.
   */
  const aplicarCancelacion = (pago: {
    complementoPagoId: string | null;
    estadoFiscal: EstadoFiscalCobranza;
    ultimoErrorFiscal: string | null;
  }) => {
    if (!pago.complementoPagoId) {
      pago.estadoFiscal = EstadoFiscalCobranza.NO_REQUERIDO;
      pago.ultimoErrorFiscal = null;
    }
    return pago;
  };

  it('sin complemento timbrado, sale de la cola', () => {
    const pago = aplicarCancelacion({
      complementoPagoId: null,
      estadoFiscal: EstadoFiscalCobranza.ERROR_REP,
      ultimoErrorFiscal: 'el PAC rechazó el timbre',
    });
    expect(pago.estadoFiscal).toBe(EstadoFiscalCobranza.NO_REQUERIDO);
    expect(pago.ultimoErrorFiscal).toBeNull();
  });

  it('con complemento timbrado, el estado se queda como está', () => {
    const pago = aplicarCancelacion({
      complementoPagoId: 'f-rep-1',
      estadoFiscal: EstadoFiscalCobranza.REP_GENERADO,
      ultimoErrorFiscal: null,
    });
    expect(pago.estadoFiscal).toBe(EstadoFiscalCobranza.REP_GENERADO);
  });

  it('y el servicio de cobranza aplica esa regla, no otra', () => {
    /*
     * La aserción estructural que une las dos de arriba con el código que
     * corre. Sin ella, las dos primeras prueban una copia de la regla escrita
     * en el propio test — el antipatrón que este barrido encontró en
     * `cobranza-regularizacion.spec.ts`, donde la copia usaba la comparación
     * correcta y el código la equivocada.
     */
    const fuente = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'credito', 'services', 'cobranza.service.ts'),
      'utf8',
    ) as string;
    const bloque = fuente.slice(
      fuente.indexOf('pago.cancelado = true;'),
      fuente.indexOf('pago.cancelado = true;') + 1800,
    );
    expect(bloque).toContain('if (!pago.complementoPagoId)');
    expect(bloque).toContain('EstadoFiscalCobranza.NO_REQUERIDO');
  });
});
