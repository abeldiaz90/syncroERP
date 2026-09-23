import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import axios, { AxiosError, AxiosRequestConfig, Method } from 'axios';
import { readFileSync } from 'node:fs';
import { Agent } from 'node:https';
import { FineractConfig } from './fineract.config';
import { FineractAuthService } from './fineract-auth.service';
import { ContextoInquilinoService } from '../../services/contexto-inquilino.service';

export class ErrorFineract extends Error {
  constructor(
    message: string,
    readonly estadoHttp: number | null,
    readonly cuerpo: unknown,
    /** Si es cierto, reintentar tiene sentido. Un 400 no lo tiene. */
    readonly reintentable: boolean,
    /**
     * Si NO se puede descartar que Fineract haya aplicado la petición.
     *
     * La distinción importa para las operaciones que no admiten clave de
     * idempotencia —los asientos contables—: ahí un reintento a ciegas puede
     * duplicar. Pero «no sé si llegó» y «probadamente no llegó» son cosas
     * distintas: con la conexión rechazada no hubo siquiera socket, así que
     * nada pudo aplicarse y el reintento es seguro.
     */
    readonly pudoAplicarse: boolean = true,
  ) {
    super(message);
    this.name = 'ErrorFineract';
  }
}

/**
 * Códigos que PRUEBAN que la petición nunca llegó al proveedor: no hubo
 * conexión que llevarla. Cualquier otro fallo de red es ambiguo —el timeout y
 * el reset ocurren con la petición ya viajando— y se trata como tal.
 */
/**
 * ============================================================================
 * Una respuesta del servidor no es una duda
 * ----------------------------------------------------------------------------
 * `pudoAplicarse` existe para las operaciones sin clave de idempotencia —los
 * asientos contables—, donde reintentar a ciegas puede duplicar. Pero la duda
 * es sobre si la petición LLEGÓ. Cuando Fineract contesta con un código, llegó
 * y además dijo qué decidió: un 403 «the journal entry cannot be made for a
 * future date» es la prueba de que NO se aplicó.
 *
 * Tratar eso como ambiguo tuvo consecuencias medidas: el vínculo de esas dos
 * pólizas se quedó EN_VUELO sin identificador para siempre, la conciliación
 * contable las denunciaba cada diez minutos como discrepancia —ruido en el
 * único control que debería estar callado—, y cada reintento empezaba
 * preguntándole a Fineract si el asiento había llegado, una vuelta de red para
 * responder algo que el propio Fineract ya había respondido.
 *
 * Las excepciones son las que de verdad no dicen nada del desenlace:
 *
 *  · 408 y 429 — «ahora no»: la petición pudo estar a medio aplicar.
 *  · 409 — el conflicto puede ser precisamente que YA existe.
 *  · 5xx — el servidor falló después de recibirla; puede haber aplicado.
 * ============================================================================
 */
const RESPUESTAS_AMBIGUAS = new Set([408, 409, 429]);

export function pudoAplicarse(estado: number): boolean {
  if (estado >= 500) return true;
  if (RESPUESTAS_AMBIGUAS.has(estado)) return true;
  // El servidor evaluó la petición y la rechazó: no la aplicó.
  return estado < 400;
}

const NUNCA_SALIO = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ERR_INVALID_URL',
  'ERR_BAD_OPTION_VALUE',
]);

interface OpcionesLlamada {
  /** Milisegundos. Por omisión el timeout de fondo. */
  timeoutMs?: number;
  /** Cuerpo JSON. */
  datos?: unknown;
  /** Parámetros de consulta. */
  params?: Record<string, string | number | boolean | undefined>;
  /**
   * Intentar la llamada con el token del usuario de la petición en curso, para
   * que Fineract la audite a su nombre y le aplique sus permisos. Si ese
   * usuario no existe en Fineract, se reintenta con la cuenta de servicio.
   * Sólo tiene sentido en lecturas hechas dentro de una petición.
   */
  comoUsuario?: boolean;
  /**
   * Inquilino contra el que va la llamada, cuando no es el configurado.
   *
   * Existe para las tareas de mantenimiento sobre la reserva: vaciar un
   * inquilino antes de reciclarlo exige hablar con ESE inquilino, y tomarlo de
   * la configuración significaría borrar en el equivocado si alguien cambió el
   * entorno. La operación normal no lo usa nunca: pasa por el configurado, que
   * es el de la instalación.
   */
  tenant?: string;
}

/**
 * Cliente HTTP hacia Fineract con cortacircuitos.
 *
 * El cortacircuitos existe por el punto de venta: si Fineract está caído, no
 * tiene sentido que cada venta pague un timeout completo. Tras varios fallos
 * seguidos el circuito se abre y las llamadas fallan de inmediato, lo que
 * permite al POS degradar a caché sin retener al cajero un segundo por venta.
 */
@Injectable()
export class FineractHttpService {
  private readonly logger = new Logger(FineractHttpService.name);

  private fallosConsecutivos = 0;
  private abiertoHasta = 0;
  private readonly agente: Agent | undefined;
  private readonly umbralApertura = 5;
  private readonly reposoMs = 20_000;

  constructor(
    private readonly cfg: FineractConfig,
    private readonly auth: FineractAuthService,
    private readonly inquilinos: ContextoInquilinoService,
  ) {
    this.agente = this.construirAgente();
  }

  /**
   * De quién es esta llamada.
   *
   * Orden: lo que se pase explícitamente —tareas de mantenimiento que ya saben
   * a qué inquilino van—, después la empresa del contexto, y al final el
   * global. Con el interruptor encendido, el global deja de ser un destino
   * posible para una operación de empresa.
   */
  private async inquilinoDeLaOperacion(explicito?: string): Promise<string> {
    if (explicito) return explicito;

    const empresaId = this.inquilinos.empresaActual;
    const porEmpresa = this.inquilinos.porEmpresa;

    if (!empresaId) {
      if (porEmpresa) {
        // Un proceso del sistema que no declaró empresa no puede escribir en
        // ningún inquilino de cliente: no se sabe en cuál.
        throw new Error(
          'Esta operación no declaró a qué empresa pertenece, y con el inquilino ' +
            'por empresa activo no se puede elegir uno. Es un defecto de programación: ' +
            'falta abrir el contexto de empresa antes de llamar al core.',
        );
      }
      return this.cfg.tenant;
    }

    const suyo = await this.inquilinos.inquilinoDe(empresaId);
    if (suyo) return suyo;

    if (porEmpresa) {
      throw new Error(
        `La empresa ${empresaId} no tiene inquilino asignado en el core. ` +
          'Asígnale uno desde la consola de SUMA antes de operar: sin él, sus datos ' +
          'acabarían mezclados con los de otro cliente.',
      );
    }

    return this.cfg.tenant;
  }

  /**
   * Agente TLS que confía en el certificado de Fineract sin bajar la guardia.
   *
   * Se añade la autoridad al almacén de confianza; NO se desactiva la
   * verificación. La diferencia importa: `rejectUnauthorized: false` acepta
   * cualquier certificado, incluido el de quien se ponga en medio. Esto acepta
   * exactamente uno.
   *
   * Un certificado vencido sigue siendo rechazado, y eso es correcto: confiar
   * en una autoridad no resucita un certificado caducado.
   */
  private construirAgente(): Agent | undefined {
    const ruta = this.cfg.rutaCertificadoCA;
    if (!ruta) return undefined;
    try {
      const ca = readFileSync(ruta);
      this.logger.log(`TLS: se confía en el certificado de ${ruta}`);
      return new Agent({ ca, keepAlive: true });
    } catch (error) {
      this.logger.error(
        `No se pudo leer el certificado ${ruta}: ${
          error instanceof Error ? error.message : String(error)
        }. Las llamadas fallarán por TLS.`,
      );
      return undefined;
    }
  }

  get disponible(): boolean {
    return this.cfg.habilitado && Date.now() >= this.abiertoHasta;
  }

  get estadoCircuito() {
    return {
      habilitado: this.cfg.habilitado,
      certificadoPropio: Boolean(this.agente),
      abierto: Date.now() < this.abiertoHasta,
      fallosConsecutivos: this.fallosConsecutivos,
      reabreEn: this.abiertoHasta ? new Date(this.abiertoHasta) : null,
    };
  }

  get<T>(ruta: string, opciones: OpcionesLlamada = {}) {
    return this.llamar<T>('GET', ruta, opciones);
  }

  post<T>(ruta: string, datos: unknown, opciones: OpcionesLlamada = {}) {
    return this.llamar<T>('POST', ruta, { ...opciones, datos });
  }

  put<T>(ruta: string, datos: unknown, opciones: OpcionesLlamada = {}) {
    return this.llamar<T>('PUT', ruta, { ...opciones, datos });
  }

  /**
   * Sólo para recursos de CONFIGURACIÓN del proveedor —hooks, por ejemplo—.
   * Nada de la cartera se borra: un crédito o un pago se revierten con su
   * propio comando y quedan en el historial, que es lo que un registro
   * financiero debe hacer.
   */
  delete<T>(ruta: string, opciones: OpcionesLlamada = {}) {
    return this.llamar<T>('DELETE', ruta, opciones);
  }

  private async llamar<T>(
    metodo: Method,
    ruta: string,
    opciones: OpcionesLlamada,
  ): Promise<T> {
    if (!this.cfg.habilitado) {
      throw new ServiceUnavailableException('Fineract no está configurado.');
    }
    if (Date.now() < this.abiertoHasta) {
      throw new ErrorFineract(
        'Circuito abierto hacia Fineract.',
        null,
        null,
        true,
        // El circuito abierto ni siquiera intenta la llamada.
        false,
      );
    }

    const cabeceraUsuario = opciones.comoUsuario
      ? this.auth.cabeceraDeUsuario()
      : undefined;

    const peticion = async (
      reintentarAutenticacion: boolean,
      usarUsuario: boolean,
    ): Promise<T> => {
      const autorizacion =
        usarUsuario && cabeceraUsuario
          ? cabeceraUsuario
          : await this.auth.cabeceraAutorizacion();

      /*
       * ────────────────────────────────────────────────────────────────────
       * El inquilino: la frontera de verdad del core
       * --------------------------------------------------------------------
       * Éste es el único sitio por donde sale una llamada a Fineract, y por eso
       * es donde se decide de quién es. Antes decía `opciones.tenant ??
       * this.cfg.tenant`, y como casi nadie pasaba `tenant`, TODO iba al
       * inquilino global: los créditos, los clientes y los asientos de todas
       * las empresas en la misma base, separados sólo por oficina — que es
       * justo lo que ya se vio fallar.
       *
       * Con `FINERACT_TENANT_POR_EMPRESA=true`, cada empresa opera en el suyo y
       * la que no tenga asignado **no opera**: se detiene con un mensaje que
       * dice qué falta. Detenerse es recuperable; escribir en la base de otro
       * cliente no, porque un crédito con historia contable no se borra.
       * ────────────────────────────────────────────────────────────────────
       */
      const inquilino = await this.inquilinoDeLaOperacion(opciones.tenant);

      const config: AxiosRequestConfig = {
        method: metodo,
        url: `${this.cfg.url}${ruta}`,
        httpsAgent: this.agente,
        timeout: opciones.timeoutMs ?? this.cfg.timeoutFondoMs,
        params: opciones.params,
        data: opciones.datos,
        headers: {
          'Fineract-Platform-TenantId': inquilino,
          'Content-Type': 'application/json',
          Authorization: autorizacion,
        },
        // Fineract responde 4xx con cuerpos descriptivos que queremos leer.
        validateStatus: () => true,
      };

      const respuesta = await axios.request<T>(config);

      if (respuesta.status === 401 || respuesta.status === 403) {
        // El usuario no existe en Fineract (su despliegue no crea usuarios
        // solos). Se repite con la cuenta de servicio en vez de fallar: negarle
        // una consulta al cajero porque su alta en el core está pendiente sería
        // castigar al operador por una tarea administrativa.
        if (usarUsuario && cabeceraUsuario) {
          this.logger.warn(
            'Fineract rechazó el token del usuario; se reintenta con la cuenta de servicio.',
          );
          return peticion(reintentarAutenticacion, false);
        }
        if (respuesta.status === 401 && reintentarAutenticacion) {
          this.auth.invalidar();
          return peticion(false, false);
        }
      }

      if (respuesta.status >= 200 && respuesta.status < 300) {
        return respuesta.data;
      }

      // 4xx es un problema del dato: reintentarlo sólo repite el error.
      // 401/408/429 y 5xx sí valen un reintento.
      const reintentable =
        respuesta.status >= 500 ||
        [401, 408, 429].includes(respuesta.status);

      throw new ErrorFineract(
        this.describir(respuesta.status, respuesta.data),
        respuesta.status,
        respuesta.data,
        reintentable,
        pudoAplicarse(respuesta.status),
      );
    };

    try {
      const resultado = await peticion(true, true);
      this.fallosConsecutivos = 0;
      return resultado;
    } catch (error) {
      this.registrarFallo(error);
      if (error instanceof ErrorFineract) throw error;

      const axiosError = error as AxiosError;
      const esRed =
        axiosError.isAxiosError === true && !axiosError.response;
      throw new ErrorFineract(
        esRed
          ? `Fineract no respondió: ${axiosError.code ?? axiosError.message}`
          : String(axiosError.message ?? error),
        null,
        null,
        true,
        !NUNCA_SALIO.has(String(axiosError.code ?? '')),
      );
    }
  }

  /** Sólo los fallos de infraestructura abren el circuito; un 400 no. */
  private registrarFallo(error: unknown): void {
    const reintentable =
      !(error instanceof ErrorFineract) || error.reintentable;
    if (!reintentable) return;

    this.fallosConsecutivos += 1;
    if (this.fallosConsecutivos >= this.umbralApertura) {
      this.abiertoHasta = Date.now() + this.reposoMs;
      this.fallosConsecutivos = 0;
      this.logger.error(
        `Circuito hacia Fineract abierto por ${this.reposoMs / 1000}s.`,
      );
    }
  }

  private describir(estado: number, cuerpo: unknown): string {
    const c = cuerpo as
      | {
          defaultUserMessage?: string;
          errors?: { defaultUserMessage?: string }[];
        }
      | undefined;
    const mensaje =
      c?.errors?.[0]?.defaultUserMessage ??
      c?.defaultUserMessage ??
      'sin detalle';
    return `Fineract respondió ${estado}: ${mensaje}`;
  }
}
