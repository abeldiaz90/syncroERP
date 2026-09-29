import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { IsSqlServerGuid } from '../../common/validators/sql-server-guid.validator';
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
  @IsSqlServerGuid()
  bancoId?: string | null;

  @IsOptional()
  @Transform(vacioANull)
  @IsString()
  @Length(18, 18)
  @Matches(/^\d{18}$/, { message: 'clabe debe contener exactamente 18 dígitos' })
  clabe?: string | null;

  @IsOptional()
  @Transform(vacioANull)
  @IsSqlServerGuid()
  cuentaContableId?: string | null;

  /*
   * El contexto de venta de una CAJA: de qué almacén sale la mercancía y con
   * qué lista se cobra. Opcionales porque una cuenta de BANCO no tiene
   * ninguno de los dos, y una caja sin configurar sigue vendiendo con el
   * predeterminado de la empresa.
   */
  @IsOptional()
  @Transform(vacioANull)
  @IsSqlServerGuid()
  almacenId?: string | null;

  @IsOptional()
  @Transform(vacioANull)
  @IsSqlServerGuid()
  listaPrecioId?: string | null;

  @IsOptional()
  @IsBoolean()
  esPorDefecto?: boolean;
}
