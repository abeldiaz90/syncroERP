import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsOptional,
  IsIn,
  MinLength,
} from 'class-validator';
import { ROLES_ASIGNABLES } from '../utils/roles-catalogo';

export class CrearUsuarioDto {
  @IsString()
  @IsNotEmpty()
  nombreCompleto: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsIn(ROLES_ASIGNABLES)
  rol?: string;

  @IsOptional()
  @IsString()
  departamentoId?: string;
}
