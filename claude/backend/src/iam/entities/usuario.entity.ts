import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Empresa } from './empresa.entity';
import { Departamento } from '../../departamentos/entities/departamento.entity';
import { Exclude } from 'class-transformer'; // ✅ IMPORTANTE

@Entity('Usuarios')
export class Usuario {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  empresaId!: string;

  @Column({ type: 'varchar', length: 100 })
  nombreCompleto!: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  email!: string;

  /** Identidad estable del usuario en el realm SUMA. Se vincula al primer acceso. */
  @Column({ type: 'varchar', length: 64, nullable: true, unique: true })
  keycloakSubject!: string | null;

  @Column({ type: 'varchar', length: 255 })
  @Exclude() // ✅ NUNCA DEVOLVERÁ EL HASH AL FRONTEND
  passwordHash!: string;

  @Column({ type: 'varchar', length: 20, default: 'empleado' })
  rol!: string;

  @Column({ type: 'varchar', length: 10, default: 'es-MX' })
  idioma!: string;

  @Column({ type: 'varchar', length: 60, default: 'America/Mexico_City' })
  zonaHoraria!: string;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  /** Propietario fundador. Solo este usuario puede activar la empresa al verificar su correo. */
  @Column({ type: 'boolean', default: false })
  esPropietario!: boolean;

  /** Invalida inmediatamente todos los JWT emitidos antes de un cambio sensible. */
  @Column({ type: 'int', default: 0 })
  tokenVersion!: number;

  @ManyToOne(() => Empresa, (empresa) => empresa.usuarios, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'empresaid' })
  empresa!: Empresa;

  @ManyToOne(() => Departamento, { nullable: true })
  @JoinColumn({ name: 'departamentoid' })
  departamento?: Departamento;

  @Column({ type: 'uuid', nullable: true })
  departamentoId?: string;

  // ── Verificación de email ─────────────────────────────────────────
  @Column({ type: 'boolean', default: false })
  emailVerificado!: boolean;

  @Column({ type: 'varchar', length: 64, nullable: true })
  tokenVerificacion!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  tokenExpira!: Date | null;

  // ── Protección contra fuerza bruta ────────────────────────────────
  /** Intentos de login fallidos consecutivos. Se resetea al entrar bien. */
  @Column({ type: 'int', default: 0 })
  intentosFallidos!: number;

  /** Si tiene valor futuro, la cuenta está bloqueada temporalmente. */
  @Column({ type: 'timestamptz', nullable: true })
  bloqueadoHasta!: Date | null;

  // ── Recuperación de contraseña ────────────────────────────────────
  @Column({ type: 'varchar', length: 64, nullable: true })
  tokenRecuperacion!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  tokenRecuperacionExpira!: Date | null;
}
