import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CrearCategoriaDto {
  @IsString()
  @IsNotEmpty()
  nombre!: string;

  @IsString()
  @IsOptional()
  descripcion?: string;

  @IsString()
  @IsOptional()
  categoriaPadreId?: string;

  @IsString()
  @IsOptional()
  cuentaVentasId?: string;

  @IsString()
  @IsOptional()
  cuentaCostoVentasId?: string;

  @IsString()
  @IsOptional()
  cuentaInventarioId?: string;

  @IsString()
  @IsOptional()
  cuentaDevolucionesId?: string;

  @IsString()
  @IsOptional()
  cuentaMermasId?: string;
}
