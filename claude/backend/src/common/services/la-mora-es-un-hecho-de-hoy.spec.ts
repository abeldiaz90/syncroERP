import { ConflictException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PoliticaCreditoService } from './politica-credito.service';
import { fechaCalendarioNegocio } from '../utils/business-time.util';

/**
 * ============================================================================
 * LA MORA ES UN HECHO DE HOY, Y EL PLAZO SE CUENTA DESDE HOY
 * ----------------------------------------------------------------------------
 * EL CASO
 *
 * `validarOperacionEnTransaccion` aceptaba `fechaCorte`, y los dos únicos
 * canales que validan lo llenaban con un dato del documento que captura el
 * usuario: `creditos.service` con `dto.fechaInicio` y `city-ledger.service` con
 * `datos.fechaEmision`. Ninguno tiene cota: `fechaInicio` sólo se valida como
 * fecha.
 *
 * Ese valor decidía dos autorizaciones:
 *
 *  1. **El bloqueo por mora.** El vencido se mide con `q.fechaVencimiento < $3`.
 *     Un cliente con `bloquearCreditoConSaldoVencido` y una cuota caída el
 *     10-sep pasaba el control capturando `fechaInicio: '2026-08-01'`: la
 *     subconsulta no encontraba nada vencido y la venta a crédito se autorizaba
 *     a un moroso. El control existía y no se disparaba para quien supiera eso.
 *
 *  2. **El plazo autorizado.** El tope es `fechaBase + diasCredito`. Con
 *     `fechaInicio = hoy + 180` y una cuota a 30 días, el vencimiento caía
 *     dentro del tope: la línea se consumía hoy y no había nada exigible en
 *     siete meses.
 *
 * LAS DOS MEDIDAS SON SOBRE HOY, Y ES LA MISMA RAZÓN
 *
 * La mora es un hecho de hoy. Y el plazo autorizado es el tiempo que la
 * institución espera su dinero, que empieza cuando la mercancía o el efectivo
 * salen — hoy. Fechar el documento hacia atrás o hacia adelante no cambia
 * ninguna de las dos cosas.
 *
 * Y el parámetro se **quitó del tipo** en vez de ignorarse: uno que se sigue
 * recibiendo y no hace nada es el defecto original con una pista falsa encima.
 * ============================================================================
 */

const SRC = join(__dirname, '..', '..');

function managerCon(datos: {
  saldoVentas?: number;
  saldoHotel?: number;
  vencidoVentas?: number;
  vencidoHotel?: number;
  diasCredito?: number;
}) {
  const consultas: Array<{ sql: string; params: unknown[] }> = [];
  /* El constructor de consultas devuelve siempre el mismo objeto: el servicio
     llama `setLock` y luego `getOne` sobre el resultado de `where`. */
  const qb: Record<string, unknown> = {};
  Object.assign(qb, {
    where: jest.fn(() => qb),
    setLock: jest.fn(() => qb),
    getOne: jest.fn(async () => ({
      id: 'cliente-1',
      empresaId: 'e1',
      activo: true,
      estadoCredito: 'AUTORIZADO',
      limiteCredito: 100_000,
      diasCredito: datos.diasCredito ?? 30,
      bloquearCreditoConSaldoVencido: true,
      versionCredito: 1,
    })),
  });

  const manager = {
    getRepository: jest.fn(() => ({ createQueryBuilder: jest.fn(() => qb) })),
    query: jest.fn(async (sql: string, params: unknown[]) => {
      consultas.push({ sql, params });
      if (sql.includes('pg_advisory_xact_lock')) return [{ resultado: 0 }];
      return [
        {
          saldoVentas: datos.saldoVentas ?? 0,
          saldoHotel: datos.saldoHotel ?? 0,
          vencidoVentas: datos.vencidoVentas ?? 0,
          vencidoHotel: datos.vencidoHotel ?? 0,
        },
      ];
    }),
  };
  return { manager, consultas };
}

describe('contra qué fecha se mide la mora al autorizar', () => {
  it('contra el día de negocio, y no hay forma de pedir otra', async () => {
    const { manager, consultas } = managerCon({ vencidoVentas: 0 });
    const servicio = new PoliticaCreditoService({ manager } as never);

    await servicio.validarOperacionEnTransaccion(manager as never, {
      empresaId: 'e1',
      clienteId: 'cliente-1',
      importe: 1_000,
    });

    /*
     * El tercer parámetro de la consulta de exposición es la fecha de corte.
     * Tiene que ser el día de negocio, calculado aquí y no recibido.
     */
    const exposicion = consultas.find((c) => c.sql.includes('vencidoVentas'));
    expect(exposicion).toBeDefined();
    expect(exposicion!.params[2]).toBe(fechaCalendarioNegocio(new Date()));
  });

  it('y un cliente con mora sigue bloqueado: el control se dispara', async () => {
    const { manager } = managerCon({ vencidoVentas: 1_500 });
    const servicio = new PoliticaCreditoService({ manager } as never);
    await expect(
      servicio.validarOperacionEnTransaccion(manager as never, {
        empresaId: 'e1',
        clienteId: 'cliente-1',
        importe: 1_000,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('contra qué fecha se mide el plazo autorizado', () => {
  const enDias = (dias: number) => {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    return d.toISOString().slice(0, 10);
  };

  it('un vencimiento dentro del plazo pasa', async () => {
    const { manager } = managerCon({ diasCredito: 30 });
    const servicio = new PoliticaCreditoService({ manager } as never);
    const r = await servicio.validarOperacionEnTransaccion(manager as never, {
      empresaId: 'e1',
      clienteId: 'cliente-1',
      importe: 1_000,
      fechaVencimiento: enDias(29),
    });
    expect(r.diasCredito).toBe(30);
  });

  it('uno que lo excede se rechaza, aunque el documento se feche en el futuro', async () => {
    /*
     * El escenario del defecto: con `fechaCorte = hoy + 180` el tope se corría
     * a `hoy + 210` y un vencimiento a siete meses pasaba. Ahora no hay dato de
     * la petición que mueva el tope.
     */
    const { manager } = managerCon({ diasCredito: 30 });
    const servicio = new PoliticaCreditoService({ manager } as never);
    await expect(
      servicio.validarOperacionEnTransaccion(manager as never, {
        empresaId: 'e1',
        clienteId: 'cliente-1',
        importe: 1_000,
        fechaVencimiento: enDias(210),
      }),
    ).rejects.toThrow(/30 días autorizados/);
  });

  it('un crédito retroactivo sigue pasando: su vencimiento también es pasado', async () => {
    /*
     * La mitad que importa no romper. Migrar histórico es legítimo, y medir el
     * tope desde hoy no lo estorba: un vencimiento de hace cinco meses está
     * holgadamente por debajo de `hoy + 30`.
     */
    const { manager } = managerCon({ diasCredito: 30 });
    const servicio = new PoliticaCreditoService({ manager } as never);
    const r = await servicio.validarOperacionEnTransaccion(manager as never, {
      empresaId: 'e1',
      clienteId: 'cliente-1',
      importe: 1_000,
      fechaVencimiento: enDias(-150),
    });
    expect(r.puedeOperar).toBe(true);
  });
});

describe('los canales que autorizan', () => {
  it('ninguno manda una fecha de corte a la validación', () => {
    /*
     * Estructural, y necesaria: el tipo ya no admite `fechaCorte`, así que
     * TypeScript atrapa un reintento directo. Lo que esto vigila es el camino
     * torcido — que alguien lo cuele por un `as never` o un objeto suelto, que
     * es justo cómo se escriben los dobles de prueba y cómo se colaría sin
     * querer en código real.
     */
    for (const archivo of [
      'credito/services/creditos.service.ts',
      'hoteleria/services/city-ledger.service.ts',
    ]) {
      const fuente = readFileSync(join(SRC, archivo), 'utf8');
      const sinComentarios = fuente
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/^\s*\/\/.*$/gm, ' ');
      const bloque = sinComentarios.slice(
        sinComentarios.indexOf('validarOperacionEnTransaccion'),
        sinComentarios.indexOf('validarOperacionEnTransaccion') + 700,
      );
      expect(bloque).not.toContain('fechaCorte');
    }
  });

  it('`obtenerResumen` sí lo conserva, porque ahí es un reporte', () => {
    /*
     * La distinción es el punto: una exposición a una fecha pasada es un
     * informe legítimo. Lo que no puede es decidir una autorización. Si alguien
     * quita el parámetro de los dos sitios, los reportes de conciliación
     * pierden la capacidad de mirar atrás.
     */
    const fuente = readFileSync(
      join(SRC, 'common/services/politica-credito.service.ts'),
      'utf8',
    );
    expect(fuente).toContain('fechaCorte?: string;');
    expect(fuente).toContain('opciones.fechaCorte?.slice(0, 10)');
  });
});
