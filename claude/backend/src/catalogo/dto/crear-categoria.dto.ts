import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { IsSqlServerGuidOpcional } from '../../common/validators/sql-server-guid.validator';

/**
 * Los datos de la categoría que maneja quien maneja el catálogo: cómo se
 * llama, qué describe y de quién cuelga.
 *
 * Las cuentas contables NO están aquí a propósito. Se cambian en
 * `PATCH /catalogo/categorias/:id/cuentas`, que pertenece a Contabilidad.
 * `ActualizarCuentasCategoriaDto` explica por qué.
 */
export class CrearCategoriaDto {
  @IsString()
  @IsNotEmpty()
  nombre!: string;

  @IsString()
  @IsOptional()
  descripcion?: string;

  @IsSqlServerGuidOpcional()
  categoriaPadreId?: string;
}
