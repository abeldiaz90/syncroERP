import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ResolverAprobacionDocumentoDto {
  @IsIn(['APROBADA', 'RECHAZADA'])
  estado!: 'APROBADA' | 'RECHAZADA';

  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  @IsOptional()
  comentario?: string;
}
