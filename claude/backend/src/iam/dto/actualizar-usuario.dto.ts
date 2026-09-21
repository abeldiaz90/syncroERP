import {
  IsString,
  IsOptional,
  IsEmail,
  IsIn,
  MinLength,
} from 'class-validator';
import { ROLES_ASIGNABLES } from '../utils/roles-catalogo';
import { IsEmailOpcional } from '../../common/validators/email-opcional.validator';
import { IsSqlServerGuidOpcional } from '../../common/validators/sql-server-guid.validator';

export class ActualizarUsuarioDto {
  @IsOptional()
  @IsString()
  nombreCompleto?: string;

  @IsEmailOpcional()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsIn(ROLES_ASIGNABLES)
  rol?: string;

  @IsSqlServerGuidOpcional()
  departamentoId?: string;

  @IsOptional()
  @IsIn(['es-MX', 'en-US'])
  idioma?: string;

  @IsOptional()
  @IsString()
  zonaHoraria?: string;
}
