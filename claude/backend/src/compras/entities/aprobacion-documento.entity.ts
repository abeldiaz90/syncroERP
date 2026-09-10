import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('aprobaciones_documentos')
@Index(
  'UX_aprobacion_documento_ciclo_nivel',
  ['empresaId', 'proceso', 'documentoId', 'ciclo', 'nivel'],
  { unique: true },
)
@Index('IX_aprobacion_documento_bandeja', [
  'empresaId',
  'estado',
  'usuarioAprobadorId',
  'rolAprobador',
  'fechaVencimiento',
])
export class AprobacionDocumento {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) empresaId: string;
  @Column({ type: 'varchar', length: 40 }) proceso: string;
  @Column({ type: 'uuid' }) documentoId: string;

  /** Permite conservar el historial cuando un documento vuelve a aprobación. */
  @Column({ type: 'int', default: 1 }) ciclo: number;

  @Column({ type: 'int' }) nivel: number;
  @Column({ type: 'uuid', nullable: true }) usuarioAprobadorId?: string;
  @Column({ type: 'varchar', length: 50, nullable: true }) rolAprobador?: string;
  @Column({ type: 'varchar', length: 20, default: 'PENDIENTE' }) estado: string;
  @Column({ type: 'uuid' }) solicitadoPorId: string;
  @Column({ type: 'uuid', nullable: true }) resueltoPorId?: string;
  @Column({ type: 'int', default: 24 }) tiempoLimiteHoras: number;
  /** Versión del documento al iniciar el ciclo. Invalida aprobaciones obsoletas. */
  @Column({ type: 'int', default: 1 }) documentoVersion: number;
  /** Snapshot JSON de las condiciones sometidas a aprobación. */
  @Column({ type: 'text', nullable: true })
  datosSolicitud?: string | null;
  /** Importe evaluado en este ciclo. Evita que el documento cambie después de solicitar aprobación. */
  @Column({
    type: 'decimal',
    precision: 18,
    scale: 2,
    transformer: decimalNumberTransformer,
    default: 0,
  })
  importeSolicitado: number;
  @Column({ type: 'boolean', default: true }) obligatorio: boolean;
  @Column({ type: 'boolean', default: false }) permiteAutoaprobacion: boolean;
  @Column({ type: 'timestamptz', nullable: true }) fechaVencimiento?: Date;
  @Column({ type: 'timestamptz', nullable: true }) fechaResolucion?: Date;
  @Column({ type: 'text', nullable: true }) comentario?: string;
  @CreateDateColumn() fechaCreacion: Date;
}
