import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Correspondencia entre el catálogo de cuentas del ERP y el del mayor externo.
 *
 * Hace falta porque los dos catálogos son distintos por naturaleza: el del ERP
 * está codificado según el agrupador del SAT y el del externo es el suyo. No
 * hay forma de deducir uno del otro.
 *
 * Una póliza cuya cuenta no esté mapeada **falla en firme** al espejarse. Es
 * deliberado: mandar el asiento a una cuenta «parecida» produce un mayor que
 * cuadra y miente, que es peor que un evento en rojo pidiendo atención.
 */
@Entity('integracion_mapeo_cuentas')
@Index('UX_integracion_mapeo_cuenta', ['empresaId', 'cuentaContableId'], {
  unique: true,
})
@Index('IX_integracion_mapeo_codigo', ['empresaId', 'codigoCuenta'])
export class MapeoCuentaExterna {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'uuid' }) empresaId!: string;

  /** Cuenta contable del ERP. */
  @Column({ type: 'uuid' }) cuentaContableId!: string;

  /** Código de la cuenta del ERP. Redundante a propósito, para diagnóstico. */
  @Column({ type: 'varchar', length: 40 }) codigoCuenta!: string;

  /** Identificador de la cuenta en el mayor externo. Opaco para el ERP. */
  @Column({ type: 'varchar', length: 120 }) idExterno!: string;

  /** Código de la cuenta en el externo, sólo para que un humano lo reconozca. */
  @Column({ type: 'varchar', length: 60, nullable: true })
  codigoExterno!: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  proveedor!: string | null;

  @Column({ default: true }) activo!: boolean;

  @CreateDateColumn() fechaCreacion!: Date;
  @UpdateDateColumn() fechaActualizacion!: Date;
}
