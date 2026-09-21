import { Transform } from 'class-transformer';
import { IsIn, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

/*
 * El comentario: opcional al aprobar, obligatorio al rechazar.
 *
 * La misma regla vivia en tres DTO y los tres decian cosas distintas: el de
 * requisicion lo exigia SIEMPRE —y por eso aprobar una requisicion devolvia
 * 400 para todos los roles, con la pantalla comiendose el error— mientras
 * estos dos no lo exigian nunca, ni siquiera al rechazar, que es justo cuando
 * el motivo importa.
 *
 * Aqui aprobar y rechazar son rutas distintas, asi que la regla se expresa con
 * dos DTO en vez de con una condicion sobre el estado.
 */

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ResolverAprobacionDocumentoDto {
  @IsIn(['APROBADA', 'RECHAZADA'])
  estado!: 'APROBADA' | 'RECHAZADA';

  /*
   * `@ValidateIf` sobre el ESTADO y no sobre la presencia del campo: el
   * navegador manda "" y no `undefined`, y `@IsOptional` no salta con la
   * cadena vacia.
   */
  @Transform(trim)
  @ValidateIf((dto: ResolverAprobacionDocumentoDto) =>
    dto.estado === 'RECHAZADA' || Boolean(dto.comentario))
  @IsString()
  @MinLength(3, {
    message: 'Al rechazar hay que decir por qué: escribe el motivo (mínimo 3 caracteres).',
  })
  @MaxLength(500)
  comentario?: string;
}
