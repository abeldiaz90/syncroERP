import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { IsSqlServerGuid, IsSqlServerGuidOpcional } from '../../common/validators/sql-server-guid.validator';
import { MetodoDepreciacion, MotivoBaja } from '../entities/activo-fijo.entity';
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const upper = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toUpperCase() : value;
export class CrearCategoriaActivoDto {
  @Transform(upper) @IsString() @MinLength(2) @MaxLength(20) clave!: string;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(100) nombre!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) tasaAnual!: number;
  @IsOptional() @IsEnum(MetodoDepreciacion) metodo?: MetodoDepreciacion;
  @IsSqlServerGuidOpcional() cuentaActivoId?: string;
  @IsSqlServerGuidOpcional() cuentaDepreciacionAcumuladaId?: string;
  @IsSqlServerGuidOpcional() cuentaGastoDepreciacionId?: string;
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
  @IsSqlServerGuidOpcional() responsableId?: string;
  @IsSqlServerGuidOpcional() departamentoId?: string;
  @IsDateString() fechaAdquisicion!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) costoAdquisicion!: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) valorResidual?: number;
  @IsSqlServerGuidOpcional() proveedorId?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) facturaCompra?: string;
  @IsOptional() @IsEnum(MetodoDepreciacion) metodo?: MetodoDepreciacion;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) tasaAnual?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1200) vidaUtilMeses?: number;
  @IsOptional() @IsDateString() inicioDepreciacion?: string;
}

/**
 * ============================================================================
 * Corregir la ficha de un activo
 * ----------------------------------------------------------------------------
 * El módulo sabía dar de alta un activo y darlo de baja, y nada en medio. Si
 * alguien capturaba mal el número de serie, la ubicación o el responsable, la
 * única salida era darlo de baja —que escribe una póliza y lo saca del
 * inventario— y volverlo a crear con otro código. El código va pegado en una
 * etiqueta física, así que eso significa ir al almacén a despegar una etiqueta
 * por un dedazo.
 *
 * Todos los campos son opcionales: se manda lo que cambia. El `codigo` NO está,
 * y es deliberado: es lo que está pegado al bien y lo que aparece en las
 * pólizas ya emitidas.
 *
 * La regla de qué se puede tocar vive en el servicio, no aquí: depende de si el
 * activo ya se depreció, y eso el DTO no lo sabe.
 * ============================================================================
 */
export class ActualizarActivoDto {
  /* ── Ficha descriptiva ────────────────────────────────────────────────── */
  @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(160) nombre?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(400) descripcion?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80) numeroSerie?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80) marca?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80) modelo?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) ubicacion?: string;
  @IsSqlServerGuidOpcional() responsableId?: string;
  @IsSqlServerGuidOpcional() departamentoId?: string;
  @IsSqlServerGuidOpcional() proveedorId?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) facturaCompra?: string;

  /* ── Base de cálculo: sólo mientras no se haya depreciado ─────────────── */
  @IsSqlServerGuidOpcional() categoriaId?: string;
  @IsOptional() @IsDateString() fechaAdquisicion?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) costoAdquisicion?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) valorResidual?: number;
  @IsOptional() @IsEnum(MetodoDepreciacion) metodo?: MetodoDepreciacion;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) tasaAnual?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1200) vidaUtilMeses?: number;
  @IsOptional() @IsDateString() inicioDepreciacion?: string;
}
