import {
  IsString,
  IsOptional,
  IsEmail,
  IsIn,
  MinLength,
} from 'class-validator';

export class ActualizarUsuarioDto {
  @IsOptional()
  @IsString()
  nombreCompleto?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsIn(['admin', 'gerencia', 'rrhh', 'finanzas', 'empleado', 'comprador', 'almacenista'])
  rol?: string;

  @IsOptional()
  @IsString()
  departamentoId?: string;

  @IsOptional()
  @IsIn(['es-MX', 'en-US'])
  idioma?: string;

  @IsOptional()
  @IsString()
  zonaHoraria?: string;
}
