import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
// hoteleria/entities/dotacion-tipo-habitacion.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { TipoHabitacion } from './tipo-habitacion.entity';

// Tipo de artículo en la dotación de una habitación:
//  - CONSUMIBLE: el huésped lo gasta/se lo lleva (shampoo, jabón, agua,
//    café, amenidades). SÍ se descuenta del inventario al check-in.
//  - BLANCO: ropa de cama y toallas (sábanas, fundas, toallas). NO se
//    consume, se ensucia y se lava. NO se descuenta del inventario; se
//    controla su ciclo de uso por separado (ropería/lavandería).
export enum TipoArticulo {
  CONSUMIBLE = 'CONSUMIBLE',
  BLANCO = 'BLANCO',
}

@Entity('dotaciones_tipo_habitacion')
export class DotacionTipoHabitacion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  empresaId!: string;

  @ManyToOne(() => TipoHabitacion, (t) => t.dotaciones, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'tipohabitacionid' })
  tipoHabitacion!: TipoHabitacion;

  @Column({ type: 'uuid' })
  tipoHabitacionId!: string;

  // Producto del catálogo del ERP (sábana, toalla, shampoo…)
  @Column({ type: 'uuid' })
  productoId!: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  productoNombre!: string | null;

  // Cantidad estándar por estancia
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 10, scale: 2, default: 1 })
  cantidad!: number;

  // CONSUMIBLE (descuenta inventario) | BLANCO (no descuenta)
  @Column({ type: 'varchar', length: 20, default: TipoArticulo.CONSUMIBLE })
  tipoArticulo!: string;
}
