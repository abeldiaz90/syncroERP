import { EsJustificacion } from '../../common/validators/es-justificacion.validator';

/**
 * ============================================================================
 * Cerrar una discrepancia exige decir qué se hizo
 * ----------------------------------------------------------------------------
 * Una discrepancia de conciliación es una diferencia entre los libros del ERP
 * y los del registro externo. Marcarla como resuelta la saca de la vista para
 * siempre.
 *
 * El endpoint aceptaba la nota como opcional —y encima en un tipo literal, que
 * el `ValidationPipe` global no mira—, así que se podía cerrar una diferencia
 * sin decir por qué ni qué se corrigió. Seis meses después, quien audite ve una
 * fila «resuelta» sin nada más, y la única manera de saber qué pasó es
 * reconstruirlo desde los dos libros.
 *
 * Es la misma regla que ya rige en otros dos sitios del sistema —descartar un
 * asiento pendiente y cancelar un cobro exigen justificación— y no tenía por
 * qué faltar justo aquí.
 * ============================================================================
 */
export class ResolverDiscrepanciaDto {
  @EsJustificacion({
    cuandoFalta: 'Cerrar una discrepancia exige una nota que explique qué se hizo.',
  })
  nota!: string;
}
