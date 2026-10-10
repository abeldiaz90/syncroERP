/**
 * ============================================================================
 * Producir no puede evaporar el valor del inventario
 * ----------------------------------------------------------------------------
 * `producir` descontaba los insumos y devolvía el costo. Nada más.
 * `registrarSalida` no encola asiento a propósito —lo encola quien tiene el
 * documento—, y aquí no había nadie: cada producción bajaba el valor del
 * almacén y el mayor seguía valorando la mercancía como si los insumos
 * siguieran ahí.
 *
 * Y faltaba la otra mitad, que el barrido no vio: tampoco se registraba lo
 * producido. Los insumos salían y el producto terminado no entraba por ningún
 * lado. El valor no cambiaba de renglón: desaparecía.
 *
 * Lo que decide a dónde va ese valor es el catálogo. Si lo producido se
 * almacena, entra al almacén con el costo REAL de los lotes consumidos y el
 * mayor no tiene nada que hacer. Si no se almacena —un KIT de barra, un
 * servicio—, el costo es un consumo de verdad y tiene que llegar al mayor.
 * ============================================================================
 */
import { RecetasService } from './services/recetas.service';
import { TipoProducto } from '../catalogo/entities/producto.entity';
import { TipoAsiento } from '../finanzas/entities/asiento-pendiente.entity';

const EMPRESA = 'empresa-1';

function armar(tipo: TipoProducto | null, opciones: { activa?: boolean } = {}) {
  const receta: any = {
    id: 'rec-1',
    productoId: 'prod-kit',
    productoNombre: 'Salsa de la casa',
    rendimiento: 1,
    activa: opciones.activa ?? true,
    insumos: [
      { insumoId: 'ins-1', insumoNombre: 'Tomate', cantidad: 2, mermaPorcentaje: 0, unidad: 'kg' },
      { insumoId: 'ins-2', insumoNombre: 'Chile', cantidad: 1, mermaPorcentaje: 0, unidad: 'kg' },
    ],
  };
  const recetaRepo: any = {
    findOne: async ({ where }: any) =>
      where?.activa === true && !receta.activa ? null : receta,
  };
  const inventario: any = {
    registrarSalida: jest.fn(async (_p: string, _a: string, cantidad: number) => ({
      mensaje: 'ok',
      cantidadTotal: cantidad,
      costoTotal: cantidad * 30,
      costoUnitarioPromedio: 30,
      consumos: [],
    })),
    registrarCompra: jest.fn(async () => ({ mensaje: 'ok' })),
  };
  const asientos: any = { encolarEnTransaccion: jest.fn(async () => ({ id: 'ev-1' })) };
  const manager: any = {
    findOne: async () => (tipo ? { id: 'prod-kit', nombre: 'Salsa de la casa', tipo } : null),
  };
  const dataSource: any = { transaction: (fn: any) => fn(manager) };
  const servicio = new RecetasService(recetaRepo, inventario, dataSource, asientos);
  return { servicio, inventario, asientos };
}

const dto = { productoId: 'prod-kit', cantidad: 10, almacenId: 'alm-1' } as any;

describe('Producir · el valor de los insumos tiene a dónde ir', () => {
  it('lo que se almacena entra al almacén con el costo real de los lotes', async () => {
    const { servicio, inventario, asientos } = armar(TipoProducto.FISICO);

    const r = await servicio.producir(dto, EMPRESA, 'u1');

    // 2 kg + 1 kg por 10 unidades = 30 kg a 30 = 900
    expect(r.costoTotal).toBe(900);
    expect(inventario.registrarCompra).toHaveBeenCalledTimes(1);
    const entrada = inventario.registrarCompra.mock.calls[0];
    expect(entrada[0]).toBe('prod-kit');
    expect(entrada[2]).toBe(10);           // cantidad producida
    expect(entrada[9]).toBe(90);           // costo unitario = 900 / 10
    expect(entrada[12]).toBe('u1');        // quién produjo

    /*
     * Y NO se encola asiento: el valor sólo cambió de renglón dentro del
     * inventario. Encolar uno aquí duplicaría el movimiento en el mayor.
     */
    expect(asientos.encolarEnTransaccion).not.toHaveBeenCalled();
  });

  it('lo que NO se almacena manda el costo al mayor, con un renglón por insumo', async () => {
    const { servicio, inventario, asientos } = armar(TipoProducto.KIT);

    const r = await servicio.producir(dto, EMPRESA, 'u1');

    expect(inventario.registrarCompra).not.toHaveBeenCalled();
    expect(asientos.encolarEnTransaccion).toHaveBeenCalledTimes(1);
    const [, tipoAsiento, carga] = asientos.encolarEnTransaccion.mock.calls[0];
    expect(tipoAsiento).toBe(TipoAsiento.SALIDA_INVENTARIO);
    expect(carga.tipo).toBe('CONSUMO');
    expect(carga.detalles).toEqual([
      { productoId: 'ins-1', cantidad: 20, costoUnitario: 30 },
      { productoId: 'ins-2', cantidad: 10, costoUnitario: 30 },
    ]);
    // Y se dice en la respuesta, para que la pantalla no prometa existencias.
    expect(r.advertencias.join(' ')).toMatch(/no se almacena/);
  });

  it('ninguna producción se queda sin destino para el valor', async () => {
    /*
     * En negativo a propósito: no se cuenta que haya una entrada o un asiento,
     * se mide que no exista un camino mudo. Si mañana aparece un tercer tipo de
     * producto, esto se pone rojo en vez de dejar que el valor se evapore.
     */
    for (const tipo of Object.values(TipoProducto)) {
      const { servicio, inventario, asientos } = armar(tipo);
      await servicio.producir(dto, EMPRESA, 'u1');
      const entradas = inventario.registrarCompra.mock.calls.length;
      const encolados = asientos.encolarEnTransaccion.mock.calls.length;
      expect({ tipo, destinos: entradas + encolados }).toEqual({ tipo, destinos: 1 });
    }
  });

  it('una receta retirada ya no puede descontar insumos por esta puerta', async () => {
    const { servicio, inventario } = armar(TipoProducto.FISICO, { activa: false });
    await expect(servicio.producir(dto, EMPRESA, 'u1')).rejects.toThrow(/receta activa/);
    expect(inventario.registrarSalida).not.toHaveBeenCalled();
  });
});
