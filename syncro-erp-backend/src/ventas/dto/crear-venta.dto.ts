import {
  IsString, IsNotEmpty, IsOptional,
  IsArray, IsNumber, Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

// ── Sin @ValidateNested — evita el problema de transform en el pipe ──
// La validación profunda de cada detalle la hace el servicio directamente.
export class CrearVentaDto {

  @IsOptional()
  @Transform(({ value }) => value === '' ? null : value)
  clienteId?: string | null;

  @IsString()
  @IsNotEmpty()
  metodoPago: string;

  @IsOptional()
  @Transform(({ value }) => value === '' ? null : value)
  almacenId?: string | null;

  @IsNumber()
  @Min(0)
  subtotal: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  descuento?: number;

  @IsNumber()
  @Min(0)
  impuestoTotal: number;

  @IsNumber()
  @Min(0)
  total: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  montoRecibido?: number;

  @IsOptional()
  @IsString()
  notas?: string;

  @IsArray()
  detalles: Array<{
    productoId: string;
    cantidad: number;
    precioUnitario: number;
    descuento?: number;
    subtotal: number;
    impuestoPorcentaje?: number;
    impuestoMonto?: number;
  }>;
}