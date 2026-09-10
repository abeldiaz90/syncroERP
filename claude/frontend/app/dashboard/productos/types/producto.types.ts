// ─────────────────────────────────────────────────────────────────
// CATÁLOGOS BÁSICOS
// ─────────────────────────────────────────────────────────────────

export interface ICatalogoBasico {
  id: string;
  nombre: string;
}

export interface IImpuesto {
  id: string;
  nombre: string;
  porcentaje: number;
}

export interface IListaPrecio {
  id: string;
  nombre: string;
  esPorDefecto: boolean;
}

// ─────────────────────────────────────────────────────────────────
// ENUMS (espejo de los enums del backend)
// ─────────────────────────────────────────────────────────────────

export type TipoProducto = 'FISICO' | 'SERVICIO' | 'CONSUMIBLE' | 'KIT' | 'MATERIA_PRIMA';
export type CondicionAlmacen = 'AMBIENTE' | 'REFRIGERADO' | 'CONGELADO' | 'CONTROLADO' | 'INFLAMABLE';
export type TipoCosto = 'PROMEDIO' | 'ESTANDAR' | 'FIFO' | 'LIFO' | 'ESPECIFICO';
export type MonedaCosto = 'MXN' | 'USD' | 'EUR';

// ─────────────────────────────────────────────────────────────────
// SUB-ENTIDADES
// ─────────────────────────────────────────────────────────────────

export interface IImagen {
  id?: string;
  url: string;
  principal: boolean;
  orden?: number;
}

export interface IEquivalencia {
  id?: string;
  nombreEmpaque: string;
  factorConversion: number;
  codigoBarras?: string;
  padreIdx?: number | null;
  // Relaciones que puede devolver el backend
  equivalenciaBaseNombre?: string;
  equivalenciaBase?: IEquivalencia;
}

export interface IAtributoProducto {
  id?: string;
  clave: string;
  etiqueta: string;
  valor: string;
  tipoValor?: 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'SELECT';
  unidad?: string;
  sector?: string;
  orden?: number;
}

export interface ILoteInventario {
  id: string;
  numeroLote: string;
  fechaCaducidad: string | null;
  stockRestante: number;
  almacenId: string;
  almacen?: { nombre: string };
}

export interface IPrecioProducto {
  listaPrecioId: string;
  precio: number;
  listaPrecio?: IListaPrecio;
}

// ─────────────────────────────────────────────────────────────────
// PRODUCTO COMPLETO (lo que devuelve el backend)
// ─────────────────────────────────────────────────────────────────

export interface IProducto {
  id: string;
  empresaId?: string;

  // ── Identificación ─────────────────────────────────────────────
  nombre: string;
  nombreCorto?: string;
  sku: string;
  codigoBarras?: string;
  codigoBarras2?: string;
  codigoProveedor?: string;
  descripcion?: string;
  observacionesInternas?: string;

  // ── SAT ────────────────────────────────────────────────────────
  claveSAT?: string;
  claveUnidadSAT?: string;

  // ── Tipo y unidad ──────────────────────────────────────────────
  tipo: TipoProducto | string;
  unidadMedida: string;
  unidadMedidaSecundaria?: string;
  esGranel?: boolean;

  // ── Costos ─────────────────────────────────────────────────────
  precioCompra: number;
  precioVenta?: number;
  monedaCosto?: MonedaCosto | string;
  tipoCosto?: TipoCosto | string;
  costoEstandar?: number | null;

  // ── Almacenamiento ─────────────────────────────────────────────
  condicionAlmacen?: CondicionAlmacen | string;
  temperaturaMinC?: number | null;
  temperaturaMaxC?: number | null;

  // ── Logística ──────────────────────────────────────────────────
  pesoKg?: number;
  volumenCm3?: number;
  diasVidaUtil?: number | null;

  // ── Control de inventario ──────────────────────────────────────
  stockActual?: number;
  stockMinimo?: number;
  stockMaximo?: number | null;
  puntoReorden?: number | null;
  cantidadMinimaPedido?: number | null;
  requiereLote?: boolean;
  requiereCaducidad?: boolean;
  permiteVentaSinStock?: boolean;
  requiereNumeroSerie?: boolean;

  // ── Comercio exterior ──────────────────────────────────────────
  fraccionArancelaria?: string;
  paisOrigen?: string;

  // ── Relaciones ─────────────────────────────────────────────────
  categoriaId?: string;
  marcaId?: string;
  impuestoId?: string;
  activo: boolean;

  // ── Colecciones ────────────────────────────────────────────────
  imagenes?: IImagen[];
  preciosProducto?: IPrecioProducto[];
  equivalencias?: IEquivalencia[];
  atributos?: IAtributoProducto[];
  lotes?: ILoteInventario[];
}

// ─────────────────────────────────────────────────────────────────
// FORM DATA (lo que maneja el formulario en el frontend)
// ─────────────────────────────────────────────────────────────────

export interface IFormData {
  // ── Identificación ─────────────────────────────────────────────
  nombre: string;
  nombreCorto: string;
  sku: string;
  codigoBarras: string;
  codigoBarras2: string;
  codigoProveedor: string;
  descripcion: string;
  observacionesInternas: string;

  // ── SAT ────────────────────────────────────────────────────────
  claveSAT: string;
  claveUnidadSAT: string;

  // ── Tipo y unidad ──────────────────────────────────────────────
  tipo: string;
  unidadMedida: string;
  unidadMedidaSecundaria: string;
  esGranel: boolean;

  // ── Costos ─────────────────────────────────────────────────────
  precioCompra: number;
  monedaCosto: string;
  tipoCosto: string;
  costoEstandar: number | null;

  // ── Almacenamiento ─────────────────────────────────────────────
  condicionAlmacen: string;
  temperaturaMinC: number | null;
  temperaturaMaxC: number | null;

  // ── Logística ──────────────────────────────────────────────────
  pesoKg: number;
  volumenCm3: number;
  diasVidaUtil: number | null;

  // ── Control de inventario ──────────────────────────────────────
  stockActual: number;
  stockMinimo: number;
  stockMaximo: number | null;
  puntoReorden: number | null;
  cantidadMinimaPedido: number | null;
  requiereLote: boolean;
  requiereCaducidad: boolean;
  permiteVentaSinStock: boolean;
  requiereNumeroSerie: boolean;

  // ── Comercio exterior ──────────────────────────────────────────
  fraccionArancelaria: string;
  paisOrigen: string;

  // ── Relaciones ─────────────────────────────────────────────────
  categoriaId: string;
  marcaId: string;
  impuestoId: string;
  almacenId: string;

  // ── Colecciones ────────────────────────────────────────────────
  imagenes: IImagen[];
  precios: { listaPrecioId: string; precio: number }[];
  equivalencias: IEquivalencia[];
  atributos: IAtributoProducto[];
}