import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
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

export enum EstadoContablePagoProveedor {
  PENDIENTE = 'PENDIENTE',
  GENERADO = 'GENERADO',
  FALLIDO = 'FALLIDO',
  REVERTIDO = 'REVERTIDO',
}

@Entity('pagos_proveedor')
@Index(['empresaId', 'ordenCompraId'])
@Index(['empresaId', 'ordenCompraId', 'claveIdempotencia'], { unique: true, where: 'claveIdempotencia IS NOT NULL' })
export class PagoProveedor {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  empresaId!: string;

  @Column({ type: 'uuid' })
  ordenCompraId!: string;

  @ManyToOne(() => OrdenCompra, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'ordencompraid' })
  ordenCompra!: OrdenCompra;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4 })
  monto!: number;

  /** IVA reclasificado de pendiente de pago a acreditable pagado. */
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  ivaReclasificado!: number;

  @Column({ type: 'uuid', nullable: true })
  cuentaBancariaId?: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  referencia?: string;

  @Column({ type: 'date' })
  fechaPago!: Date;

  @Column({ type: 'varchar', length: 100, nullable: true })
  claveIdempotencia?: string;

  @Column({ type: 'uuid', nullable: true })
  registradoPorId?: string;

  @Column({ type: 'uuid', nullable: true })
  movimientoTesoreriaId?: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: EstadoContablePagoProveedor.PENDIENTE,
  })
  estadoContable!: EstadoContablePagoProveedor;

  @Column({ type: 'uuid', nullable: true })
  asientoPendienteId?: string | null;

  @Column({ type: 'uuid', nullable: true })
  polizaId?: string | null;

  @CreateDateColumn()
  fechaCreacion!: Date;
}
