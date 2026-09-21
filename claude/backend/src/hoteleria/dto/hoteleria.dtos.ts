import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { IsSqlServerGuid, IsSqlServerGuidOpcional } from '../../common/validators/sql-server-guid.validator';
import { MetodoPagoHotel } from '../entities/folio.entity';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CrearHotelDto {
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(150) nombre!: string;
  @Transform(trim) @IsString() @IsOptional() @MaxLength(255) direccion?: string;
  @Transform(trim) @IsString() @IsOptional() @MaxLength(100) ciudad?: string;
  @Transform(trim)
  @IsString()
  @IsOptional()
  @MaxLength(100)
  estadoRepublica?: string;
  @Transform(trim) @IsString() @IsOptional() @MaxLength(100) municipio?: string;
  @Transform(trim)
  @IsString()
  @IsOptional()
  @MaxLength(20)
  codigoPostal?: string;
  @Transform(trim)
  @IsString()
  @IsOptional()
  @MaxLength(30)
  registroNacionalTurismo?: string;
  @Transform(trim) @IsString() @IsOptional() @MaxLength(20) telefono?: string;
  @Transform(({ value }) => (value === '' ? null : value))
  @IsSqlServerGuidOpcional()
  almacenId?: string | null;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) @IsOptional() horaCheckIn?: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) @IsOptional() horaCheckOut?: string;
  @Transform(trim)
  @IsString()
  @IsOptional()
  @MaxLength(60)
  zonaHoraria?: string;
  @Transform(trim) @IsString() @Length(3, 3) @IsOptional() moneda?: string;
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  tasaIva?: number;
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  tasaImpuestoHospedaje?: number;
  @Transform(trim)
  @IsString()
  @IsOptional()
  @MaxLength(100)
  nombreImpuestoHospedaje?: string;
  @IsBoolean() @IsOptional() preciosIncluyenImpuestos?: boolean;
  @IsBoolean() @IsOptional() exigirInventarioDotacion?: boolean;
  @IsBoolean() @IsOptional() permitirSobreventa?: boolean;
  @Transform(trim)
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  politicaCancelacion?: string;
  @Transform(trim)
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  avisoPrivacidad?: string;
}

export class ActualizarHotelDto extends CrearHotelDto {
  @IsBoolean() @IsOptional() activo?: boolean;
}

export class CrearTipoHabitacionDto {
  @IsString() @MinLength(1) hotelId!: string;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(100) nombre!: string;
  @Transform(trim)
  @IsString()
  @IsOptional()
  @MaxLength(500)
  descripcion?: string;
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  capacidad?: number;
  @Type(() => Number) @IsNumber() @Min(0.01) @IsOptional() tarifaBase?: number;
}

export class ActualizarTipoHabitacionDto {
  @Transform(trim)
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(100)
  nombre?: string;
  @Transform(trim)
  @IsString()
  @IsOptional()
  @MaxLength(500)
  descripcion?: string;
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  capacidad?: number;
  @Type(() => Number) @IsNumber() @Min(0.01) @IsOptional() tarifaBase?: number;
  @IsBoolean() @IsOptional() activo?: boolean;
}

export class CrearHabitacionDto {
  @IsString() @MinLength(1) hotelId!: string;
  @IsString() @MinLength(1) tipoHabitacionId!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(20) numero!: string;
  @Type(() => Number) @IsInt() @Min(-10) @Max(300) @IsOptional() piso?: number;
  @Transform(trim) @IsString() @IsOptional() @MaxLength(255) notas?: string;
}

export class CrearHabitacionesLoteDto {
  @IsString() hotelId!: string;
  @IsString() tipoHabitacionId!: string;
  @Type(() => Number) @IsInt() @Min(-10) @Max(300) piso!: number;
  @Type(() => Number) @IsInt() @Min(1) desde!: number;
  @Type(() => Number) @IsInt() @Min(1) hasta!: number;
}

export class ActualizarHabitacionDto {
  @IsString() @IsOptional() tipoHabitacionId?: string;
  @Transform(trim)
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(20)
  numero?: string;
  @Type(() => Number) @IsInt() @Min(-10) @Max(300) @IsOptional() piso?: number;
  @Transform(trim) @IsString() @IsOptional() @MaxLength(255) notas?: string;
  @IsBoolean() @IsOptional() activo?: boolean;
}

export class DotacionItemDto {
  @IsString() @MinLength(1) productoId!: string;
  @Transform(trim)
  @IsString()
  @IsOptional()
  @MaxLength(200)
  productoNombre?: string;
  @Type(() => Number) @IsNumber() @Min(0.0001) cantidad!: number;
  @IsIn(['CONSUMIBLE', 'BLANCO']) @IsOptional() tipoArticulo?:
    | 'CONSUMIBLE'
    | 'BLANCO';
}

export class GuardarDotacionDto {
  @IsString() @MinLength(1) tipoHabitacionId!: string;
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => DotacionItemDto)
  items!: DotacionItemDto[];
}

export class CrearReservacionDto {
  @IsSqlServerGuid() hotelId!: string;
  @IsSqlServerGuid() clienteId!: string;
  @Transform(trim)
  @IsString()
  @IsOptional()
  @MaxLength(150)
  clienteNombre?: string;
  @IsSqlServerGuid() tipoHabitacionId!: string;
  @IsDateString() fechaEntrada!: string;
  @IsDateString() fechaSalida!: string;
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  numHuespedes?: number;
  @Type(() => Number) @IsNumber() @Min(0) @IsOptional() tarifaNoche?: number;
  @Transform(trim) @IsString() @IsOptional() @MaxLength(1000) notas?: string;
}

export class CheckInDto {
  @IsSqlServerGuid() habitacionId!: string;
  @Transform(trim)
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  aceptacionReglamento?: string;
}

export class CancelarReservacionDto {
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  motivo!: string;
}

export class CambiarHabitacionDto {
  @IsSqlServerGuid() habitacionId!: string;

  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  motivo!: string;
}

export class AgregarConsumoDto {
  @IsSqlServerGuid() productoId!: string;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(200) concepto!: string;
  @Type(() => Number) @IsNumber() @Min(0.0001) cantidad!: number;
  // Se conserva por compatibilidad con clientes anteriores, pero el servidor
  // siempre toma el precio de la lista oficial y nunca confía en este valor.
  @Type(() => Number) @IsNumber() @Min(0) @IsOptional() precioUnitario?: number;
  @IsSqlServerGuidOpcional() listaPrecioId?: string;
  @Transform(trim)
  @IsString()
  @IsOptional()
  @MaxLength(100)
  claveIdempotencia?: string;
}

export class PagoCheckOutDto {
  @IsEnum(MetodoPagoHotel)
  metodoPago!: MetodoPagoHotel;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  importe!: number;

  @IsString()
  @IsOptional()
  cuentaBancariaId?: string;

  /** Obligatorio únicamente para CREDITO_EMPRESA y CREDITO_AGENCIA. */
  @IsSqlServerGuidOpcional()
  convenioId?: string;

  @Transform(trim)
  @IsString()
  @IsOptional()
  @MaxLength(100)
  referencia?: string;

  @Transform(trim)
  @IsString()
  @Length(3, 3)
  @IsOptional()
  moneda?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  @IsOptional()
  tipoCambio?: number;
}

export class CheckOutDto {
  @Transform(trim)
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  claveIdempotencia!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => PagoCheckOutDto)
  pagos!: PagoCheckOutDto[];
}

export class AsignarCamaristaDto {
  @IsSqlServerGuidOpcional() asignadoAId?: string;
  @Transform(trim)
  @IsString()
  @IsOptional()
  @MaxLength(150)
  asignadoANombre?: string;
}

export class InspeccionarTareaDto {
  @IsBoolean() aprobado!: boolean;
  @Transform(trim)
  @IsString()
  @IsOptional()
  @MaxLength(500)
  comentario?: string;
}
