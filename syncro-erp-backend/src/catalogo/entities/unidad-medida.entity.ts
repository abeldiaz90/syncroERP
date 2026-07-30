// catalogo/entities/unidad-medida.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

@Entity('unidades_medida')
@Unique(['empresaId', 'nombre'])
export class UnidadMedida {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uniqueidentifier' })
  empresaId!: string;

  /** Nombre visible: Pieza, Kilogramo, Litro, Caja… */
  @Column({ type: 'varchar', length: 60 })
  nombre!: string;

  /** Abreviatura corta para tickets y tablas: pza, kg, L, m… */
  @Column({ type: 'varchar', length: 10, nullable: true })
  abreviatura!: string | null;

  /**
   * Clave de unidad del catálogo SAT (c_ClaveUnidad), obligatoria para CFDI 4.0.
   * Ej: H87=Pieza, KGM=Kilogramo, LTR=Litro, MTR=Metro, XBX=Caja, E48=Servicio.
   */
  @Column({ type: 'varchar', length: 10, nullable: true })
  claveSAT!: string | null;

  @Column({ default: true })
  activo!: boolean;

  @CreateDateColumn()
  fechaCreacion!: Date;

  @UpdateDateColumn()
  fechaActualizacion!: Date;
}
