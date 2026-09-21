import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { FuenteCodigoPostal } from './codigo-postal.entity';

/**
 * ============================================================================
 * Bitácora de cargas del catálogo de códigos postales
 * ----------------------------------------------------------------------------
 * El catálogo se carga una vez, al implantar, y se queda. Esta tabla es lo que
 * hace posible esa promesa sin volverla una trampa: guarda el sha256 del
 * archivo que se importó, de modo que volver a correr el importador con el
 * mismo archivo no hace nada, y correrlo con un archivo nuevo sí actualiza.
 *
 * Sin esta tabla, «actualizar» significaría borrar y reimportar a ciegas, sin
 * saber nunca si el catálogo vigente es el de hace un mes o el de hace un año.
 * ============================================================================
 */
@Entity('codigos_postales_cargas')
@Index('UX_codigos_postales_cargas_huella', ['sha256'], { unique: true })
export class CodigosPostalesCarga {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  fuente: FuenteCodigoPostal;

  /** Nombre del archivo tal como lo publicó la fuente. */
  @Column({ type: 'varchar', length: 260 })
  archivo: string;

  /** Huella del archivo íntegro: es la que decide si hay algo que hacer. */
  @Column({ type: 'varchar', length: 64 })
  sha256: string;

  @Column({ type: 'varchar', length: 40 })
  version: string;

  @Column({ type: 'int', default: 0 })
  filas: number;

  @CreateDateColumn({ type: 'timestamptz' })
  cargadoEn: Date;

  @Column({ type: 'varchar', length: 150, nullable: true })
  cargadoPor?: string | null;

  @Column({ type: 'varchar', length: 400, nullable: true })
  notas?: string | null;
}
