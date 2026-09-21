import {
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsArray,
  ValidateNested,
  IsEnum,
  IsInt,
  Min,
  IsNotEmpty,
  MaxLength,
  ArrayUnique,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  TipoProducto,
  CondicionAlmacen,
  TipoCosto,
  MonedaCosto,
} from '../entities/producto.entity';
import { IsSqlServerGuidOpcional } from '../../common/validators/sql-server-guid.validator';

// ─────────────────────────────────────────────────────────────────
// SUB-DTOS
// ─────────────────────────────────────────────────────────────────

export class EquivalenciaDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty({ message: 'El nombre del empaque es obligatorio.' })
  nombreEmpaque: string;

  @IsNumber({}, { message: 'El factor de conversión debe ser numérico.' })
  @Min(1, { message: 'El factor de conversión debe ser al menos 1.' })
  factorConversion: number;

  @IsString()
  @IsOptional()
  codigoBarras?: string;
}

export class PrecioListaDto {
  @IsString()
  @IsNotEmpty({ message: 'La lista de precio es obligatoria.' })
  listaPrecioId: string;

  @IsNumber({}, { message: 'El precio de venta debe ser numérico.' })
  @Min(0, { message: 'El precio de venta no puede ser negativo.' })
  precio: number;
}

export class ImagenProductoDto {
  @IsString()
  url: string;

  @IsBoolean()
  @IsOptional()
  principal?: boolean;
}

export class AtributoDto {
  @IsString()
  clave: string;

  @IsString()
  etiqueta: string;

  @IsString()
  valor: string;

  @IsString()
  @IsOptional()
  tipoValor?: 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'SELECT';

  @IsString()
  @IsOptional()
  unidad?: string;

  @IsString()
  @IsOptional()
  sector?: string;

  @IsInt()
  @IsOptional()
  orden?: number;
}

// ─────────────────────────────────────────────────────────────────
// DTO PRINCIPAL
// ─────────────────────────────────────────────────────────────────

export class CrearProductoDto {
  // ── IDENTIFICACIÓN ──────────────────────────────────────────────

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty({ message: 'El nombre del producto es obligatorio.' })
  @MaxLength(200, { message: 'El nombre no puede exceder 200 caracteres.' })
  nombre: string;

  @IsString()
  @IsOptional()
  nombreCorto?: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @IsString()
  @IsNotEmpty({ message: 'El SKU es obligatorio.' })
  @MaxLength(80, { message: 'El SKU no puede exceder 80 caracteres.' })
  sku: string;

  @IsString()
  @IsOptional()
  codigoBarras?: string;

  @IsString()
  @IsOptional()
  codigoBarras2?: string;

  @IsString()
  @IsOptional()
  codigoProveedor?: string;

  @IsString()
  @IsOptional()
  descripcion?: string;

  @IsString()
  @IsOptional()
  observacionesInternas?: string;

  // ── CLASIFICACIÓN SAT ───────────────────────────────────────────

  @IsString()
  @IsOptional()
  claveSAT?: string;

  @IsString()
  @IsOptional()
  claveUnidadSAT?: string;

  // ── TIPO Y UNIDAD ───────────────────────────────────────────────

  @IsEnum(TipoProducto)
  @IsOptional()
  tipo?: TipoProducto;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty({ message: 'La unidad de medida es obligatoria.' })
  unidadMedida: string;

  @IsString()
  @IsOptional()
  unidadMedidaSecundaria?: string;

  @IsBoolean()
  @IsOptional()
  esGranel?: boolean;

  // ── COSTOS ──────────────────────────────────────────────────────

  @IsNumber({}, { message: 'El precio de compra debe ser numérico.' })
  @Min(0, { message: 'El precio de compra no puede ser negativo.' })
  precioCompra: number;

  @IsEnum(MonedaCosto)
  @IsOptional()
  monedaCosto?: MonedaCosto;

  @IsEnum(TipoCosto)
  @IsOptional()
  tipoCosto?: TipoCosto;

  @IsNumber()
  @IsOptional()
  costoEstandar?: number;

  // ── ALMACENAMIENTO ───────────────────────────────────────────────

  @IsEnum(CondicionAlmacen)
  @IsOptional()
  condicionAlmacen?: CondicionAlmacen;

  @IsNumber()
  @IsOptional()
  temperaturaMinC?: number;

  @IsNumber()
  @IsOptional()
  temperaturaMaxC?: number;

  // ── LOGÍSTICA ───────────────────────────────────────────────────

  @IsNumber()
  @IsOptional()
  pesoKg?: number;

  @IsNumber()
  @IsOptional()
  volumenCm3?: number;

  @IsInt()
  @IsOptional()
  diasVidaUtil?: number;

  // ── CONTROL DE INVENTARIO ────────────────────────────────────────

  @IsInt()
  @Min(0)
  @IsOptional()
  stockMinimo?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  stockMaximo?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  puntoReorden?: number;

  @IsNumber()
  @IsOptional()
  cantidadMinimaPedido?: number;

  @IsBoolean()
  @IsOptional()
  requiereLote?: boolean;

  @IsBoolean()
  @IsOptional()
  requiereCaducidad?: boolean;

  @IsBoolean()
  @IsOptional()
  permiteVentaSinStock?: boolean;

  @IsBoolean()
  @IsOptional()
  requiereNumeroSerie?: boolean;

  // ── COMERCIO EXTERIOR ────────────────────────────────────────────

  @IsString()
  @IsOptional()
  fraccionArancelaria?: string;

  @IsString()
  @IsOptional()
  paisOrigen?: string;

  // ── RELACIONES ───────────────────────────────────────────────────

  @IsSqlServerGuidOpcional()
  categoriaId?: string;

  @IsSqlServerGuidOpcional()
  marcaId?: string;

  @IsSqlServerGuidOpcional()
  impuestoId?: string;

  // ── STOCK INICIAL ────────────────────────────────────────────────

  @IsNumber()
  @Min(0)
  @IsOptional()
  stockActual?: number;

  @IsSqlServerGuidOpcional()
  almacenId?: string;

  // ── COLECCIONES ───────────────────────────────────────────────────

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrecioListaDto)
  @IsOptional()
  precios?: PrecioListaDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImagenProductoDto)
  @IsOptional()
  imagenes?: ImagenProductoDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EquivalenciaDto)
  @IsOptional()
  equivalencias?: EquivalenciaDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AtributoDto)
  @IsOptional()
  atributos?: AtributoDto[];
}
