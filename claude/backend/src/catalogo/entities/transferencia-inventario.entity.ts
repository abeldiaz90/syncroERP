import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, OneToMany, Index,
} from 'typeorm';
import { Almacen } from './almacen.entity';
import { TransferenciaInventarioDetalle } from './transferencia-inventario-detalle.entity';

export enum EstadoTransferenciaInventario {
  BORRADOR = 'BORRADOR',
  SOLICITADA = 'SOLICITADA',
  AUTORIZADA = 'AUTORIZADA',
  EN_PREPARACION = 'EN_PREPARACION',
  EN_TRANSITO = 'EN_TRANSITO',
  RECIBIDA = 'RECIBIDA',
  RECIBIDA_CON_DIFERENCIAS = 'RECIBIDA_CON_DIFERENCIAS',
  COMPLETADA = 'COMPLETADA',
  CANCELADA = 'CANCELADA',
}

@Entity('transferencias_inventario')
@Index('UQ_transferencia_empresa_folio', ['empresaId', 'folio'], { unique: true })
@Index(['empresaId', 'fechaCreacion'])
export class TransferenciaInventario {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 36 }) empresaId!: string;
  @Column({ type: 'varchar', length: 40 }) folio!: string;
  @Column({ type: 'uuid' }) almacenOrigenId!: string;
  @Column({ type: 'uuid' }) almacenDestinoId!: string;
  @ManyToOne(() => Almacen) @JoinColumn({ name: 'almacenorigenid' }) almacenOrigen!: Almacen;
  @ManyToOne(() => Almacen) @JoinColumn({ name: 'almacendestinoid' }) almacenDestino!: Almacen;
  @Column({ type: 'varchar', length: 35, default: EstadoTransferenciaInventario.SOLICITADA })
  estado!: EstadoTransferenciaInventario;
  @Column({ type: 'varchar', length: 255 }) motivo!: string;
  @Column({ type: 'varchar', length: 36, nullable: true }) usuarioId?: string;
  @Column({ type: 'varchar', length: 36, nullable: true }) autorizadoPor?: string;
  @Column({ type: 'varchar', length: 36, nullable: true }) enviadoPor?: string;
  @Column({ type: 'varchar', length: 36, nullable: true }) recibidoPor?: string;
  @Column({ type: 'timestamptz', nullable: true }) fechaAutorizacion?: Date;
  @Column({ type: 'timestamptz', nullable: true }) fechaEnvio?: Date;
  @Column({ type: 'timestamptz', nullable: true }) fechaRecepcion?: Date;
  @Column({ type: 'varchar', length: 500, nullable: true }) observacionesRecepcion?: string;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 }) valorTotal!: number;
  @OneToMany(() => TransferenciaInventarioDetalle, d => d.transferencia, { cascade: true })
  detalles!: TransferenciaInventarioDetalle[];
  @CreateDateColumn() fechaCreacion!: Date;
  @UpdateDateColumn() fechaActualizacion!: Date;
}
