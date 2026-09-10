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
 * Aviso entrante del registro externo
 * ----------------------------------------------------------------------------
 * Hasta hoy la integración hablaba en un solo sentido: el ERP publicaba hechos
 * y el externo los aplicaba. Nada avisaba de vuelta. Si alguien cobraba una
 * cuota en el portal del core, el ERP no se enteraba nunca —ni ese día ni
 * después— y las dos carteras se separaban en silencio.
 *
 * Esta tabla es el buzón de entrada. Es el reflejo exacto de
 * `integracion_eventos`, que es el de salida, y existe por la misma razón:
 * recibir y actuar son dos cosas distintas. Fineract espera una respuesta
 * inmediata y no reintenta indefinidamente; si el ERP intentara aplicar el
 * hecho dentro de la misma llamada, cualquier lentitud del ERP se convertiría
 * en un aviso perdido. Aquí se guarda primero y se decide después.
 *
 * LO QUE ESTA TABLA NO HACE. No aplica pagos por su cuenta. Un pago en el ERP
 * mueve efectivo: exige una cuenta de caja o banco, un método, genera asiento
 * contable y puede timbrar un CFDI. Nada de eso viene en el aviso, y elegirlo
 * por omisión sería inventar un movimiento de dinero que ninguna persona
 * autorizó de este lado. El aviso queda PENDIENTE y aparece en la lista de
 * divergencias para que alguien lo resuelva con los datos que sólo él tiene.
 *
 * El cuerpo se guarda TAL CUAL llegó. Cuando algo no cuadre, la pregunta va a
 * ser «¿qué mandó exactamente el core?», y una versión ya interpretada por
 * nosotros no puede responderla.
 * ============================================================================
 */

export enum EstadoAviso {
  /** Recibido y sin resolver. Es donde nacen los que piden una decisión. */
  PENDIENTE = 'PENDIENTE',
  /** Se reflejó en el ERP, o se comprobó que el ERP ya lo tenía. */
  PROCESADO = 'PROCESADO',
  /** Conocido y sin efecto en el ERP: el eco de algo que el ERP mismo originó. */
  IGNORADO = 'IGNORADO',
  /** Se intentó reflejar y falló. Conserva el motivo. */
  FALLIDO = 'FALLIDO',
  /** Una persona decidió que no se aplica. Conserva quién y por qué. */
  DESCARTADO = 'DESCARTADO',
}

@Entity('integracion_avisos')
/*
 * Fineract reintenta la entrega, y un aviso entregado dos veces no puede
 * aplicarse dos veces. La huella es la llave: mismo tenant, misma entidad,
 * misma acción, mismo recurso y mismo cuerpo son el mismo hecho.
 */
@Index('UX_integracion_aviso_huella', ['huella'], { unique: true })
@Index('IX_integracion_aviso_pendientes', ['empresaId', 'estado', 'recibidoEn'])
export class AvisoIntegracion {
  @PrimaryGeneratedColumn('uuid') id!: string;

  /**
   * Empresa a la que corresponde, resuelta por el vínculo del recurso.
   *
   * Nula cuando no se pudo resolver: el aviso se guarda igual. Un aviso de un
   * recurso que el ERP no conoce es justamente el que interesa ver —significa
   * que alguien creó algo directamente en el core—, y descartarlo por no saber
   * de quién es sería tirar la única señal de que eso pasó.
   */
  @Column({ type: 'uuid', nullable: true }) empresaId!: string | null;

  @Column({ type: 'varchar', length: 40 }) proveedor!: string;

  /** `LOAN`, `CLIENT`, `SAVINGSACCOUNT`… tal como lo manda el core. */
  @Column({ type: 'varchar', length: 60 }) entidad!: string;

  /** `REPAYMENT`, `DISBURSE`, `APPROVE`… tal como lo manda el core. */
  @Column({ type: 'varchar', length: 60 }) accion!: string;

  /** Tenant del core. Un mismo ERP puede recibir de más de uno. */
  @Column({ type: 'varchar', length: 60, nullable: true })
  tenant!: string | null;

  /** Id del recurso en el core. Opaco: se guarda y se compara, no se interpreta. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  idExterno!: string | null;

  /** Entidad del ERP a la que apunta, cuando el vínculo existe. */
  @Column({ type: 'uuid', nullable: true }) entidadId!: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  tipoVinculo!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  cuerpo!: Record<string, unknown> | null;

  /** El cuerpo crudo cuando no era JSON. También interesa. */
  @Column({ type: 'text', nullable: true }) cuerpoTexto!: string | null;

  /** SHA-256 de tenant + entidad + acción + recurso + cuerpo. Ver el índice. */
  @Column({ type: 'varchar', length: 64 }) huella!: string;

  @Column({ type: 'varchar', length: 20, default: EstadoAviso.PENDIENTE })
  estado!: EstadoAviso;

  /**
   * Qué haría falta hacer, en una frase, para quien abra la lista.
   *
   * Se escribe al clasificar y no al mostrar: el que resuelve el aviso puede
   * abrirlo semanas después, cuando el estado del ERP ya cambió, y la nota
   * tiene que decir lo que se veía cuando llegó.
   */
  @Column({ type: 'varchar', length: 500, nullable: true })
  diagnostico!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  error!: string | null;

  @Column({ type: 'uuid', nullable: true }) resueltoPor!: string | null;

  @Column({ type: 'timestamptz', nullable: true }) resueltoEn!: Date | null;

  @Column({ type: 'timestamptz' }) recibidoEn!: Date;

  @CreateDateColumn() fechaCreacion!: Date;
  @UpdateDateColumn() fechaActualizacion!: Date;
}
