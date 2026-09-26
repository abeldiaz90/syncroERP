import { IsIn } from 'class-validator';
import { EsJustificacion } from '../../common/validators/es-justificacion.validator';

/**
 * ============================================================================
 * Resolver un aviso es una decisión, no un valor por omisión
 * ----------------------------------------------------------------------------
 * El endpoint recibía el cuerpo como un tipo literal de TypeScript
 * (`{ decision?: 'PROCESADO' | 'DESCARTADO' }`). Un tipo no es una clase, así
 * que el `ValidationPipe` global —con `whitelist` y `forbidNonWhitelisted`
 * encendidos— no lo miraba: la unión sólo existía en tiempo de compilación.
 *
 * Y el controlador resolvía así:
 *
 *     const decision = cuerpo?.decision === 'DESCARTADO' ? 'DESCARTADO' : 'PROCESADO';
 *
 * Es decir: un dedazo, un campo mal escrito, un cuerpo vacío o una petición sin
 * cuerpo daban todos el mismo resultado —**PROCESADO**—. Un aviso del espejo
 * contable quedaba marcado como atendido sin que nadie hubiera decidido nada, y
 * la bandeja se vaciaba sola.
 *
 * Aquí la decisión es obligatoria y cerrada, y descartar exige decir por qué:
 * alguien está declarando que una diferencia entre los dos libros no se va a
 * reflejar, y eso tiene que quedar escrito.
 * ============================================================================
 */
export class ResolverAvisoDto {
  @IsIn(['PROCESADO', 'DESCARTADO'], {
    message: 'La decisión debe ser PROCESADO o DESCARTADO.',
  })
  decision!: 'PROCESADO' | 'DESCARTADO';

  @EsJustificacion({
    requeridaCuando: (dto: ResolverAvisoDto) => dto?.decision === 'DESCARTADO',
    cuandoFalta: 'Descartar un aviso exige una nota que explique por qué.',
  })
  nota?: string;
}
