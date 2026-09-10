import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { IsSqlServerGuid } from '../../common/validators/sql-server-guid.validator';
import { MetodoDepreciacion, MotivoBaja } from '../entities/activo-fijo.entity';
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const upper = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toUpperCase() : value;
export class CrearCategoriaActivoDto {
  @Transform(upper) @IsString() @MinLength(2) @MaxLength(20) clave!: string;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(100) nombre!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) tasaAnual!: number;
  @IsOptional() @IsEnum(MetodoDepreciacion) metodo?: MetodoDepreciacion;
  @IsOptional() @IsSqlServerGuid() cuentaActivoId?: string;
  @IsOptional() @IsSqlServerGuid() cuentaDepreciacionAcumuladaId?: string;
  @IsOptional() @IsSqlServerGuid() cuentaGastoDepreciacionId?: string;
  @IsOptional() @IsBoolean() activo?: boolean;
}
export class PeriodoDepreciacionDto {
  @Type(() => Number) @IsInt() @Min(2000) @Max(2100) ejercicio!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(12) mes!: number;
}
export class BajaActivoDto {
  @IsEnum(MotivoBaja) motivo!: MotivoBaja;
  @IsDateString() fecha!: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) valorVenta?: number;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) notas?: string;
}
export class CrearActivoDto {
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(160) nombre!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(400) descripcion?: string;
  @IsSqlServerGuid() categoriaId!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80) numeroSerie?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80) marca?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80) modelo?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) ubicacion?: string;
  @IsOptional() @IsSqlServerGuid() responsableId?: string;
  @IsOptional() @IsSqlServerGuid() departamentoId?: string;
  @IsDateString() fechaAdquisicion!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) costoAdquisicion!: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) valorResidual?: number;
  @IsOptional() @IsSqlServerGuid() proveedorId?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) facturaCompra?: string;
  @IsOptional() @IsEnum(MetodoDepreciacion) metodo?: MetodoDepreciacion;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) tasaAnual?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1200) vidaUtilMeses?: number;
  @IsOptional() @IsDateString() inicioDepreciacion?: string;
}
