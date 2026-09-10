import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsSqlServerGuid } from '../../common/validators/sql-server-guid.validator';
import { EstadoUbicacionAlmacen } from '../entities/ubicacion-almacen.entity';
import { EstadoStockUbicacion } from '../entities/stock-ubicacion.entity';

class CantidadPositivaDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  cantidad: number;
}

export class CrearReservaWmsDto extends CantidadPositivaDto {
  @IsSqlServerGuid() productoId: string;
  @IsSqlServerGuid() almacenId: string;
  @IsString() @MaxLength(40) referenciaTipo: string;
  @IsString() @MaxLength(80) referenciaId: string;
  @IsOptional() @IsDateString() expiraEn?: string;
  @IsOptional() @IsString() @MaxLength(255) motivo?: string;
}

export class DetalleTransferenciaWmsDto extends CantidadPositivaDto {
  @IsSqlServerGuid() productoId: string;
  @IsSqlServerGuid() ubicacionOrigenId: string;
}

export class CrearTransferenciaWmsDto {
  @IsSqlServerGuid() almacenOrigenId: string;
  @IsSqlServerGuid() almacenDestinoId: string;
  @IsString() @MaxLength(255) motivo: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true })
  @Type(() => DetalleTransferenciaWmsDto)
  detalles: DetalleTransferenciaWmsDto[];
}

export class DetalleRecepcionTransferenciaWmsDto {
  @IsSqlServerGuid() detalleId: string;
  @IsSqlServerGuid() ubicacionDestinoId: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0)
  cantidadRecibida?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0)
  cantidadDanada?: number;
}

export class RecibirTransferenciaWmsDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true })
  @Type(() => DetalleRecepcionTransferenciaWmsDto)
  detalles: DetalleRecepcionTransferenciaWmsDto[];
  @IsOptional() @IsString() @MaxLength(500) observaciones?: string;
}

export class CrearUbicacionWmsDto {
  @IsSqlServerGuid() almacenId: string;
  @IsString() @MaxLength(80) codigo: string;
  @IsOptional() @IsString() @MaxLength(80) zona?: string;
  @IsOptional() @IsString() @MaxLength(40) pasillo?: string;
  @IsOptional() @IsString() @MaxLength(40) rack?: string;
  @IsOptional() @IsString() @MaxLength(40) nivel?: string;
  @IsOptional() @IsString() @MaxLength(40) posicion?: string;
  @IsOptional() @IsEnum(EstadoUbicacionAlmacen) estado?: EstadoUbicacionAlmacen;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) capacidadMaxima?: number;
  @IsOptional() @IsString() @MaxLength(255) descripcion?: string;
}

export class ActualizarUbicacionWmsDto {
  @IsOptional() @IsString() @MaxLength(80) codigo?: string;
  @IsOptional() @IsString() @MaxLength(80) zona?: string;
  @IsOptional() @IsString() @MaxLength(40) pasillo?: string;
  @IsOptional() @IsString() @MaxLength(40) rack?: string;
  @IsOptional() @IsString() @MaxLength(40) nivel?: string;
  @IsOptional() @IsString() @MaxLength(40) posicion?: string;
  @IsOptional() @IsEnum(EstadoUbicacionAlmacen) estado?: EstadoUbicacionAlmacen;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) capacidadMaxima?: number;
  @IsOptional() @IsString() @MaxLength(255) descripcion?: string;
  @IsOptional() @IsBoolean() activo?: boolean;
}

export class AsignarProductoUbicacionWmsDto {
  @IsSqlServerGuid() ubicacionId: string;
  @IsOptional() @IsBoolean() esPrincipal?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) capacidadAsignada?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) stockMinimo?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) stockMaximo?: number;
  @IsOptional() @IsString() @MaxLength(255) observaciones?: string;
}

export class ActualizarProductoUbicacionWmsDto {
  @IsOptional() @IsBoolean() esPrincipal?: boolean;
  @IsOptional() @IsBoolean() activo?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) capacidadAsignada?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) stockMinimo?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) stockMaximo?: number;
  @IsOptional() @IsString() @MaxLength(255) observaciones?: string;
}

export class FiltroStockUbicacionWmsDto {
  @IsOptional() @IsSqlServerGuid() productoId?: string;
  @IsOptional() @IsSqlServerGuid() almacenId?: string;
  @IsOptional() @IsSqlServerGuid() ubicacionId?: string;
  @IsOptional() @IsEnum(EstadoStockUbicacion) estado?: EstadoStockUbicacion;
}

export class ReubicarStockWmsDto extends CantidadPositivaDto {
  @IsSqlServerGuid() stockUbicacionId: string;
  @IsSqlServerGuid() ubicacionDestinoId: string;
}

export class CrearConteoWmsDto {
  @IsSqlServerGuid() almacenId: string;
  @IsOptional() @IsSqlServerGuid() ubicacionId?: string;
  @IsOptional() @IsSqlServerGuid() productoId?: string;
  @IsOptional() @IsString() @MaxLength(255) motivo?: string;
  @IsOptional() @IsBoolean() conteoCiego?: boolean;
}

export class DetalleCapturaConteoWmsDto {
  @IsSqlServerGuid() detalleId: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) cantidad?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) reconteo?: number;
  @IsOptional() @IsString() @MaxLength(255) observaciones?: string;
}

export class CapturarConteoWmsDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true })
  @Type(() => DetalleCapturaConteoWmsDto)
  detalles: DetalleCapturaConteoWmsDto[];
}
