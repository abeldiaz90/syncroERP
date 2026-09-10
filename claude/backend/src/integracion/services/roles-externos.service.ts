import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Usuario } from '../../iam/entities/usuario.entity';
import { normalizarRol } from '../../iam/utils/roles.util';
import { PLANTILLAS_PERMISOS } from '../../iam/data/plantillas-permisos';
import { PUERTO_USUARIOS_EXTERNOS, TipoVinculo } from '../integracion.constants';
import { ConfiguracionIntegracionEmpresa } from '../entities/configuracion-integracion-empresa.entity';
import { MapeoRolExterno } from '../entities/mapeo-rol-externo.entity';
import { PuertoUsuariosExternos } from '../ports/usuarios-externos.port';
import { IntegracionVinculosService } from './integracion-vinculos.service';

export interface EstadoUsuarioExterno {
  usuarioId: string;
  email: string;
  rolErp: string;
  mapeado: boolean;
  existeEnExterno: boolean;
  idExterno: string | null;
  rolesExternos: string[];
  /** Qué habría que hacer para que este usuario opere en los dos sistemas. */
  accion: 'NINGUNA' | 'MAPEAR_ROL' | 'DAR_DE_ALTA' | 'CORREGIR_ROLES';
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
    @Inject(PUERTO_USUARIOS_EXTERNOS)
    private readonly externos: PuertoUsuariosExternos,
  ) {}

  /** Roles del ERP, para armar la pantalla de mapeo. */
  rolesErp(): { rol: string; etiqueta: string; descripcion: string }[] {
    return PLANTILLAS_PERMISOS.map((p) => ({
      rol: normalizarRol(p.rol),
      etiqueta: p.etiqueta,
      descripcion: p.descripcion,
    }));
  }

  rolesExternos() {
    return this.externos.rolesDisponibles();
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
  async diagnostico(empresaId: string): Promise<EstadoUsuarioExterno[]> {
    const usuarios = await this.usuarios.find({
      where: { empresaId, activo: true },
    });
    const mapeos = await this.listarMapeo(empresaId);
    const porRol = new Map(mapeos.map((m) => [m.rolErp, m]));

    const salida: EstadoUsuarioExterno[] = [];

    for (const u of usuarios) {
      const rolErp = normalizarRol(u.rol);
      const mapeo = porRol.get(rolErp);
      const idExterno = await this.vinculos.idExterno(
        empresaId,
        TipoVinculo.USUARIO,
        u.id,
      );

      let existe = false;
      let rolesActuales: string[] = [];
      if (this.externos.proveedor !== 'ninguno') {
        try {
          const remoto = await this.externos.buscarUsuario(u.email);
          existe = remoto !== null;
          rolesActuales = remoto?.roles.map((r) => r.id) ?? [];
        } catch (error) {
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
        accion: !mapeo
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
      await this.externos.asignarRoles(existente.id, rolesExternos);
      return {
        accion: 'ROLES_ACTUALIZADOS',
        usuario,
        idExterno: existente.id,
      };
    }

    const cfg = await this.configEmpresa.findOne({ where: { empresaId } });
    const idExterno = await this.externos.crearUsuario({
      usuario,
      // El correo no se usa para nada: la autenticación va por el emisor de
      // identidad. Se manda porque el proveedor lo exige.
      email: `${usuario}@integracion.local`,
      nombre: 'SyncroERP',
      apellido: 'Integracion',
      oficinaIdExterna: cfg?.oficinaContableExterna ?? '1',
      rolesExternos,
    });

    return { accion: 'CREADA', usuario, idExterno };
  }

  /**
   * Da de alta al usuario del ERP en el registro externo, o corrige sus roles
   * si ya existe. Lo dispara una persona desde la pantalla de administración.
   */
  async aprovisionar(empresaId: string, usuarioId: string) {
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

    const cfg = await this.configEmpresa.findOne({ where: { empresaId } });
    const oficina = cfg?.oficinaContableExterna ?? '1';

    const existente = await this.externos.buscarUsuario(usuario.email);

    if (existente) {
      await this.externos.asignarRoles(existente.id, mapeo.rolesExternos);
      await this.vinculos.vincular({
        empresaId,
        tipo: TipoVinculo.USUARIO,
        entidadId: usuario.id,
        idExterno: existente.id,
        proveedor: this.externos.proveedor,
        estadoRemoto: 'ACTIVO',
      });
      return { accion: 'ROLES_ACTUALIZADOS', idExterno: existente.id };
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
