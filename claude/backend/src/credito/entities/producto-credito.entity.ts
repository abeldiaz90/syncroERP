import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';

/**
 * ============================================================================
 * Producto de crédito
 * ----------------------------------------------------------------------------
 * El catálogo comercial de crédito de CADA empresa. Antes esto era un `enum`
 * de cinco valores en el código: para agregar «12 meses sin intereses» había
 * que compilar y desplegar, y las dos empresas del mismo servidor estaban
 * obligadas a vender exactamente lo mismo.
 *
 * Tres reglas gobiernan el diseño:
 *
 *  1. La fila es válida y VENDIBLE por sí sola. Una empresa que no contrató el
 *     registro externo tiene su catálogo completo aquí y no le falta nada. El
 *     ERP calcula la amortización con estos campos, no con los de nadie más.
 *
 *  2. Cuando la empresa SÍ tiene registro externo contratado, la fila no basta:
 *     necesita su correspondencia allá —un vínculo de tipo PRODUCTO_CREDITO— y
 *     haber pasado la verificación. Sin eso queda en BORRADOR y no se vende.
 *     Esa es la «correspondencia entre plataformas»: no dos catálogos que se
 *     parecen, sino uno solo con dos representaciones probadas equivalentes.
 *
 *  3. Lo que el producto EXIGE antes de otorgarse vive aquí, no en el código.
 *     `flujoValidacionId` apunta al flujo de validación —identidad, buró,
 *     política interna— que debe aprobarse antes de originar. Hoy puede ser
 *     nulo; cuando entren esas validaciones no hay que tocar esta tabla.
 *
 * El identificador externo NO se guarda aquí a propósito: vive en
 * `integracion_vinculos`, igual que el de clientes, créditos y pagos. Así una
 * empresa puede tener el mismo producto en dos proveedores distintos, y migrar
 * de proveedor no toca el catálogo comercial.
 * ============================================================================
 */

/** Unidad en que se mide el periodo entre cuotas. */
export enum UnidadPlazo {
  DIAS = 'DIAS',
  MESES = 'MESES',
}

export enum EstadoProductoCredito {
  /** Capturado pero no vendible. Es donde nace y donde cae si falla la verificación. */
  BORRADOR = 'BORRADOR',
  /** Vendible. */
  ACTIVO = 'ACTIVO',
  /** Se deja de vender sin borrarlo: los créditos vivos siguen apuntando aquí. */
  SUSPENDIDO = 'SUSPENDIDO',
}

/** Dónde nació el producto. Importa para saber quién manda al reconciliar. */
export enum OrigenProductoCredito {
  ERP = 'ERP',
  EXTERNO = 'EXTERNO',
}

@Entity('productos_credito')
@Index('UX_producto_credito_codigo', ['empresaId', 'codigo'], { unique: true })
export class ProductoCredito {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'uuid' }) empresaId!: string;

  /**
   * Código corto y estable. Es el mismo en los dos sistemas —igual que se hizo
   * con las cuentas contables— para que la correspondencia sea evidente para
   * cualquiera que abra los dos catálogos sin consultar una tabla de traducción.
   */
  @Column({ type: 'varchar', length: 30 }) codigo!: string;

  @Column({ type: 'varchar', length: 120 }) nombre!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  descripcion!: string | null;

  // ── Plazo ────────────────────────────────────────────────────────────────

  /**
   * Cada cuánto vence una cuota, y en qué unidad. Un crédito a 30 días es
   * `DIAS`/30; una mensualidad es `MESES`/1.
   *
   * Se guardan las dos piezas en vez de un tipo cerrado porque es exactamente
   * la distinción que el adaptador se comió durante semanas: mandaba todo en
   * meses y los créditos a 30, 60 y 90 días vencían el mismo día allá mientras
   * todos los importes cuadraban.
   */
  @Column({ type: 'varchar', length: 10, default: UnidadPlazo.MESES })
  unidadPlazo!: UnidadPlazo;

  @Column({ type: 'int', default: 1 }) cadaCuantos!: number;

  @Column({ type: 'int', default: 1 }) cuotasMinimas!: number;
  @Column({ type: 'int', default: 1 }) cuotasMaximas!: number;

  // ── Precio ───────────────────────────────────────────────────────────────

  @Column({ default: true }) sinInteres!: boolean;

  @Column({
    type: 'decimal',
    transformer: decimalNumberTransformer,
    precision: 8,
    scale: 4,
    default: 0,
  })
  tasaInteresMensual!: number;

  /**
   * Si el vendedor puede mover la tasa al capturar. Apagado por omisión: una
   * tasa editable en el punto de venta es una tasa que nadie autorizó.
   */
  @Column({ default: false }) tasaEditable!: boolean;

  @Column({
    type: 'decimal',
    transformer: decimalNumberTransformer,
    precision: 18,
    scale: 4,
    default: 0,
  })
  montoMinimo!: number;

  /** Cero significa «sin tope»; el tope real lo pone la línea del cliente. */
  @Column({
    type: 'decimal',
    transformer: decimalNumberTransformer,
    precision: 18,
    scale: 4,
    default: 0,
  })
  montoMaximo!: number;

  @Column({ type: 'varchar', length: 10, default: 'MXN' }) moneda!: string;

  // ── Ciclo de vida ────────────────────────────────────────────────────────

  @Column({ type: 'varchar', length: 20, default: EstadoProductoCredito.BORRADOR })
  estado!: EstadoProductoCredito;

  @Column({ type: 'varchar', length: 10, default: OrigenProductoCredito.ERP })
  origen!: OrigenProductoCredito;

  @Column({ type: 'int', default: 100 }) orden!: number;

  // ── Correspondencia con el registro externo ──────────────────────────────

  /**
   * Cuándo se comprobó por última vez que el externo produce la MISMA tabla de
   * amortización que el ERP. Nulo = nunca. Con la integración encendida, nulo
   * impide activar el producto.
   */
  @Column({ type: 'timestamptz', nullable: true })
  verificadoEn!: Date | null;

  /**
   * Resumen de la última verificación: qué se mandó y en qué difirió. Se guarda
   * el detalle porque «no cuadró» sin decir en qué cuota es un callejón sin
   * salida para quien lo tiene que arreglar.
   */
  @Column({ type: 'jsonb', nullable: true })
  resultadoVerificacion!: Record<string, unknown> | null;

  // ── Requisitos previos ───────────────────────────────────────────────────

  /**
   * Flujo de validación que hay que aprobar antes de originar con este
   * producto: identidad, buró, círculo, política interna. Nulo = sólo aplica la
   * política de crédito general de la empresa.
   */
  @Column({ type: 'uuid', nullable: true })
  flujoValidacionId!: string | null;

  /**
   * Puente con el `enum` anterior mientras existan créditos emitidos que lo
   * usan. Los productos nuevos no lo llevan; se retira cuando la columna
   * `tipocredito` de `creditos_clientes` deje de leerse.
   */
  @Column({ type: 'varchar', length: 30, nullable: true })
  tipoCreditoHeredado!: string | null;

  @CreateDateColumn() fechaCreacion!: Date;
  @UpdateDateColumn() fechaActualizacion!: Date;
}
