import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { ErrorIntegracionExterna } from '../../ports/cartera-externa.port';
import {
  AltaUsuarioExterno,
  PuertoUsuariosExternos,
  RolExterno,
  UsuarioExterno,
} from '../../ports/usuarios-externos.port';
import { FineractConfig } from './fineract.config';
import { FineractAuthService } from './fineract-auth.service';
import { ErrorFineract, FineractHttpService } from './fineract-http.service';

/**
 * Usuarios y roles de Fineract.
 *
 * Sobre la contraseña: Fineract exige una al crear un usuario aunque el
 * despliegue autentique por OIDC. Se genera aleatoria, no se devuelve, no se
 * registra en bitácora y nadie la usa nunca — la sesión se resuelve contra
 * Keycloak. Es un requisito del esquema de Fineract, no una credencial en uso.
 * Si algún día se habilitara la autenticación básica, esa contraseña seguiría
 * siendo desconocida para todos, que es justo lo que se quiere.
 */
@Injectable()
export class FineractUsuariosAdapter implements PuertoUsuariosExternos {
  readonly proveedor = 'fineract';
  private readonly logger = new Logger(FineractUsuariosAdapter.name);

  constructor(
    private readonly http: FineractHttpService,
    private readonly cfg: FineractConfig,
    private readonly auth: FineractAuthService,
  ) {}

  /**
   * Estas operaciones viajan con el token de la persona que las dispara, no con
   * el de la cuenta de servicio. Dos razones: el alta de operadores queda
   * auditada a nombre de quien la hizo, y —la práctica— permite dar de alta la
   * propia cuenta de servicio en un core recién montado, cuando esa cuenta
   * todavía no existe y por tanto no puede autenticarse.
   */
  private readonly comoUsuario = { comoUsuario: true } as const;

  /** Usuario que Fineract buscará para la cuenta de servicio del ERP. */
  usuarioDeServicio(): Promise<string | null> {
    return this.auth.usuarioDeServicio();
  }

  async rolesDisponibles(): Promise<RolExterno[]> {
    try {
      const roles = await this.http.get<
        { id: number; name: string; description?: string }[]
      >('/v1/roles', this.comoUsuario);
      return (roles ?? []).map((r) => ({
        id: String(r.id),
        nombre: r.name,
        descripcion: r.description ?? null,
        /*
         * Se reconoce por la descripción que les deja `crearRolesEspejo`:
         * «… · Espejo del rol X de SyncroERP. Sin permisos: asignalos aqui.».
         * La marca va al final, no al principio, porque delante se copia la
         * descripción del rol del ERP — por eso no sirve `startsWith`.
         *
         * Preguntar por los permisos reales de cada rol costaría una llamada
         * por rol y cientos de filas cada vez que alguien abre la pantalla.
         */
        creadoDesdeErp: /Espejo del rol .+ de SyncroERP|Creado desde SyncroERP/i.test(
          String(r.description ?? ''),
        ),
      }));
    } catch (error) {
      throw this.traducir(error);
    }
  }

  /**
   * Crea el rol en Fineract. Sin permisos: ver el porqué en el puerto.
   *
   * Fineract acepta un rol sin permisos y lo deja inerte, que es exactamente
   * lo que se quiere: existe, se puede mapear contra un rol del ERP, y no
   * habilita nada hasta que alguien decida qué habilita.
   */
  async crearRol(datos: { nombre: string; descripcion?: string }): Promise<string> {
    try {
      const respuesta = await this.http.post<{ resourceId: number }>(
        '/v1/roles',
        {
          name: datos.nombre,
          description:
            datos.descripcion ??
            'Creado desde SyncroERP para la correspondencia de roles. Sin permisos: asignalos aqui.',
        },
        this.comoUsuario,
      );
      return String(respuesta.resourceId);
    } catch (error) {
      throw this.traducir(error);
    }
  }

  async buscarUsuario(usuario: string): Promise<UsuarioExterno | null> {
    try {
      // Fineract no expone búsqueda por nombre de usuario; se lista y se filtra.
      // El padrón de operadores de un core es de decenas, no de miles.
      const usuarios = await this.http.get<
        {
          id: number;
          username: string;
          email?: string;
          officeId?: number;
          selectedRoles?: { id: number; name: string }[];
        }[]
      >('/v1/users', this.comoUsuario);

      const objetivo = usuario.trim().toLowerCase();
      const encontrado = (usuarios ?? []).find(
        (u) => String(u.username ?? '').trim().toLowerCase() === objetivo,
      );
      if (!encontrado) return null;

      return {
        id: String(encontrado.id),
        usuario: encontrado.username,
        email: encontrado.email ?? null,
        oficinaIdExterna:
          encontrado.officeId !== undefined ? String(encontrado.officeId) : null,
        roles: (encontrado.selectedRoles ?? []).map((r) => ({
          id: String(r.id),
          nombre: r.name,
        })),
      };
    } catch (error) {
      throw this.traducir(error);
    }
  }

  async crearUsuario(datos: AltaUsuarioExterno): Promise<string> {
    if (datos.rolesExternos.length === 0) {
      throw new ErrorIntegracionExterna(
        `No hay roles mapeados para dar de alta a ${datos.usuario}. ` +
          'Un usuario sin roles no puede operar; mapea su rol antes de aprovisionarlo.',
        false,
      );
    }

    const clave = this.claveDescartable();

    try {
      const respuesta = await this.http.post<{ resourceId: number }>(
        '/v1/users',
        {
          username: datos.usuario,
          email: datos.email,
          firstname: datos.nombre.slice(0, 50),
          lastname: datos.apellido.slice(0, 50),
          officeId: Number(datos.oficinaIdExterna),
          roles: datos.rolesExternos.map((r) => Number(r)),
          sendPasswordToEmail: false,
          password: clave,
          repeatPassword: clave,
        },
        this.comoUsuario,
      );
      return String(respuesta.resourceId);
    } catch (error) {
      if (error instanceof ErrorFineract && error.estadoHttp === 403) {
        const existente = await this.buscarUsuario(datos.usuario);
        if (existente) return existente.id;
      }
      throw this.traducir(error);
    }
  }

  async asignarRoles(
    idExterno: string,
    rolesExternos: string[],
  ): Promise<void> {
    try {
      await this.http.put(
        `/v1/users/${idExterno}`,
        { roles: rolesExternos.map((r) => Number(r)) },
        this.comoUsuario,
      );
    } catch (error) {
      throw this.traducir(error);
    }
  }

  /**
   * Contraseña aleatoria que nadie conoce ni necesita. Cumple el requisito de
   * complejidad de Fineract sin convertirse en una credencial viva.
   */
  private claveDescartable(): string {
    return `Sx${randomBytes(24).toString('base64url')}#9`;
  }

  private traducir(error: unknown): ErrorIntegracionExterna {
    if (error instanceof ErrorIntegracionExterna) return error;
    if (error instanceof ErrorFineract) {
      return new ErrorIntegracionExterna(error.message, error.reintentable, {
        estadoHttp: error.estadoHttp,
      });
    }
    return new ErrorIntegracionExterna(
      error instanceof Error ? error.message : String(error),
      true,
    );
  }
}
