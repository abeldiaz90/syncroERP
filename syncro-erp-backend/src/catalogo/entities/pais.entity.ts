import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('paises')
@Index('UX_paises_codigoIso2', ['codigoIso2'], {
  unique: true,
  where: 'codigoIso2 IS NOT NULL',
})
export class Pais {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  nombre: string;

  @Column({ type: 'varchar', length: 5 })
  codigo: string;

  @Column({ type: 'varchar', length: 2, nullable: true })
  codigoIso2?: string | null;

  @Column({ type: 'varchar', length: 3, nullable: true })
  codigoIso3?: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  lada?: string | null;

  @Column({ type: 'varchar', length: 3, nullable: true })
  moneda?: string | null;

  @Column({ default: false })
  esOficial: boolean;

  @Column({ default: true })
  activo: boolean;
}
