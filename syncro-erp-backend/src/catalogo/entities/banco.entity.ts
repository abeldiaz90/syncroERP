import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('bancos')
@Index('UX_bancos_clave_oficial', ['clave'], {
  unique: true,
  where: 'clave IS NOT NULL',
})
export class Banco {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  nombre!: string;

  /** Clave de institución publicada en el catálogo de bancos del Anexo 24. */
  @Column({ type: 'varchar', length: 3, nullable: true })
  clave!: string | null;

  @Column({ default: true })
  activo!: boolean;

  /** Los registros oficiales se restauran al iniciar y no se editan a mano. */
  @Column({ default: false })
  esOficial!: boolean;

  @Column({ type: 'varchar', length: 80, nullable: true })
  versionCatalogo!: string | null;
}
