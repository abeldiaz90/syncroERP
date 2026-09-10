import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { Empresa } from '../../iam/entities/empresa.entity';
import { Usuario } from '../../iam/entities/usuario.entity';
import { AuditoriaService } from '../../auditoria/services/auditoria.service';
import { CATALOGO_POR_OMISION } from '../../credito/services/productos-credito.service';
import { ProductoCredito, EstadoProductoCredito } from '../../credito/entities/producto-credito.entity';
import { ConfiguracionIntegracionEmpresa } from '../entities/configuracion-integracion-empresa.entity';
import { EstadoTenantReserva, TenantReserva } from '../entities/tenant-reserva.entity';
import { ModoCartera, ModoContabilidad } from '../integracion.constants';

/**
 * ============================================================================
 * Alta de empresas
 * ----------------------------------------------------------------------------
 * SUMA da de alta a sus clientes aquí. No todos contratan lo mismo: unos usan
 * sólo el ERP, otros el ERP con el registro externo, y otros todavía nada. Por
 * eso la empresa se crea UNA vez y los servicios se activan por separado.
 *
 * El inquilino del registro externo sale de una RESERVA creada por adelantado.
 * Fineract sólo construye el esquema de un inquilino al arrancar, así que
 * crearlo en el momento del alta obligaría a reiniciar el core con todas las
 * demás empresas operando. Con reserva, el cliente nuevo no espera y nadie se
 * cae.
 *
 * LO QUE LA RESERVA NO RESUELVE, y conviene saber antes de confiar en ella:
 * en esta instalación el core NO elige el inquilino por la cabecera de la
 * petición, sino por el emisor del token (ver `HALLAZGO-AISLAMIENTO-CORE.md`).
 * Mientras el ERP se autentique con un solo cliente de servicio, todas las
 * empresas caen en el mismo inquilino por mucho que la reserva diga otra cosa.
 * Anotar el inquilino aquí es necesario, pero hoy no es suficiente: hasta que
 * cada empresa tenga su realm, sólo UNA empresa puede operar con el core.
 *
 * QUIÉN PUEDE USAR ESTO. Dar de alta empresas es una función de la operadora
 * —SUMA—, no de cada cliente. Un administrador es administrador DE SU EMPRESA;
 * sin esta restricción, el administrador de cualquier cliente podría crear
 * empresas y enumerar las de todos los demás. Se exige que la sesión pertenezca
 * a la empresa operadora, declarada en `EMPRESA_OPERADORA_ID`, y si esa
 * variable no está definida la puerta queda cerrada para todos: es preferible
 * que la función no exista a que la tenga cualquiera.
 * ============================================================================
 */
@Injectable()
export class AltaEmpresasService {
  private readonly logger = new Logger(AltaEmpresasService.name);

  constructor(
    private readonly ds: DataSource,
    private readonly auditoria: AuditoriaService,
    @InjectRepository(Empresa)
    private readonly empresas: Repository<Empresa>,
    @InjectRepository(ConfiguracionIntegracionEmpresa)
    private readonly configs: Repository<ConfiguracionIntegracionEmpresa>,
    @InjectRepository(TenantReserva)
    private readonly reserva: Repository<TenantReserva>,
    @InjectRepository(ProductoCredito)
    private readonly productos: Repository<ProductoCredito>,
    @InjectRepository(Usuario)
    private readonly usuarios: Repository<Usuario>,
  ) {}

  // ── Reserva ───────────────────────────────────────────────────────────────

  async estadoReserva() {
    const [disponibles, asignados, retirados] = await Promise.all([
      this.reserva.count({ where: { estado: EstadoTenantReserva.DISPONIBLE } }),
      this.reserva.count({ where: { estado: EstadoTenantReserva.ASIGNADO } }),
      this.reserva.count({ where: { estado: EstadoTenantReserva.RETIRADO } }),
    ]);
    /*
     * Qué inquilinos conoce el core, para que quien registre no teclee a
     * ciegas. Si no se puede leer, la pantalla lo dice en vez de romperse: es
     * información de apoyo, y el registro ya se niega por su cuenta.
     */
    let conocidosPorElCore: string[] | null = null;
    let motivoRegistro: string | null = null;
    try {
      conocidosPorElCore = await this.tenantsDelCore();
    } catch (error) {
      motivoRegistro = error instanceof Error ? error.message : String(error);
    }

    return {
      disponibles,
      asignados,
      retirados,
      conocidosPorElCore,
      motivoRegistro,
      /*
       * El aviso llega ANTES de quedarse sin, porque reponer exige una ventana
       * de mantenimiento del core. Enterarse con cero disponibles significa que
       * el próximo cliente espera al siguiente reinicio.
       */
      suficiente: disponibles >= 3,
    };
  }

  /**
   * Los inquilinos que existen DE VERDAD en el core, leídos de su registro.
   *
   * NO se declaran a mano. Una lista escrita por una persona es una lista que
   * algún día no se actualiza, y ese día alguien la «arregla» tecleando un
   * identificador a ojo —que es exactamente el error que esto viene a impedir—.
   *
   * Tampoco se le pregunta a la API del core: en esta instalación Fineract
   * deduce el inquilino del emisor del token y no de la cabecera, así que
   * responde lo mismo para uno real que para uno inventado. Una comprobación
   * así diría que sí siempre.
   *
   * La fuente es la tabla `tenants` de la base maestra, que es donde el propio
   * core anota qué instituciones conoce. Se lee en SÓLO LECTURA y con su propia
   * conexión: el ERP no administra el core, sólo necesita saber qué existe.
   *
   * Si la base maestra no se puede leer, esto FALLA en vez de seguir. Continuar
   * significaría aceptar cualquier identificador, que es el estado del que
   * venimos.
   */
  private conexionRegistro: DataSource | null = null;

  private async registroDelCore(): Promise<DataSource> {
    if (this.conexionRegistro?.isInitialized) return this.conexionRegistro;

    const url = (process.env.FINERACT_TENANTS_DB_URL ?? '').trim();
    if (!url) {
      throw new BadRequestException(
        'Falta FINERACT_TENANTS_DB_URL: sin acceso al registro de inquilinos del core no se puede ' +
          'comprobar que un inquilino exista, y aceptar cualquiera produce empresas que se ven ' +
          'correctas y comparten cartera.',
      );
    }

    this.conexionRegistro = new DataSource({
      type: 'postgres',
      url,
      // Sin entidades ni migraciones: esta conexión sólo hace una consulta.
      synchronize: false,
      logging: false,
      extra: { max: 2 },
    });
    await this.conexionRegistro.initialize();
    return this.conexionRegistro;
  }

  /** Identificadores que el core reconoce, tal como los tiene anotados. */
  async tenantsDelCore(): Promise<string[]> {
    const ds = await this.registroDelCore();
    const filas: { identifier: string }[] = await ds.query(
      'SELECT identifier FROM tenants ORDER BY id',
    );
    return filas.map((f) => String(f.identifier).trim().toLowerCase()).filter(Boolean);
  }

  /**
   * Registra inquilinos ya creados en el proveedor.
   *
   * El ERP no crea la base del inquilino: eso ocurre del lado de Fineract, en
   * su ventana de mantenimiento. Aquí sólo se anota cuáles existen y están
   * libres.
   *
   * DOS REGLAS, las dos aprendidas rompiendo algo:
   *
   * 1. Sólo se aceptan inquilinos que el core tiene anotados en su registro.
   *    Antes se aceptaba cualquier texto: se registraron `t001`, `t002` y
   *    `t003`, que no existen, y el sistema los dio por buenos. Las empresas
   *    quedaron marcadas con un inquilino que nadie tenía.
   *
   * 2. Un inquilino que ya se asignó NO vuelve a la reserva. Fineract se niega
   *    a borrar créditos con historia contable —castigados, cerrados, con
   *    asientos— y hace bien: eso es lo que un core banking debe proteger. En
   *    la práctica un inquilino usado no se puede vaciar por la API, así que
   *    reciclarlo significa entregarle a la empresa nueva la cartera de la
   *    anterior. La reserva entrega inquilinos nuevos o no entrega nada.
   */
  async registrarEnReserva(identificadores: string[], proveedor = 'fineract') {
    const limpios = [...new Set(
      identificadores.map((x) => x.trim().toLowerCase()).filter(Boolean),
    )];
    if (!limpios.length) throw new BadRequestException('No se recibió ningún identificador.');

    let existentes: string[];
    try {
      existentes = await this.tenantsDelCore();
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        `No se pudo leer el registro de inquilinos del core: ${
          error instanceof Error ? error.message : String(error)
        }. Sin poder comprobarlo no se registra nada.`,
      );
    }

    const desconocidos = limpios.filter((x) => !existentes.includes(x));
    if (desconocidos.length) {
      throw new BadRequestException(
        `El core no conoce ${desconocidos.join(', ')}. ` +
          `Los inquilinos que existen hoy son: ${existentes.join(', ') || 'ninguno'}. ` +
          'Hay que crearlo primero en el core; el ERP no inventa inquilinos.',
      );
    }

    const nuevos: string[] = [];
    const yaEstaban: string[] = [];
    const usados: string[] = [];
    for (const identificador of limpios) {
      const existe = await this.reserva.findOne({ where: { proveedor, identificador } });
      if (existe) {
        // Un inquilino ya asignado o retirado tiene historia dentro. No vuelve.
        if (existe.estado === EstadoTenantReserva.DISPONIBLE) yaEstaban.push(identificador);
        else usados.push(identificador);
        continue;
      }
      await this.reserva.save(
        this.reserva.create({
          proveedor,
          identificador,
          estado: EstadoTenantReserva.DISPONIBLE,
        }),
      );
      nuevos.push(identificador);
    }
    return { nuevos, yaEstaban, usados };
  }

  // ── Alta ──────────────────────────────────────────────────────────────────

  async crear(datos: {
    nombreComercial: string;
    rfc?: string | null;
    usaFineract: boolean;
    /** Quién autorizó el alta del lado de SUMA. Va a la bitácora. */
    solicitadoPor: string;
    /**
     * El administrador de la empresa. Sin esta fila el alta queda a medias:
     * la identidad existe en el directorio, la empresa existe en el ERP, y la
     * persona no puede entrar porque el ERP resuelve a qué empresa pertenece
     * por SU PROPIA tabla, no por el token. Es lo que separa a una empresa de
     * otra, así que se crea aquí, dentro de la misma transacción.
     */
    administrador?: { correo: string; nombre: string; apellido: string } | null;
  }) {
    const nombre = datos.nombreComercial.trim();
    if (nombre.length < 3) {
      throw new BadRequestException('El nombre comercial es demasiado corto.');
    }

    const repetida = await this.empresas.findOne({ where: { nombreComercial: nombre } });
    if (repetida) {
      throw new ConflictException(`Ya existe una empresa llamada «${nombre}».`);
    }

    /*
     * El correo es único en TODO el ERP, y esa unicidad es justamente lo que
     * impide que una persona pertenezca a dos empresas y vea las dos carteras.
     * Se comprueba ANTES de crear nada: descubrirlo al final dejaría la empresa
     * creada y un inquilino de la reserva consumido para siempre.
     */
    const correoAdmin = datos.administrador?.correo.trim().toLowerCase() ?? '';
    if (correoAdmin) {
      const yaEs = await this.usuarios
        .createQueryBuilder('usuario')
        .leftJoinAndSelect('usuario.empresa', 'empresa')
        .where('LOWER(usuario.email) = :correo', { correo: correoAdmin })
        .getOne();
      if (yaEs) {
        throw new ConflictException(
          `${correoAdmin} ya administra «${yaEs.empresa?.nombreComercial ?? 'otra empresa'}». ` +
            'Una persona pertenece a una sola empresa: es lo que impide que vea la cartera de las dos. ' +
            'Usa un correo distinto para el administrador de ésta.',
        );
      }
    }

    /*
     * Todo en una transacción: si la reserva no tiene inquilino libre, la
     * empresa NO debe quedar creada a medias. Una empresa que dice usar el
     * registro externo y no tiene inquilino es peor que ninguna empresa: se ve
     * dada de alta y falla al primer crédito.
     */
    return this.ds.transaction(async (em) => {
      const empresa = await em.save(
        em.create(Empresa, {
          nombreComercial: nombre,
          activo: true,
          rfc: datos.rfc?.trim() || null,
          pais: 'México',
        }),
      );

      let tenant: TenantReserva | null = null;
      if (datos.usaFineract) {
        /*
         * `FOR UPDATE SKIP LOCKED` es lo que hace segura la entrega cuando dos
         * altas ocurren a la vez: cada transacción toma un renglón distinto en
         * lugar de pelearse por el mismo. Sin esto, dos clientes podrían
         * recibir el mismo inquilino y acabar viendo la cartera del otro.
         */
        const [fila] = await em.query(
          `SELECT id FROM integracion_tenants_reserva
            WHERE proveedor = $1 AND estado = 'DISPONIBLE'
            ORDER BY fechacreacion
            FOR UPDATE SKIP LOCKED
            LIMIT 1`,
          ['fineract'],
        );
        if (!fila?.id) {
          throw new ConflictException(
            'No hay inquilinos disponibles en la reserva. Hay que reponerla en la próxima ventana de mantenimiento del core antes de dar de alta esta empresa con Fineract.',
          );
        }
        tenant = await em.findOne(TenantReserva, { where: { id: fila.id } });
        if (!tenant) throw new ConflictException('No se pudo tomar el inquilino de la reserva.');
        tenant.estado = EstadoTenantReserva.ASIGNADO;
        tenant.empresaId = empresa.id;
        tenant.asignadoEn = new Date();
        // No hay usuario del ERP: se anota quién lo pidió del lado de SUMA.
        tenant.nota = `Asignado a solicitud de ${datos.solicitadoPor}.`;
        await em.save(tenant);
      }

      await em.save(
        em.create(ConfiguracionIntegracionEmpresa, {
          empresaId: empresa.id,
          // Nace en SOMBRA cuando contrata: el externo registra pero no manda
          // hasta que la conciliación demuestre que los dos sistemas cuadran.
          modo: datos.usaFineract ? ModoCartera.SOMBRA : ModoCartera.APAGADO,
          modoContabilidad: datos.usaFineract
            ? ModoContabilidad.ESPEJO
            : ModoContabilidad.APAGADO,
          parametrosProveedor: tenant ? { tenant: tenant.identificador } : {},
        }),
      );

      let administrador: Usuario | null = null;
      if (datos.administrador && correoAdmin) {
        /*
         * NO SE FIJA CONTRASEÑA, y el hash que se guarda no es un hash: es un
         * texto que ningún algoritmo puede producir, así que ninguna
         * contraseña tecleada puede coincidir con él. La columna no admite
         * nulos —el ERP nació con acceso local— y dejarla con un hash de una
         * contraseña provisional sería peor: alguien tendría que conocerla.
         * La persona entra por el directorio y define la suya por el enlace.
         */
        administrador = await em.save(
          em.create(Usuario, {
            empresaId: empresa.id,
            email: correoAdmin,
            nombreCompleto:
              `${datos.administrador.nombre} ${datos.administrador.apellido}`.trim() ||
              correoAdmin,
            passwordHash: 'sin-acceso-local:identidad-en-el-directorio',
            rol: 'admin',
            activo: true,
            esPropietario: true,
            emailVerificado: false,
            keycloakSubject: null,
          }),
        );
      }

      return {
        empresa,
        tenant: tenant?.identificador ?? null,
        administrador: administrador
          ? { id: administrador.id, email: administrador.email, rol: administrador.rol }
          : null,
      };
    }).then(async (resultado) => {
      /*
       * El catálogo se siembra FUERA de la transacción y a propósito: si algo
       * fallara aquí, la empresa ya existe y se puede sembrar después, mientras
       * que deshacer el alta entera por un catálogo dejaría un inquilino de la
       * reserva consumido y perdido.
       */
      try {
        await this.sembrarCatalogo(resultado.empresa.id);
      } catch (error) {
        this.logger.error(
          `La empresa ${resultado.empresa.id} quedó creada sin catálogo: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      /*
       * Queda constancia de quién creó la empresa. Sin esto, el alta de un
       * cliente —que le da acceso a la plataforma y consume un inquilino— no
       * dejaba rastro de su autor.
       */
      await this.auditoria.registrar({
        empresaId: null,
        usuarioEmail: datos.solicitadoPor,
        accion: 'CREAR',
        entidad: 'Empresa',
        registroId: resultado.empresa.id,
        valorNuevo: {
          nombreComercial: resultado.empresa.nombreComercial,
          rfc: resultado.empresa.rfc,
          usaFineract: datos.usaFineract,
          inquilino: resultado.tenant,
          solicitadoPor: datos.solicitadoPor,
          origen: 'consola de aprovisionamiento de SUMA',
        },
        resultado: 'OK',
      });

      return resultado;
    });
  }

  // ── Estado de una empresa ─────────────────────────────────────────────────

  /**
   * Qué le falta a una empresa para poder operar.
   *
   * Cada punto dice si está listo y, si no, qué hay que hacer. Se prefiere una
   * lista honesta con pasos manuales declarados a un botón que finja que todo
   * se resuelve solo.
   */
  async estado(empresaId: string) {
    const empresa = await this.empresas.findOne({ where: { id: empresaId } });
    if (!empresa) throw new NotFoundException('La empresa no existe.');

    const cfg = await this.configs.findOne({ where: { empresaId } });
    const tenant = await this.reserva.findOne({
      where: { empresaId, estado: EstadoTenantReserva.ASIGNADO },
    });
    const catalogo = await this.productos.find({ where: { empresaId } });
    /*
     * Con el repositorio y no con SQL crudo. La primera versión escribía el
     * nombre de la tabla a mano y envolvía el fallo en un `catch` que devolvía
     * «no se pudo contar»: el error real —el nombre no correspondía— quedaba
     * escondido detrás de un mensaje que parecía un problema de permisos.
     */
    const totalUsuarios = await this.usuarios.count({ where: { empresaId } });

    const usaFineract = (cfg?.modo ?? ModoCartera.APAGADO) !== ModoCartera.APAGADO;

    return {
      empresa: {
        id: empresa.id,
        nombreComercial: empresa.nombreComercial,
        rfc: empresa.rfc,
        activo: empresa.activo,
      },
      servicios: {
        erp: true,
        fineract: usaFineract,
        modo: cfg?.modo ?? ModoCartera.APAGADO,
        modoContabilidad: cfg?.modoContabilidad ?? ModoContabilidad.APAGADO,
      },
      puntos: [
        {
          clave: 'catalogo',
          titulo: 'Catálogo de crédito',
          listo: catalogo.length > 0,
          detalle: catalogo.length
            ? `${catalogo.length} producto(s).`
            : 'Sin productos: no se puede vender a crédito.',
          accion: catalogo.length ? null : 'Sembrar el catálogo por omisión desde Productos de crédito.',
        },
        {
          clave: 'usuarios',
          titulo: 'Usuario administrador',
          listo: totalUsuarios > 0,
          detalle: totalUsuarios
            ? `${totalUsuarios} usuario(s) en el ERP.`
            : 'Nadie puede entrar todavía a esta empresa.',
          accion: totalUsuarios
            ? null
            : 'Invitar al administrador. Recibe un enlace y define su propia contraseña; nadie más la ve.',
        },
        {
          clave: 'tenant',
          titulo: 'Inquilino en el registro externo',
          listo: !usaFineract || Boolean(tenant),
          detalle: !usaFineract
            ? 'No aplica: esta empresa opera sólo con el ERP.'
            : tenant
              ? `Asignado: ${tenant.identificador}.`
              : 'Contrató el registro externo y no tiene inquilino.',
          accion:
            usaFineract && !tenant
              ? 'Reponer la reserva en la próxima ventana de mantenimiento y asignar uno.'
              : null,
        },
        {
          clave: 'conciliacion',
          titulo: 'Autoridad sobre la cartera',
          listo: (cfg?.modo ?? ModoCartera.APAGADO) === ModoCartera.AUTORIDAD,
          detalle:
            cfg?.modo === ModoCartera.AUTORIDAD
              ? 'El registro externo manda sobre la cartera.'
              : 'El ERP sigue siendo el sistema de registro. Subir a AUTORIDAD exige conciliación sin diferencias.',
          accion: null,
        },
      ],
    };
  }

  /**
   * Siembra el catálogo por omisión de una empresa recién creada.
   *
   * Duplica lo mínimo del servicio de crédito —la lista de plantillas se
   * importa, no se copia— porque el módulo de integración no importa el de
   * crédito: hacerlo formaría un ciclo entre los dos, ya que crédito sí importa
   * integración para publicar sus hechos.
   *
   * Nacen ACTIVO porque son el catálogo por omisión, ya conocido y probado;
   * los que alguien capture a mano nacen en BORRADOR y pasan por verificación.
   */
  private async sembrarCatalogo(empresaId: string): Promise<number> {
    let creados = 0;
    for (const plantilla of CATALOGO_POR_OMISION) {
      const existe = await this.productos.findOne({
        where: { empresaId, codigo: plantilla.codigo as string },
      });
      if (existe) continue;
      await this.productos.save(
        this.productos.create({
          ...plantilla,
          empresaId,
          estado: EstadoProductoCredito.ACTIVO,
        }),
      );
      creados += 1;
    }
    return creados;
  }

  async listar() {
    const empresas = await this.empresas.find({ order: { nombreComercial: 'ASC' } });
    const configs = await this.configs.find();
    const tenants = await this.reserva.find({ where: { estado: EstadoTenantReserva.ASIGNADO } });
    /*
     * Cuántas personas pueden entrar a cada empresa. Se informa aquí porque una
     * empresa con cero es una empresa que se ve dada de alta y no lo está: la
     * lista es el único lugar donde eso se puede notar sin ir a la base.
     */
    const porEmpresa = new Map<string, number>();
    for (const fila of await this.usuarios
      .createQueryBuilder('u')
      .select('u.empresaId', 'empresaid')
      .addSelect('COUNT(*)', 'total')
      .where('u.activo = true')
      .groupBy('u.empresaId')
      .getRawMany<{ empresaid: string; total: string }>()) {
      porEmpresa.set(fila.empresaid, Number(fila.total));
    }

    return empresas.map((e) => {
      const cfg = configs.find((c) => c.empresaId === e.id);
      return {
        id: e.id,
        nombreComercial: e.nombreComercial,
        rfc: e.rfc,
        activo: e.activo,
        modo: cfg?.modo ?? ModoCartera.APAGADO,
        usaFineract: (cfg?.modo ?? ModoCartera.APAGADO) !== ModoCartera.APAGADO,
        tenant: tenants.find((t) => t.empresaId === e.id)?.identificador ?? null,
        usuarios: porEmpresa.get(e.id) ?? 0,
      };
    });
  }

  /**
   * Da administrador a una empresa que ya existe.
   *
   * Hace falta por dos caminos reales, no hipotéticos: las empresas creadas
   * antes de que el alta incluyera al administrador, y una empresa que se queda
   * sin nadie porque su única cuenta se dio de baja. Sin esto la única salida
   * era escribir en la base a mano, que es exactamente lo que esta consola
   * existe para no tener que hacer.
   *
   * Las mismas reglas que en el alta, y por las mismas razones: el correo no
   * puede administrar otra empresa, y no se fija contraseña.
   */
  async asignarAdministrador(datos: {
    empresaId: string;
    correo: string;
    nombre: string;
    apellido: string;
    solicitadoPor: string;
  }) {
    const empresa = await this.empresas.findOne({ where: { id: datos.empresaId } });
    if (!empresa) throw new NotFoundException('Esa empresa no existe en el ERP.');

    const correo = datos.correo.trim().toLowerCase();
    if (!correo.includes('@')) throw new BadRequestException('El correo no es válido.');

    const yaEs = await this.usuarios
      .createQueryBuilder('usuario')
      .leftJoinAndSelect('usuario.empresa', 'empresa')
      .where('LOWER(usuario.email) = :correo', { correo })
      .getOne();
    if (yaEs) {
      /*
       * Se distingue el caso de «ya es de ESTA empresa»: decirle a alguien que
       * el correo pertenece a otra empresa cuando en realidad ya está en la que
       * está mirando lo manda a buscar un problema que no existe.
       */
      if (yaEs.empresaId === empresa.id) {
        throw new ConflictException(
          `${correo} ya está dado de alta en «${empresa.nombreComercial}».`,
        );
      }
      throw new ConflictException(
        `${correo} ya administra «${yaEs.empresa?.nombreComercial ?? 'otra empresa'}». ` +
          'Una persona pertenece a una sola empresa: es lo que impide que vea la cartera de las dos.',
      );
    }

    const administrador = await this.usuarios.save(
      this.usuarios.create({
        empresaId: empresa.id,
        email: correo,
        nombreCompleto: `${datos.nombre} ${datos.apellido}`.trim() || correo,
        // Ver el alta: esto no es un hash, y por eso ninguna contraseña coincide.
        passwordHash: 'sin-acceso-local:identidad-en-el-directorio',
        rol: 'admin',
        activo: true,
        esPropietario: true,
        emailVerificado: false,
        keycloakSubject: null,
      }),
    );

    await this.auditoria.registrar({
      empresaId: empresa.id,
      usuarioEmail: datos.solicitadoPor,
      accion: 'CREAR',
      entidad: 'Usuario',
      registroId: administrador.id,
      valorNuevo: {
        email: administrador.email,
        rol: administrador.rol,
        empresa: empresa.nombreComercial,
        solicitadoPor: datos.solicitadoPor,
        origen: 'consola de aprovisionamiento de SUMA',
      },
      resultado: 'OK',
    });

    return {
      empresa: { id: empresa.id, nombreComercial: empresa.nombreComercial },
      administrador: { id: administrador.id, email: administrador.email, rol: administrador.rol },
    };
  }
}
