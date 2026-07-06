import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Poliza } from './poliza.entity';
import { CuentaContable } from './cuenta-contable.entity'; // Ajusta la ruta a donde guardaste la cuenta

@Entity('partidas_poliza')
export class PartidaPoliza {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Conexión con el encabezado de la póliza
  @ManyToOne(() => Poliza, (poliza) => poliza.partidas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'polizaId' })
  poliza!: Poliza;

  @Column({ type: 'uniqueidentifier' })
  polizaId!: string;

  // Conexión con el Catálogo de Cuentas
  @ManyToOne(() => CuentaContable)
  @JoinColumn({ name: 'cuentaContableId' })
  cuentaContable!: CuentaContable;

  @Column({ type: 'uniqueidentifier' })
  cuentaContableId!: string;

  // La regla de oro: Cargo y Abono
  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 })
  cargo!: number;

  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 })
  abono!: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  referencia!: string; // Opcional: Ej. "Pago factura 102", "Merma Lote X"
}