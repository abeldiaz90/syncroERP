import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { AtributoGrupo } from './atributo-grupo.entity';

/**
 * AtributoDefinicion — un CAMPO dentro de un grupo de atributos.
 *
 * El usuario define: etiqueta, tipo de dato, unidad, opciones (si es lista),
 * si es obligatorio y el orden. El formulario del producto se dibuja solo
 * a partir de estas definiciones.
 *
 * Los VALORES capturados siguen guardándose en producto_atributos
 * (clave/valor), por lo que los datos existentes no se migran.
 */
@Entity('atributo_definiciones')
@Index(['grupoId', 'clave'], { unique: true })
export class AtributoDefinicion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  empresaId!: string;

  @ManyToOne(() => AtributoGrupo, (g) => g.definiciones, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'grupoid' })
  grupo!: AtributoGrupo;

  @Column({ type: 'uuid' })
  grupoId!: string;

  /** Identificador técnico. Se genera de la etiqueta. Ej: 'principioActivo' */
  @Column({ type: 'varchar', length: 100 })
  clave!: string;

  /** Etiqueta visible. Ej: 'Principio Activo' */
  @Column({ type: 'varchar', length: 150 })
  etiqueta!: string;

  @Column({ type: 'varchar', length: 20, default: 'TEXT' })
  tipoValor!: 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'SELECT';

  /** Unidad para NUMBER. Ej: 'mg', '°C', '%' */
  @Column({ type: 'varchar', length: 20, nullable: true })
  unidad!: string | null;

  /** Opciones para SELECT, separadas por '|'. Ej: 'Bovino|Porcino|Avícola' */
  @Column({ type: 'varchar', length: 1000, nullable: true })
  opciones!: string | null;

  @Column({ default: false })
  requerido!: boolean;

  @Column({ type: 'int', default: 0 })
  orden!: number;

  @Column({ default: true })
  activo!: boolean;
}
