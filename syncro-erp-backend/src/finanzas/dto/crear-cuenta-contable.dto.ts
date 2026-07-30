import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsBoolean,
  IsEnum,
} from 'class-validator';
import {
  NaturalezaCuenta,
  RolCuentaSistema,
  TipoCuenta,
} from '../entities/cuenta-contable.entity';

export class CrearCuentaContableDto {
  @IsString()
  @IsNotEmpty()
  numeroCuenta!: string;

  @IsString()
  @IsNotEmpty()
  nombre!: string;

  @IsString()
  @IsOptional()
  codigoAgrupadorSAT?: string;

  @IsEnum(NaturalezaCuenta)
  naturaleza!: NaturalezaCuenta;

  @IsEnum(TipoCuenta)
  tipo!: TipoCuenta;

  @IsString()
  @IsOptional()
  cuentaPadreId?: string;

  @IsBoolean()
  esAfectable!: boolean;

  @IsEnum(RolCuentaSistema)
  @IsOptional()
  rolSistema?: RolCuentaSistema | null;
}
