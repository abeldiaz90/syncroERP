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
