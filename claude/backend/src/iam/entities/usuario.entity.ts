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

  /**
   * ==========================================================================
   * El hash no sale de la base, y por eso no puede salir de la API
   * --------------------------------------------------------------------------
   * Tenía `@Exclude()` y un comentario que prometía que nunca llegaría al
   * frontend. La promesa era falsa: `@Exclude()` sólo actúa si está registrado
   * el `ClassSerializerInterceptor` de Nest, y en este proyecto no está
   * registrado en ninguna parte. El decorador no hacía nada.
   *
   * El servicio de usuarios sí limpiaba la respuesta a mano, así que `/usuarios`
   * salía bien y el problema parecía resuelto. Pero cualquier OTRO servicio que
   * cargue la relación `usuario` devuelve la entidad entera, y nadie se acuerda
   * de limpiarla: `GET /configuraciones-aprobacion/matriz/todos` —que puede
   * leer cualquier rol con aprobaciones en consulta— devolvía el hash de cada
   * aprobador. Aquí la instalación usa Keycloak y el valor es un texto fijo,
   * así que no se filtró nada real; en una empresa con contraseña local se
   * habría filtrado el hash de sus directivos.
   *
   * `select: false` mueve la defensa a la capa correcta: la columna no se carga
   * en ninguna consulta ordinaria, así que ninguna relación puede arrastrarla
   * por descuido. Quien la necesita —sólo el login— la pide explícitamente.
   * ==========================================================================
   */
  @Column({ type: 'varchar', length: 255, select: false })
  @Exclude()
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

  @Column({ type: 'varchar', length: 64, nullable: true , select: false })
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
  @Column({ type: 'varchar', length: 64, nullable: true , select: false })
  tokenRecuperacion!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  tokenRecuperacionExpira!: Date | null;
}
