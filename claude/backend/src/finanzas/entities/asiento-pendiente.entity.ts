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
 * SyncroERP · Asientos contables pendientes
 * ----------------------------------------------------------------------------
 * EL PROBLEMA QUE RESUELVE
 *
 * En `ventas.service.ts` y `ordenes-compra.service.ts` la póliza se genera así:
 *
 *     await qr.commitTransaction();              // la venta YA se guardó
 *     this.motorContable.generarAsientoDeVenta({ ... })
 *       .catch(err => console.error(err.message));
 *
 * Tres problemas juntos: está fuera de la transacción, no hay `await`, y el
 * error se traga con `console.error`.
 *
 * El escenario real: una categoría sin cuenta contable configurada. Las ventas
 * salen normales, los tickets se imprimen, el cajero corta caja sin novedad.
 * Y la contabilidad simplemente no tiene esas ventas. Nadie se entera hasta el
 * cierre mensual, cuando ya hay semanas de operación que reconstruir a mano.
 *
 * LA DECISIÓN
 *
 * Que la venta NO se caiga porque falló la póliza es correcto: entre no poder
 * cobrar y quedar a deber un asiento, lo segundo es mucho menos grave.
 *
 * Lo que no es correcto es que nadie se entere. Aquí cada intento fallido
 * queda registrado con su contexto completo, se reintenta solo, y si agota los
 * reintentos queda visible en una pantalla para que alguien lo resuelva.
 *
 * El payload se guarda íntegro para que el reintento no tenga que volver a
 * consultar nada: los datos originales pueden haber cambiado.
 * ============================================================================
 */

export enum TipoAsiento {
  VENTA = 'VENTA',
  /** Reversión de una venta anulada. NO es una venta con signo contrario:
   *  genera su propia póliza espejo. */
  CANCELACION_VENTA = 'CANCELACION_VENTA',
  /** Devolución parcial o total: revierte ingreso, IVA y costo sin borrar
   *  las pólizas de la venta original. */
  DEVOLUCION_VENTA = 'DEVOLUCION_VENTA',
  COMPRA = 'COMPRA',
  PAGO_PROVEEDOR = 'PAGO_PROVEEDOR',
  COBRANZA = 'COBRANZA',
  /** Reversa de una cobranza cancelada. Póliza propia: la original no se toca. */
  CANCELACION_COBRANZA = 'CANCELACION_COBRANZA',
  /** Devolución registrada en el externo: baja el crédito sin venta detrás. */
  AJUSTE_DEVOLUCION_EXTERNA = 'AJUSTE_DEVOLUCION_EXTERNA',
  SALIDA_INVENTARIO = 'SALIDA_INVENTARIO',
  INVENTARIO_INICIAL = 'INVENTARIO_INICIAL',
  AJUSTE_INVENTARIO = 'AJUSTE_INVENTARIO',
  HOSPEDAJE = 'HOSPEDAJE',
  NOMINA = 'NOMINA',
  DEPRECIACION = 'DEPRECIACION',
  BAJA_ACTIVO = 'BAJA_ACTIVO',
  TESORERIA = 'TESORERIA',
}

export enum EstadoAsiento {
  PENDIENTE = 'PENDIENTE',
  REINTENTANDO = 'REINTENTANDO',
  GENERADO = 'GENERADO',
  /** Agotó los reintentos: necesita que una persona lo revise. */
  FALLIDO = 'FALLIDO',
  /** Alguien decidió que no procede. Requiere justificación. */
  DESCARTADO = 'DESCARTADO',
}

@Entity('asientos_pendientes')
@Index(['empresaId', 'estado'])
@Index(['empresaId', 'fechaCreacion'])
@Index(
  'UX_asientos_pendientes_empresa_tipo_documento',
  ['empresaId', 'tipo', 'documentoId'],
  { unique: true, where: 'documentoId IS NOT NULL' },
)
export class AsientoPendiente {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;

  @Column({ type: 'varchar', length: 40 }) tipo!: TipoAsiento;

  /** Documento de origen: la venta, la orden de compra, el recibo. */
  @Column({ type: 'uuid', nullable: true }) documentoId?: string;
  @Column({ type: 'varchar', length: 40, nullable: true })
  folioDocumento?: string;

  /**
   * Los datos exactos con los que hay que generar el asiento, en JSON.
   * Se guardan completos a propósito: reconsultar en el reintento daría un
   * resultado distinto si el documento cambió, y la póliza debe reflejar el
   * momento en que ocurrió la operación.
   */
  @Column({ type: 'text' }) payload!: string;

  @Column({ type: 'varchar', length: 20, default: EstadoAsiento.PENDIENTE })
  estado!: EstadoAsiento;

  @Column({ type: 'int', default: 0 }) intentos!: number;
  @Column({ type: 'varchar', length: 1000, nullable: true })
  ultimoError!: string | null;
  @Column({ type: 'timestamptz', nullable: true })
  fechaUltimoIntento!: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  proximoIntento!: Date | null;

  /** Póliza creada al resolverse: cierra el círculo de auditoría. */
  @Column({ type: 'uuid', nullable: true })
  polizaId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  resueltoPorId!: string | null;
  @Column({ type: 'varchar', length: 500, nullable: true })
  notaResolucion!: string | null;

  @CreateDateColumn() fechaCreacion!: Date;
  @UpdateDateColumn() fechaActualizacion!: Date;
}
