import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { OrdenCompra } from './orden-compra.entity';

@Entity('recepciones_compra')
@Index(['empresaId', 'ordenCompraId'])
/*
 * La misma red que tiene `PagoProveedor` desde que nació, y que aquí faltaba.
 *
 * `recibir()` comprueba la clave con un SELECT antes de insertar. Eso sirve
 * contra el reintento y NO contra el doble clic: dos peticiones simultáneas con
 * la misma clave hacen su SELECT a la vez, ninguna encuentra nada, y las dos
 * insertan. La mercancía entra dos veces al almacén, con sus dos asientos.
 * Entre la lectura y la escritura hay otra transacción, así que ningún `if`
 * puede cerrar esa ventana: sólo la base.
 *
 * Parcial porque las recepciones viejas se guardaron sin clave, y en Postgres
 * `NULL` no colisiona con nada.
 */
@Index(['empresaId', 'ordenCompraId', 'claveIdempotencia'], {
  unique: true,
  where: 'claveIdempotencia IS NOT NULL',
})
export class RecepcionCompra {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  empresaId!: string;

  @Column({ type: 'uuid' })
  ordenCompraId!: string;

  @ManyToOne(() => OrdenCompra, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'ordencompraid' })
  ordenCompra!: OrdenCompra;

  @Column({ type: 'uuid' })
  almacenId!: string;

  /** Fotografía inmutable de la remesa capturada. */
  @Column({ type: 'text' })
  detalleJson!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  claveIdempotencia?: string;

  @Column({ type: 'uuid', nullable: true })
  recibidoPorId?: string;

  @CreateDateColumn()
  fechaRecepcion!: Date;
}
