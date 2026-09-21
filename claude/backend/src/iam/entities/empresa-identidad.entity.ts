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
 * La identidad de cada empresa, como dato
 * ----------------------------------------------------------------------------
 * Hoy el ERP sabe de identidad por variables de entorno: `KEYCLOAK_ISSUER_URL`,
 * `KEYCLOAK_CLIENT_ID`, `DIRECTORIO_CLIENT_ID`… Una de cada cosa, porque hay un
 * despliegue. Eso deja de valer en cuanto cada empresa cliente tiene su propio
 * realm: entonces hay un emisor, unos clientes y unos secretos POR EMPRESA, y
 * eso son datos —tantos como clientes haya— no configuración.
 *
 * Esta tabla es ese dato. Y es la condición de todo lo demás: mientras la
 * identidad viva en `.env`, automatizar el alta produce realms que el sistema
 * no sabe usar sin que alguien edite un archivo y reinicie.
 *
 * QUÉ NO CAMBIA, y conviene subrayarlo: la empresa de una sesión sigue saliendo
 * de la fila del usuario en el ERP, nunca del token. Esta tabla dice «los tokens
 * de este emisor pertenecen a esta empresa», que es lo contrario de dejar que el
 * token elija empresa. Sirve para dos cosas:
 *
 *   1. Saber de QUIÉN aceptar tokens. Un emisor que no esté aquí se rechaza sin
 *      tocar la red: sin esto, cualquiera que levante un Keycloak podría firmar
 *      tokens con el `sub` y el correo que quiera.
 *   2. Saber con qué credenciales hablarle al directorio y al core **de esa**
 *      empresa.
 *
 * Los secretos se guardan cifrados (ver `SecretosService`). La columna es de
 * texto porque lo que lleva es el sobre `v1:iv:etiqueta:cifrado`, no el secreto.
 *
 * Mientras una empresa no tenga fila aquí, el ERP usa las variables de entorno
 * de siempre. Eso es deliberado: la tabla es aditiva y una instalación de una
 * sola empresa —como hoy— funciona exactamente igual sin tocar nada.
 * ============================================================================
 */
@Entity('empresa_identidad')
@Index(['empresaId'], { unique: true })
@Index(['emisor'], { unique: true })
export class EmpresaIdentidad {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  empresaId!: string;

  /**
   * El emisor del realm, sin barra final: `https://host/realms/<realm>`.
   *
   * Único en toda la tabla a propósito. Dos empresas con el mismo emisor
   * significaría que los tokens de una valen para la otra, que es exactamente el
   * agujero que esta tabla existe para cerrar.
   */
  @Column({ type: 'varchar', length: 300 })
  emisor!: string;

  /** El nombre del realm, para las llamadas de administración. */
  @Column({ type: 'varchar', length: 100 })
  realm!: string;

  /** El cliente con el que el navegador inicia sesión. */
  @Column({ type: 'varchar', length: 100 })
  clientIdPublico!: string;

  /** Cliente de servicio del ERP contra el core. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  clientIdServicio!: string | null;

  @Column({ type: 'text', nullable: true })
  secretoServicio!: string | null;

  /** Cliente con el que el ERP crea identidades de esta empresa. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  clientIdProvisionador!: string | null;

  @Column({ type: 'text', nullable: true })
  secretoProvisionador!: string | null;

  /**
   * A quién se le puede crear identidad en este realm. Separado por comas.
   * Vacío = sin candado, y la pantalla lo reporta en vez de callarlo.
   */
  @Column({ type: 'varchar', length: 300, nullable: true })
  dominiosPermitidos!: string | null;

  /**
   * `APROVISIONANDO` mientras la consola está armando el realm; `ACTIVA` cuando
   * está completo. Un emisor en `APROVISIONANDO` **no** se acepta todavía: a
   * medio armar, un realm puede no tener aún la política de contraseñas ni el
   * segundo factor.
   */
  @Column({ type: 'varchar', length: 20, default: 'APROVISIONANDO' })
  estado!: 'APROVISIONANDO' | 'ACTIVA' | 'SUSPENDIDA';

  /** Quién lo aprovisionó, para la bitácora. */
  @Column({ type: 'varchar', length: 150, nullable: true })
  aprovisionadoPor!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  fechaCreacion!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  fechaActualizacion!: Date;
}
