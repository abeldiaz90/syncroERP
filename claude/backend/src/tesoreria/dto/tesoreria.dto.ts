import { Transform, Type } from 'class-transformer';
import {
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
  /*
   * Sin `@ArrayMinSize(1)` a proposito. Un mes sin movimientos en el banco es
   * normal —una cuenta dormida, un mes anterior al arranque— y exigir al menos
   * una linea dejaba esa cuenta sin conciliar para siempre; como el cierre
   * mensual pide conciliacion cerrada de CADA cuenta activa, esa cuenta
   * bloqueaba el mes entero y no habia forma de desbloquearlo.
   *
   * Cargar la nada no queda impune: el servicio sigue exigiendo que el estado
   * de cuenta cuadre consigo mismo, de modo que sin lineas solo se acepta si el
   * saldo inicial es igual al final. Un mes que si tuvo movimientos no se puede
   * declarar vacio.
   */
  @IsArray() @ValidateNested({ each: true }) @Type(() => LineaEstadoCuentaDto) lineas!: LineaEstadoCuentaDto[];
}
export class ConciliacionAutomaticaDto { @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(31) ventanaDias = 5; }
export class ConciliacionManualDto { @IsSqlServerGuid() lineaId!: string; @IsSqlServerGuid() movimientoId!: string; }
