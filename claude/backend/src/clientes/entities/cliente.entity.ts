import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
// src/clientes/entities/cliente.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type TipoPersona = 'FISICA' | 'MORAL';
export type ClasificacionHoteleraCliente = 'EMPRESA' | 'AGENCIA';

@Entity('clientes')
export class Cliente {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  empresaId: string;

  @Column({ type: 'varchar', length: 150 })
  nombre: string;

  @Column({ type: 'varchar', length: 20, default: 'FISICA' })
  tipoPersona: TipoPersona;

  @Column({ type: 'varchar', length: 20, nullable: true })
  rfc?: string;

  @Column({ type: 'varchar', length: 18, nullable: true })
  curp?: string;

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

  @Column({ type: 'uuid', nullable: true })
  estadoId?: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  codigoPostal?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  pais?: string;

  @Column({ type: 'uuid', nullable: true })
  paisId?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  contactoNombre?: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  contactoTelefono?: string;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 10, scale: 2, default: 0 })
  limiteCredito: number;

  @Column({ type: 'int', default: 0 })
  diasCredito: number;

  @Column({ type: 'text', nullable: true })
  notas?: string;

  @Column({ default: true })
  activo: boolean;

  @Column({ type: 'varchar', length: 20, default: 'PROSPECTO' })
  etapaComercial: 'PROSPECTO' | 'ACTIVO' | 'BLOQUEADO' | 'INACTIVO';

  @Column({ type: 'varchar', length: 20, default: 'SIN_CREDITO' })
  estadoCredito:
    | 'SIN_CREDITO'
    | 'EN_REVISION'
    | 'AUTORIZADO'
    | 'RECHAZADO'
    | 'SUSPENDIDO';

  @Column({ type: 'varchar', length: 20, default: 'MEDIO' })
  nivelRiesgo: 'BAJO' | 'MEDIO' | 'ALTO';

  /** Política maestra: bloquea cualquier canal si la exposición global está vencida. */
  @Column({ type: 'boolean', default: true })
  bloquearCreditoConSaldoVencido: boolean;

  /** Clasificación comercial maestra usada por los convenios hoteleros. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  clasificacionHotelera?: ClasificacionHoteleraCliente | null;

  @Column({ type: 'uuid', nullable: true })
  creditoResueltoPorId?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  fechaResolucionCredito?: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  comentarioCredito?: string | null;

  /** Versión de las condiciones maestras (límite, plazo, riesgo y clasificación hotelera). */
  @Column({ type: 'int', default: 1 })
  versionCredito: number;

  @Column({ type: 'uuid', nullable: true })
  creditoSolicitadoPorId?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  fechaSolicitudCredito?: Date | null;

  /** Estado maker-checker de la propuesta; no sustituye el estado operativo. */
  @Column({ type: 'varchar', length: 20, default: 'NINGUNA' })
  estadoSolicitudCredito:
    | 'NINGUNA'
    | 'PENDIENTE'
    | 'APROBADA'
    | 'RECHAZADA'
    | 'CANCELADA';

  @Column({
    type: 'decimal',
    transformer: decimalNumberTransformer,
    precision: 10,
    scale: 2,
    nullable: true,
  })
  limiteCreditoSolicitado?: number | null;

  @Column({ type: 'int', nullable: true })
  diasCreditoSolicitados?: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  nivelRiesgoSolicitado?: 'BAJO' | 'MEDIO' | 'ALTO' | null;

  @Column({ type: 'boolean', nullable: true })
  bloquearCreditoConSaldoVencidoSolicitado?: boolean | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  clasificacionHoteleraSolicitada?: ClasificacionHoteleraCliente | null;

  /** Versión independiente de la propuesta sometida a aprobación. */
  @Column({ type: 'int', default: 0 })
  versionSolicitudCredito: number;

  @CreateDateColumn()
  fechaCreacion: Date;

  @UpdateDateColumn()
  fechaActualizacion: Date;
}
