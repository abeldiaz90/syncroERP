import { IsSqlServerGuidOpcional } from '../../common/validators/sql-server-guid.validator';

/**
 * ============================================================================
 * Las cuentas contables de una categoría de producto
 * ----------------------------------------------------------------------------
 * Viven en su propio endpoint —`PATCH /catalogo/categorias/:id/cuentas`— y no
 * en el PATCH general de la categoría, por una razón de separación de
 * funciones que no se ve hasta que alguien la usa mal.
 *
 * El PATCH general pertenece al módulo «Inventario», que el almacenista tiene
 * completo: es su catálogo, él crea y renombra categorías. Pero el mismo
 * cuerpo aceptaba las cinco cuentas —ventas, costo de ventas, inventario,
 * devoluciones y mermas—, que son las que el motor contable usa para decidir
 * a qué cuenta se va cada venta y cada salida de almacén. Es decir: quien
 * acomoda la mercancía podía cambiar, sin querer y sin que nadie se entere,
 * dónde aterriza el costo de toda una familia de productos. Eso no se detecta
 * en el almacén; se detecta en el cierre, cuando la balanza ya no cuadra.
 *
 * Esta ruta cuelga de `/catalogo/categorias/:id/cuentas`, declarada en el
 * catálogo de módulos dentro de «Contabilidad». El prefijo es más largo que
 * `/catalogo`, así que gana, y la acción queda del lado de quien responde por
 * los estados financieros.
 * ============================================================================
 */
export class ActualizarCuentasCategoriaDto {
  @IsSqlServerGuidOpcional()
  cuentaVentasId?: string;

  @IsSqlServerGuidOpcional()
  cuentaCostoVentasId?: string;

  @IsSqlServerGuidOpcional()
  cuentaInventarioId?: string;

  @IsSqlServerGuidOpcional()
  cuentaDevolucionesId?: string;

  @IsSqlServerGuidOpcional()
  cuentaMermasId?: string;
}
