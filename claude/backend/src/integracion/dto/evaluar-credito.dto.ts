import {
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { IsSqlServerGuid } from '../../common/validators/sql-server-guid.validator';

export class EvaluarCreditoDto {
  @IsSqlServerGuid() clienteId!: string;

  @IsNumber() @Min(0) limiteSolicitado!: number;

  /** Techo que la empresa autoriza sin pasar por comité. */
  @IsNumber() @Min(0) topeAutomatico!: number;

  /** Folio de la autorización firmada del titular para consultar buró. */
  @IsOptional() @IsString() folioAutorizacionBuro?: string;
}
