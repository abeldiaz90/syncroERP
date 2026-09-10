// catalogo/dto/crear-unidad-medida.dto.ts
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CrearUnidadMedidaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  nombre!: string;

  @IsString()
  @IsOptional()
  @MaxLength(10)
  abreviatura?: string;

  @IsString()
  @IsOptional()
  @MaxLength(10)
  claveSAT?: string;
}
