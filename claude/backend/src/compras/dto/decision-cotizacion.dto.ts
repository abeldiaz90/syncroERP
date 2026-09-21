import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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

export class SolicitarAprobacionCotizacionDto {
  @IsString()
  @MaxLength(1000)
  motivoSeleccion: string;
}

/** Aprobar no obliga a justificarse. */
export class ResolverAprobacionCotizacionDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comentario?: string;
}

/** Rechazar si: quien tumba una adjudicacion tiene que decir por que. */
export class RechazarCotizacionDto {
  @Transform(trim)
  @IsString()
  @MinLength(3, {
    message: 'Al rechazar la adjudicación hay que decir por qué (mínimo 3 caracteres).',
  })
  @MaxLength(1000)
  comentario!: string;
}
