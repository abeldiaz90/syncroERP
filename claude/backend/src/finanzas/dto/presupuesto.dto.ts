import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
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

import { IsSqlServerGuid } from '../../common/validators/sql-server-guid.validator';

export class CrearPresupuestoDto {
  @Type(() => Number) @IsInt() @Min(2000) @Max(2999) ejercicio!: number;
  @IsString() @MinLength(1) @MaxLength(120) nombre!: string;
  @IsOptional() @IsString() @MaxLength(300) notas?: string;
}

export class LineaPresupuestoDto {
  @IsSqlServerGuid() cuentaContableId!: string;
  @IsOptional() @IsSqlServerGuid() centroCostoId?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(12) mes!: number;
  /*
   * Positivo, en el sentido natural de la cuenta. Capturarlo con signo
   * contable obligaría a quien presupuesta a saber si su cuenta es deudora o
   * acreedora, y el día que se equivoque el comparativo diría que gastó de
   * menos.
   */
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) importe!: number;
}

export class CapturarPresupuestoDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineaPresupuestoDto)
  lineas!: LineaPresupuestoDto[];
}
