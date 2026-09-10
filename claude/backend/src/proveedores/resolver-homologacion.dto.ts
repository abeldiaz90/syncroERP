import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ResolverHomologacionDto {
  @IsIn(['APROBADO', 'CONDICIONADO', 'BLOQUEADO'])
  estado: 'APROBADO' | 'CONDICIONADO' | 'BLOQUEADO';

  @IsIn(['BAJO', 'MEDIO', 'ALTO'])
  nivelRiesgo: 'BAJO' | 'MEDIO' | 'ALTO';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comentario?: string;
}
