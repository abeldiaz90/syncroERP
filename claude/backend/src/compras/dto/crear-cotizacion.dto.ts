// src/compras/dto/crear-cotizacion.dto.ts
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsSqlServerGuid } from '../../common/validators/sql-server-guid.validator';

export class PartidaCotizacionDto {
  /*
   * `@IsSqlServerGuid` y no `@IsUUID`: los identificadores que vienen de la
   * base migrada de SQL Server no cumplen RFC-4122 —`NEWSEQUENTIALID()` deja
   * cualquier cosa en el nibble de versión— y `@IsUUID` los rechazaba. Con
   * esta validación puesta, cotizar un producto migrado habría fallado con un
   * «productoId must be a UUID» imposible de entender.
   */
  @IsSqlServerGuid()
  productoId: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  cantidad: number;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  precioUnitario: number;

  /** Lo recalcula el servidor; se acepta por compatibilidad con el formulario. */
  @IsOptional()
  @IsNumber()
  subtotal?: number;
}

export class CrearCotizacionDto {
  @IsString()
  @IsNotEmpty()
  requisicionId: string;

  @IsString()
  @IsNotEmpty()
  proveedorId: string;

  /**
   * Tasa pactada con el proveedor, en tanto por uno. Opcional: sin ella, cada
   * partida toma la tasa que su producto tenga en el catálogo.
   *
   * Existe porque una cotización se pacta a una tasa —zona fronteriza, un
   * proveedor que factura exento— y esa tasa debe quedar congelada en el
   * documento, no leerse del catálogo cada vez que alguien lo consulte.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1)
  tasaIva?: number;

  /*
   * Los tres totales siguen aceptándose para no romper el formulario, pero el
   * servidor los RECALCULA y no los cree. Un importe de impuesto que llega
   * tecleado desde el navegador es un importe que nadie verificó contra lo que
   * de verdad se está comprando, y de ahí salía una cuenta de IVA pendiente de
   * pago que no volvía a cero nunca.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  subtotal?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  impuestoTotal?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  total?: number;

  @IsOptional()
  @IsString()
  notas?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartidaCotizacionDto)
  detalles: PartidaCotizacionDto[];
}
