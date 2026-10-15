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
 * De dónde salen los datos bancarios de esta empresa
 * ----------------------------------------------------------------------------
 * Hasta hoy la respuesta era una sola para toda la instalación: de la base que
 * SUMA aprovisiona. El inquilino se creaba por adelantado —ver
 * `TenantReserva`— y el alta entregaba uno ya construido.
 *
 * Hay clientes que no aceptan eso. Una SOFOM o una caja popular con su propio
 * reglamento de datos quiere su base en su sala, bajo su respaldo y su
 * auditoría, y está dispuesta a pagar distinto por ello. Eso es lo que esta
 * tabla representa: **quién pone la base del core**, por empresa.
 *
 * El ERP NO cambia. Sigue siendo multiempresa dentro de la suite de SUMA, con
 * una sola base y los inquilinos separados por `empresaId`. Lo que se mueve es
 * de dónde lee y escribe FINERACT para esa empresa, que es justo lo que
 * Fineract sabe hacer de nacimiento: cada inquilino lleva su propia conexión
 * en `tenant_server_connections`.
 *
 * ── Por qué es una tabla aparte y aditiva ─────────────────────────────────
 * Una empresa SIN fila aquí es una empresa de la nube de SUMA, exactamente
 * como todas las de hoy. Nada en el camino de siempre pregunta por esta tabla
 * para funcionar. Es la misma regla con la que nació `empresa_identidad`: lo
 * nuevo se añade, no se interpone.
 *
 * ── Por qué el estado tiene cuatro escalones y no un booleano ─────────────
 * Porque entre «el operador tecleó una conexión» y «el core está leyendo de
 * ahí» hay cosas que pueden fallar y que no son la misma:
 *
 *   CAPTURADO            La conexión está guardada. Nadie la ha probado.
 *   VERIFICADO           Se abrió de verdad contra esa base y contestó.
 *   ESPERANDO_REINICIO   El inquilino quedó anotado en el registro del core.
 *                        Fineract sólo construye el esquema de un inquilino al
 *                        arrancar, así que hasta el siguiente reinicio
 *                        programado ese inquilino existe en la tabla y no
 *                        atiende. No es un error: es el calendario.
 *   ACTIVO               El core contestó como ese inquilino. Ahora sí.
 *   FALLIDO              Con su motivo escrito, que es lo que se le enseña al
 *                        operador en vez de «no se pudo».
 *
 * Un inquilino on-premise NO puede ser instantáneo, y eso hay que decirlo al
 * vender y no descubrirlo con el cliente enfrente.
 *
 * ── El secreto ────────────────────────────────────────────────────────────
 * La clave de la base del cliente se guarda cifrada con `SecretosService`
 * —mismo sobre `v1:iv:etiqueta:cifrado` que los secretos de identidad— y no
 * sale por ninguna API, ni siquiera cifrada. Lo único que se puede saber desde
 * fuera es si hay una guardada.
 * ============================================================================
 */

export enum OrigenCore {
  /** La base la aprovisiona SUMA. Es lo de siempre y el valor por omisión. */
  SUMA = 'SUMA',
  /** La base la pone el cliente en sus instalaciones. */
  CLIENTE = 'CLIENTE',
}

export enum EstadoOrigenCore {
  /**
   * Se decidió en el alta que la base la pone el cliente, y todavía no hay
   * ninguna conexión capturada. Es un estado y no un hueco: la empresa existe,
   * no consume reserva, y lo que falta tiene nombre.
   */
  DECLARADO = 'DECLARADO',
  CAPTURADO = 'CAPTURADO',
  VERIFICADO = 'VERIFICADO',
  ESPERANDO_REINICIO = 'ESPERANDO_REINICIO',
  ACTIVO = 'ACTIVO',
  FALLIDO = 'FALLIDO',
}

@Entity('integracion_origen_core')
@Index('UX_origen_core_empresa', ['empresaId'], { unique: true })
export class OrigenCoreEmpresa {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'uuid' }) empresaId!: string;

  @Column({ type: 'varchar', length: 20, default: OrigenCore.SUMA })
  origen!: OrigenCore;

  /**
   * El identificador con el que el core conocerá al inquilino.
   *
   * Cuando lo pone SUMA sale de la reserva (`t001`, `t002`…). Cuando lo pone el
   * cliente lo escribe el operador, y se guarda en minúsculas y sin espacios
   * porque el core compara en crudo: «Caja Norte» y «caja-norte» serían dos
   * inquilinos distintos y sólo uno existiría.
   */
  @Column({ type: 'varchar', length: 60, nullable: true })
  inquilino!: string | null;

  /* ── La conexión, cuando la pone el cliente ─────────────────────────── */

  @Column({ type: 'varchar', length: 200, nullable: true })
  servidor!: string | null;

  @Column({ type: 'int', nullable: true })
  puerto!: number | null;

  /** El nombre de la base de datos del inquilino dentro de ese servidor. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  baseDatos!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  usuario!: string | null;

  /**
   * Cifrado. La columna es de texto porque lo que lleva es el sobre, no la
   * clave. Ver `SecretosService`.
   */
  @Column({ type: 'text', nullable: true })
  secretoCifrado!: string | null;

  /**
   * Parámetros extra de la conexión, tal como el core los guarda en
   * `schema_connection_parameters`. Se deja pasar porque un cliente con TLS
   * obligatorio los necesita y el core ya sabe leerlos.
   */
  @Column({ type: 'varchar', length: 500, nullable: true })
  parametros!: string | null;

  /* ── Dónde va el camino ─────────────────────────────────────────────── */

  @Column({ type: 'varchar', length: 30, default: EstadoOrigenCore.DECLARADO })
  estado!: EstadoOrigenCore;

  @Column({ type: 'timestamptz', nullable: true })
  verificadoEn!: Date | null;

  /**
   * Qué falló la última vez, en palabras que un operador pueda usar.
   *
   * Nunca lleva la clave ni la cadena de conexión completa: un mensaje de error
   * acaba en una captura de pantalla pegada en un chat.
   */
  @Column({ type: 'varchar', length: 500, nullable: true })
  ultimoError!: string | null;

  /** Quién lo pidió del lado de SUMA. La credencial de servicio dice qué
   *  sistema llamó, no quién lo autorizó. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  registradoPor!: string | null;

  @CreateDateColumn() fechaCreacion!: Date;
  @UpdateDateColumn() fechaActualizacion!: Date;
}
