import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Marca durable por fila aplicada. La inserción se realiza en la misma
 * transacción que el movimiento de inventario, por lo que un reinicio puede
 * reanudar el archivo sin duplicar existencias.
 */
@Entity('importaciones_inventario_filas_aplicadas')
@Index(['importacionId', 'numeroFila'], { unique: true })
@Index(['empresaId', 'importacionId'])
export class ImportacionInventarioFilaAplicada {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;
  @Column({ type: 'uuid' }) importacionId!: string;
  @Column({ type: 'int' }) numeroFila!: number;
  @Column({ type: 'uuid' }) productoId!: string;
  @Column({ type: 'uuid' }) almacenId!: string;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4 }) cantidad!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4 }) costoUnitario!: number;
  @Column({ type: 'varchar', length: 120, nullable: true }) lote?: string | null;
  @Column({ type: 'date', nullable: true }) caducidad?: string | null;
  @CreateDateColumn() fechaAplicacion!: Date;
}
