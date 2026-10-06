import { readFileSync } from 'fs';
import { join } from 'path';

import { IntegridadFinancieraService } from './services/integridad-financiera.service';

/**
 * ============================================================================
 * LOS INVARIANTES DE LA CARTERA, QUE NADIE VIGILABA
 * ----------------------------------------------------------------------------
 * EL CASO
 *
 * Entre el 4 y el 5 de octubre de 2026 se cerraron cuatro defectos distintos
 * —un interés que salía negativo, un pago que se repartía mal, una anulación
 * que no devolvía el saldo, una cancelación que descontaba dos veces— y los
 * cuatro se habían comido la misma regla:
 *
 *     montoCapital + montoInteres = montoCuota
 *
 * No es cosmética. El reparto de cada pago sale de
 * `proporcionCapital = montoCapital / montoCuota`, así que una cuota
 * descuadrada reparte mal TODOS los pagos que reciba después, y el error se
 * arrastra hacia adelante sin que nada lo señale.
 *
 * Los cuatro se encontraron leyendo código, de uno en uno. Ninguna comprobación
 * de integridad miraba el invariante, así que una fila ya dañada seguiría ahí
 * para siempre: **arreglar el código impide que se rompa de nuevo; no repara lo
 * que ya está roto, y sobre todo no avisa de ello.**
 *
 * CÓMO SE COMPROBÓ QUE LAS CONSULTAS HACEN LO QUE DICEN
 *
 * Una comprobación de integridad ES una consulta: medir que la cadena contiene
 * las palabras correctas no dice nada sobre si cuenta lo que debe. Así que las
 * cuatro se ejecutaron contra un **PostgreSQL 16 de verdad**, leyendo el SQL
 * del propio archivo de servicio —no una copia— sobre seis créditos sembrados:
 *
 *   · uno sano de tres cuotas · uno con una cuota descuadrada y otra con
 *     interés negativo · uno CANCELADO y descuadrado · uno de OTRA EMPRESA y
 *     descuadrado · uno sano con pago parcial · uno con una cuota sobrepagada
 *
 * Las cuatro contaron exactamente lo que debían, incluidos los negativos: el
 * cancelado y el de la otra empresa no se cuentan, y el pago parcial sano
 * tampoco. Las aserciones de abajo fijan las decisiones que hacen que eso siga
 * siendo cierto.
 * ============================================================================
 */

const servicio = readFileSync(
  join(__dirname, 'services', 'integridad-financiera.service.ts'),
  'utf8',
);

/** Devuelve el SQL de una comprobación, tal como está en el archivo. */
function sqlDe(codigo: string): string {
  const i = servicio.indexOf(`codigo: '${codigo}'`);
  expect(i).toBeGreaterThan(-1);
  const j = servicio.indexOf('sql: `', i) + 6;
  const k = servicio.indexOf('`', j);
  return servicio.slice(j, k);
}

const NUEVAS = [
  'CUOTA_DESCUADRADA',
  'CUOTA_CON_IMPORTES_IMPOSIBLES',
  'CREDITO_SALDO_NO_COINCIDE_CON_SUS_CUOTAS',
  'CUOTA_SOBREPAGADA',
];

describe('la cartera tiene quien le mire los invariantes', () => {
  it('las cuatro comprobaciones existen', () => {
    for (const codigo of NUEVAS) {
      expect(servicio).toContain(`codigo: '${codigo}'`);
    }
  });

  it('y ningún código se repite en toda la lista', () => {
    /*
     * El código es la llave con la que la pantalla identifica cada hallazgo.
     * Dos comprobaciones con el mismo código se pisan en el tablero y una de
     * las dos desaparece de la vista sin que nadie lo note.
     */
    const codigos = [...servicio.matchAll(/codigo: '([A-Z_]+)'/g)].map(
      (m) => m[1],
    );
    expect(codigos.length).toBeGreaterThanOrEqual(NUEVAS.length);
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  it('las tres que pueden parar la operación son CRÍTICAS', () => {
    /*
     * CRÍTICA es lo que pone el tablero en BLOQUEADO. Un capital mayor que la
     * cuota o un saldo que no coincide con su detalle no son avisos: mientras
     * sigan ahí, cada cobro que entre reparte mal.
     *
     * `CUOTA_SOBREPAGADA` es ALTA a propósito: el dinero está cobrado y
     * registrado, lo que falta es moverlo a donde toca. No impide seguir
     * operando, pero el cliente tiene a su favor algo que el sistema no le
     * reconoce.
     */
    for (const codigo of NUEVAS.slice(0, 3)) {
      const i = servicio.indexOf(`codigo: '${codigo}'`);
      expect(servicio.slice(i, i + 400)).toMatch(/severidad: 'CRITICA'/);
    }
    const i = servicio.indexOf(`codigo: 'CUOTA_SOBREPAGADA'`);
    expect(servicio.slice(i, i + 400)).toMatch(/severidad: 'ALTA'/);
  });
});

describe('las consultas, y las decisiones que las hacen correctas', () => {
  it('todas filtran la empresa PASANDO POR EL CRÉDITO', () => {
    /*
     * LA TRAMPA DE ESTA TABLA. `amortizacion_cuotas` no tiene columna de
     * empresa: cuelga del crédito. Una consulta que filtrara sólo por la cuota
     * contaría las de todas las empresas de la instalación y se las enseñaría a
     * una sola, que es un problema peor que el que viene a detectar.
     */
    for (const codigo of NUEVAS) {
      const sql = sqlDe(codigo);
      expect(sql).toMatch(/creditos_clientes/);
      expect(sql).toMatch(/c\.empresaId = \$1/);
      /* Y el enlace entre las dos tablas tiene que estar, o el filtro no filtra. */
      if (sql.includes('amortizacion_cuotas q')) {
        expect(sql).toMatch(/q\.creditoId = c\.id|c\.id = q\.creditoId/);
      }
    }
  });

  it('ninguna compara decimales con una igualdad exacta', () => {
    /*
     * Son `numeric(18,4)` y los importes salen de divisiones y prorrateos. Un
     * `<>` pelado marcaría como descuadrada media cartera por centésimas que no
     * le importan a nadie, y un tablero que grita por todo deja de leerse.
     *
     * La tolerancia es de medio centavo en las cuotas y de dos centavos en el
     * saldo del crédito, que suma las de todas sus cuotas.
     */
    for (const codigo of NUEVAS) {
      const sql = sqlDe(codigo);
      expect(sql).toMatch(/ABS\(|> 0\.005|\+ 0\.005|< -0\.005/);
    }
    expect(sqlDe('CUOTA_DESCUADRADA')).toMatch(
      /ABS\(q\.montoCapital \+ q\.montoInteres - q\.montoCuota\) > 0\.005/,
    );
    expect(sqlDe('CREDITO_SALDO_NO_COINCIDE_CON_SUS_CUOTAS')).toMatch(
      /ABS\(c\.saldoPendiente - x\.porCobrar\) > 0\.02/,
    );
  });

  it('la de importes imposibles cubre las TRES formas, no sólo la que se vio', () => {
    /*
     * El defecto que se cerró el 4-oct era el interés negativo. Las otras dos
     * —capital negativo, capital mayor que la cuota— son la misma familia y
     * salen del mismo sitio: una reducción de cuota mal aplicada. Vigilar sólo
     * la que ya se vio es prepararse para la de la semana pasada.
     */
    const sql = sqlDe('CUOTA_CON_IMPORTES_IMPOSIBLES');
    expect(sql).toMatch(/q\.montoInteres < -0\.005/);
    expect(sql).toMatch(/q\.montoCapital < -0\.005/);
    expect(sql).toMatch(/q\.montoCapital > q\.montoCuota \+ 0\.005/);
  });

  it('las de la amortización miran sólo créditos vivos; la del sobrepago, todos', () => {
    /*
     * Una cuota descuadrada en un crédito CANCELADO o LIQUIDADO ya no reparte
     * nada: señalarla es ruido sobre historia que no se va a tocar.
     *
     * El sobrepago no: ahí hay dinero de un cliente aplicado de más, y que el
     * crédito esté liquidado no se lo devuelve. Por eso esa consulta NO filtra
     * por estado, y queda escrito para que no se "uniforme" con las otras tres.
     */
    for (const codigo of NUEVAS.slice(0, 3)) {
      expect(sqlDe(codigo)).toMatch(/c\.estado IN \('ACTIVO','VENCIDO'\)/);
    }
    expect(sqlDe('CUOTA_SOBREPAGADA')).not.toMatch(/c\.estado IN/);
  });

  it('cada una cuenta filas, que es lo que el tablero sabe leer', () => {
    for (const codigo of NUEVAS) {
      expect(sqlDe(codigo)).toMatch(/SELECT COUNT\(1\) cantidad/);
    }
  });
});

describe('y el diagnóstico las ejecuta y las clasifica', () => {
  /*
   * Estructural no: aquí sí se corre `diagnosticar`. Lo que se sustituye es la
   * base de datos, no el servicio, así que lo que se mide es el servicio.
   *
   * Las consultas de verdad se ejercieron contra PostgreSQL 16 sembrado —ver la
   * cabecera—; esto comprueba la otra mitad: que una comprobación con hallazgos
   * llega al tablero como CRÍTICA y lo pone en BLOQUEADO.
   */
  function servicioQueDevuelve(porCodigo: (sql: string) => number) {
    const s = Object.create(
      IntegridadFinancieraService.prototype,
    ) as Record<string, unknown>;
    s.dataSource = {
      query: async (sql: string) => [{ cantidad: porCodigo(sql) }],
    };
    return s as unknown as IntegridadFinancieraService;
  }

  it('una cuota descuadrada deja el tablero BLOQUEADO y la nombra', async () => {
    const s = servicioQueDevuelve((sql) =>
      sql.includes('q.montoCapital + q.montoInteres - q.montoCuota') ? 3 : 0,
    );

    const r = await s.diagnosticar('e1');

    const hallazgo = r.hallazgos.find((h) => h.codigo === 'CUOTA_DESCUADRADA');
    expect(hallazgo).toBeDefined();
    expect(hallazgo!.cantidad).toBe(3);
    expect(hallazgo!.estado).toBe('CON_HALLAZGOS');
    expect(hallazgo!.severidad).toBe('CRITICA');
    expect(r.estado).toBe('BLOQUEADO');
  });

  it('un sobrepago solo deja CON_ALERTAS, no BLOQUEADO', async () => {
    const s = servicioQueDevuelve((sql) =>
      sql.includes('q.montoPagado > q.montoCuota') ? 1 : 0,
    );

    const r = await s.diagnosticar('e1');

    expect(
      r.hallazgos.find((h) => h.codigo === 'CUOTA_SOBREPAGADA')?.cantidad,
    ).toBe(1);
    expect(r.estado).toBe('CON_ALERTAS');
  });

  it('y con la cartera limpia ninguna de las cuatro aparece en el tablero', async () => {
    /*
     * Un tablero que lista comprobaciones limpias entrena a no leerlo. Sólo
     * salen las que encontraron algo o las que no se pudieron medir.
     */
    const s = servicioQueDevuelve(() => 0);

    const r = await s.diagnosticar('e1');

    for (const codigo of NUEVAS) {
      expect(r.hallazgos.find((h) => h.codigo === codigo)).toBeUndefined();
    }
    expect(r.estado).toBe('SALUDABLE');
    expect(r.comprobaciones).toBeGreaterThanOrEqual(NUEVAS.length);
  });

  it('si la consulta truena, se dice NO_MEDIBLE y no se cuenta como limpia', async () => {
    /*
     * El archivo ya distingue LIMPIA de NO_MEDIBLE, y estas cuatro tienen que
     * heredarlo: un `amortizacion_cuotas` que no existiera en una instalación
     * daría cero hallazgos, y cero hallazgos es la mentira más cómoda que puede
     * contar un control de integridad.
     */
    const s = Object.create(
      IntegridadFinancieraService.prototype,
    ) as Record<string, unknown>;
    s.dataSource = {
      query: async (sql: string) => {
        if (sql.includes('amortizacion_cuotas')) {
          throw new Error('relation "amortizacion_cuotas" does not exist');
        }
        return [{ cantidad: 0 }];
      },
    };

    const r = await (s as unknown as IntegridadFinancieraService).diagnosticar(
      'e1',
    );

    const roto = r.hallazgos.find((h) => h.codigo === 'CUOTA_DESCUADRADA');
    expect(roto?.estado).toBe('NO_MEDIBLE');
    expect(roto?.detalle).toMatch(/does not exist/);
    expect(r.estado).toBe('INCOMPLETO');
  });
});
