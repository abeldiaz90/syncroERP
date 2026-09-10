import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';
import { ContextoPeticionAlmacen } from '../../../common/contexto/contexto-peticion';
import { FineractConfig } from './fineract.config';

interface TokenEnMemoria {
  valor: string;
  expiraEn: number;
}

/**
 * Credenciales con las que el ERP habla con Fineract.
 *
 * Hay DOS, y la diferencia importa:
 *
 * 1. **Token del usuario.** El ERP y Fineract federan contra el mismo Keycloak,
 *    así que el access token con el que la persona entró al ERP también sirve
 *    en Fineract. Para las CONSULTAS hechas dentro de una petición se reenvía
 *    ese token: el rastro de auditoría del otro lado queda a nombre de quien
 *    realmente consultó, y Fineract aplica sus propios permisos sobre ese
 *    usuario. Es la coherencia real de identidad entre los dos sistemas.
 *
 * 2. **Cuenta de servicio (`client_credentials`).** Para las ESCRITURAS, que
 *    salen del outbox en segundo plano y por definición ya no tienen una
 *    petición viva detrás. Ahí la identidad del operador no se falsifica: viaja
 *    como nota del recurso, y el ERP —que ya audita quién hizo qué— conserva el
 *    registro fuerte.
 *
 * El token de usuario sólo funciona si esa persona existe también en Fineract:
 * su despliegue corre con `AUTO_CREATE_USER=false`. Cuando no existe, Fineract
 * responde 401 y el llamador cae a la cuenta de servicio; ver
 * `FineractHttpService`.
 *
 * La autenticación básica queda como respaldo explícito para desarrollo local.
 */
@Injectable()
export class FineractAuthService {
  private readonly logger = new Logger(FineractAuthService.name);
  private token: TokenEnMemoria | null = null;
  private enVuelo: Promise<string> | null = null;

  constructor(private readonly cfg: FineractConfig) {}

  /**
   * Token del usuario de la petición en curso, si lo hay y si el despliegue
   * federa contra el mismo Keycloak. `undefined` en tareas de fondo.
   */
  cabeceraDeUsuario(): string | undefined {
    if (!this.cfg.tieneOAuth) return undefined;
    const token = ContextoPeticionAlmacen.token();
    return token ? `Bearer ${token}` : undefined;
  }

  /** Cabecera Authorization de la cuenta de servicio. */
  async cabeceraAutorizacion(): Promise<string> {
    if (this.cfg.tieneOAuth) {
      return `Bearer ${await this.obtenerToken()}`;
    }
    if (this.cfg.basicUser && this.cfg.basicPassword) {
      const credencial = Buffer.from(
        `${this.cfg.basicUser}:${this.cfg.basicPassword}`,
      ).toString('base64');
      return `Basic ${credencial}`;
    }
    throw new ServiceUnavailableException(
      'Fineract no tiene credenciales configuradas.',
    );
  }

  /**
   * Nombre de usuario que Fineract buscará para la cuenta de servicio.
   *
   * Fineract resuelve la identidad por el claim `preferred_username`, que en
   * una cuenta de servicio de Keycloak vale `service-account-<clientId>`. Se
   * lee del token en vez de construirlo a mano: si mañana el realm cambia la
   * convención, esto sigue diciendo la verdad.
   */
  async usuarioDeServicio(): Promise<string | null> {
    if (!this.cfg.tieneOAuth) return null;
    const cabecera = await this.cabeceraAutorizacion();
    const jwt = cabecera.replace(/^Bearer\s+/i, '');
    const partes = jwt.split('.');
    if (partes.length !== 3) return null;
    try {
      const claims = JSON.parse(
        Buffer.from(partes[1], 'base64url').toString('utf8'),
      ) as { preferred_username?: string };
      return claims.preferred_username ?? null;
    } catch {
      return null;
    }
  }

  /** Fuerza la renovación en el siguiente uso (tras un 401). */
  invalidar(): void {
    this.token = null;
  }

  private async obtenerToken(): Promise<string> {
    const ahora = Date.now();
    if (this.token && this.token.expiraEn > ahora) return this.token.valor;

    // Varias peticiones concurrentes comparten la misma renovación: sin esto,
    // un pico en el POS dispara una ráfaga de tokens contra Keycloak.
    if (this.enVuelo) return this.enVuelo;

    this.enVuelo = this.renovar().finally(() => {
      this.enVuelo = null;
    });
    return this.enVuelo;
  }

  private async renovar(): Promise<string> {
    const cuerpo = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.cfg.clientId,
      client_secret: this.cfg.clientSecret,
    });

    try {
      const { data } = await axios.post<{
        access_token: string;
        expires_in?: number;
      }>(`${this.cfg.issuerUrl}/protocol/openid-connect/token`, cuerpo, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: this.cfg.timeoutFondoMs,
      });

      if (!data?.access_token) {
        throw new Error('Keycloak no devolvió access_token');
      }

      // Se renueva 30 s antes de que expire para no usar un token al filo.
      const vigencia = Math.max(30, Number(data.expires_in ?? 300)) - 30;
      this.token = {
        valor: data.access_token,
        expiraEn: Date.now() + vigencia * 1000,
      };
      return this.token.valor;
    } catch (error) {
      this.token = null;
      const detalle = error instanceof Error ? error.message : String(error);
      this.logger.error(`No se obtuvo token para Fineract: ${detalle}`);
      throw new ServiceUnavailableException(
        'No fue posible autenticarse contra Fineract.',
      );
    }
  }
}
