import { Transform } from 'class-transformer';
import { IsIn, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

/*
 * ============================================================================
 * El comentario: opcional al aprobar, obligatorio al rechazar
 * ----------------------------------------------------------------------------
 * La misma regla estaba escrita en TRES DTO distintos y los tres decian cosas
 * distintas:
 *
 *   requisicion  @MinLength(3) sin @IsOptional  → exigido SIEMPRE
 *   cotizacion   @IsOptional                    → nunca exigido
 *   documento    @IsOptional                    → nunca exigido
 *
 * El primero rompia la pantalla de aprobaciones de compra: el campo dice
 * «Comentario (obligatorio si rechazas)» y manda cadena vacia al aprobar, asi
 * que APROBAR UNA REQUISICION devolvia 400 siempre, para todos los roles, y la
 * pantalla se comia el error. Verificado el 21-sep-2026 con la sesion del
 * administrador: la requisicion del almacenista llevaba un dia atorada y no
 * era que faltara la firma, es que el boton no podia firmar.
 *
 * Los otros dos se pasaban de permisivos: dejaban rechazar sin decir por que,
 * que es justo cuando el motivo importa.
 *
 * La regla correcta es la que la pantalla ya prometia y la que usa cualquier
 * ERP: aprobar no obliga a justificarse, rechazar si. Queda escrita igual en
 * los tres, y `@ValidateIf` la aplica sobre el ESTADO en vez de sobre la
 * presencia del campo, porque el navegador manda "" y no `undefined`, y
 * `@IsOptional` no salta con la cadena vacia.
 * ============================================================================
 */

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class ResolverAprobacionRequisicionDto {
  @IsIn(['APROBADO', 'RECHAZADO'])
  estado!: 'APROBADO' | 'RECHAZADO';

  @Transform(trim)
  @ValidateIf((dto: ResolverAprobacionRequisicionDto) =>
    dto.estado === 'RECHAZADO' || Boolean(dto.comentario))
  @IsString()
  @MinLength(3, {
    message: 'Al rechazar hay que decir por qué: escribe el motivo (mínimo 3 caracteres).',
  })
  @MaxLength(500)
  comentario?: string;
}
