import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConfiguracionAprobacion } from '../../compras/entities/configuracion-aprobacion.entity';
import { Departamento } from '../../departamentos/entities/departamento.entity';
import { Puesto } from '../entities/rrhh.entity';
import {
  esRolAdministrador,
  rolAutorizado,
} from '../../iam/utils/roles.util';
import {
  EstadoSolicitudEstructura,
  SolicitudEstructura,
  TipoSolicitudEstructura,
} from '../entities/solicitud-estructura.entity';
import {
  CrearSolicitudEstructuraDto,
  ResolverSolicitudEstructuraDto,
} from '../dto/solicitud-estructura.dto';

type UsuarioActivo = { id: string; empresaId: string; rol: string };

@Injectable()
export class EstructuraOrganizacionalService {
  constructor(
    @InjectRepository(SolicitudEstructura)
    private readonly solicitudes: Repository<SolicitudEstructura>,
    @InjectRepository(Departamento)
    private readonly departamentos: Repository<Departamento>,
    @InjectRepository(Puesto)
    private readonly puestos: Repository<Puesto>,
    private readonly dataSource: DataSource,
  ) {}

  async crear(dto: CrearSolicitudEstructuraDto, usuario: UsuarioActivo) {
    if (!rolAutorizado(usuario.rol, ['rrhh', 'gerencia'])) {
      throw new ForbiddenException('Sólo Recursos Humanos o Gerencia pueden solicitar cambios de estructura.');
    }
    const nombre = dto.nombre.trim();
    if (dto.tipo === TipoSolicitudEstructura.PUESTO) {
      const departamento = await this.departamentos.findOne({
        where: { id: dto.departamentoId, empresaId: usuario.empresaId, activo: true },
      });
      if (!departamento) throw new BadRequestException('El área seleccionada no existe o está inactiva.');
      if (Number(dto.salarioMaximo) < Number(dto.salarioMinimo)) {
        throw new BadRequestException('El salario máximo no puede ser menor al mínimo.');
      }
      const puesto = await this.puestos.findOne({
        where: { empresaId: usuario.empresaId, clave: dto.clave },
      });
      if (puesto) throw new ConflictException(`Ya existe el puesto ${dto.clave}.`);
    } else {
      const area = await this.departamentos
        .createQueryBuilder('area')
        .where('area.empresaId=:empresaId', { empresaId: usuario.empresaId })
        .andWhere('LOWER(area.nombre)=LOWER(:nombre)', { nombre })
        .getOne();
      if (area) throw new ConflictException(`Ya existe el área ${nombre}.`);
    }

    const pendiente = await this.solicitudes
      .createQueryBuilder('solicitud')
      .where('solicitud.empresaId=:empresaId', { empresaId: usuario.empresaId })
      .andWhere('solicitud.tipo=:tipo', { tipo: dto.tipo })
      .andWhere('LOWER(solicitud.nombreSolicitado)=LOWER(:nombre)', { nombre })
      .andWhere('solicitud.estado IN (:...estados)', {
        estados: [EstadoSolicitudEstructura.PENDIENTE_GERENCIA, EstadoSolicitudEstructura.PENDIENTE_FINANZAS],
      })
      .getOne();
    if (pendiente) throw new ConflictException('Ya existe una solicitud pendiente para esta alta.');

    return this.solicitudes.save(this.solicitudes.create({
      empresaId: usuario.empresaId,
      tipo: dto.tipo,
      nombreSolicitado: nombre,
      motivo: dto.motivo.trim(),
      datosJson: JSON.stringify({ ...dto, nombre }),
      solicitadoPorId: usuario.id,
      estado: EstadoSolicitudEstructura.PENDIENTE_GERENCIA,
    }));
  }

  async listar(usuario: UsuarioActivo) {
    const asignaciones = await this.dataSource.getRepository(ConfiguracionAprobacion).count({
      where: { empresaId: usuario.empresaId, usuarioId: usuario.id, activo: true },
    });
    /*
     * ────────────────────────────────────────────────────────────────────────
     * El permiso concedía y el servicio negaba
     * ------------------------------------------------------------------------
     * La plantilla de `direccion` declara irrenunciables `GET /rrhh/estructura/
     * solicitudes` y `POST /rrhh/estructura/solicitudes/:id/gerencia`, con su
     * motivo escrito: dirección está por encima de gerencia y la cubre cuando
     * el gerente falta, porque si no el alta de puestos se para en cuanto una
     * persona se va de vacaciones. La SEGUNDA etapa no la tiene, así que no
     * puede firmar las dos y la segregación se mantiene.
     *
     * Aquí la lista no la incluía. Resultado medido el 25-sep-2026 con la
     * sesión de dirección: la tabla de permisos decía que sí —la pantalla
     * aparecía en su menú— y el servicio contestaba «No tienes acceso a las
     * solicitudes de estructura». Es el mismo patrón de siempre visto del
     * revés: una puerta que se abre a una negativa.
     *
     * Las dos autorizaciones tienen que decir lo mismo. Ésta es la que estaba
     * desalineada con la intención declarada.
     * ────────────────────────────────────────────────────────────────────────
     */
    if (
      !rolAutorizado(usuario.rol, [
        'rrhh',
        'gerencia',
        'direccion',
        'finanzas',
      ]) &&
      asignaciones === 0
    ) {
      throw new ForbiddenException('No tienes acceso a las solicitudes de estructura.');
    }
    return this.solicitudes.find({
      where: { empresaId: usuario.empresaId },
      order: { fechaCreacion: 'DESC' },
      take: 200,
    });
  }

  async resolver(
    id: string,
    etapa: 'GERENCIA' | 'FINANZAS',
    dto: ResolverSolicitudEstructuraDto,
    usuario: UsuarioActivo,
  ) {
    const solicitud = await this.solicitudes.findOne({ where: { id, empresaId: usuario.empresaId } });
    if (!solicitud) throw new NotFoundException('La solicitud no existe.');
    const proceso = solicitud.tipo === TipoSolicitudEstructura.AREA ? 'ALTA_AREA' : 'ALTA_PUESTO';
    const nivel = etapa === 'GERENCIA' ? 1 : 2;
    const configurado = await this.dataSource.getRepository(ConfiguracionAprobacion).findOne({
      where: { empresaId: usuario.empresaId, proceso, orden: nivel, activo: true },
    });
    if (configurado?.usuarioId) {
      if (
        configurado.usuarioId !== usuario.id &&
        !esRolAdministrador(usuario.rol)
      ) {
        throw new ForbiddenException('Esta etapa está asignada a otro usuario.');
      }
    } else if (configurado?.rolAprobador) {
      if (!rolAutorizado(usuario.rol, [configurado.rolAprobador])) {
        throw new ForbiddenException(`Esta etapa requiere el rol ${configurado.rolAprobador}.`);
      }
    } else {
      /*
       * Dirección cubre la etapa de GERENCIA —y sólo ésa—, por lo dicho en
       * `listar()`. La de FINANZAS se queda como estaba: quien cubre una firma
       * no cubre las dos.
       */
      const rolesPermitidos =
        etapa === 'GERENCIA' ? ['gerencia', 'direccion'] : ['finanzas'];
      if (!rolAutorizado(usuario.rol, rolesPermitidos)) {
        throw new ForbiddenException(`Esta etapa requiere el rol ${etapa === 'GERENCIA' ? 'Gerencia' : 'Finanzas'}.`);
      }
    }
    const esperado = etapa === 'GERENCIA'
      ? EstadoSolicitudEstructura.PENDIENTE_GERENCIA
      : EstadoSolicitudEstructura.PENDIENTE_FINANZAS;
    if (solicitud.estado !== esperado) {
      throw new ConflictException(`La solicitud no está pendiente de ${etapa.toLowerCase()}.`);
    }
    /*
      * OJO: el administrador queda EXENTO de esta segregacion.
      *
      * Se conserva el comportamiento que ya habia —alguien tiene que poder
      * desatascar— pero queda escrito, porque es una puerta de salida a un
      * control de segregacion de funciones y antes vivia en un `!== 'admin'`
      * suelto que ni siquiera reconocia los alias del administrador.
      *
      * Si SUMA decide que la segregacion no admite excepciones, se quita la
      * tercera condicion y no hace falta nada mas.
      */
    if (
      etapa === 'FINANZAS' &&
      solicitud.aprobadoGerenciaPorId === usuario.id &&
      !esRolAdministrador(usuario.rol)
    ) {
      throw new ForbiddenException(
        'La misma persona no puede aprobar Gerencia y Finanzas. Se requiere segregación de funciones.',
      );
    }
    if (dto.decision === 'RECHAZAR') {
      if (!dto.comentario?.trim()) throw new BadRequestException('Explica el motivo del rechazo.');
      solicitud.estado = EstadoSolicitudEstructura.RECHAZADA;
      solicitud.rechazadoPorId = usuario.id;
      solicitud.comentarioResolucion = dto.comentario.trim();
      return this.solicitudes.save(solicitud);
    }
    if (etapa === 'GERENCIA') {
      solicitud.aprobadoGerenciaPorId = usuario.id;
      solicitud.fechaAprobacionGerencia = new Date();
      solicitud.estado = EstadoSolicitudEstructura.PENDIENTE_FINANZAS;
      solicitud.comentarioResolucion = dto.comentario?.trim();
      return this.solicitudes.save(solicitud);
    }

    return this.dataSource.transaction(async (manager) => {
      const solicitudes = manager.getRepository(SolicitudEstructura);
      const bloqueada = await solicitudes
        .createQueryBuilder('solicitud')
        .setLock('pessimistic_write')
        .where('solicitud.id=:id AND solicitud.empresaId=:empresaId', {
          id,
          empresaId: usuario.empresaId,
        })
        .getOne();
      if (!bloqueada || bloqueada.estado !== EstadoSolicitudEstructura.PENDIENTE_FINANZAS) {
        throw new ConflictException('La solicitud ya fue procesada por otro usuario.');
      }

      const datos = JSON.parse(bloqueada.datosJson) as CrearSolicitudEstructuraDto;
      if (bloqueada.tipo === TipoSolicitudEstructura.AREA) {
        const duplicada = await manager.getRepository(Departamento)
          .createQueryBuilder('area')
          .where('area.empresaId=:empresaId', { empresaId: usuario.empresaId })
          .andWhere('LOWER(area.nombre)=LOWER(:nombre)', { nombre: datos.nombre.trim() })
          .getOne();
        if (duplicada) throw new ConflictException(`Ya existe el área ${datos.nombre.trim()}.`);
        const area = await manager.save(Departamento, manager.create(Departamento, {
          empresaId: usuario.empresaId,
          nombre: datos.nombre.trim(),
          activo: true,
        }));
        bloqueada.entidadCreadaId = area.id;
      } else {
        const area = await manager.findOne(Departamento, {
          where: { id: datos.departamentoId, empresaId: usuario.empresaId, activo: true },
        });
        if (!area) throw new ConflictException('El área fue desactivada durante la aprobación.');
        const duplicado = await manager.findOne(Puesto, {
          where: { empresaId: usuario.empresaId, clave: String(datos.clave).trim().toUpperCase() },
        });
        if (duplicado) throw new ConflictException(`Ya existe el puesto ${datos.clave}.`);
        const puesto = await manager.save(Puesto, manager.create(Puesto, {
          empresaId: usuario.empresaId,
          clave: String(datos.clave).trim().toUpperCase(),
          nombre: datos.nombre.trim(),
          descripcion: datos.descripcion?.trim(),
          departamentoId: area.id,
          salarioMinimo: Number(datos.salarioMinimo),
          salarioMaximo: Number(datos.salarioMaximo),
          plazasAutorizadas: Number(datos.plazasAutorizadas),
          activo: true,
        }));
        bloqueada.entidadCreadaId = puesto.id;
      }
      bloqueada.aprobadoFinanzasPorId = usuario.id;
      bloqueada.fechaAprobacionFinanzas = new Date();
      bloqueada.estado = EstadoSolicitudEstructura.APROBADA;
      bloqueada.comentarioResolucion = dto.comentario?.trim();
      return solicitudes.save(bloqueada);
    });
  }
}
