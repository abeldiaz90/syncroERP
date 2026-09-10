import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class AprovisionarCuentaServicioDto {
  /**
   * Ids de los roles del registro externo con los que operará la cuenta de
   * servicio. Se exige explícito: una cuenta de servicio hereda por omisión
   * demasiado poder, y quién se lo da debe ser una decisión, no un descuido.
   */
  @IsArray() @ArrayNotEmpty() @IsString({ each: true })
  rolesExternos!: string[];
}
