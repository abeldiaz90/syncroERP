import { EsJustificacion } from '../../common/validators/es-justificacion.validator';

/**
 * Anular elimina la venta entera, así que el motivo es obligatorio y queda en
 * la pista de auditoría a nombre de quien la anula.
 *
 * Iba con `@IsString` + `@MinLength` + `@MaxLength`, y al faltar el campo los
 * tres opinaban: tres mensajes en inglés, dos de ellos falsos —«must be
 * shorter than or equal to 500 characters» sobre un valor que no existe—. Es
 * la misma forma que ya se había corregido en las aprobaciones y en la
 * conciliación; aquí se usa la regla común.
 */
export class AnularVentaDto {
  @EsJustificacion({
    cuandoFalta:
      'Anular una venta exige un motivo: es lo que explicará este movimiento dentro de seis meses.',
    maximo: 500,
  })
  motivo!: string;
}
