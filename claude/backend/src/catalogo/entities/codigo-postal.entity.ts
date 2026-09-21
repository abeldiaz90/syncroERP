import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * ============================================================================
 * Códigos postales de México (asentamiento por asentamiento)
 * ----------------------------------------------------------------------------
 * Una fila por colonia. Un código postal con doce colonias ocupa doce filas:
 * es lo que permite que el usuario elija su colonia de una lista en lugar de
 * escribirla, y que el estado y el municipio se deduzcan sin preguntar.
 *
 * Deliberadamente NO vive en `catalogos_sat_entradas`. Esa tabla modela
 * catálogos fiscales con vigencias (inicio y fin de aplicación), y el domicilio
 * de un cliente no es un dato fiscal con vigencia: es geografía. Mezclarlos
 * obligaría a inventar una vigencia falsa para cada colonia del país.
 *
 * `fuente` y `version` quedan en cada fila a propósito. Cuando alguien
 * actualice el catálogo dentro de dos años, la pregunta «¿de dónde salió esta
 * colonia?» se responde mirando el renglón, no reconstruyendo la historia.
 * ============================================================================
 */
export enum FuenteCodigoPostal {
  SEPOMEX = 'SEPOMEX',
  SAT = 'SAT',
  MANUAL = 'MANUAL',
}

@Entity('codigos_postales')
@Index('IX_codigos_postales_cp', ['cp'])
@Index('IX_codigos_postales_estado', ['estadoClave'])
@Index('IX_codigos_postales_municipio', ['estadoClave', 'municipioNombre'])
@Index('UX_codigos_postales_asentamiento', ['cp', 'coloniaNormalizada'], {
  unique: true,
})
export class CodigoPostal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Cinco dígitos, siempre con ceros a la izquierda. */
  @Column({ type: 'varchar', length: 5 })
  cp: string;

  /**
   * Clave de la entidad federativa tal como la publica la fuente cargada:
   * alfabética con el catálogo del SAT («CMX»), numérica INEGI con SEPOMEX
   * («09»). Se guarda tal cual y sólo se usa como llave interna para encadenar
   * estado → municipio → colonia; lo que se enseña y se replica es el nombre.
   */
  @Column({ type: 'varchar', length: 5 })
  estadoClave: string;

  @Column({ type: 'varchar', length: 120 })
  estadoNombre: string;

  @Column({ type: 'varchar', length: 5, nullable: true })
  municipioClave?: string | null;

  @Column({ type: 'varchar', length: 160 })
  municipioNombre: string;

  /** Localidad. No todos los códigos postales traen una; queda nula. */
  @Column({ type: 'varchar', length: 160, nullable: true })
  ciudad?: string | null;

  @Column({ type: 'varchar', length: 200 })
  colonia: string;

  /**
   * La misma colonia sin acentos, sin dobles espacios y en mayúsculas. Existe
   * únicamente para que el índice único detecte duplicados que solo difieren en
   * la acentuación, cosa que ocurre dentro de la propia fuente y entre una
   * fuente y otra.
   */
  @Column({ type: 'varchar', length: 200 })
  coloniaNormalizada: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  tipoAsentamiento?: string | null;

  /**
   * El valor por omisión es histórico: la primera carga fue de SEPOMEX. No lo
   * usa nadie —toda inserción fija la fuente— y cambiarlo costaría una
   * migración a cambio de nada.
   */
  @Column({ type: 'varchar', length: 20, default: FuenteCodigoPostal.SEPOMEX })
  fuente: FuenteCodigoPostal;

  /** Etiqueta de la carga que trajo esta fila, p. ej. «2026-09». */
  @Column({ type: 'varchar', length: 40 })
  version: string;

  @Column({ type: 'boolean', default: true })
  activo: boolean;
}
