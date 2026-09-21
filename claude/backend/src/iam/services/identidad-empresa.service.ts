import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmpresaIdentidad } from '../entities/empresa-identidad.entity';
import { SecretosService } from '../../common/services/secretos.service';

/**
 * ============================================================================
 * De quién aceptamos tokens, y con qué credenciales le hablamos a su realm
 * ----------------------------------------------------------------------------
 * Es la pieza que convierte «identidad» de configuración en dato. Todo lo que
 * hoy se lee de `.env` para hablar con Keycloak pasa por aquí, y aquí se decide
 * si la respuesta viene de la tabla o del entorno.
 *
 * La regla de precedencia, y el porqué:
 *
 *   1. Si la empresa tiene fila en `empresa_identidad` y está ACTIVA, manda la
 *      fila. Es lo específico.
 *   2. Si no, manda el entorno. Es lo que hace que una instalación de una sola
 *      empresa —como hoy— siga funcionando sin tocar nada y sin migrar datos.
 *
 * Al revés sería una trampa: si el entorno ganara, encender una variable global
 * cambiaría la identidad de empresas que ya tienen la suya.
 *
 * El caché es de un minuto, no eterno: la consola de SUMA escribe aquí al dar
 * de alta una empresa, y un caché eterno obligaría a reiniciar el ERP después de
 * cada alta — que es exactamente lo que este trabajo existe para evitar.
 * ============================================================================
 */

export interface IdentidadResuelta {
  /** De dónde salió: sirve para que las pantallas lo puedan decir. */
  origen: 'empresa' | 'entorno';
  emisor: string;
  realm: string | null;
  clientIdPublico: string | null;
  clientIdProvisionador: string | null;
  secretoProvisionador: string | null;
  dominiosPermitidos: string[];
}

const TTL_MS = 60_000;

@Injectable()
export class IdentidadEmpresaService {
  private readonly logger = new Logger(IdentidadEmpresaService.name);
  private readonly porEmpresaCache = new Map<
    string,
    { valor: IdentidadResuelta; expira: number }
  >();
  /** Emisores aceptados, con su empresa. Clave del control de acceso. */
  private emisoresCache: { valor: Map<string, string>; expira: number } | null =
    null;

  constructor(
    @InjectRepository(EmpresaIdentidad)
    private readonly repo: Repository<EmpresaIdentidad>,
    private readonly config: ConfigService,
    private readonly secretos: SecretosService,
  ) {}

  private get emisorDelEntorno(): string {
    return (this.config.get<string>('KEYCLOAK_ISSUER_URL') ?? '').replace(/\/$/, '');
  }

  private desdeEntorno(): IdentidadResuelta {
    const emisor = this.emisorDelEntorno;
    const m = emisor.match(/\/realms\/([^/]+)$/);
    return {
      origen: 'entorno',
      emisor,
      realm: m ? m[1] : null,
      clientIdPublico: this.config.get<string>('KEYCLOAK_CLIENT_ID') ?? null,
      clientIdProvisionador: this.config.get<string>('DIRECTORIO_CLIENT_ID') ?? null,
      secretoProvisionador:
        this.config.get<string>('DIRECTORIO_CLIENT_SECRET') ?? null,
      dominiosPermitidos: (
        this.config.get<string>('DIRECTORIO_DOMINIOS_PERMITIDOS') ?? ''
      )
        .split(',')
        .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
        .filter(Boolean),
    };
  }

  private desdeFila(fila: EmpresaIdentidad): IdentidadResuelta {
    return {
      origen: 'empresa',
      emisor: fila.emisor.replace(/\/$/, ''),
      realm: fila.realm,
      clientIdPublico: fila.clientIdPublico,
      clientIdProvisionador: fila.clientIdProvisionador,
      // El secreto se descifra aquí y no se guarda en el caché en claro más
      // tiempo del que vive la entrada: un minuto.
      secretoProvisionador: this.secretos.descifrar(fila.secretoProvisionador),
      dominiosPermitidos: (fila.dominiosPermitidos ?? '')
        .split(',')
        .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
        .filter(Boolean),
    };
  }

  /** La identidad que le toca a una empresa. Nunca devuelve null. */
  async deEmpresa(empresaId: string): Promise<IdentidadResuelta> {
    const enCache = this.porEmpresaCache.get(empresaId);
    if (enCache && enCache.expira > Date.now()) return enCache.valor;

    let valor: IdentidadResuelta;
    try {
      const fila = await this.repo.findOne({ where: { empresaId } });
      valor =
        fila && fila.estado === 'ACTIVA' ? this.desdeFila(fila) : this.desdeEntorno();
    } catch (error) {
      /*
       * Si la tabla todavía no existe —migración sin aplicar— no se cae nada:
       * se usa el entorno, que es como funcionaba antes. Lo que no se hace es
       * tragarse el error en silencio.
       */
      this.logger.warn(
        `No se pudo leer empresa_identidad (${
          error instanceof Error ? error.message : String(error)
        }). Se usa la configuración del entorno.`,
      );
      valor = this.desdeEntorno();
    }

    this.porEmpresaCache.set(empresaId, { valor, expira: Date.now() + TTL_MS });
    return valor;
  }

  /**
   * Los emisores que se aceptan, con la empresa de cada uno.
   *
   * Esto es control de acceso, no comodidad: es la lista que impide que alguien
   * levante su propio Keycloak, firme un token con el correo de un empleado y
   * entre. Incluye el emisor del entorno —el de hoy— y las filas ACTIVAS.
   * Las que están APROVISIONANDO **no**: un realm a medio armar puede no tener
   * todavía su política de contraseñas ni su segundo factor.
   */
  async emisoresAceptados(): Promise<Map<string, string>> {
    if (this.emisoresCache && this.emisoresCache.expira > Date.now()) {
      return this.emisoresCache.valor;
    }

    const mapa = new Map<string, string>();
    const delEntorno = this.emisorDelEntorno;
    if (delEntorno) mapa.set(delEntorno, 'entorno');

    try {
      const filas = await this.repo.find({ where: { estado: 'ACTIVA' } });
      for (const f of filas) {
        mapa.set(f.emisor.replace(/\/$/, ''), f.empresaId);
      }
    } catch {
      // Misma razón que arriba: sin tabla, solo el emisor del entorno.
    }

    this.emisoresCache = { valor: mapa, expira: Date.now() + TTL_MS };
    return mapa;
  }

  /** Si se acepta ese emisor. Es la pregunta que hace la estrategia JWT. */
  async emisorAceptado(emisor: string): Promise<boolean> {
    if (!emisor) return false;
    return (await this.emisoresAceptados()).has(emisor.replace(/\/$/, ''));
  }

  /** Tras escribir una fila, para no esperar el minuto del caché. */
  invalidar(empresaId?: string) {
    if (empresaId) this.porEmpresaCache.delete(empresaId);
    else this.porEmpresaCache.clear();
    this.emisoresCache = null;
  }

  /*
   * ══════════════════════════════════════════════════════════════════════════
   * Escritura: la consola registra la identidad de una empresa
   * --------------------------------------------------------------------------
   * Entra por la puerta de aprovisionamiento del ERP, que es una clave de
   * servicio y no una sesión de persona. Dos reglas gobiernan este método:
   *
   *  1. **Nace APROVISIONANDO, no ACTIVA.** Un realm a medio armar no debe
   *     empezar a autenticar: puede no tener aún su política de contraseñas ni
   *     su segundo factor. Activarlo es un segundo paso, deliberado, que la
   *     consola da cuando ya comprobó que el realm responde.
   *  2. **Sin cifrado no se guarda nada.** Si `SECRETOS_LLAVE` no está puesta,
   *     esto falla en vez de guardar el secreto del provisionador en claro.
   *     Un secreto en claro en la base es peor que un alta que no se completó,
   *     porque el alta se ve y el secreto no.
   * ══════════════════════════════════════════════════════════════════════════
   */
  async registrar(datos: {
    empresaId: string;
    emisor: string;
    realm: string;
    clientIdPublico: string;
    clientIdServicio?: string | null;
    secretoServicio?: string | null;
    clientIdProvisionador?: string | null;
    secretoProvisionador?: string | null;
    dominiosPermitidos?: string | null;
    aprovisionadoPor: string;
  }) {
    const emisor = (datos.emisor ?? '').trim().replace(/\/+$/, '');
    if (!emisor || !/^https:\/\//i.test(emisor)) {
      // Sin TLS el token viaja en claro y la lista de emisores deja de valer.
      throw new BadRequestException(
        'El emisor tiene que ser una URL https del directorio.',
      );
    }
    if (!datos.realm?.trim() || !datos.clientIdPublico?.trim()) {
      throw new BadRequestException(
        'Falta el realm o el cliente público con el que entra la gente.',
      );
    }

    const hayQueCifrar = !!(datos.secretoProvisionador || datos.secretoServicio);
    if (hayQueCifrar && !this.secretos.configurado) {
      throw new BadRequestException(
        `No se puede guardar la identidad porque no hay cifrado disponible: ${this.secretos.motivoNoConfigurado}`,
      );
    }

    /*
     * Dos empresas con el mismo emisor significaría que los tokens de una valen
     * para la otra. La base también lo impide con un índice único; esto existe
     * para que el mensaje diga qué pasó en vez de un error de restricción.
     */
    const ajena = await this.repo.findOne({ where: { emisor } });
    if (ajena && ajena.empresaId !== datos.empresaId) {
      throw new BadRequestException(
        `Ese emisor ya está registrado para otra empresa (${ajena.empresaId}). Un realm no se comparte entre empresas.`,
      );
    }

    const existente = await this.repo.findOne({
      where: { empresaId: datos.empresaId },
    });

    const fila = this.repo.create({
      ...(existente ?? {}),
      empresaId: datos.empresaId,
      emisor,
      realm: datos.realm.trim(),
      clientIdPublico: datos.clientIdPublico.trim(),
      clientIdServicio: datos.clientIdServicio?.trim() || null,
      clientIdProvisionador: datos.clientIdProvisionador?.trim() || null,
      dominiosPermitidos: datos.dominiosPermitidos?.trim() || null,
      aprovisionadoPor: datos.aprovisionadoPor,
      /*
       * Re-registrar una identidad ya ACTIVA la devuelve a APROVISIONANDO. No es
       * un descuido: si cambian sus clientes o su emisor, lo que había dejó de
       * describirla, y seguir aceptando tokens con datos viejos es justo lo que
       * no queremos. Vuelve a activarse cuando la consola lo confirme.
       */
      estado: 'APROVISIONANDO' as const,
    });

    // Un secreto que no viene no se borra: puede ser una actualización parcial.
    if (datos.secretoProvisionador) {
      fila.secretoProvisionador = this.secretos.cifrar(datos.secretoProvisionador);
    }
    if (datos.secretoServicio) {
      fila.secretoServicio = this.secretos.cifrar(datos.secretoServicio);
    }

    const guardada = await this.repo.save(fila);
    this.invalidar(datos.empresaId);
    this.logger.log(
      `Identidad registrada para la empresa ${datos.empresaId}: realm ${guardada.realm} (${guardada.estado}), por ${datos.aprovisionadoPor}`,
    );
    return this.resumen(datos.empresaId);
  }

  /**
   * Enciende la identidad: desde aquí el ERP acepta tokens de ese realm.
   *
   * Es un paso aparte porque es EL paso: mientras no ocurra, el realm existe
   * pero no abre ninguna puerta. Y se exige que el registro esté completo —sin
   * cliente público no hay por dónde entrar—, para que activar no sea una
   * palabra que no cambia nada.
   */
  async activar(empresaId: string, activadoPor: string) {
    const fila = await this.repo.findOne({ where: { empresaId } });
    if (!fila) {
      throw new NotFoundException(
        'Esa empresa no tiene identidad registrada. Regístrala antes de activarla.',
      );
    }
    if (!fila.emisor || !fila.clientIdPublico) {
      throw new BadRequestException(
        'El registro está incompleto: falta el emisor o el cliente público.',
      );
    }
    fila.estado = 'ACTIVA';
    fila.aprovisionadoPor = activadoPor;
    await this.repo.save(fila);
    this.invalidar(empresaId);
    this.logger.warn(
      `Identidad ACTIVADA para la empresa ${empresaId}: el ERP ya acepta tokens de ${fila.emisor} (por ${activadoPor})`,
    );
    return this.resumen(empresaId);
  }

  /**
   * Apaga la identidad sin borrarla.
   *
   * Borrar la fila devolvería la empresa al emisor del entorno —el realm
   * compartido—, que es una puerta ABIERTA, no cerrada. Suspender la deja sin
   * emisor aceptado, que es lo que se quiere cuando un cliente se va o hay una
   * sospecha.
   */
  async suspender(empresaId: string, motivoDe: string) {
    const fila = await this.repo.findOne({ where: { empresaId } });
    if (!fila) throw new NotFoundException('Esa empresa no tiene identidad registrada.');
    fila.estado = 'SUSPENDIDA';
    await this.repo.save(fila);
    this.invalidar(empresaId);
    this.logger.warn(
      `Identidad SUSPENDIDA para la empresa ${empresaId} (por ${motivoDe})`,
    );
    return this.resumen(empresaId);
  }

  /** Para las pantallas: qué hay configurado, sin revelar los secretos. */
  async resumen(empresaId: string) {
    const identidad = await this.deEmpresa(empresaId);
    let estado: string | null = null;
    try {
      estado = (await this.repo.findOne({ where: { empresaId } }))?.estado ?? null;
    } catch {
      // Sin tabla no hay estado que reportar; el origen ya dice 'entorno'.
    }
    return {
      origen: identidad.origen,
      estado,
      emisor: identidad.emisor,
      realm: identidad.realm,
      clientIdPublico: identidad.clientIdPublico,
      clientIdProvisionador: identidad.clientIdProvisionador,
      tieneSecretoProvisionador: !!identidad.secretoProvisionador,
      dominiosPermitidos: identidad.dominiosPermitidos,
      cifradoDisponible: this.secretos.configurado,
      motivoCifrado: this.secretos.motivoNoConfigurado,
    };
  }
}
