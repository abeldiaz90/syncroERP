import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Almacen } from './almacen.entity';

export enum EstadoUbicacionAlmacen { DISPONIBLE='DISPONIBLE', BLOQUEADA='BLOQUEADA', CUARENTENA='CUARENTENA', RECEPCION='RECEPCION', EMBARQUE='EMBARQUE' }

@Entity('ubicaciones_almacen')
@Index('UQ_ubicacion_empresa_almacen_codigo', ['empresaId','almacenId','codigo'], { unique: true })
export class UbicacionAlmacen {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type:'varchar', length:36 }) empresaId!: string;
  @Column({ type: 'uuid' }) almacenId!: string;
  @ManyToOne(() => Almacen) @JoinColumn({ name:'almacenid' }) almacen!: Almacen;
  @Column({ type:'varchar', length:80 }) codigo!: string;
  @Column({ type:'varchar', length:80, nullable:true }) zona?: string;
  @Column({ type:'varchar', length:40, nullable:true }) pasillo?: string;
  @Column({ type:'varchar', length:40, nullable:true }) rack?: string;
  @Column({ type:'varchar', length:40, nullable:true }) nivel?: string;
  @Column({ type:'varchar', length:40, nullable:true }) posicion?: string;
  @Column({ type:'varchar', length:20, default:EstadoUbicacionAlmacen.DISPONIBLE }) estado!: EstadoUbicacionAlmacen;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision:18, scale:4, nullable:true }) capacidadMaxima?: number;
  @Column({ type:'varchar', length:255, nullable:true }) descripcion?: string;
  @Column({ default:true }) activo!: boolean;
  @CreateDateColumn() fechaCreacion!: Date;
  @UpdateDateColumn() fechaActualizacion!: Date;
}
