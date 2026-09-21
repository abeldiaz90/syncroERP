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
import { CreditoCliente } from './credito-cliente.entity';
import { MetodoPagoCobranza } from '../dto/registrar-pago-cobranza.dto';
import { Factura } from '../../cfdi/factura.entity';

export enum EstadoContableCobranza {
  PENDIENTE = 'PENDIENTE',
  GENERADO = 'GENERADO',
  FALLIDO = 'FALLIDO',
  REVERTIDO = 'REVERTIDO',
}


export enum EstadoFiscalCobranza {
  NO_REQUERIDO = 'NO_REQUERIDO',
  PENDIENTE_REP = 'PENDIENTE_REP',
  REP_GENERADO = 'REP_GENERADO',
  ERROR_REP = 'ERROR_REP',
}

@Entity('pagos_cobranza')
@Index('UX_pago_cobranza_empresa_idempotencia', ['empresaId', 'claveIdempotencia'], {
  unique: true,
})
@Index(['empresaId', 'creditoId', 'fechaPago'])
export class PagoCobranza {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;
  @ManyToOne(() => CreditoCliente, (c) => c.pagos, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'creditoid' }) credito!: CreditoCliente;
  @Column({ type: 'uuid' }) creditoId!: string;
  @Column({ type: 'uuid', nullable: true }) cuotaId!: string | null;
  @Column({ type: 'date' }) fechaPago!: Date;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4 }) montoPagado!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 }) montoCapital!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 }) montoInteres!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 }) ivaReclasificado!: number;
  @Column({ type: 'varchar', length: 30 }) metodoPago!: MetodoPagoCobranza;
  @Column({ type: 'uuid', nullable: true }) cuentaBancariaId!: string | null;
  @Column({ type: 'varchar', length: 200, nullable: true }) referencia!: string | null;
  @Column({ type: 'varchar', length: 100 }) claveIdempotencia!: string;
  @Column({ type: 'uuid', nullable: true }) usuarioId!: string | null;
  @Column({ type: 'uuid', nullable: true }) movimientoTesoreriaId!: string | null;

  /*
   * Cancelación.
   *
   * El pago no se borra, se marca. Un movimiento de dinero que desaparece de
   * la base es justo lo que una auditoría no puede aceptar: lo que hubo que
   * deshacer también es un hecho, y tiene que poder contarse.
   */
  @Column({ default: false }) cancelado!: boolean;
  @Column({ type: 'timestamptz', nullable: true }) fechaCancelacion!: Date | null;
  @Column({ type: 'varchar', length: 500, nullable: true })
  motivoCancelacion!: string | null;
  @Column({ type: 'uuid', nullable: true }) canceladoPorId!: string | null;

  /**
   * Identificador de la transacción del registro externo que originó este
   * pago, cuando no nació en el ERP. Sirve para no republicarlo y para saber,
   * mirando el pago, de dónde vino.
   */
  @Column({ type: 'varchar', length: 100, nullable: true })
  origenExterno!: string | null;

  @ManyToOne(() => Factura, { nullable: true, onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'complementopagoid' })
  complementoPago!: Factura | null;
  @Column({ type: 'uuid', nullable: true })
  complementoPagoId!: string | null;
  @Column({
    type: 'varchar',
    length: 30,
    default: EstadoFiscalCobranza.NO_REQUERIDO,
  })
  estadoFiscal!: EstadoFiscalCobranza;
  @Column({ type: 'varchar', length: 2000, nullable: true })
  ultimoErrorFiscal!: string | null;
  @Column({ type: 'varchar', length: 20, default: EstadoContableCobranza.PENDIENTE })
  estadoContable!: EstadoContableCobranza;
  @Column({ type: 'uuid', nullable: true }) polizaId!: string | null;
  @Column({ type: 'uuid', nullable: true }) asientoPendienteId!: string | null;
  @CreateDateColumn() fechaCreacion!: Date;
}
