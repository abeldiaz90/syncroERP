/**
 * ============================================================================
 * Dos que suman a la vez, y uno de los dos se pierde
 * ----------------------------------------------------------------------------
 * `sincronizarResumen` hace `SUM(stockRestante)` sobre los lotes y escribe el
 * total en `stock_por_almacen`, sin ningún candado sobre esa fila.
 *
 * `registrarSalida` sí bloquea el resumen antes de validar disponibilidad;
 * `registrarCompra` sólo bloquea el LOTE y llama aquí. Así que una entrada
 * podía hacer su SUM antes de que una salida simultánea confirmara su
 * decremento y escribir después: la resta se pierde y el almacén se queda con
 * existencia que no existe y que luego nadie puede vender.
 *
 * El candado va sobre un NOMBRE y no sobre la fila porque la fila del resumen
 * puede no existir todavía —el primer movimiento de ese producto en ese
 * almacén—, y un `FOR UPDATE` que no devuelve filas no bloquea nada. Es la
 * misma lección del folio del crédito, y aquí habría dejado fuera justo el caso
 * en que dos procesos chocan más fácil.
 * ============================================================================
 */
import { ConflictException } from '@nestjs/common';

import { StockService } from './stock.service';

function armar(resultadoDelCandado = 0) {
  const pasos: string[] = [];
  const guardado: any[] = [];

  const loteRepo = {
    createQueryBuilder: () => {
      const api: any = {};
      for (const m of ['select', 'where', 'andWhere']) api[m] = () => api;
      api.getRawOne = async () => {
        pasos.push('SUM');
        return { total: 90 };
      };
      return api;
    },
  };
  const stockRepo = {
    findOne: async () => ({ productoId: 'p', almacenId: 'a', empresaId: 'e', cantidad: 100 }),
    create: (x: any) => x,
    save: async (x: any) => {
      pasos.push('SAVE');
      guardado.push(x);
      return x;
    },
  };
  const manager: any = {
    save: async () => undefined,
    query: async (sql: string, params?: unknown[]) => {
      if (/pg_advisory_xact_lock/.test(sql)) {
        pasos.push(`CANDADO ${String(params?.[0])}`);
        return [{ resultado: resultadoDelCandado }];
      }
      return [];
    },
    getRepository: (entidad: any) => (entidad?.name === 'LoteInventario' ? loteRepo : stockRepo),
  };

  const servicio = new StockService(stockRepo as any, loteRepo as any);
  return { servicio, manager, pasos, guardado };
}

describe('Resumen de existencias · el SUM y el SAVE van protegidos', () => {
  it('toma el candado ANTES de sumar, y lo nombra por producto y almacén', async () => {
    const { servicio, manager, pasos } = armar();
    await servicio.sincronizarResumen('p', 'a', 'e', manager);

    expect(pasos[0]).toBe('CANDADO RESUMEN_STOCK:e:p:a');
    expect(pasos.indexOf('CANDADO RESUMEN_STOCK:e:p:a')).toBeLessThan(pasos.indexOf('SUM'));
    expect(pasos.indexOf('SUM')).toBeLessThan(pasos.indexOf('SAVE'));
  });

  it('escribe el total que acaba de leer', async () => {
    const { servicio, manager, guardado } = armar();
    await servicio.sincronizarResumen('p', 'a', 'e', manager);
    expect(guardado[0].cantidad).toBe(90);
  });

  it('si el candado se niega, no se escribe un total que puede estar viejo', async () => {
    const { servicio, manager, pasos } = armar(-1);
    await expect(
      servicio.sincronizarResumen('p', 'a', 'e', manager),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(pasos).not.toContain('SAVE');
  });

  it('fuera de una transacción sigue funcionando como antes', async () => {
    /*
     * `recalcularTodoElStock` llama sin manager, y es un script de corrección
     * de datos: no puede quedarse sin camino porque se le añadió un candado
     * que allí no tiene a qué transacción pertenecer.
     */
    const { servicio, pasos } = armar();
    await servicio.sincronizarResumen('p', 'a', 'e');
    expect(pasos).toContain('SAVE');
    expect(pasos.some((x) => x.startsWith('CANDADO'))).toBe(false);
  });
});
