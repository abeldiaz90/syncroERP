import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';

/**
 * Resultado de la conciliación diaria entre la cartera del ERP y la del
 * registro externo. En modo SOMBRA esta tabla es el instrumento de medición:
 * mientras tenga filas abiertas, el registro externo no está listo para pasar a
 * AUTORIDAD.
 */
@Entity('integracion_discrepancias')
@Index('IX_integracion_discrepancia_abierta', ['empresaId', 'resuelta', 'fechaCorte'])
export class DiscrepanciaIntegracion {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'uuid' }) empresaId!: string;

  @Column({ type: 'date' }) fechaCorte!: Date;

  /** Concepto comparado: SALDO_CLIENTE, SALDO_CREDITO, VENCIDO_CLIENTE… */
  @Column({ type: 'varchar', length: 40 }) concepto!: string;

  @Column({ type: 'uuid', nullable: true }) entidadId!: string | null;

  @Column({
    type: 'decimal',
    transformer: decimalNumberTransformer,
    precision: 18,
    scale: 4,
    default: 0,
  })
  valorErp!: number;

  @Column({
    type: 'decimal',
    transformer: decimalNumberTransformer,
    precision: 18,
    scale: 4,
    default: 0,
  })
  valorExterno!: number;

  @Column({
    type: 'decimal',
    transformer: decimalNumberTransformer,
    precision: 18,
    scale: 4,
    default: 0,
  })
  diferencia!: number;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  detalle!: string | null;

  @Column({ default: false }) resuelta!: boolean;

  @CreateDateColumn() fechaCreacion!: Date;
}
