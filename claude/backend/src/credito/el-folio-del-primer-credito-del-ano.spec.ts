/**
 * ============================================================================
 * `FOR UPDATE` sobre una consulta sin filas no bloquea nada
 * ----------------------------------------------------------------------------
 * `setLock('pessimistic_write')` bloquea las FILAS QUE DEVUELVE la consulta. Si
 * no devuelve ninguna —el primer crédito de la empresa, o el primero de un año
 * nuevo, que ocurre el 1 de enero de cada año— no hay nada que bloquear y dos
 * transacciones simultáneas leen las dos «ninguno» y generan las dos
 * `CRD-2026-0001`.
 *
 * No producía folios duplicados porque lo atajaba el índice único: la segunda
 * transacción reventaba con un error de base de datos en la cara de quien
 * estaba dando de alta el crédito, a mitad de una venta. O sea que el candado
 * no protegía, sólo convertía una carrera en una caída.
 * ============================================================================
 */
import { CreditosService } from './services/creditos.service';

function armar(ultimo?: string, resultadoDelCandado = 0) {
  const consultas: Array<{ sql: string; params?: unknown[] }> = [];
  const repo = {
    createQueryBuilder: () => {
      const api: any = {};
      for (const m of ['where', 'andWhere', 'orderBy', 'setLock']) api[m] = () => api;
      api.getOne = async () => (ultimo ? { folio: ultimo } : null);
      return api;
    },
  };
  const manager: any = {
    query: async (sql: string, params?: unknown[]) => {
      consultas.push({ sql, params });
      return [{ resultado: resultadoDelCandado }];
    },
    getRepository: () => repo,
  };
  const servicio = Object.create(CreditosService.prototype);
  (servicio as any).creditoRepo = { ...repo, manager };
  return { servicio, manager, consultas };
}

describe('Folio del crédito', () => {
  it('reserva por NOMBRE, que funciona aunque no haya ninguna fila', async () => {
    const { servicio, manager, consultas } = armar(undefined);
    const folio = await (servicio as any).generarFolio('e1', manager, 2026);

    expect(folio).toBe('CRD-2026-0001');
    expect(consultas[0].sql).toMatch(/pg_advisory_xact_lock/);
    expect(consultas[0].params).toEqual(['FOLIO_CREDITO:e1:2026']);
  });

  it('continúa la numeración cuando ya hay créditos', async () => {
    const { servicio, manager } = armar('CRD-2026-0041');
    expect(await (servicio as any).generarFolio('e1', manager, 2026)).toBe('CRD-2026-0042');
  });

  it('el año es el de la fecha de inicio, no el del reloj', async () => {
    /*
     * Un crédito capturado el 2 de enero con fecha de inicio del 31 de
     * diciembre pertenece a la numeración del año viejo, que es donde lo van a
     * buscar.
     */
    const { servicio, manager, consultas } = armar('CRD-2025-0120');
    const folio = await (servicio as any).generarFolio('e1', manager, 2025);
    expect(folio).toBe('CRD-2025-0121');
    expect(consultas[0].params).toEqual(['FOLIO_CREDITO:e1:2025']);
  });

  it('si el candado se niega, no nace ningún folio', async () => {
    const { servicio, manager } = armar(undefined, -1);
    await expect(
      (servicio as any).generarFolio('e1', manager, 2026),
    ).rejects.toThrow(/folio del crédito/);
  });
});
