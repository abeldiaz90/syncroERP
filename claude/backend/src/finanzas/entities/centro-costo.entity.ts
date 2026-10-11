import {
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Para qué sirve un centro de costo, además de etiquetar.
 *
 * El tipo no cambia ninguna regla contable: existe para que el catálogo se
 * pueda leer y agrupar. Una empresa que separa por sucursal y otra que separa
 * por línea de negocio usan la misma maquinaria.
 */
export enum TipoCentroCosto {
  DEPARTAMENTO = 'DEPARTAMENTO',
  SUCURSAL = 'SUCURSAL',
  PROYECTO = 'PROYECTO',
  LINEA_NEGOCIO = 'LINEA_NEGOCIO',
  OTRO = 'OTRO',
}

/**
 * ============================================================================
 * LA DIMENSIÓN QUE LE FALTABA AL MAYOR
 * ----------------------------------------------------------------------------
 * `PartidaPoliza` tenía cuenta, cargo y abono. Nada más. Con eso se puede
 * contestar «cuánto gasté en papelería» y no se puede contestar «cuánto costó
 * el hotel contra cuánto costó la ferretería», que es la pregunta por la que
 * alguien compra un ERP en lugar de llevar la contabilidad en un despacho.
 *
 * Todo ERP serio pone esta dimensión en la LÍNEA del asiento, no en el
 * encabezado: SAP Business One con sus dimensiones, Dynamics con sus
 * *dimension sets*, Odoo con la cuenta analítica. En la línea y no en el
 * encabezado porque una sola póliza reparte gasto entre varios centros —una
 * factura de luz entre tres sucursales es un asiento con tres partidas— y
 * ponerla arriba obliga a partir el documento para poder repartirlo.
 *
 * ── POR QUÉ NO HAY UN INTERRUPTOR DE «ESTA EMPRESA USA CENTROS» ────────────
 *
 * Es el mismo criterio que ya gobierna las posiciones de almacén: *no hay un
 * interruptor de «este almacén maneja posiciones»: las maneja cuando tiene
 * alguna*. Aquí igual. Una empresa usa centros de costo cuando ha dado de alta
 * alguno que acepte movimientos; hasta entonces el campo es opcional y nada
 * cambia. Una bandera aparte sería un segundo estado que puede contradecir al
 * primero —catálogo lleno con la bandera apagada, o al revés— y alguien
 * tendría que mantener los dos de acuerdo.
 *
 * ── LA JERARQUÍA, Y POR QUÉ UN PADRE NO RECIBE MOVIMIENTOS ────────────────
 *
 * Misma regla que las cuentas contables, por la misma razón: si un centro
 * acumulador recibe sus propios movimientos, su saldo deja de ser la suma de
 * sus hijos y el reporte por centro ya no cuadra con el total. `CORPORATIVO`
 * agrupa a `NORTE` y `SUR`; el gasto se carga a uno de los dos.
 *
 * ── `oficinaExternaId` ────────────────────────────────────────────────────
 *
 * Fineract pone su dimensión en el asiento como `officeId`, **uno por asiento
 * y no por partida**. Este campo es el puente, y lo que implica está escrito
 * en el despachador: una póliza cuyas partidas caen en centros con oficinas
 * distintas no se puede espejar como un solo asiento. Vacío significa «este
 * centro no tiene oficina propia allá» y el espejo usa la de la empresa.
 * ============================================================================
 */
@Entity('centros_costo')
@Index('UX_centros_costo_empresa_codigo', ['empresaId', 'codigo'], { unique: true })
@Index('IX_centros_costo_empresa_activo', ['empresaId', 'activo'])
export class CentroCosto {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  empresaId!: string;

  /** Corto y estable: es lo que se teclea al capturar y lo que sale en los reportes. */
  @Column({ type: 'varchar', length: 30 })
  codigo!: string;

  @Column({ type: 'varchar', length: 120 })
  nombre!: string;

  @Column({ type: 'varchar', length: 20, default: TipoCentroCosto.DEPARTAMENTO })
  tipo!: TipoCentroCosto;

  /** Centro acumulador del que cuelga. Nulo si es de primer nivel. */
  @Column({ type: 'uuid', nullable: true })
  padreId!: string | null;

  /**
   * Si acepta movimientos. Un centro con hijos no debería: su saldo es la suma
   * de ellos, y recibir movimientos propios rompe esa igualdad.
   */
  @Column({ type: 'boolean', default: true })
  aceptaMovimientos!: boolean;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  /**
   * La oficina de Fineract que le corresponde, si la tiene. Ver el comentario
   * de la clase: Fineract admite una sola por asiento.
   */
  @Column({ type: 'varchar', length: 40, nullable: true })
  oficinaExternaId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  descripcion!: string | null;

  @CreateDateColumn()
  fechaCreacion!: Date;

  @UpdateDateColumn()
  fechaActualizacion!: Date;
}
