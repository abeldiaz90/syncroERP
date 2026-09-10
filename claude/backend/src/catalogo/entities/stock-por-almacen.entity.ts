import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
// stock-por-almacen.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Almacen } from './almacen.entity';
import { Producto } from './producto.entity';

@Entity('stock_por_almacen')
@Index('UQ_stock_empresa_producto_almacen', ['empresaId', 'productoId', 'almacenId'], { unique: true })
export class StockPorAlmacen {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  cantidad: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  reservado: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  comprometido: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  bloqueado: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  enTransito: number;

  @Column({ type: 'varchar', length: 36 })
  empresaId: string;

  // Columnas explícitas para productoId y almacenId
  @Column({ type: 'uuid' })
  productoId: string;

  @Column({ type: 'uuid' })
  almacenId: string;

  @UpdateDateColumn()
  ultimaActualizacion: Date;

  @ManyToOne(() => Almacen, (almacen) => almacen.stocks)
  @JoinColumn({ name: 'almacenid' })
  almacen: Almacen;

  @ManyToOne(() => Producto, (producto) => producto.stocksPorAlmacen)
  @JoinColumn({ name: 'productoid' })
  producto: Producto;
}
