import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { IsSqlServerGuid } from '../../common/validators/sql-server-guid.validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class RegistrarCompraInventarioDto {
  @IsSqlServerGuid() almacenId!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) cantidad!: number;
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(500) motivo!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) numeroLote?: string;
  @IsOptional() @IsDateString() fechaCaducidad?: string;
  @IsOptional() @IsSqlServerGuid() equivalenciaId?: string;
}

export class RegistrarSalidaInventarioDto {
  @IsSqlServerGuid() almacenId!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) cantidad!: number;
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(500) motivo!: string;
  @IsOptional() @IsSqlServerGuid() equivalenciaId?: string;
  @IsOptional() @IsSqlServerGuid() loteEspecificoId?: string;
  @IsOptional() @IsSqlServerGuid() ubicacionId?: string;
}

export class TransferirInventarioDto {
  @IsSqlServerGuid() productoId!: string;
  @IsSqlServerGuid() almacenOrigenId!: string;
  @IsSqlServerGuid() almacenDestinoId!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) cantidad!: number;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) motivo?: string;
}

export class AjusteInventarioDto {
  @IsSqlServerGuid() productoId!: string;
  @IsSqlServerGuid() almacenId!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) cantidad!: number;
  @IsIn(['INGRESO', 'MERMA']) tipo!: 'INGRESO' | 'MERMA';
  @Transform(trim) @IsString() @MinLength(5) @MaxLength(500) motivo!: string;
  @IsOptional() @IsSqlServerGuid() loteEspecificoId?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) costoUnitario?: number;
}
