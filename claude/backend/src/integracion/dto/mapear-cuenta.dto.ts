import { IsOptional, IsString, MaxLength } from 'class-validator';
import { IsSqlServerGuid } from '../../common/validators/sql-server-guid.validator';

export class MapearCuentaDto {
  @IsSqlServerGuid() cuentaContableId!: string;

  /** Identificador de la cuenta en el mayor externo. */
  @IsString() @MaxLength(120) idExterno!: string;

  /** Código legible en el externo. Sólo para que un humano lo reconozca. */
  @IsOptional() @IsString() @MaxLength(60) codigoExterno?: string;
}
