import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Acciones operativas sobre una línea ya resuelta.
 * La autorización y el rechazo sólo ocurren en la bandeja central.
 */
export class GestionarCreditoClienteDto {
  @IsIn(['REENVIAR', 'SUSPENDER'])
  decision: 'REENVIAR' | 'SUSPENDER';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comentario?: string;
}
