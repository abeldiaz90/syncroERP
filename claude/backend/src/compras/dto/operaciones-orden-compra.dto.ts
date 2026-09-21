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
import { IsSqlServerGuid, IsSqlServerGuidOpcional } from '../../common/validators/sql-server-guid.validator';
import { EstadoOC } from '../entities/orden-compra.entity';

export class CrearOrdenDesdeCotizacionDto {
  @IsSqlServerGuid()
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
  @IsSqlServerGuid()
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

  @IsSqlServerGuidOpcional()
  equivalenciaId?: string;

  @IsSqlServerGuid()
  ubicacionId!: string;
}

export class RecibirOrdenCompraDto {
  @IsUUID()
  claveIdempotencia!: string;

  @IsSqlServerGuid()
  almacenId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DetalleRecepcionCompraDto)
  detalles!: DetalleRecepcionCompraDto[];
}

export class PagarOrdenCompraDto {
  @IsUUID()
  claveIdempotencia!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  montoPagado!: number;

  @IsSqlServerGuid()
  cuentaBancariaId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  referencia?: string;

  @IsOptional()
  @IsDateString()
  fechaPago?: string;
}
