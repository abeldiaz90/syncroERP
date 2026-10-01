// src/compras/entities/requisicion.entity.ts
import {
  Index,
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

/**
 * El vocabulario de estados, como VALOR y no sólo como tipo.
 *
 * Un `type` desaparece al compilar, así que nada podía comprobar en ejecución
 * —ni en una prueba— que otro módulo estuviera contando un estado que no
 * existe. El panel de operaciones pendientes buscaba requisiciones en
 * «PENDIENTE_APROBACION»: un estado que nadie escribe nunca. La consulta era
 * válida, la tabla existía, la columna existía, y el resultado era cero en
 * cualquier base del mundo.
 */
export const ESTADOS_REQUISICION = [
  'PENDIENTE',
  'COTIZANDO',
  'APROBADA',
  'RECHAZADA',
  'CONVERTIDA',
  'ORDEN_GENERADA',
  'RECIBIDA',
  'CON_INCIDENCIAS',
  'CANCELADA',
] as const;

export type EstadoRequisicion = (typeof ESTADOS_REQUISICION)[number];

@Index(['empresaId', 'folio'], { unique: true, where: 'folio IS NOT NULL' })
@Entity('requisiciones')
export class Requisicion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /*
   * El folio que una persona puede decir por teléfono.
   *
   * Hasta el 1-oct-2026 este documento no tenía folio: la pantalla recortaba
   * los primeros ocho caracteres del uuid y lo llamaba así. Eso no se puede
   * dictar, no se puede ordenar, y —ocho hexadecimales son 32 bits— no es
   * único: a los ~10,000 documentos dos distintos empiezan a coincidir.
   *
   * Nulo en la columna porque las instalaciones existentes se rellenan por
   * migración, no por un `NOT NULL` que tumbaría el arranque. El servicio
   * siempre lo escribe al crear.
   */
  @Column({ type: 'varchar', length: 32, nullable: true })
  folio?: string;

  @Column({ type: 'uuid' })
  empresaId: string;

  @Column({ type: 'uuid', nullable: true })
  usuarioSolicitanteId?: string;

  // Relación con el usuario que creó la requisición
  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'usuariosolicitanteid' })
  usuarioSolicitante?: Usuario;

  @CreateDateColumn()
  fechaSolicitud: Date;

  @Column({ type: 'varchar', length: 30, default: 'PENDIENTE' })
  estado: EstadoRequisicion;

  @Column({ type: 'text', nullable: true })
  notas?: string;

  @Column({ type: 'varchar', length: 15, default: 'NORMAL' })
  prioridad: 'BAJA' | 'NORMAL' | 'ALTA' | 'URGENTE';

  @Column({ type: 'date', nullable: true })
  fechaRequerida?: Date | null;

  // Detalles de la requisición
  @OneToMany(() => DetalleRequisicion, (det) => det.requisicion, {
    cascade: true,
  })
  detalles: DetalleRequisicion[];

  // Cadena de aprobaciones
  @OneToMany(() => Aprobacion, (ap) => ap.requisicion, { cascade: true })
  aprobaciones: Aprobacion[];

  @OneToMany(() => Cotizacion, (cot) => cot.requisicion)
  cotizaciones: Cotizacion[];
}
