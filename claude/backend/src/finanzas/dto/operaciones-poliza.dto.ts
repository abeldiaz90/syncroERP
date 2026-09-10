import { Transform, Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { IsSqlServerGuid } from '../../common/validators/sql-server-guid.validator';
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
export class PartidaPolizaManualDto {
  @IsSqlServerGuid() cuentaContableId!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) cargo!: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) abono!: number;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(300) referencia?: string;
}
export class CrearPolizaManualDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(30) tipo!: string;
  @IsDateString() fecha!: string;
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(500) concepto!: string;
  @IsArray() @ArrayMinSize(2) @ValidateNested({ each: true }) @Type(() => PartidaPolizaManualDto) partidas!: PartidaPolizaManualDto[];
}
export class CancelarPolizaDto {
  @Transform(trim) @IsString() @MinLength(5) @MaxLength(500) motivo!: string;
  @IsOptional() @IsDateString() fechaReverso?: string;
}
export class DescartarAsientoDto { @Transform(trim) @IsString() @MinLength(5) @MaxLength(1000) nota!: string; }
