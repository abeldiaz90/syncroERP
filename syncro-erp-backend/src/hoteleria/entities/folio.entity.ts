// hoteleria/entities/folio.entity.ts
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, OneToMany,
} from 'typeorm';
import { Reservacion } from './reservacion.entity';

export enum EstadoFolio {
  ABIERTO = 'ABIERTO',
  CERRADO = 'CERRADO',
}

@Entity('folios')
export class Folio {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uniqueidentifier' })
  empresaId!: string;

  @ManyToOne(() => Reservacion, { nullable: false })
  @JoinColumn({ name: 'reservacionId' })
  reservacion!: Reservacion;

  @Column({ type: 'uniqueidentifier' })
  reservacionId!: string;

  @Column({ type: 'varchar', length: 20, default: EstadoFolio.ABIERTO })
  estado!: EstadoFolio;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  total!: number;

  @CreateDateColumn()
  fechaApertura!: Date;

  @Column({ type: 'datetime2', nullable: true })
  fechaCierre!: Date | null;

  @OneToMany(() => CargoFolio, (c) => c.folio)
  cargos!: CargoFolio[];
}

export enum TipoCargo {
  HOSPEDAJE = 'HOSPEDAJE', // noche de habitación
  CONSUMO   = 'CONSUMO',   // minibar, producto
  SERVICIO  = 'SERVICIO',  // lavandería, spa…
  OTRO      = 'OTRO',
}

@Entity('cargos_folio')
export class CargoFolio {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uniqueidentifier' })
  empresaId!: string;

  @ManyToOne(() => Folio, (f) => f.cargos, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'folioId' })
  folio!: Folio;

  @Column({ type: 'uniqueidentifier' })
  folioId!: string;

  @Column({ type: 'varchar', length: 20, default: TipoCargo.OTRO })
  tipo!: TipoCargo;

  @Column({ type: 'varchar', length: 200 })
  concepto!: string;

  // Si el cargo viene de un producto del ERP (consumo), lo referenciamos
  @Column({ type: 'uniqueidentifier', nullable: true })
  productoId!: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 1 })
  cantidad!: number;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  precioUnitario!: number;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  importe!: number;

  @CreateDateColumn()
  fecha!: Date;
}