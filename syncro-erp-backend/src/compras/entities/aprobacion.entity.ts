import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Requisicion } from './requisicion.entity';
import { Usuario } from '../../iam/entities/usuario.entity';

export type EstadoAprobacion = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';

@Entity('aprobaciones')
export class Aprobacion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Requisicion, (req) => req.aprobaciones)
  @JoinColumn({ name: 'requisicionId' })
  requisicion: Requisicion;

  @Column({ type: 'uniqueidentifier' })
  requisicionId: string;

  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'usuarioId' })
  usuario: Usuario;

  @Column({ type: 'uniqueidentifier' })
  usuarioId: string;

  @Column({ type: 'int' })
  orden: number;   // 1, 2, 3...

  @Column({ type: 'varchar', length: 20, default: 'PENDIENTE' })
  estado: EstadoAprobacion;

  @Column({ type: 'text', nullable: true })
  comentario?: string;

  @CreateDateColumn()
  fechaAprobacion: Date;
}