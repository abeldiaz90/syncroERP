import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { IsSqlServerGuid } from '../../common/validators/sql-server-guid.validator';

export class AbrirTurnoCajaDto {
  @IsSqlServerGuid()
  cuentaCajaId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  fondoInicial!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observaciones?: string;
}

export class MovimientoManualCajaDto {
  @IsSqlServerGuid()
  cuentaCajaId!: string;

  /**
   * Cuenta contra la que se registra en el mayor. Una entrada o un retiro
   * manual de caja no se pueden contabilizar sin saber su contrapartida: un
   * retiro puede ser un depósito al banco, un gasto o una entrega a la
   * dirección, y cada caso afecta una cuenta distinta.
   */
  @IsSqlServerGuid()
  cuentaContrapartidaId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  importe!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  concepto!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  referencia?: string;
}

export class CerrarTurnoCajaDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  efectivoContado!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observaciones?: string;
}
