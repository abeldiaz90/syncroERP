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
 * Política de vencimientos de cada empresa
 * ----------------------------------------------------------------------------
 * Qué hace el ERP cuando una cuota cae en día inhábil.
 *
 * Vive AQUÍ, en el ERP, y no en Fineract, por una razón concreta: hay empresas
 * que no usan Fineract, otras que sí y otras que usan los dos. Si la regla
 * viviera del lado del proveedor externo, la fecha que el cliente firma
 * dependería de qué infraestructura contrató su proveedor —dos empresas con el
 * mismo producto comercial darían tablas de amortización distintas—, y las
 * empresas sin Fineract no tendrían la regla en absoluto.
 *
 * La consecuencia operativa es que Fineract NO debe recorrer vencimientos por
 * su cuenta: `verificarConfiguracion` lo comprueba y lo marca como error.
 * ============================================================================
 */
@Entity('politicas_vencimiento_empresa')
@Index('UQ_politica_vencimiento_empresa', ['empresaId'], { unique: true })
export class PoliticaVencimientoEmpresa {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  empresaId!: string;

  /**
   * Apagado por omisión: una empresa que ya opera no debe ver cambiar las
   * fechas de sus créditos porque alguien creó esta tabla.
   */
  @Column({ type: 'boolean', default: false })
  recorrerADiaHabil!: boolean;

  /** En el comercio mexicano el sábado suele ser día de operación. */
  @Column({ type: 'boolean', default: true })
  sabadoHabil!: boolean;

  @Column({ type: 'boolean', default: false })
  domingoHabil!: boolean;

  /**
   * SIGUIENTE mueve la cuota al siguiente día hábil (lo que espera el cliente);
   * ANTERIOR la adelanta. El plazo autorizado de la línea se valida SIEMPRE
   * contra la fecha sin ajustar, para que recorrer un sábado no se convierta en
   * una extensión de crédito que nadie autorizó.
   */
  @Column({ type: 'varchar', length: 12, default: 'SIGUIENTE' })
  direccion!: 'SIGUIENTE' | 'ANTERIOR';

  @CreateDateColumn()
  fechaCreacion!: Date;

  @UpdateDateColumn()
  fechaActualizacion!: Date;
}
