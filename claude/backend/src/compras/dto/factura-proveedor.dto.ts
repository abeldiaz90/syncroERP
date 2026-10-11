import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { IsSqlServerGuid } from '../../common/validators/sql-server-guid.validator';
import { IsFechaOpcional } from '../../common/validators/fecha-opcional.validator';

/**
 * Una partida del comprobante del proveedor.
 *
 * `detalleOrdenId` es opcional a propósito: una factura puede traer un renglón
 * que no está en la orden —un flete, un cargo por maniobras— y el cotejo tiene
 * que poder verlo para denunciarlo. Si el DTO lo exigiera, ese renglón no
 * podría capturarse y la diferencia desaparecería de la vista en lugar de
 * aparecer en el reporte.
 */
export class PartidaFacturaProveedorDto {
  @IsOptional() @IsSqlServerGuid() detalleOrdenId?: string;

  @IsOptional() @IsSqlServerGuid() productoId?: string;

  @IsOptional() @IsString() @MaxLength(300) descripcion?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  cantidad: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  precioUnitario: number;

  /** La tasa como fracción: 0.16, no 16. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(1)
  tasaIva?: number;
}

export class RegistrarFacturaProveedorDto {
  @IsSqlServerGuid() proveedorId: string;

  /**
   * La orden de compra, cuando la hay. Las facturas de servicios recurrentes
   * —luz, honorarios, renta— no nacen de una orden y se capturan sin ella; lo
   * que pierden es el cotejo, no la captura.
   */
  @IsOptional() @IsSqlServerGuid() ordenCompraId?: string;

  /**
   * El folio fiscal del SAT. No se valida la forma aquí además del servicio
   * porque la negativa del servicio explica qué hacer cuando el comprobante no
   * es un CFDI; un «no cumple el patrón» de class-validator no lo explicaría.
   */
  @IsOptional() @IsString() @MaxLength(36) uuidFiscal?: string;

  /** El folio que el proveedor imprime en su papel. */
  @IsOptional() @IsString() @MaxLength(60) folioProveedor?: string;

  @IsFechaOpcional() fechaEmision: string;

  @IsFechaOpcional() @IsOptional() fechaVencimiento?: string;

  /**
   * El total del comprobante, si quien captura lo tiene a la vista. No se usa
   * para guardar —los importes se recalculan de las partidas— sino para
   * comparar y denunciar la diferencia.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  total?: number;

  @IsOptional() @IsString() @IsIn(['MXN', 'USD', 'EUR']) moneda?: string;

  /** El XML del CFDI, tal cual llegó, para que el papel no se pierda. */
  @IsOptional() @IsString() @MaxLength(400000) xml?: string;

  @IsOptional() @IsString() @MaxLength(500) notas?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PartidaFacturaProveedorDto)
  detalles: PartidaFacturaProveedorDto[];
}

export class CancelarFacturaProveedorDto {
  @IsString() @MinLength(5) @MaxLength(300) motivo: string;
}
