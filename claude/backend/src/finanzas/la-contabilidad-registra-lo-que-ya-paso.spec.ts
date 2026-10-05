import { BadRequestException, Logger } from '@nestjs/common';
import { MotorContableService } from './services/motor-contable.service';
import { Poliza } from './entities/poliza.entity';
import { PartidaPoliza } from './entities/partida-poliza.entity';
import {
  esFechaFutura,
  exigirQueYaHayaOcurrido,
} from './utils/la-contabilidad-registra-lo-que-ya-paso.util';

/**
 * ============================================================================
 * LA CONTABILIDAD REGISTRA LO QUE YA PASÓ, TAMBIÉN DESDE EL MOTOR
 * ----------------------------------------------------------------------------
 * EL CASO
 *
 * La regla existía, estaba bien escrita y tenía su historia: se registró —y se
 * pagó— la nómina del 1 al 15 de octubre el 23 de septiembre, con su póliza de
 * devengo fechada 22 días adelante. El mayor externo la rechazó: «The journal
 * entry cannot be made for a future date».
 *
 * Y el comentario que la acompañaba afirmaba esto:
 *
 *     «Vive en `aFecha` y no en cada camino de creación a propósito: las
 *      pólizas nacen desde el motor contable, la captura manual, la captura en
 *      transacción, las reversas y el cierre, y TODAS PASAN POR AQUÍ.»
 *
 * No era cierto. `MotorContableService` tiene su propio `crearPoliza` —con su
 * transacción, su folio y su verificación de período cerrado— que no llama a
 * `PolizasService` en ningún momento. Y por ahí nacen casi todas: ventas,
 * compras, cobranza, tesorería, depreciación, hospedaje, cierres de caja.
 *
 * Así que la regla cubría la captura manual, que es la minoría, mientras el
 * comentario decía lo contrario. **Un control que se cree puesto es peor que uno
 * que se sabe ausente: nadie lo va a buscar.**
 *
 * Es la misma forma de defecto que el interés negativo de hoy mismo —una regla
 * que existe en un camino y no en el de al lado—, con el agravante de que aquí
 * había un comentario afirmando que sí estaba.
 * ============================================================================
 */

const MANANA = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d;
};
const HOY_TARDE = () => {
  const d = new Date();
  d.setHours(23, 30, 0, 0);
  return d;
};
const AYER = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
};

describe('la regla, por sí sola', () => {
  it('deja pasar una fecha de hoy, aunque sean las 23:30', () => {
    /*
     * El día se compara con el calendario local, no con UTC. En México, a partir
     * de las 18:00, comparar contra UTC declararía futuro lo que se está
     * capturando hoy mismo — el mismo defecto que ya costó un día entero de
     * atraso en toda la cartera del portal.
     */
    expect(esFechaFutura(HOY_TARDE())).toBe(false);
    expect(() => exigirQueYaHayaOcurrido(HOY_TARDE())).not.toThrow();
  });

  it('deja pasar el pasado', () => {
    expect(esFechaFutura(AYER())).toBe(false);
  });

  it('rechaza mañana', () => {
    expect(esFechaFutura(MANANA())).toBe(true);
    expect(() => exigirQueYaHayaOcurrido(MANANA())).toThrow(BadRequestException);
  });

  it('el «no» dice la fecha y por qué', () => {
    const error = (() => {
      try {
        exigirQueYaHayaOcurrido(MANANA());
      } catch (e) {
        return e as Error;
      }
    })()!;
    expect(error.message).toMatch(/todavía no llega/);
    expect(error.message).toMatch(/registra lo que ya ocurrió/);
  });

  it('nombra la operación cuando se le da contexto', () => {
    /*
     * Desde el motor, el error acaba en la bandeja de asientos pendientes.
     * «No se puede registrar una póliza» a secas no dice cuál quedó parada.
     */
    const error = (() => {
      try {
        exigirQueYaHayaOcurrido(MANANA(), 'Ingresos — Ticket #4120');
      } catch (e) {
        return e as Error;
      }
    })()!;
    expect(error.message).toContain('Ingresos — Ticket #4120');
  });
});

function crearArnes() {
  const guardadas: Array<{ poliza: any; partidas: any[] }> = [];
  let pendiente: any = null;
  const manager = {
    create: (_e: any, obj: any) => obj,
    findOne: jest.fn(async () => null),
    save: jest.fn(async (entOrObj: any, maybeArr?: any) => {
      if (Array.isArray(maybeArr)) {
        guardadas.push({ poliza: pendiente, partidas: maybeArr });
        return maybeArr;
      }
      pendiente = { ...entOrObj, id: 'pol-1' };
      return pendiente;
    }),
  };
  const transacciones: string[] = [];
  const dataSource: any = {
    query: jest.fn(async () => []),
    getRepository: jest.fn((entidad: any) =>
      entidad === Poliza
        ? { findOne: async () => ({ id: 'orig-1' }) }
        : entidad === PartidaPoliza
          ? {
              find: async () => [
                { cuentaContableId: 'cta-gasto', cargo: 500, abono: 0 },
                { cuentaContableId: 'cta-banco', cargo: 0, abono: 500 },
              ],
            }
          : { findOne: async () => null, createQueryBuilder: () => ({}) },
    ),
    createQueryRunner: () => ({
      connect: jest.fn(async () => transacciones.push('connect')),
      startTransaction: jest.fn(async () => transacciones.push('start')),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      query: jest.fn(async (sql: string) =>
        sql.includes('pg_advisory_xact_lock') ? [{ resultado: 0 }] : [],
      ),
      manager,
    }),
  };
  const productoRepo: any = {
    createQueryBuilder: () => ({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      whereInIds: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: async () => [],
    }),
  };
  return {
    servicio: new MotorContableService(dataSource, productoRepo),
    guardadas,
    transacciones,
  };
}

/*
 * Se usa la cancelación de tesorería porque es el camino más corto hasta
 * `crearPoliza`: sus partidas salen del espejo de la póliza original, así que la
 * prueba mide el control de fecha y no el armado del catálogo de cuentas.
 */
const cancelacionFechada = (fecha: Date) => ({
  movimientoId: 'mov-1',
  empresaId: 'emp-1',
  fecha,
  folio: 'TES-99',
  motivo: 'Pago de renta duplicado',
});

beforeAll(() => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

describe('el motor contable, que es por donde nacen casi todas', () => {
  it('rechaza una póliza fechada mañana', async () => {
    const { servicio, guardadas } = crearArnes();

    await expect(
      servicio.generarAsientoDeCancelacionTesoreria(cancelacionFechada(MANANA())),
    ).rejects.toThrow(/todavía no llega/);
    expect(guardadas).toHaveLength(0);
  });

  it('y no abre la transacción para algo que va a rechazar', async () => {
    /*
     * Reservar folio y tomar los candados de período para después deshacerlo
     * serializa escrituras ajenas sin motivo. La comprobación va antes.
     */
    const { servicio, transacciones } = crearArnes();

    await servicio
      .generarAsientoDeCancelacionTesoreria(cancelacionFechada(MANANA()))
      .catch(() => undefined);
    expect(transacciones).toHaveLength(0);
  });

  it('el mensaje nombra la operación que quedó parada', async () => {
    const { servicio } = crearArnes();
    const error = await servicio
      .generarAsientoDeCancelacionTesoreria(cancelacionFechada(MANANA()))
      .catch((e: Error) => e);

    expect(String((error as Error).message)).toContain('TES-99');
  });
});

describe('la regla vive en un solo sitio y la llaman los dos caminos', () => {
  /*
   * ESTRUCTURAL, Y CON MOTIVO. El defecto no era que la regla no existiera: era
   * que existía en un camino y no en el contiguo, con un comentario afirmando
   * que estaba en los dos. Si alguien la vuelve a escribir a mano en uno de
   * ellos, el otro queda libre otra vez y ninguna prueba de comportamiento de la
   * utilidad lo vería.
   */
  const leer = (ruta: string[]) =>
    require('fs').readFileSync(
      require('path').join(__dirname, ...ruta),
      'utf8',
    ) as string;

  it('el motor contable la llama antes de crear la póliza', () => {
    const fuente = leer(['services', 'motor-contable.service.ts']);
    expect(fuente).toContain('exigirQueYaHayaOcurrido(data.fecha, data.concepto)');
  });

  it('el servicio de pólizas la llama en vez de tener su propia copia', () => {
    const fuente = leer(['services', 'polizas.service.ts']);
    expect(fuente).toContain(
      "from '../utils/la-contabilidad-registra-lo-que-ya-paso.util'",
    );
    /* La aritmética del fin del día ya no se escribe aquí. */
    expect(fuente).not.toMatch(/const finDeHoy = new Date\(/);
  });

  it('y el comentario que afirmaba de más ya no está', () => {
    /*
     * Decía que todas las pólizas pasaban por `aFecha`. Mientras ese texto
     * estuviera, cualquiera que buscara el control lo daría por cubierto.
     */
    const fuente = leer(['services', 'polizas.service.ts']);
    /*
     * La frase sigue en el archivo, citada a propósito: borrarla dejaría el
     * cambio sin explicación. Lo que se comprueba es que venga DESMENTIDA, no
     * que haya desaparecido.
     */
    expect(fuente).toMatch(/y todas pasan por aquí[\s\S]{0,120}No era cierto/);
  });
});
