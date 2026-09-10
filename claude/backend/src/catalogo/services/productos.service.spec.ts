import { BadRequestException } from '@nestjs/common';
import { ProductosService } from './productos.service';

describe('ProductosService · separación maestro/inventario', () => {
  const service = new ProductosService(
    {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
  );

  it('no exige almacén al editar precios de un producto que ya tiene stock', () => {
    expect(() => (service as any).validarReglasProducto({ stockActual: 25, precios: [] }))
      .not.toThrow();
  });

  it('sí exige almacén al abrir stock durante la creación', () => {
    expect(() => (service as any).validarReglasProducto({ stockActual: 25 }, true))
      .toThrow(BadRequestException);
  });
});
