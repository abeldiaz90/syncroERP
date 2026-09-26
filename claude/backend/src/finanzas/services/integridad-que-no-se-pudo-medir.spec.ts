/**
 * ============================================================================
 * Lo que no se pudo medir no es «saludable»
 * ----------------------------------------------------------------------------
 * `IntegridadFinancieraService` corre doce comprobaciones con `Promise.all` y
 * cada una cuenta filas. Tal como estaba, el panel tenía dos finales posibles
 * y ninguno decía la verdad cuando una consulta no podía ejecutarse:
 *
 *   · si una tabla no existe en esa instalación —hotelería y city ledger son
 *     módulos opcionales— `Promise.all` rechaza y la pantalla pierde las once
 *     comprobaciones que sí se podían hacer, con un error genérico;
 *
 *   · y si alguien "arreglaba" eso con un `.catch(() => 0)`, la comprobación
 *     rota se contaría como cero hallazgos y el encabezado diría SALUDABLE
 *     sobre doce comprobaciones de las que sólo corrieron once. Un control que
 *     no se pudo ejecutar no es un control que salió bien.
 *
 * Lo que se exige aquí: cada comprobación responde por sí misma, y la que no
 * se pudo medir se declara NO_MEDIBLE, aparece en la lista y le prohíbe al
 * panel declararse saludable.
 * ============================================================================
 */
import { IntegridadFinancieraService } from './integridad-financiera.service';

describe('Integridad financiera · una comprobación que no corrió', () => {
  function crear(fallan: RegExp[] = []) {
    const query = jest.fn((sql: string) => {
      if (fallan.some((r) => r.test(sql))) {
        return Promise.reject(
          new Error('relation "hoteleria_city_ledger_cuentas" does not exist'),
        );
      }
      return Promise.resolve([{ cantidad: '0' }]);
    });
    const servicio = new IntegridadFinancieraService({ query } as any);
    return { servicio, query };
  }

  it('sin nada roto y sin hallazgos, el panel sale saludable', async () => {
    const { servicio } = crear();
    const r: any = await servicio.diagnosticar('e1');
    expect(r.estado).toBe('SALUDABLE');
    expect(r.resumen.noMedibles).toBe(0);
    expect(r.hallazgos).toEqual([]);
  });

  it('una tabla ausente no derriba las demás comprobaciones', async () => {
    /*
     * Se cuenta contra el panel sano, no contra un número escrito a mano: el
     * 12 de antes convertía «añadir una comprobación» en «arreglar esta
     * prueba», y lo que aquí importa es que el total no CAMBIE porque una
     * tabla falte —la que no se puede medir sigue estando en la lista, con su
     * estado—, no cuántas haya.
     */
    const { servicio: sano } = crear();
    const total: number = ((await sano.diagnosticar('e1')) as any).comprobaciones;
    expect(total).toBeGreaterThan(5);

    const { servicio } = crear([/city_ledger/]);
    const r: any = await servicio.diagnosticar('e1');
    expect(r.comprobaciones).toBe(total);
    expect(r.resumen.noMedibles).toBeGreaterThan(0);
  });

  it('lo que no se pudo medir impide declarar el panel saludable', async () => {
    const { servicio } = crear([/city_ledger/]);
    const r: any = await servicio.diagnosticar('e1');
    expect(r.estado).toBe('INCOMPLETO');
    const sinMedir = r.hallazgos.filter((h: any) => h.estado === 'NO_MEDIBLE');
    expect(sinMedir.length).toBeGreaterThan(0);
    // Y dice por qué, para que se pueda corregir sin abrir el servidor.
    expect(sinMedir[0].detalle).toMatch(/does not exist/);
  });

  it('un hallazgo real pesa más que uno sin medir', async () => {
    const query = jest.fn((sql: string) => {
      if (/city_ledger/.test(sql)) return Promise.reject(new Error('sin tabla'));
      if (/asientos_pendientes/.test(sql)) {
        return Promise.resolve([{ cantidad: '3' }]);
      }
      return Promise.resolve([{ cantidad: '0' }]);
    });
    const servicio = new IntegridadFinancieraService({ query } as any);
    const r: any = await servicio.diagnosticar('e1');
    expect(r.estado).toBe('BLOQUEADO');
    expect(r.resumen.criticos).toBe(3);
  });
});
