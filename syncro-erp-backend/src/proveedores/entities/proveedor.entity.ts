// src/proveedores/entities/proveedor.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Pais } from '../../catalogo/entities/pais.entity';
import { Estado } from '../../catalogo/entities/estado.entity';
import { Banco } from '../../catalogo/entities/banco.entity';
import { FormaPago } from '../../catalogo/entities/forma-pago.entity';

export type TipoPersona = 'FISICA' | 'MORAL';
export type TipoProveedor = 'MERCANCIA' | 'SERVICIO' | 'AMBOS';

@Entity('proveedores')
export class Proveedor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uniqueidentifier' })
  empresaId: string;

  // ================= DATOS GENERALES =================
  @Column({ type: 'varchar', length: 150 })
  nombre: string;

  @Column({ type: 'varchar', length: 20, default: 'MORAL' })
  tipoPersona: TipoPersona;

  @Column({ type: 'varchar', length: 150, nullable: true })
  razonSocial?: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  rfc?: string;

  @Column({ type: 'varchar', length: 50, default: 'MERCANCIA' })
  tipoProveedor: TipoProveedor;

  // ================= CONTACTO =================
  @Column({ type: 'varchar', length: 100, nullable: true })
  contactoNombre?: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  contactoTelefono?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  contactoEmail?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  contactoPuesto?: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  telefono?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  email?: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  sitioWeb?: string;

  // ================= DIRECCIÓN FISCAL =================
  @Column({ type: 'varchar', length: 200, nullable: true })
  direccion?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  numeroExterior?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  numeroInterior?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  colonia?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  ciudad?: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  codigoPostal?: string;

  // ================= CATÁLOGOS (Relaciones) =================
  @ManyToOne(() => Pais, { nullable: true })
  @JoinColumn({ name: 'paisId' })
  pais: Pais;

  @Column({ type: 'uniqueidentifier', nullable: true })
  paisId: string;

  @ManyToOne(() => Estado, { nullable: true })
  @JoinColumn({ name: 'estadoId' })
  estado: Estado;

  @Column({ type: 'uniqueidentifier', nullable: true })
  estadoId: string;

  // ================= DATOS BANCARIOS =================
  @ManyToOne(() => Banco, { nullable: true })
  @JoinColumn({ name: 'bancoId' })
  banco: Banco;

  @Column({ type: 'uniqueidentifier', nullable: true })
  bancoId: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  numeroCuenta?: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  clabe?: string;

  // ================= CONDICIONES COMERCIALES =================
  @Column({ type: 'int', default: 0 })
  diasCredito: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  limiteCredito: number;

  @Column({ type: 'varchar', length: 20, default: 'PUE' })
  metodoPago: string;

  @ManyToOne(() => FormaPago, { nullable: true })
  @JoinColumn({ name: 'formaPagoId' })
  formaPago: FormaPago;

  @Column({ type: 'uniqueidentifier', nullable: true })
  formaPagoId: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  moneda?: string;

  // ================= OTROS =================
  @Column({ type: 'text', nullable: true })
  notas?: string;

  @Column({ default: true })
  activo: boolean;

  @CreateDateColumn()
  fechaCreacion: Date;

  @UpdateDateColumn()
  fechaActualizacion: Date;
}