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

@Entity('recepciones_compra')
@Index(['empresaId', 'ordenCompraId'])
export class RecepcionCompra {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  empresaId!: string;

  @Column({ type: 'uuid' })
  ordenCompraId!: string;

  @ManyToOne(() => OrdenCompra, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'ordencompraid' })
  ordenCompra!: OrdenCompra;

  @Column({ type: 'uuid' })
  almacenId!: string;

  /** Fotografía inmutable de la remesa capturada. */
  @Column({ type: 'text' })
  detalleJson!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  claveIdempotencia?: string;

  @Column({ type: 'uuid', nullable: true })
  recibidoPorId?: string;

  @CreateDateColumn()
  fechaRecepcion!: Date;
}
