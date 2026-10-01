import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * ============================================================================
 * El consecutivo, guardado donde se puede incrementar sin carreras
 * ----------------------------------------------------------------------------
 * Una fila por empresa, tipo de documento y año. `ultimo` es el último número
 * entregado, no el siguiente: la fila nace con 1 porque se crea al entregar el
 * primero.
 *
 * El año forma parte de la llave porque el consecutivo reinicia cada ejercicio
 * —decisión de Abel, 1-oct-2026, y es lo que un contador espera para que la
 * numeración cuadre con el ejercicio fiscal—. Eso hace que la fila del año
 * anterior quede congelada como está, que es justamente lo que se quiere: un
 * documento rezagado con fecha del año pasado toma el consecutivo de ESE año,
 * no el del actual.
 *
 * Por qué una tabla y no una SEQUENCE de Postgres: una secuencia es global a
 * la base, y aquí el consecutivo es por empresa. Con una secuencia habría que
 * crear una por empresa y por año en tiempo de ejecución —DDL desde el camino
 * de alta de un documento—, y además las secuencias no respetan las
 * transacciones: un `nextval` dentro de una transacción que se revierte
 * consume el número igual y deja un hueco. Con una fila, revertir la
 * transacción devuelve el número.
 * ============================================================================
 */
@Entity('folio_secuencias')
export class FolioSecuencia {
  @PrimaryColumn({ type: 'uuid' })
  empresaId!: string;

  /** El prefijo del documento: `OC`, `REQ`, `COT`, `REC`, `PP`. */
  @PrimaryColumn({ type: 'varchar', length: 16 })
  tipo!: string;

  @PrimaryColumn({ type: 'int' })
  anio!: number;

  @Column({ type: 'int', default: 0 })
  ultimo!: number;
}
