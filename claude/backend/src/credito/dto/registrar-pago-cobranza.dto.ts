import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { IsSqlServerGuidOpcional } from '../../common/validators/sql-server-guid.validator';

export enum MetodoPagoCobranza {
  EFECTIVO = 'EFECTIVO',
  TARJETA = 'TARJETA',
  TRANSFERENCIA = 'TRANSFERENCIA',
  CHEQUE = 'CHEQUE',
  OTRO = 'OTRO',
}

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class RegistrarPagoCobranzaDto {
  @IsString() @MinLength(1)
  creditoId!: string;

  @IsSqlServerGuidOpcional()
  cuotaId?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  montoPagado!: number;

  @IsEnum(MetodoPagoCobranza)
  metodoPago!: MetodoPagoCobranza;

  @IsSqlServerGuidOpcional()
  cuentaBancariaId?: string;

  @Transform(trim) @IsString() @IsOptional() @MaxLength(200)
  referencia?: string;

  @IsDateString() @IsOptional()
  fechaPago?: string;

  @Transform(trim)
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  claveIdempotencia!: string;
}
