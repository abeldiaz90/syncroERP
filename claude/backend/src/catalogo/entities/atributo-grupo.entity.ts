import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { AtributoDefinicion } from './atributo-definicion.entity';

/**
 * AtributoGrupo — "plantilla" de atributos creada POR EL USUARIO.
 *
 * Sustituye al concepto hardcodeado de "sector": ahora cada empresa crea
 * los grupos que quiera ("Ferretería", "Perfumería", "Control de calidad")
 * y dentro define sus campos (AtributoDefinicion).
 *
 * Equivalente al sistema de clasificación de SAP (clases + características).
 */
@Entity('atributo_grupos')
@Index(['empresaId', 'nombre'], { unique: true })
export class AtributoGrupo {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  empresaId!: string;

  /** Nombre visible del grupo. Ej: 'Ferretería', 'Farmacéutico' */
  @Column({ type: 'varchar', length: 100 })
  nombre!: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  descripcion!: string | null;

  @Column({ type: 'int', default: 0 })
  orden!: number;

  @Column({ default: true })
  activo!: boolean;

  @OneToMany(() => AtributoDefinicion, (d) => d.grupo, { cascade: true })
  definiciones!: AtributoDefinicion[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
