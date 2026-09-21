import {
  IsString,
  IsOptional,
  IsArray,
  IsNumber,
  IsIn,
  ValidateNested,
  IsDateString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsSqlServerGuid, IsSqlServerGuidOpcional } from '../common/validators/sql-server-guid.validator';

export class PartidaDto {
  @IsSqlServerGuidOpcional()
  productoId?: string;

  @IsString()
  claveSAT: string; // Clave SAT del producto/servicio

  @IsString()
  claveUnidadSAT: string; // Clave unidad SAT (H87=Pieza, KGM=Kilo, etc.)

  @IsString()
  @IsOptional()
  unidadMedida?: string;

  @IsString()
  @IsOptional()
  noIdentificacion?: string; // SKU

  @IsString()
  descripcion: string;

  @IsNumber()
  @Min(0.001)
  cantidad: number;

  @IsNumber()
  @Min(0)
  precioUnitario: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  descuento?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  tasaIVA?: number; // 0.16 = 16%, 0.08 = 8%, 0 = tasa cero

  /** CFDI 4.0 c_ObjetoImp. No se infiere exención a partir de una tasa cero. */
  @IsIn(['01', '02', '03', '04'])
  @IsOptional()
  objetoImpuesto?: '01' | '02' | '03' | '04';

  @IsIn(['TASA', 'EXENTO', 'NO_OBJETO'])
  @IsOptional()
  tipoFactor?: 'TASA' | 'EXENTO' | 'NO_OBJETO';
}

export class CrearFacturaDto {
  @IsSqlServerGuidOpcional()
  ventaId?: string;

  // ── RECEPTOR ──────────────────────────────────────────────────────
  @IsSqlServerGuidOpcional()
  clienteId?: string;

  @IsString()
  rfcReceptor: string;

  @IsString()
  nombreReceptor: string;

  @IsString()
  regimenFiscalReceptor: string; // Ej: '612', '601', '626'

  @IsString()
  codigoPostalReceptor: string;

  @IsString()
  @IsOptional()
  usoCFDI?: string; // Ej: 'G01', 'G03', 'S01'

  // ── PAGO ──────────────────────────────────────────────────────────
  @IsString()
  @IsOptional()
  formaPago?: string; // '01'=Efectivo, '03'=Transferencia, '04'=T.Crédito

  @IsString()
  @IsOptional()
  metodoPago?: string; // 'PUE' o 'PPD'

  @IsString()
  @IsOptional()
  moneda?: string; // 'MXN' por defecto

  @IsNumber()
  @IsOptional()
  tipoCambio?: number;

  // ── PARTIDAS ──────────────────────────────────────────────────────
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartidaDto)
  partidas: PartidaDto[];

  @IsString()
  @IsOptional()
  notas?: string;

  @IsOptional()
  @IsDateString()
  fecha?: string;
}
