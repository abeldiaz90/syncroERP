import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ModoCartera, ModoContabilidad } from '../integracion.constants';

/**
 * Perfil de integración de cada empresa.
 *
 * No todas las empresas del ERP contratan el registro externo. Las que no,
 * quedan en APAGADO en ambos ejes y no existe fila —o existe con todo apagado—
 * y operan exactamente como siempre. Sin esto, encender la integración sería un
 * interruptor global que afecta a todos los inquilinos a la vez.
 *
 * Los dos ejes son independientes a propósito: una empresa puede llevar su
 * cartera en el externo sin espejar la contabilidad, y también al revés.
 *
 * `productos` es un mapa libre porque su contenido pertenece al proveedor, no
 * al ERP: el adaptador de Fineract guarda ahí sus ids de producto de préstamo,
 * y otro adaptador guardaría otra cosa. El núcleo no lo interpreta.
 */
@Entity('integracion_configuracion_empresa')
@Index('UX_integracion_config_empresa', ['empresaId'], { unique: true })
export class ConfiguracionIntegracionEmpresa {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'uuid' }) empresaId!: string;

  /** Autoridad del externo sobre el crédito y la cartera. */
  @Column({ type: 'varchar', length: 20, default: ModoCartera.APAGADO })
  modo!: ModoCartera;

  /** Si las pólizas del ERP se replican al mayor externo. */
  @Column({ type: 'varchar', length: 20, default: ModoContabilidad.APAGADO })
  modoContabilidad!: ModoContabilidad;

  /**
   * Oficina del externo a la que se cargan los asientos espejo. Se guarda
   * aparte de `parametrosProveedor` porque el despachador la necesita en cada
   * asiento y no debe depender de un JSON sin forma.
   */
  @Column({ type: 'varchar', length: 40, nullable: true })
  oficinaContableExterna!: string | null;

  /** Parámetros propios del proveedor. Opacos para el núcleo. */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  parametrosProveedor!: Record<string, unknown>;

  /**
   * Tolerancia en pesos por debajo de la cual una diferencia entre el ERP y el
   * registro externo no se considera discrepancia. El redondeo de cuotas
   * produce centavos de diferencia legítimos.
   */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 1 })
  toleranciaConciliacion!: string;

  @CreateDateColumn() fechaCreacion!: Date;
  @UpdateDateColumn() fechaActualizacion!: Date;
}
