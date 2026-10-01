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

  /*
   * Texto y no `uuid`: desde que la conciliación mira también el sentido
   * externo → ERP, hay hallazgos cuya única identidad es la del core. En
   * Fineract eso es un entero, no un uuid, y ésa es justamente la noticia: un
   * cliente que existe allá y aquí no tiene entidad a la que apuntar.
   *
   * Fabricar un uuid a partir del id externo para que entrara en la columna
   * habría guardado igual de bien un identificador que no corresponde a nada.
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  entidadId!: string | null;

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
