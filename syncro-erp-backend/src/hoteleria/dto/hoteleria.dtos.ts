// hoteleria/dto/hoteleria.dtos.ts
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsInt,
  Min,
  IsDateString,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CrearHotelDto {
  @IsString() @IsNotEmpty() nombre!: string;
  @IsString() @IsOptional() direccion?: string;
  @IsString() @IsOptional() ciudad?: string;
  @IsString() @IsOptional() telefono?: string;
  @IsString() @IsOptional() almacenId?: string;
  @IsString() @IsOptional() horaCheckIn?: string;
  @IsString() @IsOptional() horaCheckOut?: string;
}

export class CrearTipoHabitacionDto {
  @IsString() @IsNotEmpty() hotelId!: string;
  @IsString() @IsNotEmpty() nombre!: string;
  @IsString() @IsOptional() descripcion?: string;
  @IsInt() @Min(1) @IsOptional() capacidad?: number;
  @IsNumber() @IsOptional() tarifaBase?: number;
}

export class CrearHabitacionDto {
  @IsString() @IsNotEmpty() hotelId!: string;
  @IsString() @IsNotEmpty() tipoHabitacionId!: string;
  @IsString() @IsNotEmpty() numero!: string;
  @IsInt() @IsOptional() piso?: number;
  @IsString() @IsOptional() notas?: string;
}

export class DotacionItemDto {
  @IsString() @IsNotEmpty() productoId!: string;
  @IsString() @IsOptional() productoNombre?: string;
  @IsNumber() @Min(0) cantidad!: number;
  @IsString() @IsOptional() tipoArticulo?: string; // CONSUMIBLE | BLANCO
}

export class GuardarDotacionDto {
  @IsString() @IsNotEmpty() tipoHabitacionId!: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DotacionItemDto)
  items!: DotacionItemDto[];
}

export class CrearReservacionDto {
  @IsString() @IsNotEmpty() hotelId!: string;
  @IsString() @IsNotEmpty() clienteId!: string;
  @IsString() @IsOptional() clienteNombre?: string;
  @IsString() @IsNotEmpty() tipoHabitacionId!: string;
  @IsDateString() fechaEntrada!: string;
  @IsDateString() fechaSalida!: string;
  @IsInt() @Min(1) @IsOptional() numHuespedes?: number;
  @IsNumber() @IsOptional() tarifaNoche?: number;
  @IsString() @IsOptional() notas?: string;
}

export class CheckInDto {
  @IsString() @IsNotEmpty() habitacionId!: string;
}

export class AgregarConsumoDto {
  @IsString() @IsNotEmpty() productoId!: string;
  @IsString() @IsNotEmpty() concepto!: string;
  @IsNumber() @Min(0.01) cantidad!: number;
  @IsNumber() @Min(0) precioUnitario!: number;
}

export class AsignarCamaristaDto {
  @IsString() @IsOptional() asignadoAId?: string;
  @IsString() @IsOptional() asignadoANombre?: string;
}
