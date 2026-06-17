import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Endpoint } from './endpoint.entity';

@Entity('rol_endpoint_permisos')
export class RolEndpointPermiso {
  @PrimaryGeneratedColumn('uuid')
  id: string;

// Una vez poblada la tabla, vuelve a esto:
@Column({ type: 'uniqueidentifier', nullable: false }) 
empresaId: string;

  @Column({ length: 50 })
  rol: string;

  @Column({ name: 'endpoint_id', type: 'uuid' })
  endpointId: string;

  @Column({ default: false })
  permitido: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Endpoint)
  @JoinColumn({ name: 'endpoint_id' })
  endpoint: Endpoint;
}