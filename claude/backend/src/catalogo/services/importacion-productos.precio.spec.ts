import { ImportacionProductosService } from './importacion-productos.service';
import { ListaPrecio } from '../entities/lista-precio.entity';
import { Producto, TipoProducto } from '../entities/producto.entity';
import { ProductoPrecio } from '../entities/producto-precio.entity';

describe('ImportacionProductosService · precio de venta', () => {
  const construir = (dataSource: any = {}) =>
    new ImportacionProductosService(
      dataSource,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

  it('mapea tipoProducto a la columna real tipo', () => {
    const service = construir();
    const entidad = (service as any).aEntidad({
      sku: 'SKU-1',
      nombre: 'Producto',
      tipoProducto: TipoProducto.FISICO,
      unidadMedida: 'PIEZA',
    });

    expect(entidad.tipo).toBe(TipoProducto.FISICO);
    expect(entidad.tipoProducto).toBeUndefined();
  });

  it('rechaza un precio de venta capturado en cero', () => {
    const service = construir();
    const errores = (service as any).validarFila(
      {
        sku: 'SKU-1',
        nombre: 'Producto',
        tipoProducto: TipoProducto.FISICO,
        unidadMedida: 'PIEZA',
        precioVenta: 0,
      },
      4,
    );

    expect(errores).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ campo: 'precioVenta' }),
      ]),
    );
  });

  it('guarda el precio importado en la lista predeterminada', async () => {
    const lista = {
      id: 'lista-1',
      empresaId: 'empresa-1',
      nombre: 'Público General',
      esPorDefecto: true,
    };
    const producto = {
      id: 'producto-1',
      empresaId: 'empresa-1',
      sku: 'SKU-1',
    };
    const em = {
      findOne: jest.fn(async (entidad) => {
        if (entidad === ListaPrecio) return lista;
        if (entidad === Producto) return producto;
        if (entidad === ProductoPrecio) return null;
        return null;
      }),
      update: jest.fn().mockResolvedValue(undefined),
      create: jest.fn((_entidad, datos) => ({ ...datos })),
      save: jest.fn(async (valor) => valor),
    };
    const dataSource = {
      transaction: jest.fn(async (operacion) => operacion(em)),
    };
    const service = construir(dataSource);
    jest.spyOn(service as any, 'parsear').mockResolvedValue([
      {
        sku: producto.sku,
        nombre: 'Producto',
        tipoProducto: TipoProducto.FISICO,
        unidadMedida: 'PIEZA',
        precioVenta: 149.5,
        activo: 'SI',
      },
    ]);
    jest.spyOn(service as any, 'cargarCatalogos').mockResolvedValue({
      unidades: new Map([['pieza', 'unidad-1']]),
      marcas: new Map(),
      categorias: new Map(),
      impuestos: new Map(),
    });

    const resultado = await service.procesar(
      Buffer.from('archivo'),
      'empresa-1',
      'aplicar',
    );

    expect(resultado.actualizados).toBe(1);
    expect(em.save).toHaveBeenCalledWith(
      expect.objectContaining({
        productoId: producto.id,
        listaPrecioId: lista.id,
        precio: 149.5,
      }),
    );
  });
});
