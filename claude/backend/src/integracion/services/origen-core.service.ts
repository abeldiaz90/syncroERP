import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { SecretosService } from '../../common/services/secretos.service';
import { Empresa } from '../../iam/entities/empresa.entity';
import { AuditoriaService } from '../../auditoria/services/auditoria.service';
import { AccionAuditoria } from '../../auditoria/entities/registro-auditoria.entity';
import { ConfiguracionIntegracionEmpresa } from '../entities/configuracion-integracion-empresa.entity';
import {
  EstadoOrigenCore,
  OrigenCore,
  OrigenCoreEmpresa,
} from '../entities/origen-core.entity';
import { ModoCartera, ModoContabilidad } from '../integracion.constants';
import { RegistroDelCoreService } from './registro-del-core.service';

/**
 * ============================================================================
 * El origen de los datos bancarios de una empresa
 * ----------------------------------------------------------------------------
 * Aquí se decide y se ejecuta de dónde lee y escribe FINERACT para un cliente:
 * de la base que aprovisiona SUMA —lo de siempre— o de la que el cliente pone
 * en sus instalaciones.
 *
 * El ERP no entra en esto. Sigue siendo multiempresa dentro de la suite de
 * SUMA, una sola base y los inquilinos separados por `empresaId`. Lo único que
 * se mueve es el inquilino del core, que es exactamente lo que Fineract sabe
 * hacer: cada inquilino lleva su propia conexión.
 *
 * ── Cuatro pasos, y ninguno se salta ──────────────────────────────────────
 *
 *   capturar   Guarda la conexión, cifrada. No prueba nada. Es deliberado: el
 *              operador suele teclearla antes de que el cliente abra el
 *              cortafuegos, y perder lo tecleado por eso es la forma más
 *              segura de que acabe en un bloc de notas.
 *
 *   verificar  Abre una conexión de verdad contra esa base y le pregunta.
 *              Si no contesta, se escribe POR QUÉ en palabras que el operador
 *              pueda usar, y nunca la cadena completa: un error acaba en una
 *              captura pegada en un chat.
 *
 *   registrar  Anota el inquilino en el registro del core. Y aquí viene lo
 *              que hay que saber vendiendo esto: **Fineract construye el
 *              esquema de un inquilino sólo al arrancar**. Queda
 *              ESPERANDO_REINICIO, que no es un fallo, es el calendario.
 *
 *   activar    Comprueba que el esquema ya está construido —que existe
 *              `m_office`, que es la primera tabla que el core siembra— y
 *              recién entonces enciende la integración de esa empresa.
 *
 * Capturar no es activar, igual que registrar un realm no es encenderlo. Un
 * origen a medio armar no debe atender a nadie.
 *
 * ── Por qué la fila de conexión se COPIA y no se inventa ──────────────────
 * `tenant_server_connections` tiene columnas que cambian entre versiones de
 * Fineract —el tamaño del pool, los reintentos, los parámetros de sólo
 * lectura— y una fila escrita a mano con la mitad de las columnas produce un
 * inquilino que arranca y se porta raro bajo carga. Así que se toma la fila de
 * un inquilino que YA funciona en esta instalación y se le cambia únicamente
 * de dónde salen los datos. Lo que no sabemos, lo heredamos de lo que ya va
 * bien.
 * ============================================================================
 */

/** Lo que tarda como mucho en decidirse si una base contesta. */
const ESPERA_CONEXION_MS = 8_000;

export interface ConexionDelCliente {
  inquilino: string;
  servidor: string;
  puerto: number;
  baseDatos: string;
  usuario: string;
  clave: string;
  parametros?: string | null;
}

@Injectable()
export class OrigenCoreService {
  private readonly logger = new Logger(OrigenCoreService.name);

  constructor(
    @InjectRepository(OrigenCoreEmpresa)
    private readonly origenes: Repository<OrigenCoreEmpresa>,
    @InjectRepository(Empresa)
    private readonly empresas: Repository<Empresa>,
    @InjectRepository(ConfiguracionIntegracionEmpresa)
    private readonly configuraciones: Repository<ConfiguracionIntegracionEmpresa>,
    private readonly secretos: SecretosService,
    private readonly registro: RegistroDelCoreService,
    private readonly auditoria: AuditoriaService,
  ) {}

  // ── Lectura ───────────────────────────────────────────────────────────────

  /**
   * Qué origen tiene una empresa. **Nunca devuelve el secreto**, ni cifrado:
   * lo único que se puede saber desde fuera es si hay uno guardado.
   */
  async consultar(empresaId: string) {
    const fila = await this.origenes.findOne({ where: { empresaId } });
    if (!fila) {
      /*
       * Sin fila no es un error: es una empresa de la nube de SUMA, que son
       * todas las de hoy. Se contesta lo que de verdad pasa.
       */
      return {
        origen: OrigenCore.SUMA,
        estado: null as EstadoOrigenCore | null,
        declarado: false,
      };
    }
    return {
      origen: fila.origen,
      estado: fila.estado,
      declarado: true,
      inquilino: fila.inquilino,
      servidor: fila.servidor,
      puerto: fila.puerto,
      baseDatos: fila.baseDatos,
      usuario: fila.usuario,
      tieneClave: Boolean(fila.secretoCifrado),
      verificadoEn: fila.verificadoEn,
      ultimoError: fila.ultimoError,
      registradoPor: fila.registradoPor,
    };
  }

  // ── Paso 1 · capturar ─────────────────────────────────────────────────────

  async capturar(
    empresaId: string,
    datos: ConexionDelCliente,
    solicitadoPor: string,
  ) {
    const empresa = await this.empresas.findOne({ where: { id: empresaId } });
    if (!empresa) throw new NotFoundException('Esa empresa no existe.');

    if (!this.secretos.configurado) {
      /*
       * Sin llave no se guarda a medias. Una conexión con la clave en claro en
       * una columna es una clave que sale en cada respaldo.
       */
      throw new BadRequestException(this.secretos.motivoNoConfigurado!);
    }

    const inquilino = (datos.inquilino ?? '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{1,59}$/.test(inquilino)) {
      throw new BadRequestException(
        'El identificador del inquilino sólo admite letras sin acento, números, guion y guion bajo. ' +
          'El core lo compara en crudo: «Caja Norte» y «caja-norte» serían dos inquilinos distintos y sólo uno existiría.',
      );
    }

    const servidor = (datos.servidor ?? '').trim();
    const baseDatos = (datos.baseDatos ?? '').trim();
    const usuario = (datos.usuario ?? '').trim();
    const clave = datos.clave ?? '';
    const puerto = Number(datos.puerto);

    if (!servidor) throw new BadRequestException('Falta el servidor de la base del cliente.');
    if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) {
      throw new BadRequestException('El puerto no es un puerto.');
    }
    if (!baseDatos) throw new BadRequestException('Falta el nombre de la base de datos.');
    if (!usuario) throw new BadRequestException('Falta el usuario con el que conectarse.');
    if (!clave) throw new BadRequestException('Falta la clave de ese usuario.');

    /*
     * Dos empresas con el mismo inquilino significaría que una lee la cartera
     * de la otra. Se comprueba aquí y además lo impide el índice único de la
     * empresa; esto es para poder decirlo con nombre y apellido.
     */
    const ajeno = await this.origenes.findOne({ where: { inquilino } });
    if (ajeno && ajeno.empresaId !== empresaId) {
      throw new ConflictException(
        `El inquilino «${inquilino}» ya está declarado para otra empresa. Dos empresas con el mismo inquilino acaban viendo la misma cartera.`,
      );
    }

    const cifrado = this.secretos.cifrar(clave);
    if (!cifrado) throw new BadRequestException(this.secretos.motivoNoConfigurado!);

    const existente = await this.origenes.findOne({ where: { empresaId } });
    const fila = existente ?? this.origenes.create({ empresaId });

    if (existente && existente.estado === EstadoOrigenCore.ACTIVO) {
      /*
       * Mover de sitio la base de una empresa que YA opera no es capturar una
       * conexión: es una migración de datos, con su ventana y su respaldo. No
       * se hace por una pantalla de alta.
       */
      throw new ConflictException(
        'Esta empresa ya está operando contra su base. Cambiar de servidor a partir de aquí es una migración, no una captura: hay que planearla con su ventana y su respaldo.',
      );
    }

    fila.origen = OrigenCore.CLIENTE;
    fila.inquilino = inquilino;
    fila.servidor = servidor;
    fila.puerto = puerto;
    fila.baseDatos = baseDatos;
    fila.usuario = usuario;
    fila.secretoCifrado = cifrado;
    fila.parametros = (datos.parametros ?? '').trim() || null;
    fila.estado = EstadoOrigenCore.CAPTURADO;
    fila.verificadoEn = null;
    fila.ultimoError = null;
    fila.registradoPor = solicitadoPor;

    await this.origenes.save(fila);
    await this.anotar(empresaId, 'CREAR', 'ORIGEN_CORE_CAPTURADO', solicitadoPor, {
      inquilino,
      servidor,
      baseDatos,
    });

    return this.consultar(empresaId);
  }

  /** Declara que la base la pone SUMA. Es volver al camino de siempre. */
  async declararSuma(empresaId: string, inquilino: string | null, solicitadoPor: string) {
    const existente = await this.origenes.findOne({ where: { empresaId } });
    const fila = existente ?? this.origenes.create({ empresaId });
    if (existente?.estado === EstadoOrigenCore.ACTIVO && existente.origen === OrigenCore.CLIENTE) {
      throw new ConflictException(
        'Esta empresa ya opera contra su propia base. Traerla a la nube de SUMA es una migración de datos, no un cambio de casilla.',
      );
    }
    fila.origen = OrigenCore.SUMA;
    fila.inquilino = inquilino?.trim().toLowerCase() || fila.inquilino;
    fila.servidor = null;
    fila.puerto = null;
    fila.baseDatos = null;
    fila.usuario = null;
    fila.secretoCifrado = null;
    fila.parametros = null;
    fila.estado = EstadoOrigenCore.ACTIVO;
    fila.ultimoError = null;
    fila.registradoPor = solicitadoPor;
    await this.origenes.save(fila);
    return this.consultar(empresaId);
  }

  // ── Paso 2 · verificar ────────────────────────────────────────────────────

  /**
   * Abre la conexión de verdad. Es el único paso que prueba algo.
   *
   * Devuelve además si el esquema YA está construido, porque esa es la
   * diferencia entre «una base vacía esperando al core» y «una base que ya
   * tiene un Fineract dentro», y el operador necesita saber cuál de las dos le
   * dieron.
   */
  async verificar(empresaId: string) {
    const fila = await this.exigirFila(empresaId);
    if (fila.origen !== OrigenCore.CLIENTE) {
      throw new BadRequestException(
        'Esta empresa usa la base que aprovisiona SUMA: no hay ninguna conexión del cliente que verificar.',
      );
    }

    const clave = this.secretos.descifrar(fila.secretoCifrado);
    if (!clave) {
      return this.marcarFallo(
        fila,
        'No se pudo leer la clave guardada. O cambió SECRETOS_LLAVE, o alguien editó la fila fuera del sistema. Hay que volver a capturar la conexión.',
      );
    }

    let ds: DataSource | null = null;
    try {
      ds = new DataSource({
        type: 'postgres',
        host: fila.servidor!,
        port: fila.puerto!,
        username: fila.usuario!,
        password: clave,
        database: fila.baseDatos!,
        synchronize: false,
        logging: false,
        connectTimeoutMS: ESPERA_CONEXION_MS,
        extra: { max: 1, statement_timeout: ESPERA_CONEXION_MS },
      });
      await ds.initialize();

      /*
       * `m_office` es la primera tabla que el core siembra en un inquilino.
       * Que exista significa que el esquema ya está construido; que no exista
       * es lo normal antes del primer arranque y no es un fallo.
       */
      const [{ construido }] = await ds.query(
        `SELECT to_regclass('public.m_office') IS NOT NULL AS construido`,
      );

      fila.estado = EstadoOrigenCore.VERIFICADO;
      fila.verificadoEn = new Date();
      fila.ultimoError = null;
      await this.origenes.save(fila);

      return { ...(await this.consultar(empresaId)), esquemaConstruido: Boolean(construido) };
    } catch (error) {
      return this.marcarFallo(fila, this.enPalabras(error));
    } finally {
      if (ds?.isInitialized) await ds.destroy().catch(() => undefined);
    }
  }

  // ── Paso 3 · registrar el inquilino en el core ───────────────────────────

  async registrarEnElCore(empresaId: string, solicitadoPor: string) {
    const fila = await this.exigirFila(empresaId);
    if (fila.origen !== OrigenCore.CLIENTE) {
      throw new BadRequestException('Sólo se registra un inquilino cuando la base la pone el cliente.');
    }
    if (fila.estado === EstadoOrigenCore.CAPTURADO) {
      throw new ConflictException(
        'Primero hay que verificar la conexión. Anotar en el core un inquilino que no contesta deja una fila que nadie va a volver a mirar.',
      );
    }

    const clave = this.secretos.descifrar(fila.secretoCifrado);
    if (!clave) throw new ConflictException('No se pudo leer la clave guardada.');

    const empresa = await this.empresas.findOne({ where: { id: empresaId } });

    await this.registro.registrarInquilino({
      identificador: fila.inquilino!,
      nombre: empresa?.nombreComercial ?? fila.inquilino!,
      servidor: fila.servidor!,
      puerto: fila.puerto!,
      baseDatos: fila.baseDatos!,
      usuario: fila.usuario!,
      clave,
      parametros: fila.parametros,
    });

    fila.estado = EstadoOrigenCore.ESPERANDO_REINICIO;
    fila.ultimoError = null;
    fila.registradoPor = solicitadoPor;
    await this.origenes.save(fila);
    await this.anotar(empresaId, 'ACCION', 'ORIGEN_CORE_REGISTRADO', solicitadoPor, {
      inquilino: fila.inquilino,
    });

    return {
      ...(await this.consultar(empresaId)),
      aviso:
        'El inquilino quedó anotado. Fineract construye el esquema de un inquilino nuevo únicamente al arrancar, ' +
        'así que empieza a atender en el siguiente reinicio programado del core. Después hay que activarlo.',
    };
  }

  // ── Paso 4 · activar ──────────────────────────────────────────────────────

  async activar(empresaId: string, solicitadoPor: string) {
    const fila = await this.exigirFila(empresaId);
    if (fila.origen !== OrigenCore.CLIENTE) {
      throw new BadRequestException('Esta empresa no tiene base propia que activar.');
    }
    if (fila.estado === EstadoOrigenCore.CAPTURADO) {
      throw new ConflictException('Esta conexión ni siquiera se ha verificado.');
    }

    const clave = this.secretos.descifrar(fila.secretoCifrado);
    if (!clave) throw new ConflictException('No se pudo leer la clave guardada.');

    let ds: DataSource | null = null;
    try {
      ds = new DataSource({
        type: 'postgres',
        host: fila.servidor!,
        port: fila.puerto!,
        username: fila.usuario!,
        password: clave,
        database: fila.baseDatos!,
        synchronize: false,
        logging: false,
        connectTimeoutMS: ESPERA_CONEXION_MS,
        extra: { max: 1, statement_timeout: ESPERA_CONEXION_MS },
      });
      await ds.initialize();
      const [{ construido }] = await ds.query(
        `SELECT to_regclass('public.m_office') IS NOT NULL AS construido`,
      );
      if (!construido) {
        /*
         * Éste es el no que importa. Activar aquí dejaría una empresa que se
         * ve encendida y falla en su primer crédito, que es peor que una
         * empresa que todavía no opera y lo dice.
         */
        throw new ConflictException(
          'La base del cliente todavía no tiene el esquema del core. Falta el reinicio programado de Fineract: hasta que arranque, ese inquilino no existe para el core.',
        );
      }
    } finally {
      if (ds?.isInitialized) await ds.destroy().catch(() => undefined);
    }

    fila.estado = EstadoOrigenCore.ACTIVO;
    fila.verificadoEn = new Date();
    fila.ultimoError = null;
    await this.origenes.save(fila);

    /*
     * Y recién ahora la empresa empieza a hablar con el core, en SOMBRA: el
     * externo registra y no manda hasta que la conciliación demuestre que los
     * dos sistemas cuadran. Es el mismo estado con el que nace una empresa de
     * la nube de SUMA.
     */
    const config = await this.configuraciones.findOne({ where: { empresaId } });
    if (config) {
      config.modo = ModoCartera.SOMBRA;
      config.modoContabilidad = ModoContabilidad.ESPEJO;
      config.parametrosProveedor = {
        ...(config.parametrosProveedor ?? {}),
        tenant: fila.inquilino,
      };
      await this.configuraciones.save(config);
    }

    await this.anotar(empresaId, 'ACCION', 'ORIGEN_CORE_ACTIVADO', solicitadoPor, {
      inquilino: fila.inquilino,
    });
    return this.consultar(empresaId);
  }

  // ── Interno ───────────────────────────────────────────────────────────────

  private async exigirFila(empresaId: string): Promise<OrigenCoreEmpresa> {
    const fila = await this.origenes.findOne({ where: { empresaId } });
    if (!fila) {
      throw new NotFoundException(
        'Esta empresa no tiene declarado de dónde salen sus datos bancarios.',
      );
    }
    return fila;
  }

  private async marcarFallo(fila: OrigenCoreEmpresa, motivo: string) {
    fila.estado = EstadoOrigenCore.FALLIDO;
    fila.ultimoError = motivo.slice(0, 500);
    await this.origenes.save(fila);
    return { ...(await this.consultar(fila.empresaId)), esquemaConstruido: false };
  }

  /**
   * El fallo, en palabras que un operador pueda usar.
   *
   * Y sin la cadena de conexión: un mensaje de error acaba en una captura de
   * pantalla pegada en un chat, y ahí no debe ir ni el usuario ni el servidor
   * completo, mucho menos la clave.
   */
  private enPalabras(error: unknown): string {
    const bruto = error instanceof Error ? error.message : String(error);
    const codigo = (error as { code?: string })?.code ?? '';

    if (codigo === 'ENOTFOUND' || /getaddrinfo/i.test(bruto)) {
      return 'No se resuelve el nombre del servidor. O está mal escrito, o esa máquina no se ve desde aquí.';
    }
    if (codigo === 'ECONNREFUSED') {
      return 'El servidor contesta pero rechaza la conexión en ese puerto. Suele ser que PostgreSQL no escucha ahí, o que el cortafuegos del cliente no nos deja entrar.';
    }
    if (codigo === 'ETIMEDOUT' || /timeout/i.test(bruto)) {
      return 'El servidor no contestó a tiempo. Normalmente es el cortafuegos o la VPN: ni rechaza ni deja pasar.';
    }
    if (codigo === '28P01' || /password authentication failed/i.test(bruto)) {
      return 'El usuario o la clave no son correctos para esa base.';
    }
    if (codigo === '3D000' || /database .* does not exist/i.test(bruto)) {
      return 'Ese usuario entra, pero la base de datos que nos dieron no existe en ese servidor.';
    }
    if (codigo === '28000' || /no pg_hba\.conf entry/i.test(bruto)) {
      return 'El servidor no tiene permitida la conexión desde nuestra dirección. El cliente tiene que autorizarla en su pg_hba.conf.';
    }
    this.logger.warn(`Fallo al verificar el origen de una empresa: ${codigo || bruto}`);
    return 'La base no contestó, y el motivo no es uno de los habituales. Está anotado en la bitácora del servidor.';
  }

  /**
   * Deja constancia, con el verbo que la bitácora entiende.
   *
   * `accion` es un conjunto cerrado de cinco verbos —CREAR, ACTUALIZAR,
   * ELIMINAR, CANCELAR, ACCION— y no un hueco donde escribir el nombre del
   * suceso. Lo que pasó va en `valorNuevo.evento`, que es donde se puede
   * buscar sin romper el tipo ni la tabla.
   *
   * Y quién lo autorizó va en `usuarioEmail`, como en el resto del
   * aprovisionamiento: no hay usuario del ERP detrás de estas rutas —entran
   * con credencial de servicio— y una bitácora que sólo dice «la consola» no
   * sirve para auditar a nadie.
   */
  private async anotar(
    empresaId: string,
    accion: AccionAuditoria,
    evento: string,
    solicitadoPor: string,
    detalle: Record<string, unknown>,
  ) {
    try {
      await this.auditoria.registrar({
        empresaId,
        usuarioEmail: solicitadoPor,
        accion,
        entidad: 'OrigenCoreEmpresa',
        registroId: empresaId,
        valorNuevo: { evento, ...detalle, solicitadoPor },
      });
    } catch {
      /* Una bitácora que falla no debe tumbar un alta. */
    }
  }
}
