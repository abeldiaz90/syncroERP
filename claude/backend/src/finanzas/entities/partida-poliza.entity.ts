import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Poliza } from './poliza.entity';
import { CuentaContable } from './cuenta-contable.entity'; // Ajusta la ruta a donde guardaste la cuenta

@Entity('partidas_poliza')
export class PartidaPoliza {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Conexión con el encabezado de la póliza
  @ManyToOne(() => Poliza, (poliza) => poliza.partidas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'polizaid' })
  poliza!: Poliza;

  @Column({ type: 'uuid' })
  polizaId!: string;

  // Conexión con el Catálogo de Cuentas
  @ManyToOne(() => CuentaContable)
  @JoinColumn({ name: 'cuentacontableid' })
  cuentaContable!: CuentaContable;

  @Column({ type: 'uuid' })
  cuentaContableId!: string;

  // La regla de oro: Cargo y Abono
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  cargo!: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  abono!: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  referencia!: string; // Opcional: Ej. "Pago factura 102", "Merma Lote X"

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * LA DIMENSIÓN, Y POR QUÉ VA AQUÍ Y NO EN EL ENCABEZADO
   * --------------------------------------------------------------------------
   * Una factura de luz repartida entre tres sucursales es UNA póliza con TRES
   * partidas. Si el centro viviera en la póliza habría que partir el documento
   * para poder repartirlo, y entonces el documento del ERP dejaría de parecerse
   * al papel que lo originó. Por eso todos los ERP que llevan esta dimensión la
   * llevan en la línea: SAP B1, Dynamics y Odoo, los tres.
   *
   * NULO SIGNIFICA «NO SE SABE», NO «SIN CENTRO»
   *
   * Las partidas anteriores a la migración quedaron en NULL porque nadie puede
   * saber a qué centro pertenecían. El reporte por centro las agrupa en su
   * propio renglón —«sin clasificar»— en vez de esconderlas o repartirlas por
   * una regla inventada: un reporte de aspecto correcto construido sobre
   * adivinanzas es peor que uno que dice lo que no sabe.
   * ══════════════════════════════════════════════════════════════════════════
   */
  @Column({ type: 'uuid', nullable: true })
  centroCostoId!: string | null;
}
