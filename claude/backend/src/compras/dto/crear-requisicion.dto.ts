import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsIn,
  IsDateString,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsSqlServerGuid } from '../../common/validators/sql-server-guid.validator';

export class DetalleCrearRequisicionDto {
  @IsSqlServerGuid()
  productoId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  cantidadSolicitada: number;

  @IsOptional()
  @IsString()
  notas?: string;
}

export class CrearRequisicionDto {
  @IsOptional()
  @IsString()
  notas?: string;

  @IsOptional()
  @IsIn(['BAJA', 'NORMAL', 'ALTA', 'URGENTE'])
  prioridad?: 'BAJA' | 'NORMAL' | 'ALTA' | 'URGENTE';

  @IsOptional()
  @IsDateString()
  fechaRequerida?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DetalleCrearRequisicionDto)
  detalles: DetalleCrearRequisicionDto[];
}
