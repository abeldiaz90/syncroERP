import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, Unique, ManyToOne, JoinColumn, OneToMany
} from 'typeorm';
import { Categoria } from './categoria.entity';
import { StockPorAlmacen } from './stock-por-almacen.entity';
import { Marca } from './marca.entity';
import { Impuesto } from './impuesto.entity';
import { ImagenProducto } from './imagen-producto.entity';
import { ProductoPrecio } from './producto-precio.entity';
import { ProductoEquivalencia } from './producto-equivalencia.entity';
import { LoteInventario } from './lote-inventario.entity';
import { ProductoAtributo } from './producto-atributo.entity';

// ─────────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────────

/** Tipo de producto — define comportamiento en el sistema */
export enum TipoProducto {
  FISICO     = 'FISICO',      // Producto tangible con stock
  SERVICIO   = 'SERVICIO',    // Servicio sin stock (honorarios, mano de obra)
  CONSUMIBLE = 'CONSUMIBLE',  // Artículo de uso interno (papelería, limpieza)
  KIT        = 'KIT',         // Paquete compuesto de varios productos
  MATERIA_PRIMA = 'MATERIA_PRIMA', // Para manufactura
}

/** Condición de almacenamiento — crítico para alimentos y farmacia */
export enum CondicionAlmacen {
  AMBIENTE     = 'AMBIENTE',     // 15-25°C, condiciones normales
  REFRIGERADO  = 'REFRIGERADO',  // 2-8°C (lácteos, carnes frías, medicamentos)
  CONGELADO    = 'CONGELADO',    // -18°C o menos (carnes, helados)
  CONTROLADO   = 'CONTROLADO',   // Temperatura y humedad específica
  INFLAMABLE   = 'INFLAMABLE',   // Bodega especial (petroquímica, solventes)
}

/** Estrategia de costeo del inventario */
export enum TipoCosto {
  PROMEDIO   = 'PROMEDIO',    // Costo promedio ponderado (más común en México)
  ESTANDAR   = 'ESTANDAR',   // Costo estándar fijo (manufactura)
  FIFO       = 'FIFO',       // Primero en entrar, primero en salir
  LIFO       = 'LIFO',       // Último en entrar, primero en salir
  ESPECIFICO = 'ESPECIFICO', // Identificación específica (artículos de alto valor)
}

/** Moneda del costo de adquisición */
export enum MonedaCosto {
  MXN = 'MXN',
  USD = 'USD',
  EUR = 'EUR',
}

// ─────────────────────────────────────────────────────────────────
// ENTIDAD PRINCIPAL
// ─────────────────────────────────────────────────────────────────

@Entity('productos')
@Unique(['empresaId', 'sku'])
export class Producto {

  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uniqueidentifier' })
  empresaId!: string;

  // ── IDENTIFICACIÓN ──────────────────────────────────────────────

  @Column({ type: 'varchar', length: 200 })
  nombre!: string;

  /** Nombre corto para tickets de venta (máx 60 chars) */
  @Column({ type: 'varchar', length: 60, nullable: true })
  nombreCorto!: string;

  @Column({ type: 'varchar', length: 50 })
  sku!: string;

  /** Código de barras principal (EAN-13, UPC-A, Code128) */
  @Column({ type: 'varchar', length: 50, nullable: true })
  codigoBarras!: string;

  /** Código de barras secundario (algunos productos tienen EAN y UPC) */
  @Column({ type: 'varchar', length: 50, nullable: true })
  codigoBarras2!: string;

  /** Código interno del proveedor principal */
  @Column({ type: 'varchar', length: 100, nullable: true })
  codigoProveedor!: string;

  @Column({ type: 'text', nullable: true })
  descripcion!: string;

  /** Notas internas — no se muestran al cliente */
  @Column({ type: 'text', nullable: true })
  observacionesInternas!: string;

  // ── CLASIFICACIÓN SAT (obligatorio para CFDI 4.0) ──────────────

  /**
   * Clave del catálogo de productos y servicios del SAT.
   * Ej: 50202300 = Medicamentos, 10101500 = Ganado bovino
   * https://www.sat.gob.mx/cs/Satellite/claveprodserv
   */
  @Column({ type: 'varchar', length: 20, nullable: true })
  claveSAT!: string;

  /**
   * Clave de unidad de medida del SAT.
   * Ej: H87=Pieza, KGM=Kilogramo, LTR=Litro, E48=Unidad de servicio
   */
  @Column({ type: 'varchar', length: 10, nullable: true })
  claveUnidadSAT!: string;

  // ── TIPO Y UNIDAD DE MEDIDA ──────────────────────────────────────

  @Column({ type: 'varchar', length: 20, default: TipoProducto.FISICO })
  tipo!: TipoProducto;

  /** Unidad base de inventario (PIEZA, KILOGRAMO, LITRO, METRO, CAJA) */
  @Column({ type: 'varchar', length: 20, default: 'PIEZA' })
  unidadMedida!: string;

  /**
   * Unidad secundaria para reportes (ej: se compra en CAJA pero
   * el stock se lleva en PIEZA). Distinto a equivalencias.
   */
  @Column({ type: 'varchar', length: 20, nullable: true })
  unidadMedidaSecundaria!: string;

  /**
   * Se vende por peso variable (báscula).
   * Crítico para carnicerías, pescaderías, graneles.
   */
  @Column({ default: false })
  esGranel!: boolean;

  // ── COSTOS ──────────────────────────────────────────────────────

  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 })
  precioCompra!: number;

  @Column({ type: 'varchar', length: 3, default: MonedaCosto.MXN })
  monedaCosto!: MonedaCosto;

  /**
   * Estrategia de costeo.
   * PROMEDIO es el más común para comercio en México.
   * FIFO es obligatorio para farmacia con control de caducidades.
   */
  @Column({ type: 'varchar', length: 20, default: TipoCosto.PROMEDIO })
  tipoCosto!: TipoCosto;

  /**
   * Costo estándar (solo cuando tipoCosto = ESTANDAR).
   * Se actualiza manualmente o por proceso de costeo.
   */
  @Column({ type: 'decimal', precision: 18, scale: 4, nullable: true })
  costoEstandar!: number;

  // ── ALMACENAMIENTO ───────────────────────────────────────────────

  @Column({ type: 'varchar', length: 20, default: CondicionAlmacen.AMBIENTE })
  condicionAlmacen!: CondicionAlmacen;

  /** Temperatura mínima en °C (para refrigerados/congelados) */
  @Column({ type: 'decimal', precision: 5, scale: 1, nullable: true })
  temperaturaMinC!: number;

  /** Temperatura máxima en °C */
  @Column({ type: 'decimal', precision: 5, scale: 1, nullable: true })
  temperaturaMaxC!: number;

  // ── LOGÍSTICA ───────────────────────────────────────────────────

  @Column({ type: 'decimal', precision: 10, scale: 3, nullable: true })
  pesoKg!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  volumenCm3!: number;

  /** Días de vida útil desde la fecha de producción/fabricación */
  @Column({ type: 'int', nullable: true })
  diasVidaUtil!: number;

  // ── CONTROL DE INVENTARIO ────────────────────────────────────────

  @Column({ type: 'int', default: 5 })
  stockMinimo!: number;

  @Column({ type: 'int', nullable: true })
  stockMaximo!: number;

  /** Punto de reorden — cuándo lanzar una requisición automática */
  @Column({ type: 'int', nullable: true })
  puntoReorden!: number;

  /** Cantidad mínima de compra al proveedor */
  @Column({ type: 'decimal', precision: 10, scale: 3, nullable: true })
  cantidadMinimaPedido!: number;

  @Column({ default: false })
  requiereLote!: boolean;

  @Column({ default: false })
  requiereCaducidad!: boolean;

  @Column({ default: false })
  permiteVentaSinStock!: boolean;

  /** Requiere número de serie único por unidad (electrónicos, activos fijos) */
  @Column({ default: false })
  requiereNumeroSerie!: boolean;

  // ── COMERCIO EXTERIOR ────────────────────────────────────────────

  /**
   * Fracción arancelaria (para importaciones y complemento de comercio exterior).
   * Ej: 0201.10.01 = Canales de bovino frescos
   */
  @Column({ type: 'varchar', length: 20, nullable: true })
  fraccionArancelaria!: string;

  /** País de origen (para complemento de comercio exterior en CFDI) */
  @Column({ type: 'varchar', length: 3, nullable: true })
  paisOrigen!: string;

  // ── RELACIONES ───────────────────────────────────────────────────

  @ManyToOne(() => Marca, { nullable: true })
  @JoinColumn({ name: 'marcaId' })
  marca!: Marca;

  @Column({ type: 'uniqueidentifier', nullable: true })
  marcaId!: string;

  @ManyToOne(() => Categoria, { nullable: true })
  @JoinColumn({ name: 'categoriaId' })
  categoria!: Categoria;

  @Column({ type: 'uniqueidentifier', nullable: true })
  categoriaId!: string;

  @ManyToOne(() => Impuesto, { nullable: true })
  @JoinColumn({ name: 'impuestoId' })
  impuesto!: Impuesto;

  @Column({ type: 'uniqueidentifier', nullable: true })
  impuestoId!: string;

  // ── ESTADO ───────────────────────────────────────────────────────

  @Column({ default: true })
  activo!: boolean;

  @CreateDateColumn()
  fechaCreacion!: Date;

  @UpdateDateColumn()
  fechaActualizacion!: Date;

  // ── COLECCIONES ───────────────────────────────────────────────────

  @OneToMany(() => StockPorAlmacen, (stock) => stock.producto)
  stocksPorAlmacen!: StockPorAlmacen[];

  @OneToMany(() => ImagenProducto, (imagen) => imagen.producto, { cascade: true })
  imagenes!: ImagenProducto[];

  @OneToMany(() => ProductoPrecio, (precio) => precio.producto, { cascade: true })
  preciosProducto!: ProductoPrecio[];

  @OneToMany(() => ProductoEquivalencia, (eq) => eq.producto, { cascade: true })
  equivalencias!: ProductoEquivalencia[];

  @OneToMany(() => LoteInventario, (lote) => lote.producto)
  lotes!: LoteInventario[];

  /** Atributos sectoriales — clave/valor sin alterar esta entidad */
  @OneToMany(() => ProductoAtributo, (attr) => attr.producto, { cascade: true })
  atributos!: ProductoAtributo[];
}