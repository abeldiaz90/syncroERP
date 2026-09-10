import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum EstadoImportacionInventario {
  PENDIENTE = 'PENDIENTE',
  VALIDANDO = 'VALIDANDO',
  PROCESANDO = 'PROCESANDO',
  COMPLETADO = 'COMPLETADO',
  COMPLETADO_CON_ERRORES = 'COMPLETADO_CON_ERRORES',
  FALLIDO = 'FALLIDO',
  CANCELADO = 'CANCELADO',
}

@Entity('importaciones_inventario')
@Index(['empresaId', 'tipo', 'hashArchivo'])
@Index(['empresaId', 'claveIdempotencia'], { unique: true })
export class ImportacionInventario {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'empresa_id', type: 'uuid' }) empresaId!: string;
  @Column({ name: 'usuario_id', type: 'uuid', nullable: true }) usuarioId?: string;
  @Column({ type: 'varchar', length: 40, default: 'STOCK_INICIAL' }) tipo!: string;
  @Column({ type: 'varchar', length: 20, default: 'VALIDAR' }) modo!: 'VALIDAR' | 'APLICAR';
  @Column({ name: 'nombre_archivo', type: 'varchar', length: 255 }) nombreArchivo!: string;
  @Column({ name: 'ruta_archivo', type: 'varchar', length: 600 }) rutaArchivo!: string;
  @Column({ name: 'hash_archivo', type: 'char', length: 64 }) hashArchivo!: string;
  @Column({ name: 'clave_idempotencia', type: 'varchar', length: 100 }) claveIdempotencia!: string;
  @Column({ type: 'varchar', length: 35, default: EstadoImportacionInventario.PENDIENTE }) estado!: EstadoImportacionInventario;
  @Column({ name: 'total_filas', type: 'int', default: 0 }) totalFilas!: number;
  @Column({ name: 'filas_procesadas', type: 'int', default: 0 }) filasProcesadas!: number;
  @Column({ name: 'filas_correctas', type: 'int', default: 0 }) filasCorrectas!: number;
  @Column({ name: 'filas_con_error', type: 'int', default: 0 }) filasConError!: number;
  @Column({ name: 'filas_omitidas', type: 'int', default: 0 }) filasOmitidas!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 5, scale: 2, default: 0 }) porcentaje!: number;
  @Column({ name: 'lote_actual', type: 'int', default: 0 }) loteActual!: number;
  @Column({ name: 'tamano_lote', type: 'int', default: 500 }) tamanoLote!: number;
  @Column({ name: 'mensaje_error', type: 'text', nullable: true }) mensajeError?: string;
  @Column({ name: 'poliza_id', type: 'uuid', nullable: true }) polizaId?: string;
  @Column({ name: 'asiento_pendiente_id', type: 'uuid', nullable: true }) asientoPendienteId?: string;
  @Column({ name: 'estado_contable', type: 'varchar', length: 20, nullable: true }) estadoContable?: string;
  @Column({ name: 'solicitud_cancelacion', type: 'boolean', default: false }) solicitudCancelacion!: boolean;
  @Column({ name: 'fecha_inicio', type: 'timestamptz', nullable: true }) fechaInicio?: Date;
  @Column({ name: 'fecha_fin', type: 'timestamptz', nullable: true }) fechaFin?: Date;
  @CreateDateColumn({ name: 'fecha_creacion' }) fechaCreacion!: Date;
  @UpdateDateColumn({ name: 'fecha_actualizacion' }) fechaActualizacion!: Date;
}
