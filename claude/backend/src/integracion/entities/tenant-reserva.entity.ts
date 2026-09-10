import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Un inquilino del registro externo, listo para entregarse a una empresa.
 *
 * Existe por una restricción del proveedor: Fineract crea el esquema de un
 * inquilino nuevo únicamente al arrancar. Sin reserva, dar de alta un cliente
 * exigiría reiniciar el core —y con varias empresas operando eso no es una
 * molestia, es una interrupción del servicio a todas las demás—.
 *
 * Con reserva, el alta entrega uno ya construido y nadie espera. Reponerla es
 * mantenimiento programado, no una urgencia con un cliente enfrente.
 */
export enum EstadoTenantReserva {
  DISPONIBLE = 'DISPONIBLE',
  ASIGNADO = 'ASIGNADO',
  /** Se sacó de circulación: falló al crearse, o se dio de baja la empresa. */
  RETIRADO = 'RETIRADO',
}

@Entity('integracion_tenants_reserva')
@Index('UX_tenant_reserva_identificador', ['proveedor', 'identificador'], { unique: true })
export class TenantReserva {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'varchar', length: 40, default: 'fineract' })
  proveedor!: string;

  /**
   * El identificador con el que el proveedor conoce al inquilino.
   *
   * Neutro a propósito (`t001`, `t002`): se crea antes de saber a quién se le
   * va a entregar, y el nombre comercial de la empresa vive en el ERP. Meter
   * el nombre del cliente en el identificador de una base de datos obliga a
   * migrarla cuando el cliente se renombra o se vende.
   */
  @Column({ type: 'varchar', length: 60 }) identificador!: string;

  @Column({ type: 'varchar', length: 20, default: EstadoTenantReserva.DISPONIBLE })
  estado!: EstadoTenantReserva;

  @Column({ type: 'uuid', nullable: true }) empresaId!: string | null;

  @Column({ type: 'timestamptz', nullable: true }) asignadoEn!: Date | null;

  @Column({ type: 'uuid', nullable: true }) asignadoPor!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true }) nota!: string | null;

  @CreateDateColumn() fechaCreacion!: Date;
  @UpdateDateColumn() fechaActualizacion!: Date;
}
