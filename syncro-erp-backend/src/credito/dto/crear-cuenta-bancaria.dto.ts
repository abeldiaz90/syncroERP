import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { TipoCuentaBancaria } from '../entities/cuenta-bancaria.entity';

const limpiarTexto = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const vacioANull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

export class CrearCuentaBancariaDto {
  @Transform(limpiarTexto)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre!: string;

  @IsEnum(TipoCuentaBancaria)
  tipo!: TipoCuentaBancaria;

  @IsOptional()
  @Transform(vacioANull)
  @IsString()
  @MaxLength(50)
  numeroCuenta?: string | null;

  @IsOptional()
  @Transform(vacioANull)
  @IsUUID()
  bancoId?: string | null;

  @IsOptional()
  @Transform(vacioANull)
  @IsString()
  @Length(18, 18)
  @Matches(/^\d{18}$/, { message: 'clabe debe contener exactamente 18 dígitos' })
  clabe?: string | null;

  @IsOptional()
  @Transform(vacioANull)
  @IsUUID()
  cuentaContableId?: string | null;

  @IsOptional()
  @IsBoolean()
  esPorDefecto?: boolean;
}
