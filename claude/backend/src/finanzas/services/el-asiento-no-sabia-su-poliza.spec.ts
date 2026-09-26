/**
 * ============================================================================
 * El asiento no sabía cuál era su póliza
 * ----------------------------------------------------------------------------
 * `asientos_pendientes` es la bitácora que une una operación de negocio —una
 * recepción de compra, un cobro, una venta— con la póliza que la registró.
 * Tiene su columna `polizaId`, el servicio la escribe
 * (`a.polizaId = polizaId ?? a.polizaId`), el endpoint la publica y la
 * pantalla la muestra.
 *
 * Medido contra la instalación el 25-sep-2026: **36 de 36 asientos en estado
 * GENERADO tenían `polizaId` en null.** Ninguno. Ni los resueltos a mano ni
 * los resueltos por el cron.
 *
 * La causa no estaba en el servicio sino en el contrato de abajo.
 * `ejecutar()` promete `Promise<string | undefined>` y lee el id del
 * resultado del motor; pero trece de los quince `generarAsientoDe*` del motor
 * contable estaban declarados `Promise<void>` y descartaban el id que
 * `crearPoliza` sí devolvía. Dos de los quince —ajuste de inventario y
 * depreciación— sí lo devolvían, que es la señal de que el enlace se pensó y
 * se quedó a medias.
 *
 * El efecto es de auditoría: la póliza existe y guarda su `origenClave`, así
 * que el rastro se puede reconstruir hacia atrás; pero hacia adelante —de la
 * recepción a su póliza, que es como lo pregunta un auditor— la tabla
 * contestaba «no sé» mientras afirmaba «generado».
 * ============================================================================
 */
import { AsientosPendientesService } from './asientos-pendientes.service';
import { EstadoAsiento, TipoAsiento } from '../entities/asiento-pendiente.entity';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('el asiento generado conserva el id de su póliza', () => {
  it('ejecutar devuelve el id que el motor contable produjo', async () => {
    const servicio = new AsientosPendientesService({} as any, {
      generarAsientoDeCompra: jest.fn().mockResolvedValue('POL-77'),
    } as any);

    const id = await (servicio as any).ejecutar(TipoAsiento.COMPRA, {
      fecha: '2026-09-21T18:34:07.490Z',
    });

    expect(id).toBe('POL-77');
  });

  it('al reintentar a mano, la póliza queda enlazada en la bitácora', async () => {
    const asiento: any = {
      id: 'pend-1',
      empresaId: 'emp-1',
      tipo: TipoAsiento.COMPRA,
      estado: EstadoAsiento.FALLIDO,
      payload: JSON.stringify({ fecha: '2026-09-21T18:34:07.490Z' }),
      intentos: 1,
      ultimoError: 'Faltaba la cuenta de inventario.',
      polizaId: null,
      proximoIntento: null,
    };
    const repo: any = {
      findOne: jest.fn().mockResolvedValue(asiento),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      save: jest.fn(async (v: any) => v),
    };
    const servicio = new AsientosPendientesService(repo, {
      generarAsientoDeCompra: jest.fn().mockResolvedValue('POL-88'),
    } as any);

    const r: any = await servicio.reintentarAhora('pend-1', 'emp-1');

    expect(r.generado).toBe(true);
    expect(r.polizaId).toBe('POL-88');
    expect(asiento.polizaId).toBe('POL-88');
  });

  it('ningún generador del motor contable tira el id de la póliza', () => {
    const fuente = readFileSync(
      join(__dirname, 'motor-contable.service.ts'),
      'utf8',
    );
    const lineas = fuente.split('\n');
    const generadores = lineas.flatMap((linea, i) => {
      const nombre = linea.match(/async (generarAsientoDe[A-Za-z]+)\(/);
      if (!nombre) return [];
      // La firma puede abarcar decenas de líneas cuando el parámetro es un
      // objeto literal; se busca hacia abajo el cierre de la firma.
      for (let j = i; j < Math.min(i + 60, lineas.length); j++) {
        const cierre = lineas[j].match(/\)\s*:\s*(Promise<[^>]*>)\s*\{\s*$/);
        if (cierre) return [{ nombre: nombre[1], tipo: cierre[1] }];
        if (/\)\s*\{\s*$/.test(lineas[j])) {
          return [{ nombre: nombre[1], tipo: '(sin anotación de retorno)' }];
        }
      }
      return [{ nombre: nombre[1], tipo: '(firma no reconocida)' }];
    });

    // Si el reconocimiento se rompe, la prueba no debe volverse verde por vacía.
    expect(generadores.length).toBeGreaterThanOrEqual(15);

    const mudos = generadores.filter(
      (g) => !/Promise<\s*string\s*\|\s*undefined\s*>/.test(g.tipo),
    );
    expect(mudos.map((g) => `${g.nombre}: ${g.tipo}`)).toEqual([]);
  });

  it('cuando la operación produce dos pólizas, devuelve la que la representa', () => {
    /*
     * Una venta genera dos: el ingreso y el consumo de inventario. La bitácora
     * guarda UNA, y tiene que ser la que alguien busca al preguntar «¿dónde
     * quedó registrada esta venta?».
     *
     * Medido en vivo el 25-sep-2026 con la primera venta del sistema (ticket
     * #11): `asientos_pendientes` apuntaba a `DI-2026-00020 · Costo de
     * ventas`, no a `IN-2026-00019 · Ingresos`. El id se capturaba en la
     * primera llamada por orden de escritura, que es la del costo.
     *
     * Se comprueba sobre la fuente porque el orden de escritura es justo lo
     * que se quiere fijar: la captura va en la póliza principal.
     */
    const fuente = readFileSync(
      join(__dirname, 'motor-contable.service.ts'),
      'utf8',
    );
    const lineas = fuente.split('\n');
    const conceptoDe = (i: number) => {
      for (let j = i; j < Math.min(i + 8, lineas.length); j++) {
        const m = lineas[j].match(/concepto:\s*[`']([^`']+)/);
        if (m) return m[1];
      }
      return '';
    };

    const capturadas = lineas.flatMap((l, i) =>
      /idPolizaGenerada = await this\.crearPoliza\(\{/.test(l)
        ? [conceptoDe(i)]
        : [],
    );

    expect(capturadas.length).toBeGreaterThanOrEqual(10);
    // Ninguna póliza secundaria —el costo o su reversa— puede ser la que se
    // guarda como «la póliza de la operación».
    const secundarias = capturadas.filter((c) =>
      /Costo de ventas|Reversión de costo|Costo de devolución/.test(c),
    );
    expect(secundarias).toEqual([]);

    // Y las principales de venta sí están capturadas.
    expect(capturadas.some((c) => c.startsWith('Ingresos'))).toBe(true);
    expect(capturadas.some((c) => c.startsWith('Reversión de ingreso'))).toBe(
      true,
    );
  });
});
