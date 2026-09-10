import {
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class MapearRolDto {
  /** Rol del ERP. Se normaliza al guardar. */
  @IsString() @MaxLength(60) rolErp!: string;

  /**
   * Ids de los roles del registro externo. No se admite vacío: un mapeo sin
   * roles es un usuario que puede entrar y no puede hacer nada, y es mejor no
   * tener mapeo que tener uno que miente.
   */
  @IsArray() @ArrayNotEmpty() @IsString({ each: true })
  rolesExternos!: string[];

  @IsOptional() @IsString() @MaxLength(300) descripcionExterna?: string;
}
