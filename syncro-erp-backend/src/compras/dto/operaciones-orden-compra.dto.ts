import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { EstadoOC } from '../entities/orden-compra.entity';

export class CrearOrdenDesdeCotizacionDto {
  @IsUUID()
  cotizacionId!: string;
}

export class CambiarEstadoOrdenCompraDto {
  @IsIn([
    'PENDIENTE',
    'ENVIADA',
    'RECIBIDA',
    'CON_INCIDENCIAS',
    'PARCIALMENTE_PAGADA',
    'PAGADA',
    'CANCELADA',
  ])
  estado!: EstadoOC;
}

export class DetalleRecepcionCompraDto {
  @IsUUID()
  id!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  cantidadRecibidaOk!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  cantidadRechazada!: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  motivoRechazo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lote?: string;

  @IsOptional()
  @IsDateString()
  fechaCaducidad?: string;

  @IsOptional()
  @IsUUID()
  equivalenciaId?: string;
}

export class RecibirOrdenCompraDto {
  @IsUUID()
  almacenId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DetalleRecepcionCompraDto)
  detalles!: DetalleRecepcionCompraDto[];
}

export class PagarOrdenCompraDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  montoPagado!: number;

  @IsOptional()
  @IsUUID()
  cuentaBancariaId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  referencia?: string;

  @IsOptional()
  @IsDateString()
  fechaPago?: string;
}
