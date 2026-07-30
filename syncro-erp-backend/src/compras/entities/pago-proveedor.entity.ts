import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { OrdenCompra } from './orden-compra.entity';

@Entity('pagos_proveedor')
@Index(['empresaId', 'ordenCompraId'])
export class PagoProveedor {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uniqueidentifier' })
  empresaId!: string;

  @Column({ type: 'uniqueidentifier' })
  ordenCompraId!: string;

  @ManyToOne(() => OrdenCompra, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'ordenCompraId' })
  ordenCompra!: OrdenCompra;

  @Column({ type: 'decimal', precision: 18, scale: 4 })
  monto!: number;

  /** IVA reclasificado de pendiente de pago a acreditable pagado. */
  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 })
  ivaReclasificado!: number;

  @Column({ type: 'uniqueidentifier', nullable: true })
  cuentaBancariaId?: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  referencia?: string;

  @Column({ type: 'date' })
  fechaPago!: Date;

  @Column({ type: 'uniqueidentifier', nullable: true })
  registradoPorId?: string;

  @CreateDateColumn()
  fechaCreacion!: Date;
}
