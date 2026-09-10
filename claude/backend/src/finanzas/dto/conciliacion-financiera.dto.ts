import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class IniciarConciliacionDto {
  @IsDateString()
  fechaCorte!: string;
}

export class ResolverAreaConciliacionDto {
  @IsIn(['CONFIRMADA', 'JUSTIFICADA', 'REQUIERE_AJUSTE'])
  estado!: 'CONFIRMADA' | 'JUSTIFICADA' | 'REQUIERE_AJUSTE';

  @IsOptional()
  @IsString()
  @Length(10, 500)
  justificacion?: string;
}
