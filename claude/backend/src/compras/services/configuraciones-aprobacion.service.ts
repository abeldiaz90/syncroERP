import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, IsNull, Repository } from 'typeorm';
import { ConfiguracionAprobacion } from '../entities/configuracion-aprobacion.entity';
import { CrearConfiguracionAprobacionDto, PROCESOS_APROBABLES } from '../dto/crear-configuracion-aprobacion.dto';
import { Usuario } from '../../iam/entities/usuario.entity';
import { Departamento } from '../../departamentos/entities/departamento.entity';
import { esRolAdministrador, normalizarRol } from '../../iam/utils/roles.util';
import { Endpoint } from '../../iam/entities/endpoint.entity';
import { RolEndpointPermiso } from '../../iam/entities/rol-endpoint-permiso.entity';
import { PermisosDinamicosService } from '../../iam/services/permisos-dinamicos.service';
import {
  derivarEscalaFinanciera,
  esProcesoFinancieroCentral,
  existeAsignacionSegregada,
} from '../utils/rutas-aprobacion.util';

/**
 * ============================================================================
 * Qué necesita poder tocar quien aprueba, por proceso
 * ----------------------------------------------------------------------------
 * Designar a alguien como aprobador y no darle el permiso para aprobar produce
 * el peor de los resultados: el documento se le asigna, lo ve en su bandeja, y
 * al oprimir el botón —si es que la interfaz se lo muestra— recibe un 403. El
 * documento queda atascado para siempre, porque resolver una aprobación exige
 * ser la persona asignada: ni el administrador puede desatascarlo.
 *
 * Eso es exactamente lo que pasaba con requisiciones y cotizaciones. El código
 * ya resolvía el problema para crédito de clientes y convenios hoteleros
 * —concediendo los permisos de la bandeja central al guardar el flujo— pero
 * los procesos de compras se habían quedado fuera de esa lista.
 *
 * Esta tabla lo hace explícito y ampliable: cada proceso declara los endpoints
 * sin los cuales su aprobador no puede trabajar. Si mañana se conecta
 * `ALTA_PROVEEDOR`, se agrega aquí y deja de ser un olvido posible.
 * ============================================================================
 */
export const ENDPOINTS_POR_PROCESO: Record<string, Array<{ metodo: string; ruta: string }>> = {
  CREDITO_CLIENTE: [
    { metodo: 'GET', ruta: '/aprobaciones/pendientes' },
    { metodo: 'GET', ruta: '/aprobaciones/historial' },
    { metodo: 'PATCH', ruta: '/aprobaciones/:id/resolver' },
  ],
  HOTEL_CONVENIO: [
    { metodo: 'GET', ruta: '/aprobaciones/pendientes' },
    { metodo: 'GET', ruta: '/aprobaciones/historial' },
    { metodo: 'PATCH', ruta: '/aprobaciones/:id/resolver' },
  ],
  REQUISICION: [
    { metodo: 'GET', ruta: '/compras/requisiciones' },
    { metodo: 'GET', ruta: '/compras/requisiciones/:id' },
    { metodo: 'GET', ruta: '/compras/requisiciones/aprobaciones/pendientes' },
    { metodo: 'PATCH', ruta: '/compras/requisiciones/aprobaciones/:id' },
  ],
  COTIZACION: [
    { metodo: 'GET', ruta: '/compras/cotizaciones/:id' },
    { metodo: 'GET', ruta: '/compras/cotizaciones/requisicion/:id' },
    { metodo: 'PATCH', ruta: '/compras/cotizaciones/:id/aprobar' },
    { metodo: 'PATCH', ruta: '/compras/cotizaciones/:id/rechazar' },
  ],
};

@Injectable()
export class ConfiguracionesAprobacionService {
  constructor(
    @InjectRepository(ConfiguracionAprobacion) private readonly repo: Repository<ConfiguracionAprobacion>,
    @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>,
    @InjectRepository(Departamento) private readonly departamentos: Repository<Departamento>,
    private readonly ds: DataSource,
    private readonly permisosDinamicos: PermisosDinamicosService,
  ) {}

  catalogoProcesos() {
    return [
      ['REQUISICION', 'Requisiciones de compra', 'COMPRAS', 'OPERATIVO'],
      ['COTIZACION', 'Adjudicación de cotizaciones', 'COMPRAS', 'OPERATIVO'],
      ['ORDEN_COMPRA', 'Órdenes de compra', 'COMPRAS', 'PREPARADO'],
      ['NOMINA', 'Cálculo y liberación de nómina', 'RRHH', 'OPERATIVO'],
      ['ALTA_PUESTO', 'Creación de puestos y tabuladores', 'RRHH', 'OPERATIVO'],
      ['ALTA_AREA', 'Creación de áreas organizacionales', 'RRHH', 'OPERATIVO'],
      ['INCIDENCIA_RH', 'Incidencias laborales', 'RRHH', 'PREPARADO'],
      ['VACACIONES', 'Solicitudes de vacaciones', 'RRHH', 'OPERATIVO'],
      ['ALTA_PROVEEDOR', 'Alta y activación de proveedores', 'MAESTROS', 'PREPARADO'],
      ['CREDITO_CLIENTE', 'Crédito y condiciones de clientes', 'MAESTROS', 'OPERATIVO'],
      ['HOTEL_CONVENIO', 'Convenios de crédito hotelero', 'HOTELERIA', 'OPERATIVO'],
    ].map(([clave, nombre, modulo, estadoIntegracion]) => ({
      clave,
      nombre,
      modulo,
      estadoIntegracion,
    }));
  }

  private procesoOperativo(proceso: string) {
    return this.catalogoProcesos().some(
      (item) =>
        item.clave === proceso && item.estadoIntegracion === 'OPERATIVO',
    );
  }

  async crear(dto: CrearConfiguracionAprobacionDto, empresaId: string) {
    if (!dto.aprobadores?.length) throw new BadRequestException('Agrega al menos un nivel de aprobación.');
    if (['ALTA_PUESTO', 'ALTA_AREA'].includes(dto.proceso) && dto.aprobadores.length !== 2) {
      throw new BadRequestException('Las altas de estructura requieren exactamente dos niveles de aprobación.');
    }
    if (!PROCESOS_APROBABLES.includes(dto.proceso as any)) throw new BadRequestException('Proceso no soportado.');
    if (!this.procesoOperativo(dto.proceso)) {
      throw new BadRequestException(
        'Este proceso todavía no está conectado a una operación real. No se permite guardar una matriz que no vaya a ejecutarse.',
      );
    }
    if (dto.proceso === 'REQUISICION' && !dto.departamentoId) {
      throw new BadRequestException('Las requisiciones requieren un área solicitante.');
    }
    if (esProcesoFinancieroCentral(dto.proceso) && dto.departamentoId) {
      throw new BadRequestException(
        'Crédito de clientes y convenios hoteleros son políticas globales de la empresa; no pueden configurarse por departamento.',
      );
    }
    if (dto.departamentoId) {
      const area = await this.departamentos.findOne({ where: { id: dto.departamentoId, empresaId, activo: true } });
      if (!area) throw new BadRequestException('El área no existe o está inactiva.');
    }
    const ordenes = dto.aprobadores.map((a) => a.orden);
    if (new Set(ordenes).size !== ordenes.length || [...ordenes].sort((a, b) => a - b).some((n, i) => n !== i + 1)) {
      throw new BadRequestException('Los niveles deben ser consecutivos: 1, 2, 3…');
    }

    const usuariosActivos = await this.usuarios.find({
      where: { empresaId, activo: true },
      select: { id: true, rol: true },
    });
    const rolesActivos = new Set(usuariosActivos.map((usuario) => normalizarRol(usuario.rol)));
    const usuariosEspecificos = new Set<string>();
    const rolesAsignados = new Set<string>();

    for (const aprobador of dto.aprobadores) {
      if (Boolean(aprobador.usuarioId) === Boolean(aprobador.rolAprobador?.trim())) {
        throw new BadRequestException(`El nivel ${aprobador.orden} debe tener un usuario o un rol, pero no ambos.`);
      }
      if (dto.proceso === 'REQUISICION' && !aprobador.usuarioId) {
        throw new BadRequestException('En requisiciones cada nivel debe asignarse a un usuario concreto.');
      }
      if (aprobador.usuarioId) {
        const usuario = usuariosActivos.find((item) => item.id === aprobador.usuarioId);
        if (!usuario) throw new BadRequestException(`El usuario del nivel ${aprobador.orden} no existe o está inactivo.`);
        if (usuariosEspecificos.has(aprobador.usuarioId)) {
          throw new BadRequestException(
            `El usuario del nivel ${aprobador.orden} ya aparece en otro nivel. Una misma persona no debe aprobar dos etapas del mismo flujo.`,
          );
        }
        usuariosEspecificos.add(aprobador.usuarioId);
      }
      if (aprobador.rolAprobador?.trim()) {
        const rol = normalizarRol(aprobador.rolAprobador);
        if (!rolesActivos.has(rol)) {
          throw new BadRequestException(
            `No existe un usuario activo con el rol ${aprobador.rolAprobador.trim()} para atender el nivel ${aprobador.orden}.`,
          );
        }
        if (rolesAsignados.has(rol)) {
          throw new BadRequestException(
            `El rol ${aprobador.rolAprobador.trim()} aparece en más de un nivel. Asigna roles distintos o usuarios específicos para conservar la segregación de funciones.`,
          );
        }
        rolesAsignados.add(rol);
      }
      if (aprobador.montoHasta != null && Number(aprobador.montoHasta) < Number(aprobador.montoDesde ?? 0)) {
        throw new BadRequestException(`El monto máximo del nivel ${aprobador.orden} es menor al mínimo.`);
      }
    }

    let aprobadoresNormalizados = dto.aprobadores;
    if (esProcesoFinancieroCentral(dto.proceso)) {
      if (
        dto.aprobadores.some(
          (nivel) =>
            nivel.obligatorio === false ||
            nivel.permiteAutoaprobacion === true,
        )
      ) {
        throw new BadRequestException(
          'Crédito y convenios hoteleros requieren todos los niveles y prohíben la autoaprobación.',
        );
      }

      let topeAnterior = -0.01;
      for (let indice = 0; indice < dto.aprobadores.length; indice++) {
        const nivel = dto.aprobadores[indice];
        const esUltimo = indice === dto.aprobadores.length - 1;
        if (!esUltimo && nivel.montoHasta == null) {
          throw new BadRequestException(
            `El nivel ${indice + 1} necesita un tope de autoridad. Sólo el último nivel puede quedar sin tope.`,
          );
        }
        if (esUltimo && nivel.montoHasta != null) {
          throw new BadRequestException(
            'El último nivel debe quedar sin tope para que ningún importe quede fuera de la matriz.',
          );
        }
        if (nivel.montoHasta != null) {
          const tope = Number(nivel.montoHasta);
          if (tope <= topeAnterior + 0.009) {
            throw new BadRequestException(
              `El tope del nivel ${indice + 1} debe ser mayor al del nivel anterior.`,
            );
          }
          topeAnterior = tope;
        }
      }
      aprobadoresNormalizados = derivarEscalaFinanciera(
        dto.aprobadores.map((nivel) => ({
          ...nivel,
          obligatorio: true,
          permiteAutoaprobacion: false,
        })),
      ) as typeof dto.aprobadores;
    }

    if (esProcesoFinancieroCentral(dto.proceso)) {
      const candidatosPorNivel = aprobadoresNormalizados.map((nivel) => ({
        orden: nivel.orden,
        candidatos: nivel.usuarioId
          ? [nivel.usuarioId]
          : usuariosActivos
              .filter(
                (usuario) =>
                  normalizarRol(usuario.rol) ===
                  normalizarRol(nivel.rolAprobador),
              )
              .map((usuario) => usuario.id),
      }));
      if (!existeAsignacionSegregada(candidatosPorNivel)) {
        throw new BadRequestException(
          'La matriz no puede completarse con personas distintas en todos los niveles. Agrega aprobadores activos o asigna usuarios específicos diferentes.',
        );
      }
    }

    const rolesAprobadores = new Set<string>();
    for (const aprobador of aprobadoresNormalizados) {
      if (aprobador.rolAprobador?.trim()) {
        rolesAprobadores.add(normalizarRol(aprobador.rolAprobador));
      } else if (aprobador.usuarioId) {
        const usuario = usuariosActivos.find((item) => item.id === aprobador.usuarioId);
        if (usuario?.rol) rolesAprobadores.add(normalizarRol(usuario.rol));
      }
    }

    const resultado = await this.ds.transaction(async (em) => {
      const repo = em.getRepository(ConfiguracionAprobacion);
      if (esProcesoFinancieroCentral(dto.proceso)) {
        // Limpia también matrices departamentales heredadas: Crédito y Convenios
        // tienen una sola política global por empresa.
        await repo.delete({ empresaId, proceso: dto.proceso });
      } else {
        await repo.delete({
          empresaId,
          proceso: dto.proceso,
          departamentoId: dto.departamentoId ?? (IsNull() as any),
        });
      }
      const configs = aprobadoresNormalizados.map((a) => repo.create({
        empresaId, proceso: dto.proceso, departamentoId: dto.departamentoId,
        usuarioId: a.usuarioId, rolAprobador: a.rolAprobador?.trim().toLowerCase(), orden: a.orden,
        montoDesde: a.montoDesde, montoHasta: a.montoHasta, tiempoLimiteHoras: a.tiempoLimiteHoras,
        obligatorio: a.obligatorio, permiteAutoaprobacion: a.permiteAutoaprobacion, activo: true,
      }));
      const guardadas = await repo.save(configs);

      const endpointsRequeridos = ENDPOINTS_POR_PROCESO[dto.proceso] ?? [];
      if (endpointsRequeridos.length > 0) {
        const endpointRepo = em.getRepository(Endpoint);
        const permisoRepo = em.getRepository(RolEndpointPermiso);
        const endpoints = await endpointRepo
          .createQueryBuilder('endpoint')
          .where('endpoint.activo = true')
          .andWhere(
            new Brackets((qb) => {
              endpointsRequeridos.forEach((requerido, indice) => {
                qb.orWhere(
                  `(endpoint.metodo = :metodo${indice} AND endpoint.ruta = :ruta${indice})`,
                  { [`metodo${indice}`]: requerido.metodo, [`ruta${indice}`]: requerido.ruta },
                );
              });
            }),
          )
          .getMany();

        if (endpoints.length !== endpointsRequeridos.length) {
          /*
           * Se nombra lo que falta. Un «no están sincronizados» a secas obliga
           * a adivinar, y el arreglo casi siempre es reiniciar el backend para
           * que el sincronizador de endpoints los registre.
           */
          const faltantes = endpointsRequeridos
            .filter((r) => !endpoints.some((e) => e.metodo === r.metodo && e.ruta === r.ruta))
            .map((r) => `${r.metodo} ${r.ruta}`);
          throw new BadRequestException(
            `Faltan endpoints por registrar para este flujo: ${faltantes.join(', ')}. ` +
              'Reinicia el backend para que se sincronicen y vuelve a guardar.',
          );
        }

        for (const rol of rolesAprobadores) {
          if (esRolAdministrador(rol)) continue;
          for (const endpoint of endpoints) {
            const existente = await permisoRepo
              .createQueryBuilder('permiso')
              .where('permiso.empresaId=:empresaId', { empresaId })
              .andWhere('permiso.endpointId=:endpointId', { endpointId: endpoint.id })
              .andWhere(
                `UPPER(REPLACE(REPLACE(LTRIM(RTRIM(permiso.rol)), '-', '_'), ' ', '_'))=:rol`,
                { rol },
              )
              .getOne();
            if (existente) {
              existente.rol = rol;
              existente.permitido = true;
              await permisoRepo.save(existente);
            } else {
              await permisoRepo.save(
                permisoRepo.create({ empresaId, rol, endpointId: endpoint.id, permitido: true }),
              );
            }
          }
        }
      }
      return guardadas;
    });
    this.permisosDinamicos.invalidarCacheRoles(empresaId, [...rolesAprobadores]);
    return resultado;
  }

  obtenerPorDepartamento(departamentoId: string, empresaId: string) {
    return this.repo.find({ where: { empresaId, proceso: 'REQUISICION', departamentoId, activo: true }, relations: ['usuario', 'departamento'], order: { orden: 'ASC' } });
  }

  obtenerMatriz(empresaId: string, proceso?: string, departamentoId?: string) {
    const qb = this.repo.createQueryBuilder('c').leftJoinAndSelect('c.usuario', 'usuario').leftJoinAndSelect('c.departamento', 'departamento')
      .where('c.empresaId=:empresaId AND c.activo=true', { empresaId });
    if (proceso) qb.andWhere('c.proceso=:proceso', { proceso });
    if (departamentoId) qb.andWhere('c.departamentoId=:departamentoId', { departamentoId });
    return qb.orderBy('c.proceso', 'ASC').addOrderBy('c.departamentoId', 'ASC').addOrderBy('c.orden', 'ASC').getMany();
  }

  async eliminar(id: string, empresaId: string) {
    const config = await this.repo.findOne({ where: { id, empresaId } });
    if (!config) throw new NotFoundException('Configuración no encontrada');
    if (esProcesoFinancieroCentral(config.proceso)) {
      throw new BadRequestException(
        'No elimines un nivel financiero de forma aislada. Edita y guarda la matriz completa para conservar una escala coherente.',
      );
    }
    return this.repo.remove(config);
  }
}
