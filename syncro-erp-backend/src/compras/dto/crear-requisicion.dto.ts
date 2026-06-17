import { IsString, IsOptional, IsArray } from 'class-validator';
import { Transform } from 'class-transformer';

export class CrearRequisicionDto {
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined ? undefined : value))
  usuarioSolicitanteId?: string;

  @IsOptional()
  @IsString()
  notas?: string;

  @IsArray()
  detalles: {
    productoId: string;
    cantidadSolicitada: number;
    notas?: string;
  }[];
}