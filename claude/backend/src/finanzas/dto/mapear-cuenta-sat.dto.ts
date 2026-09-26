import { IsBoolean, IsDateString, IsOptional, IsString } from 'class-validator';
import { IsFechaOpcional } from '../../common/validators/fecha-opcional.validator';

export class MapearCuentaSatDto {
  @IsString()
  codigoAgrupador!: string;

  @IsFechaOpcional()
  vigenciaDesde?: string;

  @IsOptional()
  @IsBoolean()
  confirmar?: boolean;
}
