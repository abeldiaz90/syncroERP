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
import { IsSqlServerGuid } from '../../common/validators/sql-server-guid.validator';
import { MetodoPagoCobranza } from '../../credito/dto/registrar-pago-cobranza.dto';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CrearConvenioHotelDto {
  @IsSqlServerGuid() hotelId!: string;
  @IsSqlServerGuid() clienteId!: string;
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  numeroConvenio!: string;
  @IsDateString() vigenciaDesde!: string;
  @IsDateString() @IsOptional() vigenciaHasta?: string;
}

export class SuspenderConvenioHotelDto {
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  comentario!: string;
}

export class ReenviarConvenioHotelDto {
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @IsOptional()
  numeroConvenio?: string;

  @IsDateString()
  @IsOptional()
  vigenciaDesde?: string;

  @IsDateString()
  @IsOptional()
  vigenciaHasta?: string | null;
}

export class CancelarConvenioHotelDto {
  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  motivo!: string;
}

export class RegistrarCobroCityLedgerDto {
  @IsSqlServerGuid() cuentaCobrarId!: string;
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  importe!: number;
  @IsEnum(MetodoPagoCobranza) metodoPago!: MetodoPagoCobranza;
  @IsSqlServerGuid() cuentaBancariaId!: string;
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  @IsOptional()
  referencia?: string;
  @IsDateString() @IsOptional() fechaPago?: string;
  @Transform(trim)
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  claveIdempotencia!: string;
}
