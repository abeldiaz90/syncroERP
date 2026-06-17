import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn, Index
} from 'typeorm';
import { Producto } from './producto.entity';

/**
 * ProductoAtributo — tabla de atributos sectoriales en formato clave/valor.
 *
 * Permite agregar campos específicos por sector sin modificar la entidad
 * principal. Cada sector tiene sus propias claves definidas en los PRESETS
 * de abajo.
 *
 * Ejemplos:
 *   Farmacéutico:  { clave: 'principioActivo',    valor: 'Paracetamol' }
 *   Farmacéutico:  { clave: 'registroSanitario',  valor: 'COFEPRIS/2024/001' }
 *   Cárnico:       { clave: 'especieBovina',       valor: 'Angus' }
 *   Petrolero:     { clave: 'gradoAPI',            valor: '35' }
 *   Hotelero:      { clave: 'amenidad',            valor: 'Shampoo' }
 */
@Entity('producto_atributos')
@Index(['productoId', 'clave'], { unique: true })
export class ProductoAtributo {

  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Producto, (p) => p.atributos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productoId' })
  producto!: Producto;

  @Column({ type: 'uniqueidentifier' })
  productoId!: string;

  /** Identificador del atributo. Ej: 'principioActivo', 'gradoAPI' */
  @Column({ type: 'varchar', length: 100 })
  clave!: string;

  /** Etiqueta legible para mostrar en UI. Ej: 'Principio Activo' */
  @Column({ type: 'varchar', length: 150 })
  etiqueta!: string;

  /** Valor del atributo siempre como string — se convierte en el servicio */
  @Column({ type: 'varchar', length: 500 })
  valor!: string;

  /**
   * Tipo del valor — para que el frontend sepa cómo renderizarlo.
   * TEXT: input de texto
   * NUMBER: input numérico
   * BOOLEAN: checkbox
   * DATE: date picker
   * SELECT: lista de opciones (opciones en metadatos)
   */
  @Column({ type: 'varchar', length: 20, default: 'TEXT' })
  tipoValor!: 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'SELECT';

  /** Unidad del valor cuando tipoValor = NUMBER. Ej: '°C', 'mg', 'API' */
  @Column({ type: 'varchar', length: 20, nullable: true })
  unidad!: string;

  /** Sector al que pertenece. Permite filtrar atributos por contexto */
  @Column({ type: 'varchar', length: 50, nullable: true })
  sector!: string;

  /** Orden de presentación en la ficha del producto */
  @Column({ type: 'int', default: 0 })
  orden!: number;

  @CreateDateColumn()
  fechaCreacion!: Date;
}

// ─────────────────────────────────────────────────────────────────
// PRESETS DE ATRIBUTOS POR SECTOR
// Úsalos en el servicio al crear un producto de un sector específico.
// El frontend los carga dinámicamente desde GET /catalogo/atributos/:sector
// ─────────────────────────────────────────────────────────────────

export const ATRIBUTOS_FARMACEUTICO = [
  { clave: 'principioActivo',    etiqueta: 'Principio Activo',       tipoValor: 'TEXT',   sector: 'FARMACEUTICO', orden: 1 },
  { clave: 'concentracion',      etiqueta: 'Concentración',          tipoValor: 'TEXT',   sector: 'FARMACEUTICO', orden: 2, unidad: 'mg/ml' },
  { clave: 'formaFarmaceutica',  etiqueta: 'Forma Farmacéutica',     tipoValor: 'SELECT', sector: 'FARMACEUTICO', orden: 3 },
  { clave: 'viaAdministracion',  etiqueta: 'Vía de Administración',  tipoValor: 'SELECT', sector: 'FARMACEUTICO', orden: 4 },
  { clave: 'registroSanitario',  etiqueta: 'Registro Sanitario',     tipoValor: 'TEXT',   sector: 'FARMACEUTICO', orden: 5 },
  { clave: 'requiereReceta',     etiqueta: 'Requiere Receta',        tipoValor: 'BOOLEAN',sector: 'FARMACEUTICO', orden: 6 },
  { clave: 'contenidoPiezas',    etiqueta: 'Contenido (piezas)',      tipoValor: 'NUMBER', sector: 'FARMACEUTICO', orden: 7 },
  { clave: 'laboratorio',        etiqueta: 'Laboratorio Fabricante', tipoValor: 'TEXT',   sector: 'FARMACEUTICO', orden: 8 },
];

export const ATRIBUTOS_CARNICO = [
  { clave: 'especie',            etiqueta: 'Especie',                tipoValor: 'SELECT', sector: 'CARNICO', orden: 1 },
  { clave: 'corte',              etiqueta: 'Corte',                  tipoValor: 'TEXT',   sector: 'CARNICO', orden: 2 },
  { clave: 'clasificacionUSDA',  etiqueta: 'Clasificación USDA',     tipoValor: 'SELECT', sector: 'CARNICO', orden: 3 },
  { clave: 'procesoConservacion',etiqueta: 'Proceso de Conservación',tipoValor: 'SELECT', sector: 'CARNICO', orden: 4 },
  { clave: 'tipoProcesado',      etiqueta: 'Tipo Procesado',         tipoValor: 'SELECT', sector: 'CARNICO', orden: 5 },
  { clave: 'origenGeografico',   etiqueta: 'Origen Geográfico',      tipoValor: 'TEXT',   sector: 'CARNICO', orden: 6 },
];

export const ATRIBUTOS_PETROLERO = [
  { clave: 'gradoAPI',           etiqueta: 'Grado API',              tipoValor: 'NUMBER', sector: 'PETROLERO', orden: 1, unidad: '°API' },
  { clave: 'contenidoAzufre',    etiqueta: 'Contenido de Azufre',    tipoValor: 'NUMBER', sector: 'PETROLERO', orden: 2, unidad: '%' },
  { clave: 'puntoFlash',         etiqueta: 'Punto de Inflamación',   tipoValor: 'NUMBER', sector: 'PETROLERO', orden: 3, unidad: '°C' },
  { clave: 'viscosidad',         etiqueta: 'Viscosidad',             tipoValor: 'NUMBER', sector: 'PETROLERO', orden: 4, unidad: 'cSt' },
  { clave: 'normaAplicable',     etiqueta: 'Norma Aplicable',        tipoValor: 'TEXT',   sector: 'PETROLERO', orden: 5 },
  { clave: 'clasificacionONU',   etiqueta: 'Clasificación ONU',      tipoValor: 'TEXT',   sector: 'PETROLERO', orden: 6 },
];

export const ATRIBUTOS_HOTELERO = [
  { clave: 'tipoAmenidad',       etiqueta: 'Tipo de Amenidad',       tipoValor: 'SELECT', sector: 'HOTELERO', orden: 1 },
  { clave: 'areaSuministro',     etiqueta: 'Área de Suministro',     tipoValor: 'SELECT', sector: 'HOTELERO', orden: 2 },
  { clave: 'dosisXHabitacion',   etiqueta: 'Dosis por Habitación',   tipoValor: 'NUMBER', sector: 'HOTELERO', orden: 3 },
  { clave: 'proveedor',          etiqueta: 'Proveedor Específico',   tipoValor: 'TEXT',   sector: 'HOTELERO', orden: 4 },
];