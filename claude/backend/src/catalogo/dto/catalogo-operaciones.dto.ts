import { PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class AutoConfigurarCategoriasDto { @IsOptional() @IsBoolean() soloVacias = true; }
export class CrearListaPrecioDto {
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) nombre!: string;
  @IsBoolean() esPorDefecto = false;

  /*
   * La regla de la lista. `MANUAL` es lo de siempre —un precio tecleado por
   * artículo—; `MARGEN` calcula el precio desde el costo de reposición, que
   * cada recepción de compra mantiene al día.
   */
  @IsOptional() @IsIn(['MANUAL', 'MARGEN']) modo?: 'MANUAL' | 'MARGEN';

  /** Porcentaje sobre el costo. 35 = costo × 1.35. Nunca negativo: vender bajo
   *  costo por regla no es una regla, es un descuido con forma de política. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(10000) margenPorcentaje?: number;

  /** Múltiplo al que se sube el precio calculado. 0 = sin redondear. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100000) redondeo?: number;
}
export class ActualizarListaPrecioDto extends PartialType(CrearListaPrecioDto) {}
export class CrearGrupoAtributoDto {
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) nombre!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) descripcion?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) orden?: number;
}
export class ActualizarGrupoAtributoDto extends PartialType(CrearGrupoAtributoDto) {}
export class CrearDefinicionAtributoDto {
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) etiqueta!: string;
  @IsOptional() @IsIn(['TEXT','NUMBER','BOOLEAN','DATE','SELECT']) tipoValor?: 'TEXT'|'NUMBER'|'BOOLEAN'|'DATE'|'SELECT';
  @IsOptional() @Transform(trim) @IsString() @MaxLength(50) unidad?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(4000) opciones?: string;
  @IsOptional() @IsBoolean() requerido?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) orden?: number;
}
export class ActualizarDefinicionAtributoDto extends PartialType(CrearDefinicionAtributoDto) {}
export class CrearCategoriaWizardDto {
  @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) nombre?: string;
}
