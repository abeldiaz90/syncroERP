import { 
  Entity, PrimaryGeneratedColumn, Column, 
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn 
} from 'typeorm';
import { Controlador } from './controlador.entity';

@Entity('endpoints')
export class Endpoint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'controlador_id', type: 'uuid' })
  controladorId: string;

  @Column({ length: 10 })
  metodo: string;

  @Column({ length: 500 })
  ruta: string;

  @Column({ length: 200 })
  nombre: string;

  @Column({ length: 500, nullable: true })
  descripcion: string;

  @Column({ default: true })
  activo: boolean;

  // ─── NUEVOS CAMPOS PARA MENÚ DINÁMICO ───────────────────────────

  /**
   * Ruta de Next.js donde navega este endpoint.
   * Ej: /dashboard/marcas, /dashboard/compras/requisiciones
   * null = no es navegable directamente (es una acción, no una página)
   */
  @Column({ name: 'ruta_frontend', length: 500, nullable: true })
  rutaFrontend: string | null;

  /**
   * Si es true, aparece en el menú lateral cuando el rol tiene permiso GET.
   * Los endpoints de acción (POST, PATCH, DELETE) típicamente son false.
   */
  @Column({ name: 'es_navegable', default: false })
  esNavegable: boolean;

  /**
   * Orden de aparición dentro del módulo en el menú.
   */
  @Column({ name: 'orden_menu', default: 0 })
  ordenMenu: number;

  // ────────────────────────────────────────────────────────────────

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Controlador, c => c.endpoints)
  @JoinColumn({ name: 'controlador_id' })
  controlador: Controlador;
}