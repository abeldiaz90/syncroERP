import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Usuario } from '../../iam/entities/usuario.entity';
import { normalizarRol } from '../../iam/utils/roles.util';
import { ROL_ADMINISTRADOR } from '../../iam/utils/roles-catalogo';
import { PLANTILLAS_PERMISOS } from '../../iam/data/plantillas-permisos';
import { PUERTO_USUARIOS_EXTERNOS, TipoVinculo } from '../integracion.constants';
import { ConfiguracionIntegracionEmpresa } from '../entities/configuracion-integracion-empresa.entity';
import { MapeoRolExterno } from '../entities/mapeo-rol-externo.entity';
import { PuertoUsuariosExternos } from '../ports/usuarios-externos.port';
import { IntegracionVinculosService } from './integracion-vinculos.service';
import { IntegracionModoService } from './integracion-modo.service';
import { DirectorioIdentidadService } from '../../iam/services/directorio-identidad.service';

export interface EstadoUsuarioExterno {
  usuarioId: string;
  email: string;
  rolErp: string;
  mapeado: boolean;
  /**
   * Si existe en el core. `null` es «no se pudo preguntar»: el core no
   * contestó, o contestó que quien pregunta no tiene autoridad para mirar.
   * Tratarlo como «no existe» invita a darlo de alta otra vez, que es la peor
   * reacción posible ante un core que no responde.
   */
  existeEnExterno: boolean | null;
  idExterno: string | null;
  rolesExternos: string[];
  /**
   * Si existe en el directorio (Keycloak). `null` significa «no se pudo
   * preguntar», que no es lo mismo que «no existe».
   */
  enDirectorio?: boolean | null;
  /** Si el directorio lo tiene deshabilitado aunque exista. */
  habilitadoEnDirectorio?: boolean | null;
  /** La oficina en la que vive ese operador del otro lado, si existe. */
  oficinaExterna?: string | null;
  /** La oficina que le toca a esta empresa. Null si nadie la ha configurado. */
  oficinaEsperada?: string | null;
  /**
   * Qué habría que hacer para que este usuario opere en los dos sistemas.
   *
   * `SIN_OFICINA` y `OTRA_OFICINA` no son estados de trámite, son avisos: en el
   * core la oficina es lo que separa a una empresa de otra, así que un operador
   * en la oficina equivocada ve una cartera que no es la suya.
   */
  accion:
    | 'NINGUNA'
    | 'MAPEAR_ROL'
    | 'DAR_DE_ALTA'
    | 'CORREGIR_ROLES'
    | 'SIN_OFICINA'
    | 'OTRA_OFICINA'
    | 'NO_EXISTE_EN_DIRECTORIO'
    | 'CORE_NO_DISPONIBLE';
}

/**
 * Coherencia de identidad entre el ERP y el registro externo.
 *
 * El ERP ya reenvía el token del usuario en las consultas, pero eso sólo sirve
 * si esa persona existe también del otro lado: Fineract corre con
 * `AUTO_CREATE_USER=false`. Este servicio cierra ese hueco — mapea los roles y
 * aprovisiona a los usuarios que hagan falta.
 *
 * Lo que NO hace es aprovisionar solo. Dar de alta operadores en un core
 * bancario es una decisión de una persona con responsabilidad, no un efecto
 * secundario de que alguien entre al ERP.
 */
@Injectable()
export class RolesExternosService {
  private readonly logger = new Logger(RolesExternosService.name);

  constructor(
    @InjectRepository(MapeoRolExterno)
    private readonly mapeos: Repository<MapeoRolExterno>,
    @InjectRepository(Usuario)
    private readonly usuarios: Repository<Usuario>,
    @InjectRepository(ConfiguracionIntegracionEmpresa)
    private readonly configEmpresa: Repository<ConfiguracionIntegracionEmpresa>,
    private readonly vinculos: IntegracionVinculosService,
    private readonly directorio: DirectorioIdentidadService,
    private readonly modos: IntegracionModoService,
    @Inject(PUERTO_USUARIOS_EXTERNOS)
    private readonly externos: PuertoUsuariosExternos,
  ) {}

  /**
   * Roles del ERP, para armar la pantalla de mapeo.
   *
   * Va primero ADMIN, que no tiene plantilla porque no la necesita: salta la
   * tabla de permisos entera. Se quedaba fuera de esta lista y el resultado
   * era que el diagnostico pedia mapear el rol del unico usuario real y la
   * pantalla de mapeo no lo ofrecia. Un rol que existe y no se puede mapear
   * es peor que no tenerlo.
   */
  rolesErp(): { rol: string; etiqueta: string; descripcion: string }[] {
    return [
      {
        rol: normalizarRol(ROL_ADMINISTRADOR),
        etiqueta: 'Administrador',
        descripcion:
          'Puede todo en el ERP: no pasa por la tabla de permisos. Mapealo con cuidado.',
      },
      ...PLANTILLAS_PERMISOS.map((p) => ({
        rol: normalizarRol(p.rol),
        etiqueta: p.etiqueta,
        descripcion: p.descripcion,
      })),
    ];
  }

  rolesExternos() {
    return this.externos.rolesDisponibles();
  }

  /**
   * Crea en el registro externo un rol espejo por cada rol del ERP que no
   * tenga uno con ese nombre, y deja la correspondencia hecha.
   *
   * Existe porque sin esto el mapeo no puede significar nada: recien montado,
   * el core sólo trae «Super user», «Self Service User» y la cuenta técnica.
   * Mapear cualquier rol del ERP contra ese catálogo es mapearlo a Super user,
   * y un cajero acabaría pudiendo cerrar el periodo.
   *
   * Los roles nacen SIN permisos, a propósito. El ERP propone la
   * correspondencia; qué puede hacer cada rol dentro del core lo decide quien
   * conoce el core. Un rol inerte es visible y auditable; un rol con permisos
   * adivinados no se nota hasta que alguien los usa.
   *
   * No pisa lo que ya existe: si allá ya hay un rol con ese nombre, se reutiliza.
   */
  async crearRolesEspejo(empresaId: string, simular = false) {
    await this.exigirContratado(empresaId);
    const existentes = await this.externos.rolesDisponibles();
    const porNombre = new Map(
      existentes.map((r) => [normalizarRol(r.nombre), r]),
    );

    const creados: { rol: string; idExterno: string }[] = [];
    const reutilizados: { rol: string; idExterno: string }[] = [];
    const problemas: { rol: string; motivo: string }[] = [];

    for (const r of this.rolesErp()) {
      const yaEsta = porNombre.get(normalizarRol(r.etiqueta)) ?? porNombre.get(r.rol);
      if (yaEsta) {
        reutilizados.push({ rol: r.rol, idExterno: String(yaEsta.id) });
        if (!simular) {
          await this.guardarMapeo(empresaId, {
            rolErp: r.rol,
            rolesExternos: [String(yaEsta.id)],
            descripcionExterna: yaEsta.nombre,
          });
        }
        continue;
      }
      if (simular) {
        creados.push({ rol: r.rol, idExterno: '(se crearia)' });
        continue;
      }
      try {
        const id = await this.externos.crearRol({
          nombre: r.etiqueta,
          descripcion: `${r.descripcion} · Espejo del rol ${r.rol} de SyncroERP. Sin permisos: asignalos aqui.`,
        });
        await this.guardarMapeo(empresaId, {
          rolErp: r.rol,
          rolesExternos: [id],
          descripcionExterna: r.etiqueta,
        });
        creados.push({ rol: r.rol, idExterno: id });
      } catch (e) {
        problemas.push({
          rol: r.rol,
          motivo: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return {
      simulacion: simular,
      creados,
      reutilizados,
      problemas,
      aviso:
        'Los roles espejo nacen SIN permisos. Asignaselos en el core antes de que alguien opere con ellos.',
    };
  }

  async listarMapeo(empresaId: string): Promise<MapeoRolExterno[]> {
    return this.mapeos.find({ where: { empresaId }, order: { rolErp: 'ASC' } });
  }

  async guardarMapeo(
    empresaId: string,
    datos: {
      rolErp: string;
      rolesExternos: string[];
      descripcionExterna?: string | null;
    },
  ): Promise<MapeoRolExterno> {
    const rolErp = normalizarRol(datos.rolErp);
    const existente = await this.mapeos.findOne({
      where: { empresaId, rolErp },
    });

    const fila =
      existente ?? this.mapeos.create({ empresaId, rolErp, rolesExternos: [] });
    fila.rolesExternos = datos.rolesExternos;
    fila.descripcionExterna = datos.descripcionExterna ?? null;
    fila.proveedor = this.externos.proveedor;
    fila.activo = true;

    return this.mapeos.save(fila);
  }

  /**
   * Diagnóstico: qué usuarios del ERP pueden operar de verdad contra el
   * registro externo y qué le falta a cada uno. Es la pantalla que evita
   * descubrir el problema el día que alguien no puede trabajar.
   */
  /**
   * Corta en seco lo que no debería existir para esta empresa.
   *
   * La correspondencia de roles solo tiene sentido cuando hay dos sistemas que
   * corresponder. Para una empresa que solo usa el ERP, aprovisionar operadores
   * en el core no es un error de configuración: es una operación que no le
   * pertenece, y hacerla crearía usuarios en un registro que no contrató.
   */
  private async exigirContratado(empresaId: string) {
    if (!(await this.modos.usaRegistroExterno(empresaId))) {
      throw new ForbiddenException(
        'Esta empresa no tiene contratado el registro financiero externo. ' +
          'La correspondencia de roles y usuarios solo aplica a las que operan con el core.',
      );
    }
  }

  async diagnostico(empresaId: string): Promise<EstadoUsuarioExterno[]> {
    // Sin core contratado no hay nada que diagnosticar, y una lista vacía dice
    // eso mejor que un error: la pantalla ni siquiera debería estar abierta.
    if (!(await this.modos.usaRegistroExterno(empresaId))) return [];

    const usuarios = await this.usuarios.find({
      where: { empresaId, activo: true },
    });
    const mapeos = await this.listarMapeo(empresaId);
    const porRol = new Map(mapeos.map((m) => [m.rolErp, m]));
    const cfg = await this.configEmpresa.findOne({ where: { empresaId } });
    const oficinaEsperada = cfg?.oficinaContableExterna ?? null;

    const salida: EstadoUsuarioExterno[] = [];

    for (const u of usuarios) {
      const rolErp = normalizarRol(u.rol);
      const mapeo = porRol.get(rolErp);
      const idExterno = await this.vinculos.idExterno(
        empresaId,
        TipoVinculo.USUARIO,
        u.id,
      );

      /*
       * Los tres sistemas en una sola fila. El orden de las preguntas no es
       * casual: si la persona no existe en el directorio, no puede entrar ni al
       * ERP, así que da igual lo bien mapeada que esté del otro lado.
       */
      const identidad = await this.directorio.buscarPorCorreo(u.email);
      const enDirectorio = identidad === undefined ? null : identidad !== null;
      const habilitadoEnDirectorio =
        identidad === undefined || identidad === null ? null : identidad.habilitado;

      let existe: boolean | null = null;
      let rolesActuales: string[] = [];
      let oficinaExterna: string | null = null;
      if (this.externos.proveedor === 'ninguno') {
        existe = false;
      } else {
        try {
          const remoto = await this.externos.buscarUsuario(u.email);
          existe = remoto !== null;
          rolesActuales = remoto?.roles.map((r) => r.id) ?? [];
          oficinaExterna = remoto?.oficinaIdExterna ?? null;
        } catch (error) {
          // Se queda en null a propósito: no sabemos si existe.
          this.logger.warn(
            `No se pudo consultar a ${u.email} en el registro externo: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      const esperados = mapeo?.rolesExternos ?? [];
      const rolesCoinciden =
        esperados.length > 0 &&
        esperados.every((r) => rolesActuales.includes(r));

      salida.push({
        usuarioId: u.id,
        email: u.email,
        rolErp,
        mapeado: esperados.length > 0,
        existeEnExterno: existe,
        idExterno,
        rolesExternos: rolesActuales,
        enDirectorio,
        habilitadoEnDirectorio,
        oficinaExterna,
        oficinaEsperada,
        /*
         * El orden importa: primero lo que impide operar bien, después lo que
         * impide operar. Un operador que existe pero en otra oficina es peor
         * que uno que no existe, porque parece que todo está en orden.
         */
        accion: enDirectorio === false
          ? 'NO_EXISTE_EN_DIRECTORIO'
          : existe === null
            ? 'CORE_NO_DISPONIBLE'
            : !oficinaEsperada
              ? 'SIN_OFICINA'
              : existe && oficinaExterna && oficinaExterna !== oficinaEsperada
                ? 'OTRA_OFICINA'
                : !mapeo
                  ? 'MAPEAR_ROL'
                  : !existe
                    ? 'DAR_DE_ALTA'
                    : rolesCoinciden
                      ? 'NINGUNA'
                      : 'CORREGIR_ROLES',
      });
    }

    return salida;
  }

  /**
   * ==========================================================================
   * Garantizar roles SUMA; nunca reemplaza
   * --------------------------------------------------------------------------
   * El PUT de Fineract reemplaza la lista entera de roles. Eso ya costó una
   * vez: al «corregir roles» sobre un administrador que operaba bien, el core
   * se quedó contestando «User has no authority to READ roles» —la corrección
   * le quitó la autoridad que tenía—. La lección se escribió en
   * `aprovisionar`, y su hermana `aprovisionarCuentaServicio` siguió mandando
   * el PUT crudo dos años: la misma decision escrita dos veces, y solo una
   * copia aprendio.
   *
   * Importa mas alla de aquel susto. Hay instalaciones donde Fineract es el
   * sistema de registro y su administrador reparte alli la autoridad: un
   * boton del ERP que reemplaza la lista se lleva por delante lo que
   * concedieron en un sistema que no es suyo, y sin dejar constancia.
   *
   * El ERP no sabe, ni puede saber, que autoridad bancaria necesita alguien
   * dentro del core. Solo garantiza que esten los roles que su mapa promete.
   * Quitar uno es una decision de quien administra el core, y se hace alla, a
   * proposito y a la vista.
   * ==========================================================================
   */
  private async garantizarRoles(
    idExterno: string,
    aQuienBuscar: string,
    deseados: string[],
    actualesCrudos: { id: string | number }[],
  ): Promise<{ agregados: string[] }> {
    const actuales = actualesCrudos.map((r) => String(r.id));
    const union = Array.from(new Set([...actuales, ...deseados.map(String)]));
    const faltantes = union.filter((r) => !actuales.includes(r));
    if (faltantes.length === 0) return { agregados: [] };

    await this.externos.asignarRoles(idExterno, union);

    // Comprobar que quedó como se pidió. Un PUT que responde 200 y deja al
    // usuario sin roles es exactamente lo que pasó una vez.
    const despues = await this.externos.buscarUsuario(aQuienBuscar);
    const quedaron = (despues?.roles ?? []).map((r) => String(r.id));
    const perdidos = actuales.filter((r) => !quedaron.includes(r));
    if (perdidos.length > 0) {
      this.logger.error(
        `El registro externo se quedó sin los roles ${perdidos.join(', ')} ` +
          `de ${aQuienBuscar} después de corregirlos. Revísalo allá.`,
      );
    }
    return { agregados: faltantes };
  }

  /**
   * Da de alta en el registro externo la CUENTA DE SERVICIO del propio ERP.
   *
   * Resuelve un círculo vicioso: Fineract corre con `AUTO_CREATE_USER=false`,
   * así que rechaza el token de la cuenta de servicio hasta que exista un
   * usuario suyo con ese nombre — pero para crearlo hacía falta poder
   * autenticarse. La salida es que esta operación viaja con el token de la
   * persona que la dispara, que sí existe del otro lado.
   *
   * Es la operación que convierte «montar el core» en un botón.
   */
  async aprovisionarCuentaServicio(
    empresaId: string,
    rolesExternos: string[],
  ) {
    /*
     * Faltaba aquí y estaba en las tres hermanas (`crearRolesEspejo`,
     * `aprovisionar`, `diagnostico`). Sin esto, una empresa con los dos ejes en
     * APAGADO —que no contrató el core— creaba o modificaba el usuario de
     * servicio en el registro externo: escritura en un sistema que no es suyo.
     */
    await this.exigirContratado(empresaId);
    if (rolesExternos.length === 0) {
      throw new NotFoundException(
        'Hay que indicar con qué roles del registro externo opera la cuenta de servicio.',
      );
    }

    const usuario = await this.externos.usuarioDeServicio();
    if (!usuario) {
      throw new NotFoundException(
        'El proveedor no usa cuenta de servicio, o no está configurada con OAuth2.',
      );
    }

    const existente = await this.externos.buscarUsuario(usuario);
    if (existente) {
      /*
       * Aquí iba el PUT crudo, que reemplaza. La cuenta de servicio es del
       * ERP, sí, pero el usuario que la representa vive en el core y allá
       * puede tener autoridad que alguien le concedió a propósito: en una
       * instalación donde Fineract es el sistema de registro, ese alguien no
       * es el ERP. Se garantiza lo del mapa y se respeta lo demás.
       */
      const { agregados } = await this.garantizarRoles(
        existente.id,
        usuario,
        rolesExternos,
        existente.roles ?? [],
      );
      return {
        accion: agregados.length > 0 ? 'ROLES_ACTUALIZADOS' : 'YA_ESTABA',
        usuario,
        idExterno: existente.id,
        rolesAgregados: agregados,
      };
    }

    const cfg = await this.configEmpresa.findOne({ where: { empresaId } });
    /*
     * La oficina no se inventa. Decía `?? '1'` —la Head Office—, el mismo
     * atajo que ya se quitó de `aprovisionar` unas líneas más arriba: un valor
     * por omisión que mezcla empresas no es un valor por omisión.
     */
    if (!cfg?.oficinaContableExterna) {
      throw new NotFoundException(
        'La empresa no tiene oficina asignada en el registro externo. ' +
          'Configúrala antes de crear la cuenta de servicio.',
      );
    }
    const idExterno = await this.externos.crearUsuario({
      usuario,
      // El correo no se usa para nada: la autenticación va por el emisor de
      // identidad. Se manda porque el proveedor lo exige.
      email: `${usuario}@integracion.local`,
      nombre: 'SyncroERP',
      apellido: 'Integracion',
      oficinaIdExterna: cfg.oficinaContableExterna,
      rolesExternos,
    });

    return { accion: 'CREADA', usuario, idExterno };
  }

  /**
   * Da de alta al usuario del ERP en el registro externo, o corrige sus roles
   * si ya existe. Lo dispara una persona desde la pantalla de administración.
   */
  async aprovisionar(empresaId: string, usuarioId: string) {
    await this.exigirContratado(empresaId);
    const usuario = await this.usuarios.findOne({
      where: { id: usuarioId, empresaId, activo: true },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado.');

    const rolErp = normalizarRol(usuario.rol);
    const mapeo = await this.mapeos.findOne({
      where: { empresaId, rolErp, activo: true },
    });
    if (!mapeo || mapeo.rolesExternos.length === 0) {
      throw new NotFoundException(
        `El rol ${rolErp} no está mapeado a ningún rol del registro externo.`,
      );
    }

    /*
     * La oficina no se adivina.
     *
     * Aquí decía `cfg?.oficinaContableExterna ?? '1'`, y el 1 de Fineract es la
     * Head Office. Con una sola empresa no se nota; con dos, los operadores de
     * la empresa que nadie configuró aterrizan en la misma oficina que los de
     * la otra, y en el core la oficina es justamente lo que separa una cartera
     * de otra. Un valor por omisión que mezcla empresas no es un valor por
     * omisión: es un error silencioso.
     */
    const cfg = await this.configEmpresa.findOne({ where: { empresaId } });
    const oficina = cfg?.oficinaContableExterna ?? null;
    if (!oficina) {
      throw new ConflictException(
        'Esta empresa no tiene configurada su oficina del registro externo. ' +
          'Configúrala antes de dar de alta operadores: sin ella acabarían en la oficina de otra empresa.',
      );
    }

    const existente = await this.externos.buscarUsuario(usuario.email);

    if (existente) {
      /*
       * Existe allá — pero ¿es de esta empresa? El padrón del core es único y
       * la búsqueda es por nombre de usuario, así que sin esta comprobación una
       * empresa podía adoptar al operador de otra: le reasignaba SUS roles y lo
       * vinculaba a SU empresa, sobre la misma cuenta.
       */
      if (
        existente.oficinaIdExterna &&
        existente.oficinaIdExterna !== oficina
      ) {
        throw new ConflictException(
          `Ya existe un operador "${usuario.email}" en el registro externo, pero en la oficina ` +
            `${existente.oficinaIdExterna} y esta empresa opera en la ${oficina}. ` +
            'No se toca: sería el operador de otra empresa.',
        );
      }

      const otrasEmpresas = (
        await this.vinculos.empresasConIdExterno(
          TipoVinculo.USUARIO,
          existente.id,
        )
      ).filter((id) => id !== empresaId);
      if (otrasEmpresas.length > 0) {
        throw new ConflictException(
          'Ese operador del registro externo ya está vinculado a otra empresa del ERP.',
        );
      }

      /*
       * «Corregir roles» SUMA, no reemplaza. Y esto se escribe con una cicatriz.
       *
       * Antes se mandaba `asignarRoles(id, rolesDelMapeo)` y el PUT de Fineract
       * REEMPLAZA la lista entera. Al pulsar el botón sobre un administrador
       * que ya operaba bien, el core se quedó contestando «User has no
       * authority to READ roles»: la corrección le quitó la autoridad que tenía.
       *
       * El ERP no sabe, ni puede saber, qué autoridad bancaria necesita alguien
       * dentro del core —es el mismo motivo por el que los roles espejo nacen
       * sin permisos—. Así que aquí solo se garantiza que estén los roles que el
       * mapa promete; lo que alguien haya concedido allá se respeta. Quitar un
       * rol en el core es una decisión de quien administra el core, y se hace
       * allá, a propósito y a la vista.
       */
      const { agregados: faltantes } = await this.garantizarRoles(
        existente.id,
        usuario.email,
        mapeo.rolesExternos,
        existente.roles ?? [],
      );

      await this.vinculos.vincular({
        empresaId,
        tipo: TipoVinculo.USUARIO,
        entidadId: usuario.id,
        idExterno: existente.id,
        proveedor: this.externos.proveedor,
        estadoRemoto: 'ACTIVO',
      });
      return {
        accion: faltantes.length > 0 ? 'ROLES_ACTUALIZADOS' : 'YA_ESTABA',
        idExterno: existente.id,
        rolesAgregados: faltantes,
      };
    }

    const partes = (usuario.nombreCompleto ?? usuario.email).trim().split(/\s+/);
    const idExterno = await this.externos.crearUsuario({
      usuario: usuario.email,
      email: usuario.email,
      nombre: partes[0] ?? usuario.email,
      apellido: partes.slice(1).join(' ') || '.',
      oficinaIdExterna: oficina,
      rolesExternos: mapeo.rolesExternos,
    });

    await this.vinculos.vincular({
      empresaId,
      tipo: TipoVinculo.USUARIO,
      entidadId: usuario.id,
      idExterno,
      proveedor: this.externos.proveedor,
      estadoRemoto: 'ACTIVO',
    });

    return { accion: 'CREADO', idExterno };
  }
}
