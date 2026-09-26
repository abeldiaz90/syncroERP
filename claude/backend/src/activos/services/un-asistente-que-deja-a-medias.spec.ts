import { ActivosService } from './activos.service';

/**
 * ============================================================================
 * Un asistente que deja a medias justo la parte que no se ve
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ, medido el 26-sep-2026
 *
 * La pantalla de activos fijos, sin categorías, ofrece un botón: «Crear las
 * siete categorías estándar». Se pulsa, contesta «7 creadas», la advertencia
 * desaparece y la pantalla queda como si estuviera configurada.
 *
 * Las siete se creaban con su tasa del art. 34 LISR y con las TRES CUENTAS
 * CONTABLES EN `null`:
 *
 *   cuentaActivoId: null
 *   cuentaDepreciacionAcumuladaId: null
 *   cuentaGastoDepreciacionId: null
 *
 * Eso no se nota hasta la primera corrida mensual, cuando el asiento no se
 * puede armar —nadie sabe contra qué cuenta cargar el gasto ni cuál acumulada
 * abonar— y la depreciación se queda en la bandeja de asientos pendientes.
 * Entre el clic y el descubrimiento pueden pasar semanas.
 *
 * Un asistente que resuelve lo visible y deja pendiente lo invisible es peor
 * que no tener asistente: el que no existe se nota.
 *
 * LA REGLA
 *
 * Si un botón dice «crear las categorías estándar», las deja utilizables. Las
 * cuentas se resuelven por `codigoAgrupadorSAT` —el único identificador estable
 * del catálogo, porque el número de cuenta lo puede cambiar la empresa— y lo
 * que no se encuentre se dice en voz alta, no se deja en silencio.
 * ============================================================================
 */

/** El catálogo SAT reducido a lo que este sembrado necesita. */
const CATALOGO: Record<string, { id: string }> = {
  '151.01': { id: 'cta-terrenos' },
  '152.01': { id: 'cta-edificios' },
  '153.01': { id: 'cta-maquinaria' },
  '154.01': { id: 'cta-transporte' },
  '155.01': { id: 'cta-mobiliario' },
  '156.01': { id: 'cta-computo' },
  '164.01': { id: 'cta-herramental' },
  '171.01': { id: 'cta-dep-edificios' },
  '171.02': { id: 'cta-dep-maquinaria' },
  '171.03': { id: 'cta-dep-transporte' },
  '171.04': { id: 'cta-dep-mobiliario' },
  '171.05': { id: 'cta-dep-computo' },
  '171.12': { id: 'cta-dep-herramental' },
  '504.07': { id: 'cta-gasto-edificios' },
  '504.08': { id: 'cta-gasto-maquinaria' },
  '504.09': { id: 'cta-gasto-transporte' },
  '504.10': { id: 'cta-gasto-mobiliario' },
  '504.11': { id: 'cta-gasto-computo' },
  '504.18': { id: 'cta-gasto-herramental' },
};

function crear(opciones: { existentes?: any[]; sinCuentas?: string[] } = {}) {
  const guardadas: any[] = [...(opciones.existentes ?? [])];
  const repoCategorias: any = {
    findOne: jest.fn(async ({ where }: any) =>
      guardadas.find((c) => c.clave === where.clave) ?? null,
    ),
    create: jest.fn((v: any) => ({ ...v })),
    save: jest.fn(async (v: any) => {
      const i = guardadas.findIndex((c) => c.clave === v.clave);
      if (i >= 0) guardadas[i] = v;
      else guardadas.push(v);
      return v;
    }),
  };
  const repoCuentas: any = {
    findOne: jest.fn(async ({ where }: any) => {
      const codigo = where.codigoAgrupadorSAT;
      if ((opciones.sinCuentas ?? []).includes(codigo)) return null;
      return CATALOGO[codigo] ?? null;
    }),
  };
  const dataSource: any = {
    getRepository: () => repoCuentas,
  };
  const servicio = new ActivosService(
    {} as any,
    repoCategorias,
    {} as any,
    dataSource,
    {} as any,
  );
  return { servicio, guardadas };
}

describe('Activos fijos · el sembrado deja las categorías utilizables', () => {
  it('cada categoría depreciable nace con sus tres cuentas', async () => {
    const { servicio, guardadas } = crear();
    const r: any = await servicio.sembrarCategorias('e1');

    expect(r.creadas).toBe(7);
    const sinCuentas = guardadas
      .filter((c) => c.clave !== 'TERR')
      .filter(
        (c) =>
          !c.cuentaActivoId ||
          !c.cuentaDepreciacionAcumuladaId ||
          !c.cuentaGastoDepreciacionId,
      )
      .map((c) => c.clave);

    expect(sinCuentas).toEqual([]);
  });

  it('cada clave apunta a la cuenta que le toca', async () => {
    const { servicio, guardadas } = crear();
    await servicio.sembrarCategorias('e1');
    const porClave = Object.fromEntries(guardadas.map((c) => [c.clave, c]));

    expect(porClave.COMP.cuentaActivoId).toBe('cta-computo');
    expect(porClave.COMP.cuentaDepreciacionAcumuladaId).toBe('cta-dep-computo');
    expect(porClave.COMP.cuentaGastoDepreciacionId).toBe('cta-gasto-computo');
    expect(porClave.TRAN.cuentaActivoId).toBe('cta-transporte');
    expect(porClave.EDIF.cuentaDepreciacionAcumuladaId).toBe('cta-dep-edificios');
  });

  it('un terreno tiene cuenta de activo y ninguna de depreciación', async () => {
    // No se deprecia: darle cuenta de gasto sería invitar a un asiento falso.
    const { servicio, guardadas } = crear();
    await servicio.sembrarCategorias('e1');
    const terr = guardadas.find((c) => c.clave === 'TERR');

    expect(terr.cuentaActivoId).toBe('cta-terrenos');
    expect(terr.cuentaDepreciacionAcumuladaId).toBeUndefined();
    expect(terr.cuentaGastoDepreciacionId).toBeUndefined();
  });

  it('completa las categorías que ya existían sin cuentas', async () => {
    /*
     * El caso real: quien ya pulsó el botón antes del arreglo tiene las siete
     * categorías creadas y vacías. Volver a pulsarlo tiene que repararlas, no
     * contestar «0 creadas» y dejarlo igual.
     */
    const { servicio, guardadas } = crear({
      existentes: [
        { clave: 'COMP', nombre: 'Equipo de cómputo', tasaAnual: 30 },
      ],
    });
    const r: any = await servicio.sembrarCategorias('e1');

    expect(r.completadas).toContain('COMP');
    const comp = guardadas.find((c) => c.clave === 'COMP');
    expect(comp.cuentaGastoDepreciacionId).toBe('cta-gasto-computo');
  });

  it('no pisa una cuenta que el contador ya eligió', async () => {
    const { servicio, guardadas } = crear({
      existentes: [
        {
          clave: 'COMP',
          nombre: 'Equipo de cómputo',
          tasaAnual: 30,
          cuentaGastoDepreciacionId: 'cta-que-eligio-el-contador',
        },
      ],
    });
    await servicio.sembrarCategorias('e1');
    const comp = guardadas.find((c) => c.clave === 'COMP');

    expect(comp.cuentaGastoDepreciacionId).toBe('cta-que-eligio-el-contador');
    // Y las que sí faltaban se completan igual.
    expect(comp.cuentaActivoId).toBe('cta-computo');
  });

  it('lo que no está en el catálogo se dice, no se calla', async () => {
    const { servicio } = crear({ sinCuentas: ['504.11'] });
    const r: any = await servicio.sembrarCategorias('e1');

    expect(r.sinCuentaEnElCatalogo.join(' ')).toContain('COMP');
    expect(r.sinCuentaEnElCatalogo.join(' ')).toContain('504.11');
  });
});
