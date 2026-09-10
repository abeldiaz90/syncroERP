import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TipoVinculo } from '../integracion.constants';

/**
 * Traduce identidades entre el ERP y el registro externo de cartera.
 *
 * Sin esta tabla la integración sería adivinanza: el ERP usa UUID por empresa y
 * el proveedor usa lo que se le ocurra. `idExterno` es una cadena opaca; el ERP
 * la guarda y la devuelve, nunca la interpreta.
 *
 * `referenciaIdempotencia` es la clave que el ERP impone al crear el recurso.
 * Es lo que hace seguro cualquier reintento: si el alta se perdió pero el
 * proveedor la aplicó, el segundo intento choca contra esta referencia y se
 * resuelve consultando en lugar de duplicando.
 */
@Entity('integracion_vinculos')
@Index('UX_integracion_vinculo_entidad', ['empresaId', 'tipo', 'entidadId'], {
  unique: true,
})
@Index('UX_integracion_vinculo_referencia', ['tipo', 'referenciaIdempotencia'], {
  unique: true,
})
export class VinculoIntegracion {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'uuid' }) empresaId!: string;

  @Column({ type: 'varchar', length: 30 }) tipo!: TipoVinculo;

  /** UUID de la entidad en el ERP (cliente, crédito, pago…). */
  @Column({ type: 'uuid' }) entidadId!: string;

  /** Identificador que asignó el proveedor. Opaco para el ERP. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  idExterno!: string | null;

  /** Clave determinista: `syncro:<tipo>:<entidadId>`. */
  @Column({ type: 'varchar', length: 120 }) referenciaIdempotencia!: string;

  /** Proveedor que emitió el id externo. Permite migrar sin ambigüedad. */
  @Column({ type: 'varchar', length: 40, nullable: true })
  proveedor!: string | null;

  /** Último estado conocido del recurso, para diagnóstico. */
  @Column({ type: 'varchar', length: 40, nullable: true })
  estadoRemoto!: string | null;

  @CreateDateColumn() fechaCreacion!: Date;
  @UpdateDateColumn() fechaActualizacion!: Date;
}

/** Construye la referencia. Determinista a propósito: es la llave de idempotencia. */
export function referenciaDe(tipo: TipoVinculo, entidadId: string): string {
  return `syncro:${tipo.toLowerCase()}:${entidadId}`;
}
