import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { Producto } from './producto.entity';
import { Almacen } from './almacen.entity';

export enum EstadoReservaInventario { ACTIVA='ACTIVA', PARCIALMENTE_CONSUMIDA='PARCIALMENTE_CONSUMIDA', CONSUMIDA='CONSUMIDA', LIBERADA='LIBERADA', EXPIRADA='EXPIRADA' }
@Entity('reservas_inventario')
@Index(['empresaId','productoId','almacenId','estado'])
@Index('UQ_reserva_empresa_referencia', ['empresaId','referenciaTipo','referenciaId','productoId','almacenId'], { unique:true })
export class ReservaInventario {
 @PrimaryGeneratedColumn('uuid') id!: string;
 @Column({type:'varchar',length:36}) empresaId!: string;
 @Column({type: 'uuid'}) productoId!: string;
 @ManyToOne(()=>Producto) @JoinColumn({name:'productoid'}) producto!: Producto;
 @Column({type: 'uuid'}) almacenId!: string;
 @ManyToOne(()=>Almacen) @JoinColumn({name:'almacenid'}) almacen!: Almacen;
 @Column({type: 'decimal', transformer: decimalNumberTransformer,precision:18,scale:4}) cantidad!: number;
 @Column({type: 'decimal', transformer: decimalNumberTransformer,precision:18,scale:4,default:0}) cantidadConsumida!: number;
 @Column({type:'varchar',length:30}) referenciaTipo!: string;
 @Column({type:'varchar',length:80}) referenciaId!: string;
 @Column({type:'varchar',length:20,default:EstadoReservaInventario.ACTIVA}) estado!: EstadoReservaInventario;
 @Column({type: 'timestamptz',nullable:true}) expiraEn?: Date;
 @Column({type:'varchar',length:36,nullable:true}) usuarioId?: string;
 @Column({type:'varchar',length:255,nullable:true}) motivo?: string;
 @CreateDateColumn() fechaCreacion!: Date;
 @UpdateDateColumn() fechaActualizacion!: Date;
}
