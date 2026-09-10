import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { ConteoInventario } from './conteo-inventario.entity';
import { Producto } from './producto.entity';
import { UbicacionAlmacen } from './ubicacion-almacen.entity';
import { LoteInventario } from './lote-inventario.entity';
@Entity('conteos_inventario_detalle')
@Index('UQ_conteo_producto_ubicacion_lote',['conteoId','productoId','ubicacionId','loteId'],{unique:true})
export class ConteoInventarioDetalle {
 @PrimaryGeneratedColumn('uuid') id!: string;
 @Column({type: 'uuid'}) conteoId!: string;
 @ManyToOne(()=>ConteoInventario,c=>c.detalles,{onDelete:'CASCADE'}) @JoinColumn({name:'conteoid'}) conteo!: ConteoInventario;
 @Column({type: 'uuid'}) productoId!: string;
 @ManyToOne(()=>Producto) @JoinColumn({name:'productoid'}) producto!: Producto;
 @Column({type: 'uuid',nullable:true}) ubicacionId?: string;
 @ManyToOne(()=>UbicacionAlmacen,{nullable:true}) @JoinColumn({name:'ubicacionid'}) ubicacion?: UbicacionAlmacen;
 @Column({type: 'uuid',nullable:true}) loteId?: string;
 @ManyToOne(()=>LoteInventario,{nullable:true}) @JoinColumn({name:'loteid'}) lote?: LoteInventario;
 @Column({type:'varchar',length:20,default:'DISPONIBLE'}) estadoStock!: string;
 @Column({type: 'decimal', transformer: decimalNumberTransformer,precision:18,scale:4}) existenciaTeorica!: number;
 @Column({type: 'decimal', transformer: decimalNumberTransformer,precision:18,scale:4,nullable:true}) primerConteo?: number;
 @Column({type: 'decimal', transformer: decimalNumberTransformer,precision:18,scale:4,nullable:true}) reconteo?: number;
 @Column({type: 'decimal', transformer: decimalNumberTransformer,precision:18,scale:4,nullable:true}) cantidadFinal?: number;
 @Column({type: 'decimal', transformer: decimalNumberTransformer,precision:18,scale:4,default:0}) diferencia!: number;
 @Column({type:'varchar',length:255,nullable:true}) observaciones?: string;
}
