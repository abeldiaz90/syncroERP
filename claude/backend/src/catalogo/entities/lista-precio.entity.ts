import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
import { ProductoPrecio } from './producto-precio.entity';

/**
 * De dónde sale el precio de una lista.
 *
 *  · MANUAL — alguien teclea el precio de cada artículo. Es lo único que había.
 *  · MARGEN — el precio se calcula desde el costo de reposición del artículo,
 *    que a su vez se alimenta solo de cada recepción de compra.
 */
export enum ModoListaPrecio {
  MANUAL = 'MANUAL',
  MARGEN = 'MARGEN',
}

@Entity('listas_precio')
export class ListaPrecio {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  empresaId!: string;

  @Column({ type: 'varchar', length: 100 })
  nombre!: string;

  @Column({ default: false })
  esPorDefecto!: boolean;

  /**
   * ==========================================================================
   * El precio calculado desde el costo
   * --------------------------------------------------------------------------
   * Hasta aquí el precio de venta se tecleaba artículo por artículo y lista por
   * lista, y nadie lo volvía a tocar. El proveedor subía el costo, la compra
   * siguiente entraba más cara, y el precio de venta seguía siendo el de hace
   * dos años: se vendía por debajo del costo sin que ninguna pantalla lo dijera.
   *
   * Es el mismo problema que resuelven los ERPs grandes, y lo resuelven igual:
   *
   *  · SAP Business One mantiene una lista de sistema, «Last Purchase Price»,
   *    que él actualiza con cada recepción y que nadie puede editar a mano; las
   *    demás listas se declaran «basadas en» ella con un factor.
   *  · Dynamics 365 Business Central lo pone en la ficha del artículo como
   *    `Price/Profit Calculation`, con tres modos: `Price=Cost+Profit`,
   *    `Profit=Price-Cost` y `No Relationship`.
   *  · Odoo lo pone en la regla de la lista: «Based on: Cost», más descuento
   *    (negativo = margen), margen mínimo y redondeo.
   *
   * Aquí se toma la forma de Odoo —la regla vive en la lista, no en el
   * artículo— porque encaja con el diseño que ya tenía el ERP: el precio de
   * venta vive ÚNICAMENTE en las listas, `Producto` no tiene campo de precio.
   * El papel de la lista de sistema de SAP lo hace `producto.precioCompra`, que
   * desde la separación de funciones ya se actualiza solo en cada recepción con
   * el precio de la orden.
   *
   * Un precio tecleado a mano para un artículo concreto GANA sobre la fórmula,
   * igual que en SAP: la regla es el piso, no una camisa de fuerza.
   * ==========================================================================
   */
  @Column({ type: 'varchar', length: 10, default: ModoListaPrecio.MANUAL })
  modo!: ModoListaPrecio;

  /** Porcentaje sobre el costo de reposición. 35 significa costo × 1.35. */
  @Column({
    type: 'decimal',
    precision: 9,
    scale: 4,
    default: 0,
    transformer: decimalNumberTransformer,
  })
  margenPorcentaje!: number;

  /**
   * Múltiplo al que se redondea hacia arriba el precio calculado.
   * `0` = sin redondeo. `0.5` deja precios en .00 y .50; `1` en pesos enteros.
   * Existe porque un precio de $186.4732 no se le cobra a nadie.
   */
  @Column({
    type: 'decimal',
    precision: 9,
    scale: 4,
    default: 0,
    transformer: decimalNumberTransformer,
  })
  redondeo!: number;

  @OneToMany(() => ProductoPrecio, (pp) => pp.listaPrecio)
  preciosProducto: ProductoPrecio[];
}
