import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { IsSqlServerGuid } from '../../common/validators/sql-server-guid.validator';

import { TipoCentroCosto } from '../entities/centro-costo.entity';

export class CrearCentroCostoDto {
  @IsString() @MinLength(1) @MaxLength(30) codigo!: string;
  @IsString() @MinLength(1) @MaxLength(120) nombre!: string;
  @IsOptional() @IsEnum(TipoCentroCosto) tipo?: TipoCentroCosto;
  @IsOptional() @IsSqlServerGuid() padreId?: string | null;
  @IsOptional() @IsBoolean() aceptaMovimientos?: boolean;
  /** La oficina de Fineract que le corresponde, si la tiene. */
  @IsOptional() @IsString() @MaxLength(40) oficinaExternaId?: string;
  @IsOptional() @IsString() @MaxLength(255) descripcion?: string;
}

export class ActualizarCentroCostoDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(30) codigo?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) nombre?: string;
  @IsOptional() @IsEnum(TipoCentroCosto) tipo?: TipoCentroCosto;
  @IsOptional() @IsSqlServerGuid() padreId?: string | null;
  @IsOptional() @IsBoolean() aceptaMovimientos?: boolean;
  @IsOptional() @IsBoolean() activo?: boolean;
  @IsOptional() @IsString() @MaxLength(40) oficinaExternaId?: string;
  @IsOptional() @IsString() @MaxLength(255) descripcion?: string;
}
