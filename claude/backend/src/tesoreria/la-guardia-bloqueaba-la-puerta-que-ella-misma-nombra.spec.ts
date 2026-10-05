import { ConflictException } from '@nestjs/common';
import { TesoreriaService } from './services/tesoreria.service';
import {
  MovimientoTesoreria,
  TipoMovimiento,
  EstadoConciliacion,
} from './entities/tesoreria.entity';

/**
 * ============================================================================
 * LA GUARDIA BLOQUEABA LA PUERTA QUE ELLA MISMA NOMBRA
 * ----------------------------------------------------------------------------
 * EL CASO
 *
 * `tesoreria.cancelar` rechaza todo movimiento que nació de un documento, y el
 * razonamiento es bueno: cancelarlo desde la pantalla de tesorería devolvería el
 * saldo al banco y dejaría el documento diciendo que el dinero sí se movió.
 *
 * El mensaje de ese rechazo nombra la salida correcta:
 *
 *     «Cancela el pago en Créditos → Cobranza: desde ahí se rehace el reparto
 *      entre cuotas y se cancela este movimiento.»
 *
 * Y su comentario la cita por nombre: «es lo que hace `CobranzaService.
 * cancelarPago`».
 *
 * Pero `CobranzaService.cancelarPago` llama a `tesoreria.cancelar`, y el
 * movimiento que creó lleva `tipoDocumento: 'PAGO_COBRANZA'`. Así que la guardia
 * **lo rechazaba a él**, con un mensaje que lo mandaba a sí mismo.
 *
 * Resultado: cancelar un pago de cobranza fallaba SIEMPRE con 409, y como esa
 * transacción es SERIALIZABLE se revertía entera. La operación que el propio
 * código describe como la buena no se podía hacer por ninguna vía. Las pruebas
 * no lo veían porque sustituyen tesorería por un doble.
 *
 * EL ARREGLO
 *
 * La guardia se escribió contra la PANTALLA, no contra el módulo dueño del
 * documento. Ahora el dueño lo dice explícitamente al llamar, y la guardia sigue
 * entera para todos los demás.
 * ============================================================================
 */

const movimientoDe = (extra: Partial<MovimientoTesoreria> = {}) =>
  ({
    id: 'mov-1',
    empresaId: 'e1',
    folio: 'MOV-1',
    cuentaBancariaId: 'c1',
    fecha: new Date('2026-09-20'),
    tipo: TipoMovimiento.INGRESO,
    origen: 'COBRANZA',
    importe: 1000,
    cancelado: false,
    estadoConciliacion: EstadoConciliacion.PENDIENTE,
    tipoDocumento: 'PAGO_COBRANZA',
    ...extra,
  }) as unknown as MovimientoTesoreria;

function servicioCon(movimiento: MovimientoTesoreria) {
  const guardados: Array<Record<string, unknown>> = [];
  const encolados: unknown[] = [];
  const s = Object.create(TesoreriaService.prototype) as Record<string, unknown>;
  s.movimientos = { findOne: () => Promise.resolve(movimiento) };
  s.dataSource = {
    transaction: (cuerpo: (m: unknown) => Promise<unknown>) =>
      cuerpo({
        getRepository: () => ({
          save: (x: Record<string, unknown>) => {
            guardados.push(x);
            return Promise.resolve(x);
          },
          create: (x: Record<string, unknown>) => x,
        }),
      }),
  };
  s.asientos = {
    encolarEnTransaccion: (_m: unknown, tipo: unknown) => {
      encolados.push(tipo);
      return Promise.resolve({ id: 'pend-1' });
    },
  };
  s.siguienteFolio = () => Promise.resolve('MOV-999');
  s.recalcularSaldos = () => Promise.resolve(undefined);
  return { s: s as unknown as TesoreriaService, guardados, encolados };
}

describe('cancelar el movimiento de un documento', () => {
  it('sigue prohibido desde la pantalla de tesorería', async () => {
    /* La guardia no se debilita: ésta es la razón por la que existe. */
    const { s } = servicioCon(movimientoDe());

    await expect(
      s.cancelar('mov-1', 'me equivoqué', 'e1', 'u1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('y el «no» sigue diciendo dónde se deshace de verdad', async () => {
    const { s } = servicioCon(movimientoDe());
    const error = await s
      .cancelar('mov-1', 'me equivoqué', 'e1', 'u1')
      .catch((e: Error) => e);

    expect(String((error as Error).message)).toMatch(/Créditos → Cobranza/);
  });

  it('pero el módulo dueño sí puede, que es justo lo que ese mensaje manda hacer', async () => {
    /*
     * El renglón que faltaba. Sin él, `CobranzaService.cancelarPago` chocaba
     * contra la guardia y cancelar un pago era imposible por cualquier vía.
     */
    const { s, guardados } = servicioCon(movimientoDe());

    const resultado = await s.cancelar('mov-1', 'El cheque rebotó.', 'e1', 'u1', {
      loPideElDocumentoDeOrigen: true,
    });

    expect(resultado.original.cancelado).toBe(true);
    expect(resultado.contrapartida.tipo).toBe(TipoMovimiento.EGRESO);
    expect(guardados.length).toBeGreaterThanOrEqual(2);
  });

  it('un movimiento capturado a mano no necesita permiso de nadie', async () => {
    const { s } = servicioCon(movimientoDe({ tipoDocumento: null as never }));

    const resultado = await s.cancelar('mov-1', 'Duplicado.', 'e1', 'u1');
    expect(resultado.original.cancelado).toBe(true);
  });

  it('y las dos protecciones de siempre siguen puestas', async () => {
    /* Conciliado con el banco y ya cancelado: ninguna depende de quién llame. */
    const conciliado = servicioCon(
      movimientoDe({ estadoConciliacion: EstadoConciliacion.CONCILIADO }),
    );
    await expect(
      conciliado.s.cancelar('mov-1', 'x', 'e1', 'u1', {
        loPideElDocumentoDeOrigen: true,
      }),
    ).rejects.toThrow(/conciliado/i);

    const yaCancelado = servicioCon(movimientoDe({ cancelado: true }));
    await expect(
      yaCancelado.s.cancelar('mov-1', 'x', 'e1', 'u1', {
        loPideElDocumentoDeOrigen: true,
      }),
    ).rejects.toThrow(/ya está cancelado/i);
  });
});

/**
 * ============================================================================
 * UN MOVIMIENTO CANCELADO SE DESCONTABA DOS VECES DEL AUXILIAR
 * ----------------------------------------------------------------------------
 * `cancelar` hace dos cosas a la vez: marca el original con `cancelado = true`
 * **y** escribe la contrapartida inversa. El recálculo de saldos saltaba los
 * cancelados, así que el original dejaba de sumar y la contrapartida restaba
 * otra vez:
 *
 *     INGRESO de 1,000, cancelado  →  saldo = B − 1,000, cuando debía ser B
 *
 * Y no era un caso raro: `cancelar` es el único sitio que pone
 * `cancelado = true`, y siempre crea la contrapartida. Los dos mecanismos iban
 * siempre juntos, así que el descuento doble ocurría todas las veces.
 *
 * Se eligió el mecanismo que deja rastro —la contrapartida—, que es el mismo que
 * ya usa el mayor desde que la cancelación encola su propia póliza. Auxiliar y
 * contabilidad con la misma forma: nada se borra, todo se contrarresta.
 *
 * Esto es el defecto simétrico del que se cerró esta misma mañana: allí el
 * auxiliar quedaba bien y el mayor sin reversar; aquí, al poner el mayor en su
 * sitio, quedaba el auxiliar descontando de más.
 * ============================================================================
 */
describe('el saldo del auxiliar después de una cancelación', () => {
  /** Reproduce el recálculo tal como lo hace el servicio, sobre una lista. */
  function saldoFinal(movimientos: Array<Partial<MovimientoTesoreria>>) {
    const SIGNO: Record<string, number> = {
      [TipoMovimiento.INGRESO]: 1,
      [TipoMovimiento.EGRESO]: -1,
      [TipoMovimiento.TRASPASO_ENTRADA]: 1,
      [TipoMovimiento.TRASPASO_SALIDA]: -1,
    };
    const fuente = require('fs').readFileSync(
      require('path').join(__dirname, 'services', 'tesoreria.service.ts'),
      'utf8',
    ) as string;
    /*
     * La prueba lee el código para no quedarse midiendo una copia propia: si
     * alguien repone el `continue` de los cancelados, esto falla.
     */
    expect(fuente).not.toMatch(/if \(m\.cancelado\) \{\s*\n\s*m\.saldoPosterior/);

    return movimientos.reduce(
      (saldo, m) => saldo + SIGNO[m.tipo as string] * Number(m.importe),
      0,
    );
  }

  it('vuelve a donde estaba: el original cuenta y la contrapartida lo deshace', () => {
    expect(
      saldoFinal([
        { tipo: TipoMovimiento.INGRESO, importe: 1000, cancelado: true },
        { tipo: TipoMovimiento.EGRESO, importe: 1000 },
      ]),
    ).toBe(0);
  });

  it('no se queda en menos mil, que es lo que daba antes', () => {
    expect(
      saldoFinal([
        { tipo: TipoMovimiento.INGRESO, importe: 1000, cancelado: true },
        { tipo: TipoMovimiento.EGRESO, importe: 1000 },
      ]),
    ).not.toBe(-1000);
  });

  it('un egreso cancelado tampoco infla el saldo', () => {
    expect(
      saldoFinal([
        { tipo: TipoMovimiento.INGRESO, importe: 5000 },
        { tipo: TipoMovimiento.EGRESO, importe: 2000, cancelado: true },
        { tipo: TipoMovimiento.INGRESO, importe: 2000 },
      ]),
    ).toBe(5000);
  });

  it('el saldo anterior tampoco salta los cancelados', () => {
    /*
     * La misma exclusión estaba en la consulta que busca el saldo de arranque.
     * Dejarla ahí haría que el recálculo partiera de un número que ya venía
     * descontado de más.
     */
    const fuente = require('fs').readFileSync(
      require('path').join(__dirname, 'services', 'tesoreria.service.ts'),
      'utf8',
    ) as string;
    const inicio = fuente.indexOf('const anterior = await repo');
    expect(inicio).toBeGreaterThan(0);
    expect(fuente.slice(inicio, inicio + 500)).not.toContain(
      "andWhere('m.cancelado = false')",
    );
  });
});

describe('y la cobranza se declara dueña al pedirlo', () => {
  /*
   * ESTRUCTURAL, Y CON UNA LECCIÓN DETRÁS.
   *
   * Un mutante deliberado quitó `{ loPideElDocumentoDeOrigen: true }` de la
   * llamada y **todas las pruebas siguieron verdes**, incluidas las de cobranza.
   * El motivo es el que explica por qué este defecto vivió tanto:
   *
   *     EL DOBLE DE TESORERÍA EN LAS PRUEBAS ACEPTA LO QUE EL REAL RECHAZA.
   *
   * `cancelarPago` tiene pruebas, y pasan, porque sustituyen tesorería por un
   * objeto que no tiene guardia. El código real fallaba con 409 en cada
   * ejecución y la suite entera decía que todo iba bien.
   *
   * Montar `CobranzaService.cancelarPago` de verdad —transacción SERIALIZABLE,
   * crédito, cuotas, CFDI, cartera— mediría el armado del doble y no esto. La
   * aserción se queda donde el valor se compone, y la lección queda escrita:
   * cuando un doble es más permisivo que el original, las pruebas dejan de
   * medir el sistema y pasan a medir el doble.
   */
  const fuente = require('fs').readFileSync(
    require('path').join(
      __dirname,
      '..',
      'credito',
      'services',
      'cobranza.service.ts',
    ),
    'utf8',
  ) as string;

  it('pasa la opción al cancelar el movimiento del pago', () => {
    const inicio = fuente.indexOf('this.tesoreria.cancelar(');
    expect(inicio).toBeGreaterThan(0);
    expect(fuente.slice(inicio, inicio + 600)).toContain(
      'loPideElDocumentoDeOrigen: true',
    );
  });
});
