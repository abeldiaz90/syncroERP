// recetas/dto/recetas.dtos.ts
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  Min,
  Max,
  ArrayMinSize,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsSqlServerGuid } from '../../common/validators/sql-server-guid.validator';

export class RecetaInsumoDto {
  @IsSqlServerGuid() insumoId!: string;
  @IsString() @IsOptional() @MaxLength(200) insumoNombre?: string;
  @Type(() => Number) @IsNumber() @Min(0.0001) cantidad!: number;
  @IsString() @IsOptional() @MaxLength(20) unidad?: string;
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  mermaPorcentaje?: number;
}

export class GuardarRecetaDto {
  @IsSqlServerGuid() productoId!: string;
  @IsString() @IsOptional() @MaxLength(200) productoNombre?: string;
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  @IsOptional()
  rendimiento?: number;
  @IsString() @IsOptional() @MaxLength(500) notas?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecetaInsumoDto)
  insumos!: RecetaInsumoDto[];
}

// Para producir/vender un producto con receta (explota y descuenta)
export class ProducirDto {
  @IsSqlServerGuid() productoId!: string;
  @Type(() => Number) @IsNumber() @Min(0.01) cantidad!: number;
  @IsSqlServerGuid() almacenId!: string;
  @IsString() @IsOptional() @MaxLength(300) motivo?: string;
}
