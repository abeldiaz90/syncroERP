import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

/**
 * ============================================================================
 * El tercer sistema: ¿esta persona existe en el directorio?
 * ----------------------------------------------------------------------------
 * El ERP sabía dos de tres cosas. Sabía quién está dado de alta en el ERP
 * (su tabla) y podía preguntar quién está dado de alta en el core (el puerto de
 * usuarios externos). De Keycloak no sabía nada: solo verificaba tokens, que es
 * saber quién ENTRÓ, no quién EXISTE.
 *
 * La diferencia se nota el día del alta. Alguien crea un usuario en el ERP, le
 * asigna su rol, le manda el correo, y la persona no puede entrar — porque
 * nadie la creó en SUMA. El ERP no tenía manera de decirlo antes de tiempo, y
 * el síntoma aparece del lado de la persona, que es el peor sitio.
 *
 * ----------------------------------------------------------------------------
 * LEE y, cuando se le configura para eso, DA DE ALTA.
 *
 * El alta se agregó por una razón práctica que zanja el debate arquitectónico:
 * la mayoría de las empresas van a usar **solo el ERP**, y en su despliegue el
 * portal de Fineract no existe. Si la única forma de crear una identidad fuera
 * el portal —que sí sabe hacerlo— o la consola de SUMA —que la operamos
 * nosotros, no el cliente—, entonces dar de alta a un empleado exigiría abrir
 * un ticket. Eso no escala y convierte cada alta en una espera.
 *
 * Lo que sí se conserva del principio «quien opera no aprovisiona»:
 *
 *   · El cliente de Keycloak lleva `manage-users` y `view-users`, nada más.
 *     No es un administrador del realm: no toca roles, ni clientes, ni flujos.
 *   · Solo actúa sobre el correo que se le pasa. No lista el realm, no modifica
 *     a nadie más, no borra.
 *   · El candado de dominios (`DIRECTORIO_DOMINIOS_PERMITIDOS`) limita a quién
 *     se le puede crear identidad. Sin él, cualquier correo valdría.
 *   · Y sigue siendo el ERP quien decide la EMPRESA y el ROL; el directorio
 *     solo guarda la credencial.
 *
 * Si no está configurado, no estorba: lo dice y el resto sigue funcionando
 * igual que antes. «No lo sé» es una respuesta honesta; «existe» sin haber
 * preguntado, no.
 *
 * Configuración (opcional):
 *   DIRECTORIO_CLIENT_ID             cliente confidencial del realm
 *   DIRECTORIO_CLIENT_SECRET         su secreto
 *   DIRECTORIO_DOMINIOS_PERMITIDOS   lista separada por comas, p. ej.
 *                                    «sumamexico.com,cliente.mx». Vacío = sin
 *                                    candado, y eso se reporta en pantalla.
 *   (el realm y el host salen de KEYCLOAK_ISSUER_URL, que ya existe)
 *
 * Puede apuntar al MISMO cliente que usa el portal (`fineract-provisioner`):
 * son el mismo realm y el mismo permiso. Dos secretos distintos para lo mismo
 * solo multiplican los sitios donde rotarlo.
 * ============================================================================
 */

/**
 * Lo que pasó al intentar dar de alta una identidad.
 *
 * El discriminante es una cadena y no un booleano a propósito: este proyecto
 * compila con `strictNullChecks: false`, y ahí TypeScript ensancha `true`/
 * `false` a `boolean` y deja de estrechar la unión. Con `resultado` de tipo
 * texto, el compilador sí distingue las dos ramas.
 */
export type AltaIdentidad =
  | {
      resultado: 'ok';
      sub: string;
      /** Si ya existía, no se crea nada: se reutiliza y se dice. */
      yaExistia: boolean;
      correo: 'enviado' | 'no-enviado' | 'no-aplica';
      motivoCorreo?: string;
    }
  | { resultado: 'error'; codigo: string; motivo: string };

export interface IdentidadDirectorio {
  sub: string;
  usuario: string;
  email: string | null;
  emailVerificado: boolean;
  habilitado: boolean;
}

@Injectable()
export class DirectorioIdentidadService {
  private readonly logger = new Logger(DirectorioIdentidadService.name);
  private token: { valor: string; expiraEn: number } | null = null;
  private enVuelo: Promise<string> | null = null;

  constructor(private readonly config: ConfigService) {}

  /*
   * ──────────────────────────────────────────────────────────────────────────
   * La identidad puede venir de la empresa, no solo del entorno
   * --------------------------------------------------------------------------
   * Con un realm por empresa, el cliente y el secreto con los que se administra
   * el directorio dependen de QUÉ empresa se esté atendiendo. Este servicio
   * sigue funcionando igual cuando nadie le pasa nada —usa el entorno, que es la
   * instalación de hoy— y usa lo de la empresa cuando se lo dan.
   *
   * `paraIdentidad()` devuelve una COPIA atada a esa identidad en vez de mutar
   * la instancia compartida: dos peticiones de empresas distintas no pueden
   * pisarse el cliente a media llamada. Y la identidad llega como parámetro en
   * vez de inyectando el resolutor, para no atar este servicio a la tabla —sigue
   * sirviendo en una instalación que no la tenga—.
   * ──────────────────────────────────────────────────────────────────────────
   */
  private sobreescritura: {
    emisor: string;
    clientId: string;
    clientSecret: string;
    dominios: string[];
  } | null = null;

  paraIdentidad(identidad: {
    emisor: string;
    clientIdProvisionador: string | null;
    secretoProvisionador: string | null;
    dominiosPermitidos: string[];
  }): DirectorioIdentidadService {
    // Sin los tres datos no hay nada que sobreescribir: se queda el del entorno.
    if (
      !identidad.emisor ||
      !identidad.clientIdProvisionador ||
      !identidad.secretoProvisionador
    ) {
      return this;
    }
    const copia = new DirectorioIdentidadService(this.config);
    copia.sobreescritura = {
      emisor: identidad.emisor.replace(/\/+$/, ''),
      clientId: identidad.clientIdProvisionador,
      clientSecret: identidad.secretoProvisionador,
      dominios: identidad.dominiosPermitidos,
    };
    return copia;
  }

  private get issuer(): string {
    if (this.sobreescritura) return this.sobreescritura.emisor;
    return (this.config.get<string>('KEYCLOAK_ISSUER_URL') ?? '').replace(/\/$/, '');
  }
  private get clientId(): string {
    if (this.sobreescritura) return this.sobreescritura.clientId;
    return this.config.get<string>('DIRECTORIO_CLIENT_ID') ?? '';
  }
  private get clientSecret(): string {
    if (this.sobreescritura) return this.sobreescritura.clientSecret;
    return this.config.get<string>('DIRECTORIO_CLIENT_SECRET') ?? '';
  }

  /**
   * Dominios a los que se les puede crear identidad. Vacío = sin candado.
   *
   * Importa que sea explícito: sin candado, el alta de usuario del ERP podría
   * crear una identidad corporativa para cualquier correo del mundo, y esa
   * identidad entra al realm que también autentica el core.
   */
  get dominiosPermitidos(): string[] {
    if (this.sobreescritura) return this.sobreescritura.dominios;
    return (this.config.get<string>('DIRECTORIO_DOMINIOS_PERMITIDOS') ?? '')
      .split(',')
      .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean);
  }

  private dominioPermitido(email: string): boolean {
    const permitidos = this.dominiosPermitidos;
    if (permitidos.length === 0) return true;
    const dominio = email.split('@')[1]?.toLowerCase() ?? '';
    return permitidos.includes(dominio);
  }

  /** Está configurado para poder preguntar. */
  get configurado(): boolean {
    return !!(this.issuer && this.clientId && this.clientSecret);
  }

  /** Qué falta, dicho para que se pueda arreglar sin adivinar. */
  get motivoNoConfigurado(): string | null {
    if (this.configurado) return null;
    if (!this.issuer) return 'Falta KEYCLOAK_ISSUER_URL.';
    return (
      'Falta DIRECTORIO_CLIENT_ID / DIRECTORIO_CLIENT_SECRET: un cliente confidencial ' +
      'del realm con cuenta de servicio y los roles view-users y manage-users de ' +
      'realm-management. Nada más: no hace falta que sea administrador del realm.'
    );
  }

  /**
   * La URL de administración del realm.
   *
   * El emisor es `https://host/realms/<realm>` y la API de administración vive
   * en `https://host/admin/realms/<realm>`. Se deriva en vez de pedir otra
   * variable de entorno que alguien tendría que mantener en sincronía.
   */
  private get baseAdmin(): string | null {
    const m = this.issuer.match(/^(https?:\/\/[^/]+)(?:\/.*)?\/realms\/([^/]+)$/);
    if (!m) return null;
    return `${m[1]}/admin/realms/${m[2]}`;
  }

  private async obtenerToken(): Promise<string> {
    if (this.token && this.token.expiraEn > Date.now()) return this.token.valor;
    if (this.enVuelo) return this.enVuelo;
    this.enVuelo = this.renovar().finally(() => {
      this.enVuelo = null;
    });
    return this.enVuelo;
  }

  private async renovar(): Promise<string> {
    const cuerpo = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });
    const { data } = await axios.post<{ access_token: string; expires_in?: number }>(
      `${this.issuer}/protocol/openid-connect/token`,
      cuerpo,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 },
    );
    if (!data?.access_token) throw new Error('El directorio no devolvió access_token');
    const vigencia = Math.max(30, Number(data.expires_in ?? 300)) - 30;
    this.token = { valor: data.access_token, expiraEn: Date.now() + vigencia * 1000 };
    return this.token.valor;
  }

  /**
   * Da de alta la identidad, o reutiliza la que ya exista.
   *
   * Reutilizar no es un atajo: es el caso «y viceversa» del que hablamos. Si a
   * alguien lo crearon antes en el portal de Fineract o en la consola, el ERP
   * tiene que reconocerlo y engancharse, no crear una segunda identidad para
   * la misma persona —eso produce dos accesos y ninguna forma de saber cuál es
   * el bueno—.
   *
   * La contraseña NUNCA la fija ni la conoce el ERP: se crea la identidad con
   * la acción `UPDATE_PASSWORD` pendiente y Keycloak manda el correo. Si el
   * SMTP del realm no está configurado, el alta no se deshace: la identidad
   * queda creada y se reporta que el correo no salió, porque un administrador
   * puede reenviarlo desde Keycloak y borrar la identidad sería peor.
   */
  async crearIdentidad(datos: {
    email: string;
    nombre: string;
    apellido?: string;
  }): Promise<AltaIdentidad> {
    const email = datos.email.trim().toLowerCase();

    if (!this.configurado) {
      return {
        resultado: 'error',
        codigo: 'DIRECTORIO_NO_CONFIGURADO',
        motivo:
          this.motivoNoConfigurado ??
          'El directorio no está configurado para dar de alta identidades.',
      };
    }
    if (!this.dominioPermitido(email)) {
      return {
        resultado: 'error',
        codigo: 'DOMINIO_NO_PERMITIDO',
        motivo: `Solo se pueden crear identidades de ${this.dominiosPermitidos.join(', ')}.`,
      };
    }

    const base = this.baseAdmin;
    if (!base) {
      return {
        resultado: 'error',
        codigo: 'EMISOR_INVALIDO',
        motivo: `KEYCLOAK_ISSUER_URL no tiene forma de emisor de realm: ${this.issuer}`,
      };
    }

    // Si ya está, no se crea: se reutiliza.
    const existente = await this.buscarPorCorreo(email);
    if (existente) {
      return { resultado: 'ok', sub: existente.sub, yaExistia: true, correo: 'no-aplica' };
    }
    if (existente === undefined) {
      return {
        resultado: 'error',
        codigo: 'DIRECTORIO_NO_CONTESTA',
        motivo:
          'No se pudo consultar el directorio antes de dar de alta. Se detiene aquí ' +
          'a propósito: crear sin haber comprobado es como se acaba con dos identidades.',
      };
    }

    try {
      const token = await this.obtenerToken();
      await axios.post(
        `${base}/users`,
        {
          username: email,
          email,
          firstName: datos.nombre,
          lastName: datos.apellido?.trim() || '.',
          enabled: true,
          emailVerified: false,
          requiredActions: ['UPDATE_PASSWORD'],
        },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 },
      );
    } catch (error) {
      const estado = (error as any)?.response?.status;
      this.token = null;
      if (estado === 409) {
        return {
          resultado: 'error',
          codigo: 'YA_EXISTE',
          motivo: 'El directorio dice que ya existe una identidad con ese correo o nombre de usuario.',
        };
      }
      if (estado === 403) {
        return {
          resultado: 'error',
          codigo: 'SIN_PERMISO',
          motivo:
            'El cliente del directorio no tiene permiso para crear usuarios. ' +
            'Le falta `manage-users` en su cuenta de servicio.',
        };
      }
      return {
        resultado: 'error',
        codigo: 'RECHAZO_DIRECTORIO',
        motivo: `El directorio rechazó el alta${estado ? ` (${estado})` : ''}.`,
      };
    }

    // Keycloak devuelve la ubicación en una cabecera que no siempre llega
    // completa detrás de un proxy; se relocaliza por correo, que es lo que el
    // resto del sistema usa como identidad de todas formas.
    const creado = await this.buscarPorCorreo(email);
    if (!creado) {
      return {
        resultado: 'error',
        codigo: 'CREADA_SIN_LOCALIZAR',
        motivo: 'La identidad se creó pero no se pudo localizar después. Revísala en el directorio.',
      };
    }

    const correo = await this.enviarCorreoDeContrasena(creado.sub);
    return {
      resultado: 'ok',
      sub: creado.sub,
      yaExistia: false,
      correo: correo.enviado ? 'enviado' : 'no-enviado',
      motivoCorreo: correo.motivo,
    };
  }

  /** El enlace para que la persona defina su contraseña. */
  private async enviarCorreoDeContrasena(
    sub: string,
  ): Promise<{ enviado: boolean; motivo?: string }> {
    const base = this.baseAdmin;
    if (!base) return { enviado: false, motivo: 'Emisor inválido.' };
    try {
      const token = await this.obtenerToken();
      await axios.put(
        `${base}/users/${encodeURIComponent(sub)}/execute-actions-email`,
        ['UPDATE_PASSWORD'],
        { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 },
      );
      return { enviado: true };
    } catch (error) {
      const detalle = (error as any)?.response?.data?.errorMessage;
      return {
        enviado: false,
        motivo:
          detalle ??
          'El directorio no pudo enviar el correo. Suele ser el SMTP del realm sin configurar.',
      };
    }
  }

  /**
   * La identidad del directorio para ese correo, o null si no existe.
   *
   * Devuelve `undefined` cuando NO SE PUEDE SABER —no está configurado, o el
   * directorio no contestó—. Tres estados en vez de dos, a propósito: tratar
   * «no pude preguntar» como «no existe» haría que la pantalla acusara de falta
   * de alta a gente que sí está.
   */
  async buscarPorCorreo(
    email: string,
  ): Promise<IdentidadDirectorio | null | undefined> {
    if (!this.configurado) return undefined;
    const base = this.baseAdmin;
    if (!base) {
      this.logger.warn(
        `KEYCLOAK_ISSUER_URL no tiene forma de emisor de realm: ${this.issuer}`,
      );
      return undefined;
    }

    try {
      const token = await this.obtenerToken();
      const { data } = await axios.get<
        Array<{
          id: string;
          username: string;
          email?: string;
          emailVerified?: boolean;
          enabled?: boolean;
        }>
      >(`${base}/users`, {
        params: { email, exact: true },
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
      });

      const encontrado = (data ?? [])[0];
      if (!encontrado) return null;
      return {
        sub: encontrado.id,
        usuario: encontrado.username,
        email: encontrado.email ?? null,
        emailVerificado: encontrado.emailVerified === true,
        habilitado: encontrado.enabled !== false,
      };
    } catch (error) {
      // Un directorio que no contesta no convierte a nadie en inexistente.
      this.token = null;
      this.logger.warn(
        `No se pudo consultar el directorio por ${email}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return undefined;
    }
  }
}
