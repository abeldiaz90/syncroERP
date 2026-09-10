import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('importaciones_inventario_errores')
@Index(['importacionId', 'numeroFila'])
export class ImportacionInventarioError {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) id!: string;
  @Column({ name: 'importacion_id', type: 'uuid' }) importacionId!: string;
  @Column({ name: 'numero_fila', type: 'int' }) numeroFila!: number;
  @Column({ type: 'varchar', length: 100, nullable: true }) sku?: string;
  @Column({ type: 'varchar', length: 100, nullable: true }) campo?: string;
  @Column({ type: 'varchar', length: 500, nullable: true }) valor?: string;
  @Column({ type: 'varchar', length: 1200 }) mensaje!: string;
  @CreateDateColumn({ name: 'fecha_creacion' }) fechaCreacion!: Date;
}
