import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { EsRfc } from '../common/validators/rfc.validator';
import { EsCampoCondicional } from '../common/validators/campo-condicional.validator';

/**
 * ============================================================================
 * Los datos del receptor, pedidos de uno en uno
 * ----------------------------------------------------------------------------
 * Timbrar con el cuerpo incompleto devolvía dos mensajes por campo y en inglés:
 *
 *   «nombreReceptor must be shorter than or equal to 300 characters»  ← no hay
 *   «nombreReceptor must be a string»                                  ← falta
 *
 * Es la pantalla donde alguien factura una venta con el cliente delante, así
 * que el mensaje tiene que decir qué falta y decirlo una vez. Los tres campos
 * fiscales del receptor van con `EsCampoCondicional`; el RFC conserva su
 * validador propio, que ya comprobaba forma y fecha con un solo mensaje.
 * ============================================================================
 */
export class TimbrarVentaDto {
  @EsRfc()
  rfcReceptor!: string;

  @EsCampoCondicional({
    cuandoFalta: 'Falta el nombre o razón social del receptor.',
    etiqueta: 'El nombre del receptor',
    forma: 'texto',
    minimo: 1,
    maximo: 300,
  })
  nombreReceptor!: string;

  @EsCampoCondicional({
    cuandoFalta:
      'Falta el régimen fiscal del receptor (tres dígitos, como 601 o 626).',
    etiqueta: 'El régimen fiscal del receptor',
    forma: 'clave',
    patron: /^\d{3}$/,
  })
  regimenFiscalReceptor!: string;

  @EsCampoCondicional({
    cuandoFalta: 'Falta el código postal del receptor (cinco dígitos).',
    etiqueta: 'El código postal del receptor',
    forma: 'clave',
    patron: /^\d{5}$/,
  })
  codigoPostalReceptor!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9]{3}$/i, {
    message:
      'El uso del CFDI son tres caracteres del catálogo del SAT, como G03 o P01.',
  })
  usoCFDI?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Las notas no pueden pasar de 500 caracteres.' })
  notas?: string;
}
