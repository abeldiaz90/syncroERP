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

  @Column({ type: 'uniqueidentifier' })
  empresaId!: string;

  @Column({ type: 'uniqueidentifier' })
  ordenCompraId!: string;

  @ManyToOne(() => OrdenCompra, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'ordenCompraId' })
  ordenCompra!: OrdenCompra;

  @Column({ type: 'uniqueidentifier' })
  almacenId!: string;

  /** Fotografía inmutable de la remesa capturada. */
  @Column({ type: 'nvarchar', length: 'MAX' })
  detalleJson!: string;

  @Column({ type: 'uniqueidentifier', nullable: true })
  recibidoPorId?: string;

  @CreateDateColumn()
  fechaRecepcion!: Date;
}
