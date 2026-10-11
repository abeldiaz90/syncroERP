import {
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';

/**
 * En qué momento de su vida está un presupuesto.
 *
 * El estado NO es decorativo: es el control. Un presupuesto que cualquiera
 * puede editar después de aprobado no sirve para medir a nadie, porque siempre
 * se puede ajustar al real y entonces nunca hay desviación. Es el mismo
 * razonamiento que el cierre contable: lo que ya se firmó no se reescribe.
 */
export enum EstadoPresupuesto {
  /** Se captura y se corrige. Nadie lo ha firmado. */
  BORRADOR = 'BORRADOR',
  /** Firmado. Las líneas ya no se tocan; contra esto se mide. */
  APROBADO = 'APROBADO',
  /** El ejercicio terminó. Ni se edita ni se vuelve a aprobar. */
  CERRADO = 'CERRADO',
}

/**
 * ============================================================================
 * EL PRESUPUESTO, QUE ES LO QUE LE DA SENTIDO AL CENTRO DE COSTO
 * ----------------------------------------------------------------------------
 * Un reporte por centro, solo, describe. Dice que la sucursal norte gastó
 * 412,000 y no dice si eso está bien. La pregunta que un director hace de
 * verdad —«¿vamos bien?»— necesita dos cifras, y la segunda es ésta.
 *
 * Por eso se construye justo después de los centros y no antes: un presupuesto
 * sin dimensión sólo se puede hacer por cuenta, y «gastos de operación de toda
 * la empresa» es un número contra el que nadie se puede medir.
 *
 * ── POR QUÉ HAY VARIOS PRESUPUESTOS POR EJERCICIO ─────────────────────────
 *
 * Porque los hay: el original aprobado en diciembre y el revisado de junio. Si
 * la tabla admitiera uno solo, revisar obligaría a sobrescribir el original, y
 * entonces nadie podría volver a ver contra qué se comprometió la empresa a
 * principio de año. Se guardan los dos y se compara contra el que se elija.
 * ============================================================================
 */
@Entity('presupuestos')
@Index('UX_presupuestos_empresa_ejercicio_nombre', ['empresaId', 'ejercicio', 'nombre'], {
  unique: true,
})
@Index('IX_presupuestos_empresa_ejercicio', ['empresaId', 'ejercicio'])
export class Presupuesto {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  empresaId!: string;

  @Column({ type: 'int' })
  ejercicio!: number;

  /** «Original 2027», «Revisión de junio». Es lo que lo distingue de sus hermanos. */
  @Column({ type: 'varchar', length: 120 })
  nombre!: string;

  @Column({ type: 'varchar', length: 20, default: EstadoPresupuesto.BORRADOR })
  estado!: EstadoPresupuesto;

  @Column({ type: 'uuid', nullable: true })
  aprobadoPorId!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  fechaAprobacion!: Date | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  notas!: string | null;

  @CreateDateColumn()
  fechaCreacion!: Date;

  @UpdateDateColumn()
  fechaActualizacion!: Date;
}

/**
 * Una celda del presupuesto: cuenta × centro × mes.
 *
 * ── POR QUÉ POR MES Y NO POR AÑO ──────────────────────────────────────────
 * Porque la pregunta se hace en marzo, no en diciembre. Un presupuesto anual
 * sólo se puede comparar contra el real al cerrar el ejercicio, que es cuando
 * ya no se puede hacer nada. Repartirlo en doce permite preguntar «¿vamos bien
 * a estas alturas?», que es la única versión útil de la pregunta.
 *
 * Doce renglones por cuenta y centro es más captura, así que la pantalla ofrece
 * repartir un anual en partes iguales; lo que se guarda son los doce.
 */
@Entity('presupuesto_lineas')
@Index(
  'UX_presupuesto_linea',
  ['presupuestoId', 'cuentaContableId', 'centroCostoId', 'mes'],
  { unique: true },
)
@Index('IX_presupuesto_lineas_presupuesto', ['presupuestoId'])
export class PresupuestoLinea {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  presupuestoId!: string;

  @Column({ type: 'uuid' })
  cuentaContableId!: string;

  /**
   * Nulo = presupuestado para la empresa entera, sin abrir por centro. Se
   * admite porque hay gastos que de verdad no son de nadie —la auditoría
   * externa, el seguro corporativo— y obligar a repartirlos inventaría una
   * distribución que nadie decidió.
   */
  @Column({ type: 'uuid', nullable: true })
  centroCostoId!: string | null;

  /** 1 a 12. */
  @Column({ type: 'int' })
  mes!: number;

  /**
   * Siempre POSITIVO, en el sentido natural de la cuenta: lo que se espera
   * ingresar en una de ingreso, lo que se espera gastar en una de gasto.
   *
   * Guardarlo con signo contable obligaría a quien captura a saber si su
   * cuenta es deudora o acreedora para teclear el número, y el día que se
   * equivoque el comparativo dirá que gastó de menos.
   */
  @Column({
    type: 'decimal',
    transformer: decimalNumberTransformer,
    precision: 18,
    scale: 2,
    default: 0,
  })
  importe!: number;
}
