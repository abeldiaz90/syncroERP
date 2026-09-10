import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class EvaluarCreditoDto {
  @IsUUID() clienteId!: string;

  @IsNumber() @Min(0) limiteSolicitado!: number;

  /** Techo que la empresa autoriza sin pasar por comité. */
  @IsNumber() @Min(0) topeAutomatico!: number;

  /** Folio de la autorización firmada del titular para consultar buró. */
  @IsOptional() @IsString() folioAutorizacionBuro?: string;
}
