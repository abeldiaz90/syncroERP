import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  EstadoEventoIntegracion,
  TipoEventoIntegracion,
} from '../integracion.constants';

/**
 * Outbox transaccional. Es la costura entre el ERP y el registro externo.
 *
 * Una venta a crédito no puede depender de que el proveedor esté vivo: si la
 * llamada HTTP viviera dentro de la transacción de la venta, un timeout dejaría
 * al cliente sin ticket y a la caja sin cuadrar. El evento se escribe con la
 * venta, en su misma transacción, y se despacha después.
 *
 * Ésta es también la costura que permite sacar el despachador a un proceso
 * aparte el día que convenga: el ERP sólo escribe aquí y no necesita saber
 * quién lee.
 *
 * `claveIdempotencia` impide que el mismo hecho se publique dos veces aunque el
 * productor se reintente.
 */
@Entity('integracion_eventos')
@Index('UX_integracion_evento_idempotencia', ['empresaId', 'claveIdempotencia'], {
  unique: true,
})
@Index('IX_integracion_evento_despacho', ['estado', 'proximoIntento'])
export class EventoIntegracion {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'uuid' }) empresaId!: string;

  @Column({ type: 'varchar', length: 40 }) tipo!: TipoEventoIntegracion;

  /** Entidad del ERP que originó el hecho. */
  @Column({ type: 'uuid', nullable: true }) entidadId!: string | null;

  @Column({ type: 'varchar', length: 140 }) claveIdempotencia!: string;

  /** Cuerpo del hecho, en vocabulario del ERP. La traducción al proveedor ocurre al despachar. */
  @Column({ type: 'jsonb' }) carga!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 20, default: EstadoEventoIntegracion.PENDIENTE })
  estado!: EstadoEventoIntegracion;

  @Column({ type: 'int', default: 0 }) intentos!: number;

  /** No se despacha antes de esta marca. Sostiene el retroceso exponencial. */
  @Column({ type: 'timestamptz', nullable: true })
  proximoIntento!: Date | null;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  ultimoError!: string | null;

  /** Respuesta del proveedor al aplicarlo, para auditoría y conciliación. */
  @Column({ type: 'jsonb', nullable: true })
  respuesta!: Record<string, unknown> | null;

  @Column({ type: 'timestamptz', nullable: true }) fechaEnvio!: Date | null;

  @CreateDateColumn() fechaCreacion!: Date;
  @UpdateDateColumn() fechaActualizacion!: Date;
}
