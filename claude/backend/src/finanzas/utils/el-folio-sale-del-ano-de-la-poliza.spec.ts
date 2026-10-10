/**
 * ============================================================================
 * El folio sale del año de la póliza, y las tres puertas comparten candado
 * ----------------------------------------------------------------------------
 * Las pólizas nacen por tres caminos y cada uno tenía su copia de la regla:
 *
 *  · `PolizasService.generarFolio` tomaba el año del RELOJ del servidor
 *    (`new Date().getFullYear()`) mientras la póliza guarda
 *    `anio = fecha.getFullYear()`. Una póliza de diciembre capturada en enero
 *    nacía con folio del año nuevo y campo `anio` del viejo.
 *  · Dos candados con llaves distintas —`POLIZA_FOLIO:…:DIARIO:…` en el motor,
 *    `FOLIO_POLIZA:…:DI:…` en la captura en transacción—. Dos textos distintos
 *    son dos candados distintos: no se excluían entre sí.
 *  · Y un tercer camino —la captura manual y la reversa— sin candado ninguno,
 *    leyendo el último folio FUERA de la transacción que creaba la póliza.
 * ============================================================================
 */
import { PolizasService } from '../services/polizas.service';
import {
  claveDeFolio,
  patronDeFolio,
  prefijoDePoliza,
  siguienteFolio,
} from './el-folio-de-la-poliza';

describe('La regla del folio, dicha una vez', () => {
  it('el prefijo es el del tipo, y el desconocido no revienta', () => {
    expect(prefijoDePoliza('DIARIO')).toBe('DI');
    expect(prefijoDePoliza('INGRESO')).toBe('IN');
    expect(prefijoDePoliza('EGRESO')).toBe('EG');
    expect(prefijoDePoliza('TRASPASO')).toBe('TR');
  });

  it('la llave del candado es la MISMA se pida con tipo o con prefijo', () => {
    /*
     * Éste es el defecto entero. Mientras el motor pidiera una llave y la
     * captura otra, las dos podían asignar el mismo folio a la vez, cada una
     * creyéndose serializada.
     */
    expect(claveDeFolio('e1', 'DIARIO', 2026)).toBe('FOLIO_POLIZA:e1:DI:2026');
    expect(claveDeFolio('e1', 'DI', 2026)).toBe('FOLIO_POLIZA:e1:DI:2026');
  });

  it('el patrón y el folio usan el mismo año que la llave', () => {
    expect(patronDeFolio('DIARIO', 2025)).toBe('DI-2025-%');
    expect(siguienteFolio('DIARIO', 2025, 'DI-2025-00041')).toBe('DI-2025-00042');
    expect(siguienteFolio('DIARIO', 2025, null)).toBe('DI-2025-00001');
  });
});

describe('PolizasService · generarFolio', () => {
  function armar(ultimo?: string) {
    const consultas: Array<{ sql: string; params?: unknown[] }> = [];
    const ejecutor = {
      query: async (sql: string, params?: unknown[]) => {
        consultas.push({ sql, params });
        if (/pg_advisory_xact_lock/.test(sql)) return [{ resultado: 0 }];
        return ultimo ? [{ folio: ultimo }] : [];
      },
    };
    const servicio = Object.create(PolizasService.prototype);
    return { servicio, ejecutor, consultas };
  }

  it('usa el año que se le pasa, no el del reloj', async () => {
    const { servicio, ejecutor } = armar('DI-2025-00007');
    const folio = await (servicio as any).generarFolio(ejecutor, 'e1', 'DIARIO', 2025);
    expect(folio).toBe('DI-2025-00008');
    expect(folio).not.toContain(String(new Date().getFullYear()));
  });

  it('toma el candado ANTES de leer el último folio, y con la llave compartida', async () => {
    const { servicio, ejecutor, consultas } = armar('DI-2026-00001');
    await (servicio as any).generarFolio(ejecutor, 'e1', 'DIARIO', 2026);

    expect(consultas.length).toBeGreaterThanOrEqual(2);
    expect(consultas[0].sql).toMatch(/pg_advisory_xact_lock/);
    expect(consultas[0].params).toEqual(['FOLIO_POLIZA:e1:DI:2026']);
    expect(consultas[1].sql).toMatch(/FROM polizas/);
    /* Y la lectura va por el MISMO ejecutor, o sea dentro de la transacción. */
    expect(consultas[1].params).toEqual(['e1', 'DI-2026-%']);
  });

  it('si el candado se niega, no se inventa ningún folio', async () => {
    const servicio = Object.create(PolizasService.prototype);
    const ejecutor = { query: async () => [{ resultado: -1 }] };
    await expect(
      (servicio as any).generarFolio(ejecutor, 'e1', 'DIARIO', 2026),
    ).rejects.toThrow(/folio contable/);
  });
});
