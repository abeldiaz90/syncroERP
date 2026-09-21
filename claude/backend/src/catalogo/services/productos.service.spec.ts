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
    /*
     * El repositorio de unidades es el SEXTO parametro del constructor, no el
     * octavo. El mock se pasaba en la ultima posicion y caia sobre
     * `asientos`, asi que `unidadRepository` quedaba en `{}` y las dos pruebas
     * fallaban con "this.unidadRepository.findOne is not a function" sin que
     * hubiera nada malo en el servicio.
     *
     * Las dependencias posicionales se desacomodan solas en cuanto alguien
     * agrega un parametro en medio. El orden aqui se mantiene igual al del
     * constructor y por eso va anotado.
     */
    const conCatalogo = (nombre: string | null) =>
      new ProductosService(
        {} as any, // producto
        {} as any, // imagenProducto
        {} as any, // atributo
        {} as any, // inventarioService
        {} as any, // categoria
        { findOne: async () => (nombre ? { nombre } : null) } as any, // unidadMedida
        {} as any, // dataSource
        {} as any, // asientos
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
