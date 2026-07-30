// impuesto.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('impuestos')
export class Impuesto {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  nombre!: string; // Ej: "IVA 16%", "IVA 21%", "Exento"

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  porcentaje!: number; // Ej: 16.00

  /** Catálogo c_Impuesto del SAT: 001 ISR, 002 IVA, 003 IEPS. */
  @Column({ type: 'varchar', length: 3, default: '002' })
  claveImpuestoSAT!: string;

  /** Distingue tasa cero de exento; ambos tienen porcentaje numérico cero. */
  @Column({ type: 'varchar', length: 12, default: 'TASA' })
  tipoFactor!: 'TASA' | 'EXENTO' | 'NO_OBJETO';

  /** c_ObjetoImp de CFDI 4.0. Los impuestos trasladados usan normalmente 02. */
  @Column({ type: 'varchar', length: 2, default: '02' })
  objetoImpuesto!: '01' | '02' | '03' | '04';

  @Column({ type: 'uniqueidentifier' })
  empresaId!: string;

  @Column({ default: true })
  activo!: boolean;

  @CreateDateColumn()
  fechaCreacion!: Date;

  @UpdateDateColumn()
  fechaActualizacion!: Date;
}
