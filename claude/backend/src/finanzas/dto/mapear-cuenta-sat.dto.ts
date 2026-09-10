import { IsBoolean, IsDateString, IsOptional, IsString } from 'class-validator';

export class MapearCuentaSatDto {
  @IsString()
  codigoAgrupador!: string;

  @IsOptional()
  @IsDateString()
  vigenciaDesde?: string;

  @IsOptional()
  @IsBoolean()
  confirmar?: boolean;
}
