import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * ============================================================================
 * Identificaciones del cliente
 * ----------------------------------------------------------------------------
 * El expediente tenía dos columnas fijas —`rfc` y `curp`— y ningún lugar para
 * una credencial de elector, un pasaporte o un comprobante de domicilio. Quien
 * los pedía en ventanilla los guardaba en las notas o no los guardaba.
 *
 * **Por qué el RFC y la CURP NO se mudaron aquí.** Es la decisión que más se
 * discute y conviene dejarla escrita: no son documentos, son claves de
 * identidad fiscal que medio sistema lee —el CFDI, la validación, la búsqueda
 * de clientes— y que están garantizadas como una sola por persona. Moverlas a
 * una tabla las habría vuelto una consulta más en cada factura, a cambio de una
 * pureza de modelo que nadie iba a cobrar. Esta tabla es para lo que sí es un
 * documento: tiene folio, puede vencer, y una persona puede tener varios.
 *
 * `vigenciaHasta` es lo que hace que esto valga más que una nota: una
 * identificación vencida sigue siendo un documento válido en el expediente y a
 * la vez inservible para operar. La distinción sólo existe si la fecha está en
 * una columna.
 * ============================================================================
 */
export enum TipoIdentificacion {
  INE = 'INE',
  PASAPORTE = 'PASAPORTE',
  CEDULA_PROFESIONAL = 'CEDULA_PROFESIONAL',
  LICENCIA_CONDUCIR = 'LICENCIA_CONDUCIR',
  COMPROBANTE_DOMICILIO = 'COMPROBANTE_DOMICILIO',
  ACTA_CONSTITUTIVA = 'ACTA_CONSTITUTIVA',
  PODER_NOTARIAL = 'PODER_NOTARIAL',
  OTRO = 'OTRO',
}

/** Cómo se llama cada tipo en el catálogo del registro externo. */
export const ETIQUETA_EXTERNA: Readonly<Record<TipoIdentificacion, string>> = {
  [TipoIdentificacion.INE]: 'Credencial para votar (INE)',
  [TipoIdentificacion.PASAPORTE]: 'Pasaporte',
  [TipoIdentificacion.CEDULA_PROFESIONAL]: 'Cédula profesional',
  [TipoIdentificacion.LICENCIA_CONDUCIR]: 'Licencia de conducir',
  [TipoIdentificacion.COMPROBANTE_DOMICILIO]: 'Comprobante de domicilio',
  [TipoIdentificacion.ACTA_CONSTITUTIVA]: 'Otro documento',
  [TipoIdentificacion.PODER_NOTARIAL]: 'Otro documento',
  [TipoIdentificacion.OTRO]: 'Otro documento',
};

@Entity('cliente_identificaciones')
@Index('IX_cliente_identificaciones_cliente', ['empresaId', 'clienteId'])
@Index('UX_cliente_identificaciones_folio', ['empresaId', 'clienteId', 'tipo', 'folio'], {
  unique: true,
})
export class ClienteIdentificacion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  empresaId!: string;

  @Column({ type: 'uuid' })
  clienteId!: string;

  @Column({ type: 'varchar', length: 40 })
  tipo!: TipoIdentificacion;

  /** Número, folio o clave del documento. */
  @Column({ type: 'varchar', length: 100 })
  folio!: string;

  @Column({ type: 'date', nullable: true })
  vigenciaDesde?: Date | string | null;

  @Column({ type: 'date', nullable: true })
  vigenciaHasta?: Date | string | null;

  /** Autoridad que lo emitió, cuando importa (notaría, estado, dependencia). */
  @Column({ type: 'varchar', length: 150, nullable: true })
  emisor?: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  notas?: string | null;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  fechaCreacion!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  fechaActualizacion!: Date;
}
