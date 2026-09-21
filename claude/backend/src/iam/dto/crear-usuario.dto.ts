import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsOptional,
  IsIn,
  MinLength,
} from 'class-validator';
import { ROLES_ASIGNABLES } from '../utils/roles-catalogo';
import { IsSqlServerGuidOpcional } from '../../common/validators/sql-server-guid.validator';

export class CrearUsuarioDto {
  @IsString()
  @IsNotEmpty()
  nombreCompleto: string;

  @IsEmail()
  email: string;

  /*
   * Opcional a propósito. Con `AUTH_MODE=keycloak` —lo normal— el ERP no tiene
   * contraseñas: la credencial vive en el directorio y esta columna se marca
   * como «sin acceso local». Exigirla obligaba a la pantalla a pedir una
   * contraseña temporal que no autenticaba nada; pedir un dato inútil enseña a
   * la gente a inventárselo.
   *
   * En modo local sigue haciendo falta, y el servicio la exige ahí.
   */
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsIn(ROLES_ASIGNABLES)
  rol?: string;

  /*
   * `@IsOptional() + @IsString()` dejaba pasar la cadena vacía que manda el
   * <select> en blanco del alta de usuarios, y PostgreSQL la rechazaba al
   * escribirla en una columna uuid: alta de usuario SIN área asignada —el caso
   * normal— fallaba con «El identificador o alguno de los valores no tiene el
   * formato esperado», que no nombra ningún campo.
   */
  @IsSqlServerGuidOpcional()
  departamentoId?: string;
}
