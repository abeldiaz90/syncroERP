import { Transform } from 'class-transformer';
import { IsIn } from 'class-validator';
import { EsMotivoDeRechazo } from '../../common/validators/motivo-de-rechazo.validator';

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

/*
 * ──────────────────────────────────────────────────────────────────────────
 * Y por que el motivo ausente se convierte en motivo vacio
 *
 * Rechazar sin comentario devolvia TRES errores a la vez:
 *
 *   «comentario must be shorter than or equal to 500 characters»
 *   «Al rechazar hay que decir por que: escribe el motivo (minimo 3 caracteres).»
 *   «comentario must be a string»
 *
 * Los dos de los extremos son falsos —no hay 501 caracteres, no hay un tipo
 * equivocado: no hay nada— y el unico verdadero queda enterrado en medio. Quien
 * lee eso no aprende que le falta el motivo; aprende a no leer los errores.
 *
 * Al rechazar, que el campo no venga no es «de otro tipo»: es vacio. Diciendolo
 * asi, `@IsString` y `@MaxLength` pasan, y salta un solo mensaje, que es el
 * cierto. Medido el 25-sep-2026 contra la instalacion.
 * ──────────────────────────────────────────────────────────────────────────
 */
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ResolverAprobacionRequisicionDto {
  @IsIn(['APROBADO', 'RECHAZADO'])
  estado!: 'APROBADO' | 'RECHAZADO';

  @Transform(trim)
  @EsMotivoDeRechazo()
  comentario?: string;
}
