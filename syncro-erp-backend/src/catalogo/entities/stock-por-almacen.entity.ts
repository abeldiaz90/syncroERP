// stock-por-almacen.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Almacen } from './almacen.entity';
import { Producto } from './producto.entity';

@Entity('stock_por_almacen')
export class StockPorAlmacen {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  cantidad: number;

  @Column({ type: 'varchar', length: 36 })
  empresaId: string;

  // Columnas explícitas para productoId y almacenId
  @Column({ type: 'uniqueidentifier' })
  productoId: string;

  @Column({ type: 'uniqueidentifier' })
  almacenId: string;

  @CreateDateColumn()
  ultimaActualizacion: Date;

  @ManyToOne(() => Almacen, (almacen) => almacen.stocks)
  @JoinColumn({ name: 'almacenId' })
  almacen: Almacen;

  @ManyToOne(() => Producto, (producto) => producto.stocksPorAlmacen)
  @JoinColumn({ name: 'productoId' })
  producto: Producto;
}