// recetas/dto/recetas.dtos.ts
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RecetaInsumoDto {
  @IsString() @IsNotEmpty() insumoId!: string;
  @IsString() @IsOptional() insumoNombre?: string;
  @IsNumber() @Min(0) cantidad!: number;
  @IsString() @IsOptional() unidad?: string;
  @IsNumber() @IsOptional() mermaPorcentaje?: number;
}

export class GuardarRecetaDto {
  @IsString() @IsNotEmpty() productoId!: string;
  @IsString() @IsOptional() productoNombre?: string;
  @IsNumber() @IsOptional() rendimiento?: number;
  @IsString() @IsOptional() notas?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecetaInsumoDto)
  insumos!: RecetaInsumoDto[];
}

// Para producir/vender un producto con receta (explota y descuenta)
export class ProducirDto {
  @IsString() @IsNotEmpty() productoId!: string;
  @IsNumber() @Min(0.01) cantidad!: number; // cuántas unidades del producto
  @IsString() @IsNotEmpty() almacenId!: string; // de dónde salen los insumos
  @IsString() @IsOptional() motivo?: string;
}
