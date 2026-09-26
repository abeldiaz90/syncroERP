import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import {
  IsSqlServerGuid,
} from '../../common/validators/sql-server-guid.validator';
import { IsFechaOpcional } from '../../common/validators/fecha-opcional.validator';

export class PartidaDevolucionProveedorDto {
  @IsSqlServerGuid() detalleOrdenId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  cantidad: number;
}

export class CrearDevolucionProveedorDto {
  @IsSqlServerGuid() ordenCompraId: string;

  /** De qué almacén sale la mercancía. */
  @IsSqlServerGuid() almacenId: string;

  @IsFechaOpcional() fecha: string;

  /*
   * El motivo es obligatorio y con cuerpo. Dentro de seis meses es lo único
   * que explicará por qué salió mercancía del almacén sin haberse vendido.
   */
  @IsString() @MinLength(5) @MaxLength(500) motivo: string;

  /** El folio de la nota de crédito del proveedor, cuando ya llegó. */
  @IsOptional() @IsString() @MaxLength(60) notaCreditoProveedor?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PartidaDevolucionProveedorDto)
  partidas: PartidaDevolucionProveedorDto[];
}
