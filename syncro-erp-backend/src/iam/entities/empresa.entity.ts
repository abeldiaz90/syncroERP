import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
} from 'typeorm';
import { Usuario } from './usuario.entity';

@Entity('Empresas')
export class Empresa {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // default: '' permite que SQL Server agregue la columna a la tabla con filas
  @Column({ type: 'nvarchar', length: 150, default: '' })
  nombreComercial!: string;

  @Column({ type: 'bit', default: 1 })
  activo!: boolean;

  @CreateDateColumn({ type: 'datetime2' })
  fechaCreacion!: Date;

  @OneToMany(() => Usuario, (usuario) => usuario.empresa)
  usuarios!: Usuario[];

  // ── Onboarding: datos fiscales (paso 1) ──────────────────────
  @Column({ type: 'nvarchar', length: 13, nullable: true })
  rfc!: string | null;

  @Column({ type: 'nvarchar', length: 100, nullable: true })
  regimenFiscal!: string | null;

  /** Tipo de contribuyente usado para validar compatibilidad de regímenes SAT. */
  @Column({ type: 'varchar', length: 10, nullable: true })
  tipoPersonaFiscal!: 'FISICA' | 'MORAL' | null;

  /** Perfil operativo; no sustituye la determinación fiscal de cada operación. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  perfilImpuestos!: 'GENERAL' | 'MIXTO' | 'EXENTO' | 'FRONTERA' | null;

  @Column({ type: 'nvarchar', length: 60, nullable: true })
  giro!: string | null;

  @Column({ type: 'nvarchar', length: 20, nullable: true })
  tamano!: string | null;

  // ── Onboarding: domicilio fiscal (paso 2) ────────────────────
  @Column({ type: 'nvarchar', length: 255, nullable: true })
  direccion!: string | null;

  @Column({ type: 'nvarchar', length: 100, nullable: true })
  ciudad!: string | null;

  @Column({ type: 'nvarchar', length: 100, nullable: true })
  estado!: string | null;

  @Column({ type: 'nvarchar', length: 10, nullable: true })
  codigoPostal!: string | null;

  @Column({ type: 'nvarchar', length: 60, nullable: true, default: 'México' })
  pais!: string | null;

  // ── Onboarding: plan (paso 4) ────────────────────────────────
  @Column({ type: 'nvarchar', length: 20, nullable: true })
  plan!: string | null;

  @Column({ type: 'bit', default: 0 })
  onboardingCompletado!: boolean;
}
