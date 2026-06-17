// src/compras/dto/crear-cotizacion.dto.ts
import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsOptional,
  IsNumber,
  Min,
} from 'class-validator';

export class CrearCotizacionDto {
  @IsString()
  @IsNotEmpty()
  requisicionId: string;

  @IsString()
  @IsNotEmpty()
  proveedorId: string;

  @IsNumber()
  @Min(0)
  subtotal: number;

  @IsNumber()
  @Min(0)
  impuestoTotal: number;

  @IsNumber()
  @Min(0)
  total: number;

  @IsOptional()
  @IsString()
  notas?: string;

  @IsArray()
  detalles: {
    productoId: string;
    cantidad: number;
    precioUnitario: number;
    subtotal: number;
  }[];
}