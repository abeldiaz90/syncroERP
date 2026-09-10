import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SolicitarAprobacionCotizacionDto {
  @IsString()
  @MaxLength(1000)
  motivoSeleccion: string;
}

export class ResolverAprobacionCotizacionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comentario?: string;
}
