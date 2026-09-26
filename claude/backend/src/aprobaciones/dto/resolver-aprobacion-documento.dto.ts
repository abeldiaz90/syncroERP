import { Transform } from 'class-transformer';
import { IsIn } from 'class-validator';
import { EsMotivoDeRechazo } from '../../common/validators/motivo-de-rechazo.validator';

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

export class ResolverAprobacionDocumentoDto {
  @IsIn(['APROBADA', 'RECHAZADA'])
  estado!: 'APROBADA' | 'RECHAZADA';

  /*
   * Una sola condicion, un solo mensaje. La regla —y por que no son cuatro
   * decoradores— vive en `EsMotivoDeRechazo`.
   */
  @Transform(trim)
  @EsMotivoDeRechazo()
  comentario?: string;
}
