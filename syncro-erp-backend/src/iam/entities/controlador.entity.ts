import { 
  Entity, PrimaryGeneratedColumn, Column, 
  CreateDateColumn, UpdateDateColumn, OneToMany 
} from 'typeorm';
import { Endpoint } from './endpoint.entity';

@Entity('controladores')
export class Controlador {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100, unique: true })
  nombre: string;

  @Column({ length: 100 })
  titulo: string;

  @Column({ length: 50, nullable: true })
  categoria: string;

  @Column({ default: 0 })
  orden: number;

  @Column({ default: true })
  activo: boolean;

  // ─── NUEVOS CAMPOS PARA MENÚ DINÁMICO ───────────────────────────

  /**
   * Nombre del ícono de Lucide React a usar en el menú.
   * Ej: 'Package', 'ShoppingCart', 'Users', 'Settings'
   * El frontend lo resuelve dinámicamente con iconMap[icono]
   */
  @Column({ length: 50, nullable: true, default: 'Folder' })
  icono: string;

  /**
   * Sección del sidebar donde aparece este módulo.
   * Ej: 'Operaciones', 'Catálogos Core', 'Sistema', 'General'
   */
  @Column({ length: 100, nullable: true, default: 'General' })
  seccion: string;

  // ────────────────────────────────────────────────────────────────

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => Endpoint, endpoint => endpoint.controlador)
  endpoints: Endpoint[];
}