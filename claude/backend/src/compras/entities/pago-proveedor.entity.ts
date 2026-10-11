import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { OrdenCompra } from './orden-compra.entity';

export enum EstadoContablePagoProveedor {
  PENDIENTE = 'PENDIENTE',
  GENERADO = 'GENERADO',
  FALLIDO = 'FALLIDO',
  REVERTIDO = 'REVERTIDO',
}

@Entity('pagos_proveedor')
@Index(['empresaId', 'ordenCompraId'])
@Index(['empresaId', 'ordenCompraId', 'claveIdempotencia'], { unique: true, where: 'claveIdempotencia IS NOT NULL' })
@Index(['empresaId', 'folio'], { unique: true, where: 'folio IS NOT NULL' })
export class PagoProveedor {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

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
  /**
   * La factura del proveedor que este pago liquida.
   *
   * Nulo en los pagos anteriores al 11-oct-2026, y NULL significa «no se sabe
   * con qué comprobante se pagó» — que es exactamente la verdad de esos pagos:
   * se hicieron contra la recepción, porque la factura no existía como
   * documento en el sistema.
   */
  @Column({ type: 'uuid', nullable: true })
  facturaProveedorId!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  folio?: string;

  @Column({ type: 'uuid' })
  empresaId!: string;

  @Column({ type: 'uuid' })
  ordenCompraId!: string;

  @ManyToOne(() => OrdenCompra, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'ordencompraid' })
  ordenCompra!: OrdenCompra;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4 })
  monto!: number;

  /** IVA reclasificado de pendiente de pago a acreditable pagado. */
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  ivaReclasificado!: number;

  @Column({ type: 'uuid', nullable: true })
  cuentaBancariaId?: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  referencia?: string;

  @Column({ type: 'date' })
  fechaPago!: Date;

  @Column({ type: 'varchar', length: 100, nullable: true })
  claveIdempotencia?: string;

  @Column({ type: 'uuid', nullable: true })
  registradoPorId?: string;

  @Column({ type: 'uuid', nullable: true })
  movimientoTesoreriaId?: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: EstadoContablePagoProveedor.PENDIENTE,
  })
  estadoContable!: EstadoContablePagoProveedor;

  @Column({ type: 'uuid', nullable: true })
  asientoPendienteId?: string | null;

  @Column({ type: 'uuid', nullable: true })
  polizaId?: string | null;

  @CreateDateColumn()
  fechaCreacion!: Date;
}
