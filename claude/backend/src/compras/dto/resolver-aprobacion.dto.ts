import { Transform } from 'class-transformer';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
export class ResolverAprobacionRequisicionDto {
  @IsIn(['APROBADO','RECHAZADO']) estado!: 'APROBADO'|'RECHAZADO';
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(500) comentario!: string;
}
