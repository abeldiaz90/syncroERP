// src/compras/entities/requisicion.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { DetalleRequisicion } from './detalle-requisicion.entity';
import { Aprobacion } from './aprobacion.entity';
import { Usuario } from '../../iam/entities/usuario.entity';
import { Cotizacion } from './cotizacion.entity';

export type EstadoRequisicion =
  | 'PENDIENTE'
  | 'COTIZANDO'
  | 'APROBADA'
  | 'RECHAZADA'
  | 'CONVERTIDA'
  | 'ORDEN_GENERADA'; 

@Entity('requisiciones')
export class Requisicion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uniqueidentifier' })
  empresaId: string;

  @Column({ type: 'uniqueidentifier', nullable: true })
  usuarioSolicitanteId?: string;

  // Relación con el usuario que creó la requisición
  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'usuarioSolicitanteId' })
  usuarioSolicitante?: Usuario;

  @CreateDateColumn()
  fechaSolicitud: Date;

  @Column({ type: 'varchar', length: 30, default: 'PENDIENTE' })
  estado: EstadoRequisicion;

  @Column({ type: 'text', nullable: true })
  notas?: string;

  // Detalles de la requisición
  @OneToMany(() => DetalleRequisicion, (det) => det.requisicion, { cascade: true })
  detalles: DetalleRequisicion[];

  // Cadena de aprobaciones
  @OneToMany(() => Aprobacion, (ap) => ap.requisicion, { cascade: true })
  aprobaciones: Aprobacion[];

  @OneToMany(() => Cotizacion, (cot) => cot.requisicion)
  cotizaciones: Cotizacion[];
}