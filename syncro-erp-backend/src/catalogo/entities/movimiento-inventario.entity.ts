import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Producto } from './producto.entity';
import { Almacen } from './almacen.entity';

@Entity('movimientos_inventario')
export class MovimientoInventario {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'empresa_id' })
  empresaId!: string;

  // --- RELACIÓN PRODUCTO ---
  @ManyToOne(() => Producto)
  @JoinColumn({ name: 'producto_id' })
  producto!: Producto;

  @Column({ name: 'producto_id' })
  productoId!: string;

  // --- RELACIÓN ALMACÉN ---
  @ManyToOne(() => Almacen)
  @JoinColumn({ name: 'almacen_id' })
  almacen!: Almacen;

  @Column({ name: 'almacen_id' })
  almacenId!: string;

  // --- CAMPOS DE MOVIMIENTO ---
  @Column({ type: 'varchar', length: 20 })
  tipo!: string;

  // ✅ SOLUCIÓN: Se agrega default: 0 para que SQL Server acepte la migración sin romper los datos existentes
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  cantidad!: number;

  // ✅ MEJORA: Removido nullable: true y agregado default: 0 para asegurar reportes contables limpios
  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'stock_anterior', default: 0 })
  stockAnterior!: number;

  // ✅ MEJORA: Removido nullable: true y agregado default: 0
  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'stock_nuevo', default: 0 })
  stockNuevo!: number;

  @Column({ type: 'varchar', length: 255 })
  motivo!: string;

  @Column({ name: 'usuario_id', nullable: true })
  usuarioId?: string;

  @CreateDateColumn({ name: 'fecha_movimiento' })
  fechaMovimiento!: Date;

  @Column({ type: 'varchar', length: 100, nullable: true })
  lote?: string;

  @Column({ type: 'date', nullable: true })
  fechaCaducidadMovimiento?: Date;
}