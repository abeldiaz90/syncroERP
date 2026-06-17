import { IsString, IsNotEmpty, IsArray, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class CrearConfiguracionAprobacionDto {
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) => value?.trim())
  departamentoId: string;

  @IsArray()
  @IsNotEmpty()
  aprobadores: {
    usuarioId: string;
    orden: number;
  }[];
}