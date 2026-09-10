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
  @Column({ type: 'varchar', length: 150, default: '' })
  nombreComercial!: string;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  fechaCreacion!: Date;

  @OneToMany(() => Usuario, (usuario) => usuario.empresa)
  usuarios!: Usuario[];

  // ── Onboarding: datos fiscales (paso 1) ──────────────────────
  @Column({ type: 'varchar', length: 13, nullable: true })
  rfc!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  regimenFiscal!: string | null;

  /** Tipo de contribuyente usado para validar compatibilidad de regímenes SAT. */
  @Column({ type: 'varchar', length: 10, nullable: true })
  tipoPersonaFiscal!: 'FISICA' | 'MORAL' | null;

  /** Perfil operativo; no sustituye la determinación fiscal de cada operación. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  perfilImpuestos!: 'GENERAL' | 'MIXTO' | 'EXENTO' | 'FRONTERA' | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  giro!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  tamano!: string | null;

  // ── Onboarding: domicilio fiscal (paso 2) ────────────────────
  @Column({ type: 'varchar', length: 255, nullable: true })
  direccion!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  ciudad!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  estado!: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  codigoPostal!: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true, default: 'México' })
  pais!: string | null;

  // ── Onboarding: plan (paso 4) ────────────────────────────────
  @Column({ type: 'varchar', length: 20, nullable: true })
  plan!: string | null;

  @Column({ type: 'boolean', default: false })
  onboardingCompletado!: boolean;

  @Column({ type: 'int', default: 0 })
  onboardingPaso!: number;

  @Column({ type: 'timestamptz', nullable: true })
  onboardingActualizadoEn!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  terminosAceptadosEn!: Date | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  terminosVersion!: string | null;
}
