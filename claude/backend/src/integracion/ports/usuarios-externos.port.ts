import { ErrorIntegracionExterna } from './cartera-externa.port';

/**
 * Puerto de usuarios y roles del registro externo.
 *
 * Existe porque Fineract corre con `AUTO_CREATE_USER=false`: un token de
 * Keycloak válido no basta, la persona tiene que existir también allá. Sin esto
 * la "coherencia de identidad" se queda en teoría — el ERP reenvía el token, el
 * otro lado no reconoce a nadie y todo cae a la cuenta de servicio.
 */

export interface RolExterno {
  id: string;
  nombre: string;
  descripcion?: string | null;
  /**
   * Nació aquí, como rol espejo, y por tanto **sin un solo permiso**.
   *
   * Importa decirlo en voz alta: mapear un rol del ERP contra uno de éstos
   * parece una decisión inofensiva y no lo es. Un operador al que se le asigna
   * un rol vacío queda sin autoridad en el core aunque en la pantalla todo se
   * vea correspondido. Pasó: una corrección de roles dejó a un administrador
   * con «User has no authority to READ roles».
   */
  creadoDesdeErp?: boolean;
}

export interface UsuarioExterno {
  id: string;
  usuario: string;
  email?: string | null;
  roles: RolExterno[];
  oficinaIdExterna?: string | null;
}

export interface AltaUsuarioExterno {
  /** Debe coincidir con el `preferred_username` del token de Keycloak. */
  usuario: string;
  email: string;
  nombre: string;
  apellido: string;
  oficinaIdExterna: string;
  rolesExternos: string[];
}

export interface PuertoUsuariosExternos {
  readonly proveedor: string;

  /** Catálogo de roles del otro lado, para poder mapear contra los del ERP. */
  rolesDisponibles(): Promise<RolExterno[]>;

  /**
   * Crea un rol en el registro externo, SIN permisos.
   *
   * Y sin permisos es deliberado. El ERP sabe qué rol de los suyos equivale a
   * cuál de allá —eso es la correspondencia— pero no sabe, ni puede saber, qué
   * permisos bancarios necesita un «Almacenista» dentro del core. Adivinarlos
   * sería peor que dejarlo explícito: un permiso de más en un core bancario no
   * se nota hasta que alguien lo usa.
   *
   * Es el mismo criterio por el que aquí no se aprovisionan operadores solos.
   * El ERP propone la correspondencia; los permisos los decide quien conoce el
   * core.
   */
  crearRol(datos: { nombre: string; descripcion?: string }): Promise<string>;

  /** Usuario por nombre de usuario. Null si no existe. */
  buscarUsuario(usuario: string): Promise<UsuarioExterno | null>;

  /** Da de alta al usuario. Devuelve su id externo. */
  crearUsuario(datos: AltaUsuarioExterno): Promise<string>;

  /** Reemplaza los roles del usuario. */
  asignarRoles(idExterno: string, rolesExternos: string[]): Promise<void>;

  /**
   * Nombre de usuario con el que el registro externo identifica a la cuenta de
   * servicio del ERP. Null si no aplica al proveedor.
   */
  usuarioDeServicio(): Promise<string | null>;
}

export class UsuariosExternosNoConfigurado implements PuertoUsuariosExternos {
  readonly proveedor = 'ninguno';
  private negar(): never {
    throw new ErrorIntegracionExterna(
      'No hay un registro externo de usuarios configurado.',
      false,
    );
  }
  async rolesDisponibles(): Promise<RolExterno[]> {
    return [];
  }
  async buscarUsuario(): Promise<UsuarioExterno | null> {
    return null;
  }
  async crearRol(): Promise<string> {
    this.negar();
  }
  async crearUsuario(): Promise<string> {
    this.negar();
  }
  async asignarRoles(): Promise<void> {
    this.negar();
  }
  async usuarioDeServicio(): Promise<string | null> {
    return null;
  }
}
