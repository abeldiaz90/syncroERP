import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IsSqlServerGuid, IsSqlServerGuidOpcional } from '../../common/validators/sql-server-guid.validator';
import { OrigenMovimiento, TipoMovimiento } from '../entities/tesoreria.entity';
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class CrearMovimientoTesoreriaDto {
  @IsSqlServerGuid() cuentaBancariaId!: string;
  @IsDateString() fecha!: string;
  @IsEnum(TipoMovimiento) tipo!: TipoMovimiento;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) importe!: number;
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(500) concepto!: string;
  @IsOptional() @IsEnum(OrigenMovimiento) origen?: OrigenMovimiento;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) referencia?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(30) numeroCheque?: string;
  @IsSqlServerGuidOpcional() documentoId?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(50) tipoDocumento?: string;
  @IsSqlServerGuidOpcional() terceroId?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) nombreTercero?: string;
  /**
   * Cuenta contra la que se registra el movimiento en el mayor. Obligatoria
   * para altas manuales: el sistema no puede adivinar si un ingreso es una
   * aportación de capital, un préstamo o un cobro extraordinario.
   */
  @IsSqlServerGuidOpcional() cuentaContrapartidaId?: string;
}
export class CancelarMovimientoTesoreriaDto { @Transform(trim) @IsString() @MinLength(5) @MaxLength(500) motivo!: string; }
export class TraspasoTesoreriaDto {
  @IsSqlServerGuid() origenId!: string;
  @IsSqlServerGuid() destinoId!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) importe!: number;
  @IsDateString() fecha!: string;
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(500) concepto!: string;
}
export class LineaEstadoCuentaDto {
  @IsDateString() fecha!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(500) descripcion!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) referencia?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) cargo?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) abono?: number;
}
export class CrearEstadoCuentaDto {
  @IsSqlServerGuid() cuentaBancariaId!: string;
  @Type(() => Number) @IsInt() @Min(2000) @Max(2100) ejercicio!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(12) mes!: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) saldoInicialBanco!: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) saldoFinalBanco!: number;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => LineaEstadoCuentaDto) lineas!: LineaEstadoCuentaDto[];
}
export class ConciliacionAutomaticaDto { @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(31) ventanaDias = 5; }
export class ConciliacionManualDto { @IsSqlServerGuid() lineaId!: string; @IsSqlServerGuid() movimientoId!: string; }
