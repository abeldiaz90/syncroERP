// src/catalogo/entities/forma-pago.entity.ts
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('formas_pago')
export class FormaPago {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  nombre: string;

  @Column({ default: true })
  activo: boolean;
}