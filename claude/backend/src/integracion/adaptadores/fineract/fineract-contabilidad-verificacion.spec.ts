import { FineractContabilidadAdapter } from './fineract-contabilidad.adapter';
import { TipoVinculo } from '../../integracion.constants';

describe('Verificación contable de productos vinculados', () => {
  function escenario(parametros = {}, links: any[] = [], reglas: Record<string, number> = {}) {
    const get = jest.fn(async (ruta: string) => {
      if (ruta === '/v1/workingdays') return { repaymentRescheduleType: { id: 1 } };
      return { name: ruta, accountingRule: { id: reglas[ruta] ?? 1 } };
    });
    const find = jest.fn().mockResolvedValue(links);
    const adapter = new FineractContabilidadAdapter(
      { get } as any, {} as any,
      { findOne: jest.fn().mockResolvedValue({ oficinaContableExterna: '1', parametrosProveedor: parametros }) } as any,
      { find } as any,
    );
    return { adapter, get, find };
  }

  it('detecta contabilidad automática en productos del catálogo sin parámetros antiguos', async () => {
    const { adapter, find } = escenario({}, [{ entidadId: 'producto-erp', idExterno: '5' }], { '/v1/loanproducts/5': 2 });
    const avisos = await adapter.verificarConfiguracion('empresa-a');
    expect(find).toHaveBeenCalledWith({ where: { empresaId: 'empresa-a', tipo: TipoVinculo.PRODUCTO_CREDITO, proveedor: 'fineract' } });
    expect(avisos).toEqual([expect.objectContaining({ gravedad: 'ERROR', clave: 'contabilidad-duplicada:producto:producto-erp' })]);
  });

  it('deduplica vínculos y parámetros antiguos, y omite vínculos sin ID', async () => {
    const { adapter, get } = escenario({ productoMsiId: 4 }, [
      { entidadId: 'a', idExterno: '4' }, { entidadId: 'b', idExterno: '4' }, { entidadId: 'c', idExterno: null },
    ]);
    expect(await adapter.verificarConfiguracion('empresa-a')).toEqual([]);
    expect(get.mock.calls.filter(([ruta]) => ruta.startsWith('/v1/loanproducts/'))).toEqual([['/v1/loanproducts/4']]);
  });

  it('conserva compatibilidad con productos definidos en parámetros antiguos', async () => {
    const { adapter } = escenario({ productoCreditoSimpleId: 1 }, [], { '/v1/loanproducts/1': 3 });
    expect(await adapter.verificarConfiguracion('empresa-a')).toEqual([
      expect.objectContaining({ clave: 'contabilidad-duplicada:productoCreditoSimpleId' }),
    ]);
  });

  it('informa un producto vinculado ilegible sin omitir el calendario', async () => {
    const { adapter, get } = escenario({}, [{ entidadId: 'a', idExterno: '5' }]);
    get.mockRejectedValueOnce(new Error('Acceso denegado'));
    expect(await adapter.verificarConfiguracion('empresa-a')).toEqual([
      expect.objectContaining({ gravedad: 'ADVERTENCIA', clave: 'producto-ilegible:producto:a' }),
    ]);
    expect(get).toHaveBeenCalledWith('/v1/workingdays');
  });
});
