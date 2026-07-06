import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { CreditoCliente } from './credito-cliente.entity';

@Entity('pagos_cobranza')
export class PagoCobranza {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uniqueidentifier' }) empresaId!: string;
  @ManyToOne(() => CreditoCliente, (c) => c.pagos)
  @JoinColumn({ name: 'creditoId' }) credito!: CreditoCliente;
  @Column({ type: 'uniqueidentifier' }) creditoId!: string;
  @Column({ type: 'uniqueidentifier', nullable: true }) cuotaId!: string;
  @Column({ type: 'date' }) fechaPago!: Date;
  @Column({ type: 'decimal', precision: 18, scale: 4 }) montoPagado!: number;
  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 }) montoCapital!: number;
  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 }) montoInteres!: number;
  @Column({ type: 'varchar', length: 30 }) metodoPago!: string;
  @Column({ type: 'uniqueidentifier', nullable: true }) cuentaBancariaId!: string;
  @Column({ type: 'varchar', length: 200, nullable: true }) referencia!: string;
  @Column({ type: 'uniqueidentifier', nullable: true }) usuarioId!: string;
  @Column({ type: 'uniqueidentifier', nullable: true }) polizaId!: string;
  @CreateDateColumn() fechaCreacion!: Date;
}