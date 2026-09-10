import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class ConsultarCurpDto {
  @IsIn(['CURP', 'DATOS'])
  tipo!: 'CURP' | 'DATOS';

  @ValidateIf((o) => o.tipo === 'CURP')
  @Transform(upper)
  @Matches(/^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/)
  curp?: string;

  @ValidateIf((o) => o.tipo === 'DATOS')
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  nombre?: string;

  @ValidateIf((o) => o.tipo === 'DATOS')
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  primerApellido?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  segundoApellido?: string;

  @ValidateIf((o) => o.tipo === 'DATOS')
  @IsDateString()
  fechaNacimiento?: string;

  @ValidateIf((o) => o.tipo === 'DATOS')
  @IsIn(['H', 'M', 'HOMBRE', 'MUJER'])
  sexo?: string;

  @ValidateIf((o) => o.tipo === 'DATOS')
  @Transform(upper)
  @Matches(/^[A-Z]{2}$/)
  entidadNacimiento?: string;
}
