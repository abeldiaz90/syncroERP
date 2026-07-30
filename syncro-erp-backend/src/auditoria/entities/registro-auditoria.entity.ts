import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type AccionAuditoria =
  | 'CREAR'
  | 'ACTUALIZAR'
  | 'ELIMINAR'
  | 'CANCELAR'
  | 'ACCION';

/**
 * RegistroAuditoria — la "caja negra" del ERP.
 *
 * Deja constancia inmutable de quién hizo qué, cuándo y sobre qué registro,
 * con los valores antes/después. Para plataformas financieras es un
 * requisito regulatorio (la CNBV y los auditores lo exigen).
 *
 * REGLA DE ORO: esta tabla es de solo-anexar (append-only). Nunca se
 * edita ni se borra una fila. No hay endpoints de UPDATE/DELETE.
 */
@Entity('registros_auditoria')
@Index(['empresaId', 'fechaHora'])
@Index(['empresaId', 'entidad', 'registroId'])
export class RegistroAuditoria {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uniqueidentifier', nullable: true })
  empresaId!: string | null;

  // ── Quién ──
  @Column({ type: 'uniqueidentifier', nullable: true })
  usuarioId!: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  usuarioEmail!: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  usuarioRol!: string | null;

  // ── Qué ──
  @Column({ type: 'varchar', length: 20 })
  accion!: AccionAuditoria;

  /** Nombre lógico de lo afectado. Ej: 'Producto', 'Usuario', 'Poliza'. */
  @Column({ type: 'varchar', length: 80 })
  entidad!: string;

  /** Id del registro afectado, si se pudo determinar. */
  @Column({ type: 'varchar', length: 80, nullable: true })
  registroId!: string | null;

  // ── Detalle ──
  /** Método HTTP + ruta. Ej: 'POST /api/catalogo/productos'. */
  @Column({ type: 'varchar', length: 300, nullable: true })
  endpoint!: string | null;

  /** Estado anterior del registro (JSON). Null en altas. */
  @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
  valorAnterior!: string | null;

  /** Estado nuevo / payload enviado (JSON). Null en bajas. */
  @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
  valorNuevo!: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  ip!: string | null;

  /** Resultado: 'OK' o 'ERROR' si la operación falló. */
  @Column({ type: 'varchar', length: 10, default: 'OK' })
  resultado!: string;

  @CreateDateColumn()
  @Index()
  fechaHora!: Date;
}
