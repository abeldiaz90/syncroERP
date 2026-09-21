import { BadRequestException } from '@nestjs/common';
import { ProductosService } from './productos.service';

describe('ProductosService · separación maestro/inventario', () => {
  const service = new ProductosService(
    {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    // Repositorio de unidades de medida: lo usa `normalizarUnidad`, que resuelve
    // la unidad del producto contra el catálogo para que «PIEZA» y «Pieza» no
    // acaben siendo dos cosas distintas.
    {} as any,
  );

  it('no exige almacén al editar precios de un producto que ya tiene stock', () => {
    expect(() => (service as any).validarReglasProducto({ stockActual: 25, precios: [] }))
      .not.toThrow();
  });

  it('sí exige almacén al abrir stock durante la creación', () => {
    expect(() => (service as any).validarReglasProducto({ stockActual: 25 }, true))
      .toThrow(BadRequestException);
  });

  /*
   * La unidad se guardaba como la mandara quien la mandara, así que el catálogo
   * acabó con productos en «Pieza» y productos en «PIEZA». El desplegable de la
   * ficha arma sus opciones con los nombres del catálogo: el producto en
   * mayúsculas no coincidía, el campo salía vacío y deshabilitado —la unidad
   * base no se puede cambiar—, y al guardar el servidor exigía una unidad que
   * la pantalla no dejaba elegir. El producto quedaba imposible de editar.
   */
  describe('normaliza la unidad contra el catálogo', () => {
    const conCatalogo = (nombre: string | null) =>
      new ProductosService(
        {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
        { findOne: async () => (nombre ? { nombre } : null) } as any,
      );

    it('devuelve la grafía del catálogo aunque llegue en otra', async () => {
      const s = conCatalogo('Pieza');
      await expect((s as any).normalizarUnidad('PIEZA', 'e1')).resolves.toBe('Pieza');
      await expect((s as any).normalizarUnidad('  pieza ', 'e1')).resolves.toBe('Pieza');
    });

    it('respeta una unidad que el catálogo no tiene, sólo la recorta', async () => {
      const s = conCatalogo(null);
      await expect((s as any).normalizarUnidad(' Tambo ', 'e1')).resolves.toBe('Tambo');
    });

    it('no inventa unidad cuando no viene', async () => {
      const s = conCatalogo('Pieza');
      await expect((s as any).normalizarUnidad(undefined, 'e1')).resolves.toBeUndefined();
    });
  });
});
