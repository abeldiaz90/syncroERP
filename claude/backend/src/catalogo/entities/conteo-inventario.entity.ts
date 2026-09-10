import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany, Index } from 'typeorm';
import { Almacen } from './almacen.entity';
import { ConteoInventarioDetalle } from './conteo-inventario-detalle.entity';
export enum EstadoConteoInventario { BORRADOR='BORRADOR', ABIERTO='ABIERTO', EN_CONTEO='EN_CONTEO', PENDIENTE_AUTORIZACION='PENDIENTE_AUTORIZACION', AJUSTADO='AJUSTADO', CERRADO='CERRADO', CANCELADO='CANCELADO' }
@Entity('conteos_inventario')
@Index('UQ_conteo_empresa_folio',['empresaId','folio'],{unique:true})
export class ConteoInventario {
 @PrimaryGeneratedColumn('uuid') id!: string;
 @Column({type:'varchar',length:36}) empresaId!: string;
 @Column({type:'varchar',length:40}) folio!: string;
 @Column({type: 'uuid'}) almacenId!: string;
 @ManyToOne(()=>Almacen) @JoinColumn({name:'almacenid'}) almacen!: Almacen;
 @Column({type:'varchar',length:30,default:EstadoConteoInventario.BORRADOR}) estado!: EstadoConteoInventario;
 @Column({type:'varchar',length:255}) motivo!: string;
 @Column({type: 'boolean',default:true}) conteoCiego!: boolean;
 @Column({type:'varchar',length:36,nullable:true}) creadoPor?: string;
 @Column({type:'varchar',length:36,nullable:true}) capturadoPor?: string;
 @Column({type:'varchar',length:36,nullable:true}) autorizadoPor?: string;
 @Column({type: 'timestamptz',nullable:true}) fechaApertura?: Date;
 @Column({type: 'timestamptz',nullable:true}) fechaCierre?: Date;
 @OneToMany(()=>ConteoInventarioDetalle,d=>d.conteo,{cascade:true}) detalles!: ConteoInventarioDetalle[];
 @CreateDateColumn() fechaCreacion!: Date;
 @UpdateDateColumn() fechaActualizacion!: Date;
}
