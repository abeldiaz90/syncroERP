import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { StockPorAlmacen } from './stock-por-almacen.entity';

@Entity('almacenes')
export class Almacen {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  nombre: string; // Ej: "Almacén Central", "Sucursal Norte"

  @Column({ type: 'varchar', length: 255, nullable: true })
  ubicacion: string; // Dirección o pasillo físico

  @Column({ default: true })
  activo: boolean;

  @Column({ type: 'varchar', length: 36 })
  empresaId: string; // Crucial para la arquitectura Multi-Tenant

  @CreateDateColumn()
  fechaCreacion: Date;

  @UpdateDateColumn()
  fechaActualizacion: Date;

  // Relación: Un almacén tiene muchos registros de stock (uno por cada producto)
  @OneToMany(() => StockPorAlmacen, (stock) => stock.almacen)
  stocks: StockPorAlmacen[];
}