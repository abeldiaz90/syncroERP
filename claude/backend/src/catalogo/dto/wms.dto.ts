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
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IsSqlServerGuid, IsSqlServerGuidOpcional } from '../../common/validators/sql-server-guid.validator';
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
  @IsSqlServerGuidOpcional() productoId?: string;
  @IsSqlServerGuidOpcional() almacenId?: string;
  @IsSqlServerGuidOpcional() ubicacionId?: string;
  @IsOptional() @IsEnum(EstadoStockUbicacion) estado?: EstadoStockUbicacion;
}

export class ReubicarStockWmsDto extends CantidadPositivaDto {
  /*
   * Dos orígenes posibles, y por eso los tres son opcionales aquí y el
   * servicio decide:
   *
   *   · `stockUbicacionId` — mercancía que ya está en una posición y se mueve
   *     a otra.
   *   · `productoId` + `almacenId` — mercancía que está en el almacén y aún no
   *     tiene posición (carga inicial, entradas sin ubicar). Antes no había
   *     manera de colocarla, y era justo la que el verificador de integridad
   *     denunciaba.
   */
  @IsSqlServerGuidOpcional() stockUbicacionId?: string;
  @IsSqlServerGuidOpcional() productoId?: string;
  @IsSqlServerGuidOpcional() almacenId?: string;
  @IsSqlServerGuid() ubicacionDestinoId: string;
  /*
   * El motivo lo pide la pantalla desde siempre —obligatorio, mínimo cinco
   * caracteres— y el DTO no lo declaraba, así que la lista blanca de
   * validación contestaba «motivo: property motivo should not exist» y la
   * reubicación NUNCA se pudo guardar: 400 en cada intento, con el formulario
   * lleno y correcto. Un campo obligatorio que el servidor prohíbe.
   *
   * Queda declarado. Al aceptarse, el interceptor de auditoría lo guarda con
   * el resto del cuerpo, que es donde tiene que vivir el porqué de un
   * movimiento físico.
   */
  @IsString() @MinLength(5) @MaxLength(255) motivo: string;
}

export class CrearConteoWmsDto {
  @IsSqlServerGuid() almacenId: string;
  @IsSqlServerGuidOpcional() ubicacionId?: string;
  @IsSqlServerGuidOpcional() productoId?: string;
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
