import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Correspondencia entre un rol del ERP y los roles del registro externo.
 *
 * Es de muchos a uno a propósito: un rol del ERP puede necesitar varios roles
 * del otro lado para poder operar. Al revés no —dos roles del ERP apuntando al
 * mismo rol externo es válido y frecuente.
 *
 * Sin mapeo, el usuario se da de alta sin roles: puede entrar y no puede hacer
 * nada. Es lo correcto. Otorgar permisos por omisión en un core bancario es
 * exactamente el error que nadie quiere firmar.
 */
@Entity('integracion_mapeo_roles')
@Index('UX_integracion_mapeo_rol', ['empresaId', 'rolErp'], { unique: true })
export class MapeoRolExterno {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'uuid' }) empresaId!: string;

  /** Rol del ERP, ya normalizado (mayúsculas, sin acentos). */
  @Column({ type: 'varchar', length: 60 }) rolErp!: string;

  /** Ids de los roles del proveedor. Opacos para el ERP. */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  rolesExternos!: string[];

  /** Nombres, sólo para que un humano reconozca lo que mapeó. */
  @Column({ type: 'varchar', length: 300, nullable: true })
  descripcionExterna!: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  proveedor!: string | null;

  @Column({ default: true }) activo!: boolean;

  @CreateDateColumn() fechaCreacion!: Date;
  @UpdateDateColumn() fechaActualizacion!: Date;
}
