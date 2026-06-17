// impuesto.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('impuestos')
export class Impuesto {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  nombre!: string; // Ej: "IVA 16%", "IVA 21%", "Exento"

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  porcentaje!: number; // Ej: 16.00

  @Column({ type: 'uniqueidentifier' })
  empresaId!: string;

  @Column({ default: true })
  activo!: boolean;

  @CreateDateColumn()
  fechaCreacion!: Date;

  @UpdateDateColumn()
  fechaActualizacion!: Date;
}