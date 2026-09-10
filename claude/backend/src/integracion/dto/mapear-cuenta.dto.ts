import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class MapearCuentaDto {
  @IsUUID() cuentaContableId!: string;

  /** Identificador de la cuenta en el mayor externo. */
  @IsString() @MaxLength(120) idExterno!: string;

  /** Código legible en el externo. Sólo para que un humano lo reconozca. */
  @IsOptional() @IsString() @MaxLength(60) codigoExterno?: string;
}
