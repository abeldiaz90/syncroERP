import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { EsRfcOpcional } from '../../common/validators/rfc.validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class OnboardingPasoDto {
  @IsOptional()
  @Transform(trim)
  @EsRfcOpcional()
  rfc?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  regimenFiscal?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  giro?: string;

  @IsOptional()
  @IsIn(['micro', 'pequena', 'mediana', 'grande'])
  tamano?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(255)
  direccion?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  ciudad?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  estado?: string;

  @IsOptional()
  @Transform(trim)
  @Matches(/^\d{5}$/, { message: 'El código postal debe tener 5 dígitos' })
  codigoPostal?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  pais?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  nombre?: string;

  @IsOptional()
  @IsIn(['starter', 'business', 'enterprise'])
  plan?: string;
}
