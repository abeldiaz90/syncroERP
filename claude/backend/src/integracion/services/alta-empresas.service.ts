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
import { ContextoInquilinoService } from './contexto-inquilino.service';
import { AuditoriaService } from '../../auditoria/services/auditoria.service';
import { CATALOGO_POR_OMISION } from '../../credito/services/productos-credito.service';
import { ProductoCredito, EstadoProductoCredito } from '../../credito/entities/producto-credito.entity';
import { ConfiguracionIntegracionEmpresa } from '../entities/configuracion-integracion-empresa.entity';
import { EstadoTenantReserva, TenantReserva } from '../entities/tenant-reserva.entity';
import { RegistroDelCoreService } from './registro-del-core.service';
import {
  EstadoOrigenCore,
  OrigenCore,
  OrigenCoreEmpresa,
} from '../entities/origen-core.entity';
import { ModoCartera, ModoContabilidad } from '../integracion.constants';
import { plural } from '../../common/plural';

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
 * empresas y enumerar las de todos los demás.
 *
 * La puerta es una CLAVE DE SERVICIO en la cabecera —`APROVISIONAMIENTO_TOKEN`,
 * ver `AltaEmpresasController`— y no una sesión de persona: no se hereda de un
 * token robado, no aparece en un navegador y no depende de qué roles se haya
 * otorgado alguien. Sin esa clave configurada, estas rutas contestan 404 como
 * si no existieran, que es preferible a que la función la tenga cualquiera.
 *
 * Hasta el 22-oct-2026 este párrafo decía que la puerta era
 * `EMPRESA_OPERADORA_ID`. Era de la versión anterior y llevaba tiempo sin ser
 * verdad: esa variable no se lee en ninguna parte del código. Un comentario
 * que describe un control que ya no existe es la misma avería que un control
 * que se cree puesto, sólo que en prosa —y se encontró justamente por fiarse
 * de él para gatear otra cosa—.
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
    /* Para avisar en cuanto una empresa estrena inquilino. Ver `tomarInquilino`. */
    private readonly inquilinos: ContextoInquilinoService,
    /*
     * Dónde está el registro de inquilinos del core y cómo se le habla lo sabe
     * UN solo sitio. Vivía aquí dentro como método privado; desde que también
     * se escribe en él —cuando la base la pone el cliente— tenerlo en dos
     * clases sería tener dos verdades sobre la misma base.
     */
    private readonly registro: RegistroDelCoreService,
    /*
     * De dónde sale la base del core de cada empresa. Se lee en `estado()` y en
     * `listar()` porque una empresa que trae su propia base CONTRATÓ el core y
     * sus dos modos están APAGADOS a propósito hasta que su esquema contesta:
     * sin este renglón, las dos pantallas la daban por «solo ERP».
     */
    @InjectRepository(OrigenCoreEmpresa)
    private readonly origenes: Repository<OrigenCoreEmpresa>,
  ) {}

  /**
   * ¿Esta empresa usa el registro externo?
   *
   * LOS DOS EJES, NO UNO. Esta pregunta se hacía en tres sitios de esta clase
   * mirando sólo la cartera. Hay empresas que contratan el registro externo
   * SÓLO para espejar contabilidad y no mueven cartera —los dos ejes son
   * independientes por diseño, y `IntegracionModoService.usaRegistroExterno`
   * ya pregunta por los dos—. Con la pregunta a medias, una empresa así salía
   * en la consola como «sólo ERP», su punto del inquilino decía «No aplica:
   * opera sólo con el ERP» teniendo uno asignado, y la fila lo enseñaba al
   * lado: dos afirmaciones contrarias en el mismo renglón.
   *
   * Y es un estado alcanzable sin hacer nada raro: basta con que una empresa
   * ERP+core baje su cartera a APAGADO mientras concilia. Con la pregunta a
   * medias, la consola la daba por desligada del core mientras el espejo
   * contable seguía publicando.
   *
   * Es estático para que las tres respuestas sean literalmente la misma.
   */
  private static usaRegistroExterno(
    cfg?: { modo?: ModoCartera | null; modoContabilidad?: ModoContabilidad | null } | null,
  ): boolean {
    return (
      (cfg?.modo ?? ModoCartera.APAGADO) !== ModoCartera.APAGADO ||
      (cfg?.modoContabilidad ?? ModoContabilidad.APAGADO) !== ModoContabilidad.APAGADO
    );
  }

  /**
   * ¿Esta empresa CONTRATÓ el registro externo?
   *
   * EL TERCER EJE. `usaRegistroExterno` pregunta por los dos modos, o sea por
   * lo que ESTÁ FLUYENDO. Es la pregunta correcta para decidir si se publica un
   * hecho, y la equivocada para decir qué contrató el cliente: una empresa que
   * trae su propia base nace con los dos modos APAGADOS a propósito —su
   * inquilino todavía no existe para el core, se construye en el próximo
   * arranque— y se encienden al ACTIVAR su origen.
   *
   * MEDIDO el 21-oct-2026 en vivo sobre «Financiera Onpremise Prueba», dada
   * de alta con su base propia: la lista la enseñaba como «sólo ERP» y su
   * ficha decía «No aplica: esta empresa opera sólo con el ERP» mientras el
   * panel de abajo, en la misma pantalla, le pedía capturar la conexión a su
   * servidor del core. Dos afirmaciones contrarias en la misma ficha, que es
   * justo el defecto que esta familia ya se quitó una vez por mirar un eje de
   * dos; ahora eran dos de tres.
   */
  private static contratoElRegistroExterno(
    cfg?: { modo?: ModoCartera | null; modoContabilidad?: ModoContabilidad | null } | null,
    origen?: { origen?: OrigenCore | null } | null,
  ): boolean {
    return (
      AltaEmpresasService.usaRegistroExterno(cfg) ||
      origen?.origen === OrigenCore.CLIENTE
    );
  }

  // ── Reserva ───────────────────────────────────────────────────────────────

  async estadoReserva() {
    const [disponibles, asignados, retirados] = await Promise.all([
      this.reserva.count({ where: { estado: EstadoTenantReserva.DISPONIBLE } }),
      this.reserva.count({ where: { estado: EstadoTenantReserva.ASIGNADO } }),
      this.reserva.count({ where: { estado: EstadoTenantReserva.RETIRADO } }),
    ]);
    /*
     * ──────────────────────────────────────────────────────────────────────
     * EL INVENTARIO, NO LA LISTA
     *
     * Antes se devolvían los identificadores que el core conoce, a secas, y la
     * consola los imprimía para que alguien los volviera a TECLEAR en una caja
     * de texto. Dos problemas, y los dos costaban trabajo a quien opera:
     *
     *  · Teclear lo que el sistema ya sabe es trabajo que el sistema debería
     *    hacerse a sí mismo, y cada letra es una oportunidad de equivocarse.
     *  · La lista no distinguía cuáles están libres, cuáles ya se registraron y
     *    cuáles se entregaron a una empresa. Así que lo normal era escribir uno
     *    ya asignado y recibir una negativa por algo que la pantalla podía
     *    haber sabido antes de que nadie escribiera nada.
     *
     * Ahora se devuelve el ESTADO de cada uno, y la consola ofrece registrar
     * los que faltan de un golpe. `empresaId` va sin resolver a nombre: la
     * consola ya tiene la lista de empresas y cruzarlo allí ahorra una consulta
     * por inquilino.
     * ──────────────────────────────────────────────────────────────────────
     */
    /*
     * ── Y LOS QUE NO SON NUESTROS ─────────────────────────────────────
     * El registro del core lleva TODOS los inquilinos de la instalación, y
     * desde que una empresa puede traer su propia base, algunos de ellos viven
     * en el servidor del cliente. Para esta pantalla eran «SIN_REGISTRAR».
     *
     * MEDIDO el 21-oct-2026 en vivo: recién anotado `onpremise-prueba` —que
     * vive en la base de «Financiera Onpremise Prueba»— el inventario lo
     * ofrecía en `sinRegistrar`, o sea en el botón que «registra los que
     * faltan de un golpe». Un clic y la reserva de SUMA lo habría dado por
     * DISPONIBLE para entregarlo a la SIGUIENTE empresa que se dé de alta: esa
     * empresa habría acabado leyendo y escribiendo en la base de un cliente
     * ajeno, y nadie se habría enterado hasta que alguien viera cartera que no
     * es suya.
     *
     * Son del cliente, se dicen de quién son, y no se ofrecen.
     */
    const deClientes = new Map<string, string>();
    for (const fila of await this.origenes.find({ where: { origen: OrigenCore.CLIENTE } })) {
      if (fila.inquilino) deClientes.set(fila.inquilino.trim().toLowerCase(), fila.empresaId);
    }

    let inventarioDelCore:
      | Array<{
          identificador: string;
          estado: EstadoTenantReserva | 'SIN_REGISTRAR' | 'BASE_DEL_CLIENTE';
          empresaId: string | null;
        }>
      | null = null;
    let sinRegistrar: string[] = [];
    let motivoRegistro: string | null = null;
    try {
      const conocidos = await this.tenantsDelCore();
      const anotados = await this.reserva.find({ where: { proveedor: 'fineract' } });
      inventarioDelCore = conocidos.map((identificador) => {
        const fila = anotados.find((a) => a.identificador === identificador);
        const deUnCliente = deClientes.get(identificador);
        if (deUnCliente) {
          return {
            identificador,
            estado: 'BASE_DEL_CLIENTE' as const,
            empresaId: deUnCliente,
          };
        }
        return {
          identificador,
          estado: fila?.estado ?? ('SIN_REGISTRAR' as const),
          empresaId: fila?.empresaId ?? null,
        };
      });
      sinRegistrar = inventarioDelCore
        .filter((x) => x.estado === 'SIN_REGISTRAR')
        .map((x) => x.identificador);
    } catch (error) {
      motivoRegistro = error instanceof Error ? error.message : String(error);
    }

    return {
      disponibles,
      asignados,
      retirados,
      inventarioDelCore,
      sinRegistrar,
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
   *
   * La conexión a esa base maestra vive en `RegistroDelCoreService`, que es
   * ahora el único sitio que sabe dónde está y cómo se le habla: desde que
   * también se ESCRIBE en ella —cuando la base del inquilino la pone el
   * cliente— tenerla en dos clases sería tener dos verdades sobre la misma
   * base.
   */
  async tenantsDelCore(): Promise<string[]> {
    return this.registro.tenants();
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
   *
   * 3. Un inquilino que vive en la base de un CLIENTE no entra a la reserva de
   *    SUMA. La reserva existe para repartir inquilinos de la nube de SUMA
   *    entre empresas nuevas; meter ahí el de un cliente es prometer su base a
   *    otra empresa. No basta con no ofrecerlo en la pantalla —esta ruta se
   *    puede llamar sola—, así que se niega aquí, que es donde se escribe.
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

    /*
     * Antes que nada, de quién es. Va ANTES de la comprobación de existencia
     * a propósito: un inquilino de un cliente SÍ existe en el core, así que la
     * otra regla lo dejaría pasar entero.
     */
    const ajenos: string[] = [];
    for (const fila of await this.origenes.find({ where: { origen: OrigenCore.CLIENTE } })) {
      const suyo = (fila.inquilino ?? '').trim().toLowerCase();
      if (suyo && limpios.includes(suyo)) ajenos.push(suyo);
    }
    if (ajenos.length) {
      throw new ConflictException(
        `${ajenos.join(', ')} ${
          ajenos.length === 1 ? 'vive' : 'viven'
        } en la base de un cliente, no en la nube de SUMA. La reserva reparte inquilinos ` +
          'entre empresas nuevas: anotar ahí el de un cliente sería prometerle su base a otra ' +
          'empresa, que acabaría leyendo cartera que no es suya.',
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
    /**
     * De dónde van a salir los datos bancarios de esta empresa.
     *
     * `SUMA` —lo de siempre, y lo que vale si no se dice nada— toma un
     * inquilino de la reserva y la empresa nace hablando con el core en
     * SOMBRA.
     *
     * `CLIENTE` significa que la base la pone el cliente en sus
     * instalaciones. Entonces NO se toca la reserva: ese inquilino todavía no
     * existe en ningún sitio, y gastar uno de los preconstruidos sería
     * regalarlo. La empresa nace con la integración APAGADA y con su renglón
     * de origen en DECLARADO, que es el estado que dice «falta la conexión»
     * con todas sus letras. Se captura, se verifica y se registra después, por
     * sus propias rutas.
     */
    origenCore?: 'SUMA' | 'CLIENTE';
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
      /*
       * Que parezca un correo. Suena obvio hasta que alguien pega el ejemplo
       * del instructivo en lugar del correo: en esta base quedó una empresa
       * cuyo administrador es «el-correo-con-el-que-entras-al-erp», activa y
       * con rol admin. Nadie puede entrar con eso —el directorio jamás va a
       * emitir un token con ese correo— pero la fila se ve igual de sana que
       * cualquier otra, y la empresa cuenta para el aislamiento.
       */
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correoAdmin)) {
        throw new BadRequestException(
          `«${correoAdmin}» no es un correo. El administrador de la empresa se identifica con el mismo correo con el que entra al directorio.`,
        );
      }
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

      const laPoneElCliente = datos.origenCore === 'CLIENTE' && datos.usaFineract;

      let tenant: TenantReserva | null = null;
      if (datos.usaFineract && !laPoneElCliente) {
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

      if (laPoneElCliente) {
        /*
         * El renglón nace aquí y no en la primera captura para que la empresa
         * nunca esté en el limbo: desde el instante en que existe, el sistema
         * puede decir de dónde van a salir sus datos y qué falta para que
         * salgan.
         */
        await em.save(
          em.create(OrigenCoreEmpresa, {
            empresaId: empresa.id,
            origen: OrigenCore.CLIENTE,
            estado: EstadoOrigenCore.DECLARADO,
            registradoPor: datos.solicitadoPor,
          }),
        );
      }

      await em.save(
        em.create(ConfiguracionIntegracionEmpresa, {
          empresaId: empresa.id,
          /*
           * Nace en SOMBRA cuando contrata: el externo registra pero no manda
           * hasta que la conciliación demuestre que los dos sistemas cuadran.
           *
           * Pero si la base la pone el cliente nace APAGADA, y eso no es
           * prudencia: ese inquilino todavía NO EXISTE para el core —se
           * construye en el próximo arranque— así que una empresa en SOMBRA
           * estaría mandándole hechos a una base que no está. Se enciende al
           * activar el origen, cuando el esquema ya contestó.
           */
          modo:
            datos.usaFineract && !laPoneElCliente
              ? ModoCartera.SOMBRA
              : ModoCartera.APAGADO,
          modoContabilidad:
            datos.usaFineract && !laPoneElCliente
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
      /*
       * Y SE DICE si falló. La primera versión lo escribía en el registro del
       * servidor y devolvía el alta como si nada: la consola contestaba «LISTO
       * · Creada» y la empresa quedaba sin productos de crédito, cosa que nadie
       * descubre hasta que alguien intenta vender a crédito semanas después.
       * Un fallo que sólo consta en un log es un fallo que nadie lee.
       */
      const catalogo: { sembrados: number; error: string | null } = {
        sembrados: 0,
        error: null,
      };
      try {
        catalogo.sembrados = await this.sembrarCatalogo(resultado.empresa.id);
      } catch (error) {
        catalogo.error = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `La empresa ${resultado.empresa.id} quedó creada sin catálogo: ${catalogo.error}`,
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

      return { ...resultado, catalogo };
    });
  }

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * Dar inquilino a una empresa que contrató el core y no tiene
   * --------------------------------------------------------------------------
   * Pasa por dos caminos reales: el alta se hizo cuando la reserva estaba
   * vacía y se optó por crear la empresa sólo con el ERP, o —el de esta misma
   * instalación— la empresa se configuró a mano antes de que existiera la
   * consola. En los dos casos la empresa queda diciendo que usa el registro
   * externo y sin inquilino, y la lista de pendientes lo marcaba con esta
   * acción: «Reponer la reserva y asignar uno».
   *
   * ASIGNAR UNO NO SE PODÍA. No había endpoint, ni método, ni pantalla: la
   * reserva sólo entregaba inquilinos dentro del alta. El consejo mandaba a una
   * puerta que no estaba en la pared, y la única salida real era escribir en la
   * base de datos a mano.
   *
   * Las mismas garantías que en el alta, porque es la misma entrega: se toma
   * con `FOR UPDATE SKIP LOCKED` para que dos asignaciones simultáneas no se
   * lleven el mismo renglón, y se escribe el inquilino TAMBIÉN en la
   * configuración de la empresa, que es de donde lo lee el despachador. Anotar
   * sólo la reserva dejaría a la empresa publicando sin inquilino: exactamente
   * el estado del que venimos.
   * ══════════════════════════════════════════════════════════════════════════
   */
  async asignarInquilino(empresaId: string, solicitadoPor: string) {
    const empresa = await this.empresas.findOne({ where: { id: empresaId } });
    if (!empresa) throw new NotFoundException('La empresa no existe.');

    const cfg = await this.configs.findOne({ where: { empresaId } });
    if (!AltaEmpresasService.usaRegistroExterno(cfg)) {
      /*
       * Una empresa que no contrató el registro externo no debe consumir un
       * inquilino: son escasos —reponerlos exige reiniciar el core— y el suyo
       * se lo estaría quitando a un cliente que sí lo compró.
       */
      throw new ConflictException(
        `«${empresa.nombreComercial}» no tiene contratado el registro externo, así que no necesita ` +
          'inquilino. Los inquilinos son escasos: dárselo sería quitárselo a un cliente que sí lo contrató.',
      );
    }

    const yaTiene = await this.reserva.findOne({
      where: { empresaId, estado: EstadoTenantReserva.ASIGNADO },
    });
    if (yaTiene) {
      throw new ConflictException(
        `«${empresa.nombreComercial}» ya tiene el inquilino ${yaTiene.identificador}. ` +
          'Un inquilino usado no se cambia: el core conserva la cartera de quien lo usó.',
      );
    }

    return this.ds.transaction(async (em) => {
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
          'No hay inquilinos disponibles en la reserva. Hay que reponerla en la próxima ventana de ' +
            'mantenimiento del core: sólo construye el esquema de un inquilino al arrancar.',
        );
      }
      const tenant = await em.findOne(TenantReserva, { where: { id: fila.id } });
      if (!tenant) throw new ConflictException('No se pudo tomar el inquilino de la reserva.');
      tenant.estado = EstadoTenantReserva.ASIGNADO;
      tenant.empresaId = empresaId;
      tenant.asignadoEn = new Date();
      tenant.nota = `Asignado a «${empresa.nombreComercial}» a solicitud de ${solicitadoPor}.`;
      await em.save(tenant);

      const configuracion = await em.findOne(ConfiguracionIntegracionEmpresa, {
        where: { empresaId },
      });
      if (configuracion) {
        configuracion.parametrosProveedor = {
          ...(configuracion.parametrosProveedor ?? {}),
          tenant: tenant.identificador,
        };
        await em.save(configuracion);
        /*
         * ────────────────────────────────────────────────────────────────────
         * EL CACHÉ NO SE ENTERA SOLO
         * --------------------------------------------------------------------
         * `ContextoInquilinoService` guarda por un minuto el inquilino de cada
         * empresa y el reparto de empresas por inquilino. Sin este aviso, la
         * empresa que acaba de estrenar inquilino sigue pareciendo, durante ese
         * minuto, una empresa sin él.
         *
         * Antes eso significaba escribir en el inquilino global —el libro de
         * otra—. Ahora, con el control de mezcla, significa además que el ERP
         * puede negarse a operar justo después de que alguien arreglara la
         * configuración desde la consola, que es el peor momento para dar un
         * error que ya no es cierto.
         * ────────────────────────────────────────────────────────────────────
         */
        this.inquilinos.invalidar(empresaId);
      }

      await this.auditoria.registrar({
        empresaId,
        usuarioEmail: solicitadoPor,
        accion: 'ACTUALIZAR',
        entidad: 'TenantReserva',
        registroId: tenant.id,
        valorNuevo: {
          inquilino: tenant.identificador,
          empresa: empresa.nombreComercial,
          solicitadoPor,
          origen: 'consola de aprovisionamiento de SUMA',
        },
        resultado: 'OK',
      });

      return { empresa: { id: empresa.id, nombreComercial: empresa.nombreComercial }, tenant: tenant.identificador };
    });
  }

  /**
   * Siembra el catálogo de una empresa que se quedó sin él.
   *
   * Es el remedio del fallo de arriba, y existe porque nombrarlo sin ofrecerlo
   * sería mandar a alguien a una puerta que no está en la pared: la única
   * alternativa era entrar al ERP con una cuenta de esa empresa a crear los
   * productos a mano. Es idempotente —salta los códigos que ya existen— así
   * que pulsarlo dos veces no duplica nada.
   */
  async sembrarCatalogoDe(empresaId: string): Promise<{ sembrados: number; total: number }> {
    const empresa = await this.empresas.findOne({ where: { id: empresaId } });
    if (!empresa) throw new NotFoundException('La empresa no existe.');
    const sembrados = await this.sembrarCatalogo(empresaId);
    const total = await this.productos.count({ where: { empresaId } });
    return { sembrados, total };
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
    const origen = await this.origenes.findOne({ where: { empresaId } });
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
    const cuentas = await this.usuarios.find({
      where: { empresaId },
      order: { email: 'ASC' },
    });
    const totalUsuarios = cuentas.length;
    /*
     * ──────────────────────────────────────────────────────────────────────
     * CUÁNTAS PERSONAS PUEDEN ENTRAR, NO CUÁNTAS FILAS HAY
     *
     * El punto «Usuario administrador» se daba por LISTO con `totalUsuarios >
     * 0`, o sea contando cuentas DADAS DE BAJA igual que las vivas. La lista de
     * empresas, dos pantallas más arriba, cuenta `u.activo = true` y su propio
     * comentario lo dice: «cuántas personas pueden entrar a cada empresa».
     *
     * Las dos medían la misma pregunta y contestaban distinto. Medido en vivo
     * el 6-oct sobre EMPRESA B PRUEBA AISLAMIENTO: la fila enseñaba la pastilla
     * «nadie puede entrar» y, al abrirla, el punto decía «LISTO · 1 usuario(s)
     * en el ERP». Quien abre la empresa es justamente quien quiere saber qué le
     * falta, y se le contestaba que no le falta nada.
     *
     * Y no era cosmético: `accionAutomatica` sólo ofrece DAR_ADMINISTRADOR
     * cuando el punto está en rojo. Con una cuenta inactiva, la empresa quedaba
     * inalcanzable Y la consola escondía el único botón que lo arregla.
     *
     * Se cuenta lo que la pregunta dice, y cuando los dos números no coinciden
     * se dicen los dos: «1 cuenta, ninguna activa» no se puede leer como «hay
     * administrador».
     * ──────────────────────────────────────────────────────────────────────
     */
    const puedenEntrar = cuentas.filter((u) => u.activo).length;

    /*
     * ──────────────────────────────────────────────────────────────────────
     * LOS DOS EJES, NO UNO
     *
     * Esto miraba sólo la cartera. Hay empresas que contratan el registro
     * externo SÓLO para espejar contabilidad y no mueven cartera —los dos ejes
     * son independientes por diseño, y `usaRegistroExterno` en el ERP ya
     * pregunta por los dos—. Con la pregunta a medias, una empresa así salía
     * en la consola como «sólo ERP», su punto del inquilino decía «No aplica:
     * opera sólo con el ERP» teniendo uno asignado, y la fila la enseñaba al
     * lado: dos afirmaciones contrarias en el mismo renglón.
     *
     * Y es un estado alcanzable sin hacer nada raro: basta con que una empresa
     * ERP+core baje su cartera a APAGADO durante una conciliación. Con la
     * pregunta a medias, la consola la daba por desligada del core mientras el
     * espejo contable seguía publicando.
     * ──────────────────────────────────────────────────────────────────────
     */
    const laBaseLaPoneElCliente = origen?.origen === OrigenCore.CLIENTE;
    const usaFineract = AltaEmpresasService.contratoElRegistroExterno(cfg, origen);
    const espejaContabilidad =
      (cfg?.modoContabilidad ?? ModoContabilidad.APAGADO) !== ModoContabilidad.APAGADO;
    /* Si hay algo que entregar, el consejo cambia; ver el punto del inquilino. */
    const librePorEntregar = await this.reserva.count({
      where: { estado: EstadoTenantReserva.DISPONIBLE },
    });

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
      /*
       * Quiénes pueden entrar, por nombre. El punto de la lista decía «2
       * usuario(s)» y con eso no se puede hacer nada: para reenviarle la
       * invitación a alguien hay que saber a quién, y la consola no tenía de
       * dónde sacarlo salvo preguntándole a la empresa. No va el hash ni nada
       * que se le parezca; sólo lo que hace falta para actuar.
       */
      cuentas: cuentas.map((u) => ({
        id: u.id,
        email: u.email,
        nombreCompleto: u.nombreCompleto,
        rol: u.rol,
        activo: u.activo,
        /*
         * Una cuenta creada por el alta no tiene acceso local: su contraseña
         * vive en el directorio. Se dice, porque explica por qué «reenviar la
         * invitación» es la única forma de que esa persona entre.
         */
        accesoLocal: !String(u.passwordHash ?? '').startsWith('sin-acceso-local:'),
      })),
      puntos: [
        {
          clave: 'catalogo',
          titulo: 'Catálogo de crédito',
          /*
           * ────────────────────────────────────────────────────────────────
           * «NO APLICA» NO ES «LISTO»
           *
           * Los cuatro puntos sólo tenían `listo`, así que los dos que no le
           * tocan a una empresa «sólo ERP» salían con la misma palomita verde
           * que los medidos de verdad. Cuatro verdes donde se midieron dos: el
           * panel se lee como una empresa completa, y quien lo mira no puede
           * distinguir «se comprobó y está bien» de «aquí no había nada que
           * comprobar». Es la misma avería que se persigue en el ERP —un
           * control que se cree puesto— con el verde de otro.
           *
           * `aplica` separa las dos cosas. Un punto que no aplica no cuenta
           * para el verde ni para el rojo: se dice en neutro y ya.
           * ────────────────────────────────────────────────────────────────
           */
          aplica: true,
          listo: catalogo.length > 0,
          detalle: catalogo.length
            ? `${plural(catalogo.length, 'producto', 'productos')}.`
            : 'Sin productos: no se puede vender a crédito.',
          accion: catalogo.length
            ? null
            : 'Sembrar el catálogo por omisión. Son los productos ya probados; los que capture la empresa nacen en borrador y pasan por verificación.',
          /*
           * Lo que la consola puede hacer por quien opera, en vez de explicarle
           * a dónde ir. Cada clave tiene su ruta de servicio; una acción sin
           * ruta no se declara aquí, porque un botón que no lleva a ningún
           * sitio es peor que una instrucción.
           */
          accionAutomatica: catalogo.length ? null : 'SEMBRAR_CATALOGO',
        },
        {
          clave: 'usuarios',
          titulo: 'Usuario administrador',
          aplica: true,
          listo: puedenEntrar > 0,
          detalle: puedenEntrar
            ? `${plural(puedenEntrar, 'usuario activo', 'usuarios activos')} en el ERP` +
              (totalUsuarios > puedenEntrar
                ? `, de ${plural(totalUsuarios, 'cuenta', 'cuentas')} en total.`
                : '.')
            : totalUsuarios
              ? `Nadie puede entrar: hay ${plural(totalUsuarios, 'cuenta', 'cuentas')}, ninguna activa.`
              : 'Nadie puede entrar todavía a esta empresa.',
          accion: puedenEntrar
            ? null
            : 'Invitar al administrador. Recibe un enlace y define su propia contraseña; nadie más la ve.',
          accionAutomatica: puedenEntrar ? null : 'DAR_ADMINISTRADOR',
        },
        {
          clave: 'tenant',
          titulo: 'Inquilino en el registro externo',
          aplica: usaFineract,
          /*
           * Una empresa que trae su base NO toma inquilino de la reserva: su
           * esquema vive en su servidor. El punto se da por resuelto cuando su
           * origen está ACTIVO, y nunca ofrece entregarle uno de los nuestros
           * —hacerlo le daría un inquilino de la nube de SUMA que no compró, y
           * ésa es precisamente la clase de botón que no puede estar aquí--.
           */
          listo: laBaseLaPoneElCliente
            ? origen?.estado === EstadoOrigenCore.ACTIVO
            : !usaFineract || Boolean(tenant),
          detalle: laBaseLaPoneElCliente
            ? origen?.estado === EstadoOrigenCore.ACTIVO
              ? 'No toma inquilino de la reserva: su base la pone el cliente y su origen ya está activo.'
              : 'Su base la pone el cliente: el inquilino vive en el servidor de la institución, no en la reserva de SUMA. Falta terminar el alta de su origen, en el panel de abajo.'
            : !usaFineract
              ? 'No aplica: esta empresa opera sólo con el ERP.'
              : tenant
                ? `Asignado: ${tenant.identificador}.`
                : 'Contrató el registro externo y no tiene inquilino.',
          /*
           * El consejo depende de si HAY inquilinos, y antes no: decía siempre
           * «reponer la reserva y asignar uno» aunque hubiera cinco libres, y
           * asignar uno era justamente lo que no se podía hacer desde ninguna
           * parte. Ahora, si hay, se entrega de un clic; si no hay, se dice que
           * el core tiene que construirlos al arrancar, que es la verdad y no
           * tiene botón.
           */
          accion: laBaseLaPoneElCliente
            ? origen?.estado === EstadoOrigenCore.ACTIVO
              ? null
              : 'Capturar y verificar la conexión a su servidor, en el panel de abajo. No se le entrega un inquilino de la reserva.'
            : usaFineract && !tenant
              ? librePorEntregar
                ? 'Entregarle uno de los que están libres en la reserva.'
                : 'La reserva está vacía: hay que preparar inquilinos nuevos en la próxima ventana de mantenimiento del core, que sólo construye el esquema al arrancar.'
              : null,
          accionAutomatica:
            !laBaseLaPoneElCliente && usaFineract && !tenant && librePorEntregar
              ? 'ASIGNAR_INQUILINO'
              : null,
        },
        /*
         * Este punto exigía AUTORIDAD para darse por hecho, y AUTORIDAD ya no
         * se concede: nadie la ejerce —ver `un-modo-que-no-cambia-nada.spec.ts`
         * y la negativa de `establecerModoCartera`—. Un punto de lista que no
         * se puede marcar nunca es una empresa que jamás sale como terminada, y
         * eso enseña a ignorar la lista entera.
         *
         * Lo que de verdad hay que alcanzar para que la integración sirva es
         * SOMBRA: desde ahí se publica, se refleja y se concilia. Se marca eso,
         * y el detalle explica el grado siguiente sin fingir que está a mano.
         */
        /*
         * Este punto habla de la CARTERA, así que pregunta por su eje y no por
         * el conjunto. Lo que sí cambió es qué se dice cuando está apagada:
         * antes ordenaba «Súbela a SOMBRA» a cualquiera que tocara el core, y
         * una empresa que contrató SÓLO el espejo contable no tiene ninguna
         * cartera que subir. Ordenarle un cambio de modo que nadie compró es
         * la misma avería de siempre vista al revés: una lista que manda a
         * hacer algo que no toca se deja de leer entera.
         */
        {
          clave: 'conciliacion',
          titulo: 'Cartera enlazada con el registro externo',
          aplica: usaFineract,
          listo:
            !usaFineract ||
            (cfg?.modo ?? ModoCartera.APAGADO) !== ModoCartera.APAGADO ||
            espejaContabilidad,
          detalle: !usaFineract
            ? 'No aplica: esta empresa opera sólo con el ERP.'
            : laBaseLaPoneElCliente &&
                (cfg?.modo ?? ModoCartera.APAGADO) === ModoCartera.APAGADO &&
                !espejaContabilidad
              ? 'Apagada a propósito: su inquilino todavía no existe para el core ' +
                '—se construye en el próximo arranque—, así que publicar ahora sería ' +
                'mandarle hechos a una base que no está. Los dos modos se encienden ' +
                'al ACTIVAR su origen, no a mano.'
            : (cfg?.modo ?? ModoCartera.APAGADO) !== ModoCartera.APAGADO
              ? 'En SOMBRA: se publica, se refleja y se concilia, el registro ' +
                'externo es la fuente de verdad del registro y la decisión de ' +
                'vender a crédito se toma en el ERP. Es el modo integrado y no ' +
                'hay otro por encima: AUTORIDAD está retirada.'
              : espejaContabilidad
                ? 'Esta empresa espeja contabilidad y NO cartera: sus créditos ' +
                  'viven enteros en el ERP y no se publican. Es una contratación ' +
                  'legítima, no un pendiente.'
                : 'La cartera no se publica ni se concilia. Súbela a SOMBRA.',
          accion:
            usaFineract &&
            !laBaseLaPoneElCliente &&
            !espejaContabilidad &&
            (cfg?.modo ?? ModoCartera.APAGADO) === ModoCartera.APAGADO
              ? 'Subir el modo de cartera a SOMBRA.'
              : laBaseLaPoneElCliente && origen?.estado !== EstadoOrigenCore.ACTIVO
                ? 'Activar su origen cuando su base tenga el esquema del core: al activarlo los dos modos suben solos.'
                : null,
          accionAutomatica: null,
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
    const origenes = await this.origenes.find();
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
      const origen = origenes.find((o) => o.empresaId === e.id) ?? null;
      return {
        id: e.id,
        nombreComercial: e.nombreComercial,
        rfc: e.rfc,
        activo: e.activo,
        modo: cfg?.modo ?? ModoCartera.APAGADO,
        /*
         * Los DOS modos, no sólo el de cartera. La fila decía «ERP + core ·
         * modo APAGADO» para una empresa que espeja contabilidad, que se lee
         * como una avería y es su contratación.
         */
        modoContabilidad: cfg?.modoContabilidad ?? ModoContabilidad.APAGADO,
        // Los tres ejes; ver `contratoElRegistroExterno` y por qué mirar dos engañaba.
        usaFineract: AltaEmpresasService.contratoElRegistroExterno(cfg, origen),
        /*
         * De dónde sale su base del core, para que la fila no se lea «cartera
         * APAGADO · sin inquilino» —que parece una avería— cuando lo que
         * pasa es que su base la pone el cliente y todavía no contestó.
         */
        origenCore: origen?.origen ?? null,
        estadoOrigenCore: origen?.estado ?? null,
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
    // La misma vara que en el alta: un «@» suelto no basta.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) {
      throw new BadRequestException(`«${correo}» no es un correo.`);
    }

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
