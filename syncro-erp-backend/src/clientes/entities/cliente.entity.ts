// src/clientes/entities/cliente.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type TipoPersona = 'FISICA' | 'MORAL';

@Entity('clientes')
export class Cliente {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uniqueidentifier' })
  empresaId: string;

  @Column({ type: 'varchar', length: 150 })
  nombre: string;

  @Column({ type: 'varchar', length: 20, default: 'FISICA' })
  tipoPersona: TipoPersona;

  @Column({ type: 'varchar', length: 20, nullable: true })
  rfc?: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  razonSocial?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  email?: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  telefono?: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  direccion?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  ciudad?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  estado?: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  codigoPostal?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  pais?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  contactoNombre?: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  contactoTelefono?: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  limiteCredito: number;

  @Column({ type: 'int', default: 0 })
  diasCredito: number;

  @Column({ type: 'text', nullable: true })
  notas?: string;

  @Column({ default: true })
  activo: boolean;

  @CreateDateColumn()
  fechaCreacion: Date;

  @UpdateDateColumn()
  fechaActualizacion: Date;
}