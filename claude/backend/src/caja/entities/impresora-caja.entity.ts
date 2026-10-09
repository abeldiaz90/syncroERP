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
 * La impresora de una caja
 * ----------------------------------------------------------------------------
 * POR QUÉ CUELGA DE LA CUENTA DE CAJA Y NO DE LA EMPRESA
 *
 * Una tienda con tres mostradores tiene tres impresoras, y el ticket tiene que
 * salir en la del mostrador donde se cobró, no en la de al lado. La caja ya se
 * identifica por su cuenta (`cuentaCajaId`, lo mismo que abre el turno), así
 * que es ahí donde cuelga el aparato.
 *
 * Y se deja una fila con `cuentaCajaId` nulo: la impresora de la empresa, para
 * el negocio de una sola caja, que es la mayoría. Quien tenga varias las
 * declara una por una; quien tenga una sola no configura nada dos veces.
 *
 * LOS MODOS
 *
 *   RED        · la impresora tiene IP y escucha en 9100. El servidor le
 *                escribe. No hay que instalar nada en la caja.
 *   NAVEGADOR  · la impresora cuelga por USB de la computadora del mostrador.
 *                El servidor no la alcanza; el punto de venta abre el ticket y
 *                lo manda con el diálogo de impresión, como hasta hoy.
 *   NINGUNA    · no se imprime. Existe a propósito: un mostrador que sólo
 *                factura por correo no tiene por qué ver avisos de impresora
 *                cada venta.
 *
 * El modo no se adivina. Una caja sin configurar se comporta como NAVEGADOR,
 * que es lo que había antes de todo esto: estrenar una función no puede
 * cambiarle el comportamiento a quien no la ha pedido.
 * ============================================================================
 */
export enum ModoImpresion {
  RED = 'RED',
  NAVEGADOR = 'NAVEGADOR',
  NINGUNA = 'NINGUNA',
}

/** Caracteres por renglón según el papel. */
export enum AnchoPapel {
  MM58 = 32,
  MM80 = 48,
}

/*
 * La unicidad no se declara aquí porque hace falta que sea PARCIAL: en SQL,
 * NULL no es igual a NULL, así que un índice único corriente dejaría a una
 * empresa con varias impresoras «por omisión» y ninguna forma de saber cuál
 * manda. Los dos índices parciales que lo resuelven están en la migración
 * `ElTicketSaleEnPapel`.
 */
@Entity('caja_impresoras')
@Index('IX_caja_impresoras_empresa', ['empresaId', 'cuentaCajaId'])
export class ImpresoraCaja {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  empresaId!: string;

  /** Nulo = la impresora por omisión de la empresa. */
  @Column({ type: 'uuid', nullable: true })
  cuentaCajaId!: string | null;

  @Column({ type: 'varchar', length: 100, default: 'Impresora de tickets' })
  nombre!: string;

  @Column({ type: 'varchar', length: 20, default: ModoImpresion.NAVEGADOR })
  modo!: ModoImpresion;

  /** IP o nombre del equipo. Sólo para el modo RED. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  host!: string | null;

  @Column({ type: 'int', default: 9100 })
  puerto!: number;

  @Column({ type: 'int', default: AnchoPapel.MM80 })
  ancho!: number;

  /**
   * Abrir el cajón de dinero al cobrar en efectivo.
   *
   * Sólo con efectivo, y es a propósito: un cajón que se abre con cada tarjeta
   * acaba quedándose abierto, y un cajón abierto es un cajón al que cualquiera
   * mete la mano.
   */
  @Column({ type: 'boolean', default: true })
  abrirCajon!: boolean;

  /** Lo que va al pie del papel: agradecimiento, horario, política de cambios. */
  @Column({ type: 'varchar', length: 300, nullable: true })
  pie!: string | null;

  /** Cuántas copias del mismo ticket. La segunda ya sale marcada. */
  @Column({ type: 'int', default: 1 })
  copias!: number;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  /**
   * Lo último que pasó al imprimir, para que el administrador no tenga que
   * adivinar si la caja está imprimiendo. Un número de errores sin fecha ni
   * motivo no se puede arreglar.
   */
  @Column({ type: 'timestamptz', nullable: true })
  ultimoIntento!: Date | null;

  @Column({ type: 'boolean', nullable: true })
  ultimoExito!: boolean | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  ultimoMotivo!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  fechaCreacion!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  fechaActualizacion!: Date;
}
