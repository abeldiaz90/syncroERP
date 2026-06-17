import {
  IsString, IsNumber, IsBoolean, IsOptional,
  IsArray, ValidateNested, IsEnum, IsInt, Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  TipoProducto,
  CondicionAlmacen,
  TipoCosto,
  MonedaCosto,
} from '../entities/producto.entity';

// ─────────────────────────────────────────────────────────────────
// SUB-DTOS
// ─────────────────────────────────────────────────────────────────

export class EquivalenciaDto {
  @IsString()
  nombreEmpaque: string;

  @IsNumber()
  factorConversion: number;

  @IsString()
  @IsOptional()
  codigoBarras?: string;
}

export class PrecioListaDto {
  @IsString()
  listaPrecioId: string;

  @IsNumber()
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

  @IsString()
  nombre: string;

  @IsString()
  @IsOptional()
  nombreCorto?: string;

  @IsString()
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

  @IsString()
  unidadMedida: string;

  @IsString()
  @IsOptional()
  unidadMedidaSecundaria?: string;

  @IsBoolean()
  @IsOptional()
  esGranel?: boolean;

  // ── COSTOS ──────────────────────────────────────────────────────

  @IsNumber()
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

  @IsString()
  @IsOptional()
  categoriaId?: string;

  @IsString()
  @IsOptional()
  marcaId?: string;

  @IsString()
  @IsOptional()
  impuestoId?: string;

  // ── STOCK INICIAL ────────────────────────────────────────────────

  @IsNumber()
  @Min(0)
  @IsOptional()
  stockActual?: number;

  @IsString()
  @IsOptional()
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