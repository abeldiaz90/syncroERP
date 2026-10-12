import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { IsFechaOpcional } from '../../common/validators/fecha-opcional.validator';
import {
  IsSqlServerGuid,
  IsSqlServerGuidOpcional,
} from '../../common/validators/sql-server-guid.validator';

export class PartidaPedidoVentaDto {
  @IsSqlServerGuid() productoId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  cantidad: number;

  /**
   * El precio que la pantalla cree que aplica. Como en el mostrador, **no se
   * usa para calcular**: el servidor resuelve el precio con la lista y sólo
   * compara, para avisar de que la pantalla estaba desactualizada.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  precioUnitario?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  descuento?: number;
}

export class CrearPedidoVentaDto {
  @IsSqlServerGuidOpcional() clienteId?: string;

  /** De qué almacén se compromete la mercancía: ahí se aparta. */
  @IsSqlServerGuidOpcional() almacenId?: string;

  @IsSqlServerGuidOpcional() listaPrecioId?: string;

  @IsFechaOpcional() @IsOptional() fechaPedido?: string;

  /** Cuándo se le dijo al cliente que lo tendría. */
  @IsFechaOpcional() @IsOptional() fechaCompromiso?: string;

  @IsOptional() @IsString() @MaxLength(300) notas?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PartidaPedidoVentaDto)
  detalles: PartidaPedidoVentaDto[];
}

export class LineaASurtirDto {
  @IsSqlServerGuid() detalleId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  cantidad: number;
}

export class SurtirPedidoDto {
  /** Sin lista, se surte todo lo que esté apartado. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LineaASurtirDto)
  lineas?: LineaASurtirDto[];

  @IsString() metodoPago: string;

  @IsSqlServerGuidOpcional() cuentaBancariaId?: string;

  /**
   * Cobrar el precio de hoy cuando no es el que se pactó. Es explícito a
   * propósito: la negativa que lo pide nombra los dos números, y aceptarlo
   * queda escrito en las notas de la venta.
   */
  @IsOptional() @IsBoolean() aceptarPrecioVigente?: boolean;

  @IsOptional() @IsString() @MaxLength(200) notas?: string;
}

export class CancelarPedidoVentaDto {
  @IsString() @MinLength(5) @MaxLength(300) motivo: string;
}
