import { PreciosService } from './precios.service';
import { TipoProducto } from '../entities/producto.entity';

describe('PreciosService · integridad del punto de venta', () => {
  const producto = {
    id: 'producto-1',
    empresaId: 'empresa-1',
    nombre: 'Producto de prueba',
    tipo: TipoProducto.FISICO,
    activo: true,
    impuestoId: 'iva-16',
    impuesto: { nombre: 'IVA 16%', porcentaje: 16 },
  };

  it('recupera una lista existente cuando la empresa no tenía predeterminada', async () => {
    const lista = {
      id: 'lista-1',
      empresaId: 'empresa-1',
      nombre: 'Público General',
      esPorDefecto: false,
    };
    const productoRepo = { findOne: jest.fn().mockResolvedValue(producto) };
    const precioRepo = {
      find: jest
        .fn()
        .mockResolvedValue([
          { productoId: producto.id, listaPrecioId: lista.id, precio: 199.99 },
        ]),
    };
    const listaRepo = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(lista),
      save: jest.fn(async (valor) => valor),
    };
    const service = new PreciosService(
      productoRepo as any,
      precioRepo as any,
      listaRepo as any,
    );

    const resultado = await service.consultarPrecio(
      producto.id,
      producto.empresaId,
    );

    expect(resultado).toMatchObject({
      precioUnitario: 199.99,
      listaPrecioId: lista.id,
      sinPrecio: false,
    });
    expect(listaRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ esPorDefecto: true }),
    );
  });

  it('normaliza el rol y no exige inventario físico a un servicio', async () => {
    const servicio = {
      ...producto,
      id: 'servicio-1',
      nombre: 'Instalación',
      tipo: TipoProducto.SERVICIO,
    };
    const productoRepo = { find: jest.fn().mockResolvedValue([servicio]) };
    const precioRepo = {
      find: jest
        .fn()
        .mockResolvedValue([
          { productoId: servicio.id, listaPrecioId: 'lista-1', precio: 100 },
        ]),
    };
    const listaRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'lista-1',
        empresaId: 'empresa-1',
        esPorDefecto: true,
      }),
    };
    const service = new PreciosService(
      productoRepo as any,
      precioRepo as any,
      listaRepo as any,
    );

    const resultado = await service.resolverVenta(
      [
        {
          productoId: servicio.id,
          cantidad: 1,
          descuentoPorcentaje: 10,
        },
      ],
      'empresa-1',
      { rolUsuario: 'gerente' },
    );

    expect(resultado.detalles[0]).toMatchObject({
      precioUnitario: 100,
      descuento: 10,
      controlaInventario: false,
    });
    expect(resultado.listaPrecioId).toBe('lista-1');
  });
});
