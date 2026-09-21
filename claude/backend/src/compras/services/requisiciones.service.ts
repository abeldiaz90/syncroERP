// src/compras/services/requisiciones.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  EstadoRequisicion,
  Requisicion,
} from '../entities/requisicion.entity';
import { DetalleRequisicion } from '../entities/detalle-requisicion.entity';
import { Aprobacion } from '../entities/aprobacion.entity';
import { ConfiguracionAprobacion } from '../entities/configuracion-aprobacion.entity';
import { Usuario } from '../../iam/entities/usuario.entity';
import { CrearRequisicionDto } from '../dto/crear-requisicion.dto';
import { Producto } from '../../catalogo/entities/producto.entity';
import { MailService } from '../../common/services/mail.service';
import {
  htmlNuevaRequisicion,
  htmlRechazoRequisicion,
  htmlAprobadaRequisicion,
} from '../utils/email-templates';
import { esRolAdministrador, normalizarRol } from '../../iam/utils/roles.util';

@Injectable()
export class RequisicionesService {
  constructor(
    @InjectRepository(Requisicion)
    private readonly reqRepo: Repository<Requisicion>,
    @InjectRepository(DetalleRequisicion)
    private readonly detalleRepo: Repository<DetalleRequisicion>,
    @InjectRepository(Aprobacion)
    private readonly aprobacionRepo: Repository<Aprobacion>,
    @InjectRepository(ConfiguracionAprobacion)
    private readonly configAprobacionRepo: Repository<ConfiguracionAprobacion>,
    @InjectRepository(Usuario)
    private readonly usuarioRepo: Repository<Usuario>,
    @InjectRepository(Producto)
    private readonly productoRepo: Repository<Producto>,
    private readonly mailService: MailService,
    private readonly dataSource: DataSource,
  ) {}

  // ====================== CREAR REQUISICIÓN ======================
  async crear(
    dto: CrearRequisicionDto,
    empresaId: string,
    usuarioSolicitanteId: string,
  ) {
    const usuario = await this.usuarioRepo.findOne({
      where: { id: usuarioSolicitanteId, empresaId, activo: true },
      relations: ['departamento'],
    });
    if (!usuario) {
      throw new BadRequestException(
        'El usuario autenticado no está activo o no pertenece a la empresa.',
      );
    }
    if (!usuario.departamentoId) {
      throw new BadRequestException(
        /*
         * El mensaje le hablaba al administrador, pero lo lee quien acaba de
         * capturar la requisición —el almacenista— y le pide hacer algo que no
         * puede hacer, después de llenar el formulario. Ahora dice de quién es
         * el pendiente y por qué existe la regla.
         */
        'Tu usuario todavía no tiene departamento asignado, y de él dependen ' +
          'los aprobadores de la requisición. Pídele al administrador que te ' +
          'asigne uno en Usuarios; en cuanto lo tengas, esta captura funciona.',
      );
    }

    const ids = dto.detalles.map((detalle) => detalle.productoId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException(
        'Un producto no puede aparecer más de una vez en la requisición.',
      );
    }
    const productos = await this.productoRepo
      .createQueryBuilder('producto')
      .where('producto.empresaId = :empresaId', { empresaId })
      .andWhere('producto.id IN (:...ids)', { ids })
      .andWhere('producto.activo = :activo', { activo: true })
      .getCount();
    if (productos !== ids.length) {
      throw new BadRequestException(
        'Uno o más productos no existen, están inactivos o pertenecen a otra empresa.',
      );
    }

    const configuraciones = await this.configAprobacionRepo.find({
      where: {
        empresaId,
        proceso: 'REQUISICION',
        departamentoId: usuario.departamentoId,
        activo: true,
      },
      order: { orden: 'ASC' },
    });
    if (configuraciones.length === 0) {
      throw new BadRequestException(
        'No existe una ruta de aprobación activa para requisiciones de este departamento.',
      );
    }
    if (configuraciones.some((configuracion) => !configuracion.usuarioId)) {
      throw new BadRequestException(
        'La ruta de aprobación contiene niveles sin un aprobador asignado.',
      );
    }
    if (
      configuraciones.some(
        (configuracion) => configuracion.usuarioId === usuarioSolicitanteId,
      )
    ) {
      throw new BadRequestException(
        'El solicitante no puede formar parte de su propia ruta de aprobación.',
      );
    }
    const aprobadoresIds = configuraciones.map(
      (configuracion) => configuracion.usuarioId!,
    );
    const aprobadoresActivos = await this.usuarioRepo
      .createQueryBuilder('usuario')
      .where('usuario.empresaId = :empresaId', { empresaId })
      .andWhere('usuario.activo = :activo', { activo: true })
      .andWhere('usuario.id IN (:...aprobadoresIds)', { aprobadoresIds })
      .getCount();
    if (aprobadoresActivos !== new Set(aprobadoresIds).size) {
      throw new BadRequestException(
        'La ruta contiene aprobadores inactivos o ajenos a la empresa. Actualízala antes de continuar.',
      );
    }

    const primerAprobador = await this.usuarioRepo.findOne({
      where: {
        id: configuraciones[0].usuarioId!,
        empresaId,
        activo: true,
      },
    });
    if (!primerAprobador) {
      throw new BadRequestException(
        'El primer aprobador configurado ya no está activo en la empresa.',
      );
    }
    const requisicionId = await this.dataSource.transaction(async (em) => {
      const requisiciones = em.getRepository(Requisicion);
      const detallesRepo = em.getRepository(DetalleRequisicion);
      const aprobacionesRepo = em.getRepository(Aprobacion);
      const guardada = await requisiciones.save(
        requisiciones.create({
          empresaId,
          usuarioSolicitanteId,
          notas: dto.notas,
          prioridad: dto.prioridad ?? 'NORMAL',
          fechaRequerida: dto.fechaRequerida
            ? new Date(`${dto.fechaRequerida.slice(0, 10)}T12:00:00`)
            : null,
        }),
      );
      await detallesRepo.save(
        dto.detalles.map((detalle) =>
          detallesRepo.create({
            requisicionId: guardada.id,
            productoId: detalle.productoId,
            cantidadSolicitada: detalle.cantidadSolicitada,
            notas: detalle.notas,
          }),
        ),
      );
      await aprobacionesRepo.save(
        configuraciones.map((configuracion) =>
          aprobacionesRepo.create({
            requisicionId: guardada.id,
            usuarioId: configuracion.usuarioId!,
            orden: configuracion.orden,
          }),
        ),
      );
      return guardada.id;
    });
    const reqCompleta = await this.reqRepo.findOne({
      where: { id: requisicionId, empresaId },
      relations: ['detalles', 'detalles.producto'],
    });
    void this.mailService
      .enviarCorreo({
        destinatario: primerAprobador.email,
        asunto: 'Nueva requisición pendiente de aprobación',
        cuerpo: `Hola ${primerAprobador.nombreCompleto}, tienes una nueva requisición (ID: ${requisicionId}) pendiente de aprobación.`,
        cuerpoHtml: htmlNuevaRequisicion(
          reqCompleta,
          primerAprobador.nombreCompleto,
        ),
      })
      .catch(() => undefined);

    return this.reqRepo.findOne({
      where: { id: requisicionId, empresaId },
      relations: [
        'detalles',
        'detalles.producto',
        'aprobaciones',
        'aprobaciones.usuario',
        'usuarioSolicitante',
        'cotizaciones',
        'cotizaciones.proveedor',
        'cotizaciones.ordenesCompra', // ← CORREGIDO
      ],
    });
  }

  // ====================== OBTENER TODAS ======================
  async obtenerTodas(empresaId: string, usuarioId?: string, rol?: string) {
    const where: any = { empresaId };
    const rolNormalizado = normalizarRol(rol);
    if (
      !esRolAdministrador(rol) &&
      !['COMPRADOR', 'COMPRAS'].includes(rolNormalizado) &&
      usuarioId
    ) {
      where.usuarioSolicitanteId = usuarioId;
    }

    return this.reqRepo.find({
      where,
      relations: [
        'detalles',
        'detalles.producto',
        'aprobaciones',
        'aprobaciones.usuario',
        'usuarioSolicitante',
        'cotizaciones',
        'cotizaciones.proveedor',
        'cotizaciones.ordenesCompra', // ← CORREGIDO
      ],
      order: { fechaSolicitud: 'DESC' },
    });
  }

  // ====================== OBTENER POR ID ======================
  async obtenerPorId(
    id: string,
    empresaId: string,
    usuarioId: string,
    rol?: string,
  ) {
    const req = await this.reqRepo.findOne({
      where: { id, empresaId },
      relations: [
        'detalles',
        'detalles.producto',
        'aprobaciones',
        'aprobaciones.usuario',
        'usuarioSolicitante',
        'cotizaciones',
        'cotizaciones.proveedor',
        'cotizaciones.ordenesCompra', // ← CORREGIDO
      ],
    });
    if (!req) throw new NotFoundException('Requisición no encontrada');
    const puedeConsultar =
      esRolAdministrador(rol) ||
      ['COMPRADOR', 'COMPRAS'].includes(normalizarRol(rol)) ||
      req.usuarioSolicitanteId === usuarioId ||
      req.aprobaciones?.some((aprobacion) => aprobacion.usuarioId === usuarioId);
    if (!puedeConsultar) {
      throw new ForbiddenException(
        'No puedes consultar requisiciones de otro solicitante.',
      );
    }
    return req;
  }

  // ====================== CAMBIAR ESTADO ======================
  async cambiarEstado(
    id: string,
    empresaId: string,
    estado: EstadoRequisicion,
    usuarioId?: string,
    rol?: string,
  ) {
    const req = await this.reqRepo.findOne({ where: { id, empresaId } });
    if (!req) throw new NotFoundException('Requisición no encontrada');
    if (
      !esRolAdministrador(rol) &&
      !['COMPRADOR', 'COMPRAS'].includes(normalizarRol(rol)) &&
      req.usuarioSolicitanteId !== usuarioId
    ) {
      throw new ForbiddenException(
        'Sólo el solicitante o Compras pueden cancelar esta requisición.',
      );
    }
    const transiciones: Partial<
      Record<EstadoRequisicion, EstadoRequisicion[]>
    > = {
      PENDIENTE: ['CANCELADA'],
      COTIZANDO: ['CANCELADA'],
    };
    if (!(transiciones[req.estado] ?? []).includes(estado)) {
      throw new BadRequestException(
        `No se permite cambiar una requisición de ${req.estado} a ${estado}.`,
      );
    }
    req.estado = estado;
    return this.reqRepo.save(req);
  }

  // ====================== OBTENER APROBACIONES PENDIENTES ======================
  async obtenerAprobacionesPendientes(usuarioId: string, empresaId: string) {
    const asignadas = await this.aprobacionRepo.find({
      where: {
        usuarioId,
        estado: 'PENDIENTE',
        requisicion: { empresaId },
      },
      relations: [
        'requisicion',
        'requisicion.usuarioSolicitante',
        'requisicion.detalles',
        'requisicion.detalles.producto',
      ],
      order: { fechaCreacion: 'ASC' },
    });
    const visibles: Aprobacion[] = [];
    for (const ap of asignadas) {
      if (ap.requisicion.estado !== 'PENDIENTE') continue;
      const anterior = await this.aprobacionRepo.createQueryBuilder('a')
        .where('a.requisicionId = :requisicionId', { requisicionId: ap.requisicionId })
        .andWhere('a.orden < :orden', { orden: ap.orden })
        .andWhere('a.estado <> :aprobado', { aprobado: 'APROBADO' })
        .getCount();
      if (anterior === 0) visibles.push(ap);
    }
    return visibles;
  }

  // ====================== RESOLVER APROBACIÓN (ATÓMICO) ======================
  async resolverAprobacion(
    id: string,
    estado: 'APROBADO' | 'RECHAZADO',
    comentario: string,
    empresaId: string,
    usuarioActualId: string,
  ) {
    const resultado = await this.dataSource.transaction(async (em) => {
      const aprobaciones = em.getRepository(Aprobacion);
      const requisiciones = em.getRepository(Requisicion);

      const aprobacion = await aprobaciones
        .createQueryBuilder('a')
        .setLock('pessimistic_write', undefined, ['a'])
        .leftJoinAndSelect('a.requisicion', 'r')
        .leftJoinAndSelect('r.usuarioSolicitante', 'solicitante')
        .where('a.id = :id', { id })
        .getOne();
      if (!aprobacion) throw new NotFoundException('Aprobación no encontrada');
      if (aprobacion.requisicion.empresaId !== empresaId)
        throw new NotFoundException('No pertenece a tu empresa');
      if (aprobacion.usuarioId !== usuarioActualId)
        throw new BadRequestException('Esta aprobación está asignada a otro usuario.');
      if (aprobacion.estado !== 'PENDIENTE')
        throw new BadRequestException('Esta aprobación ya fue resuelta.');
      if (aprobacion.requisicion.estado !== 'PENDIENTE')
        throw new BadRequestException(`La requisición ya no está pendiente; estado: ${aprobacion.requisicion.estado}.`);

      const anterioresSinAprobar = await aprobaciones
        .createQueryBuilder('a')
        .where('a.requisicionId = :requisicionId', { requisicionId: aprobacion.requisicionId })
        .andWhere('a.orden < :orden', { orden: aprobacion.orden })
        .andWhere('a.estado <> :aprobado', { aprobado: 'APROBADO' })
        .getCount();
      if (anterioresSinAprobar > 0)
        throw new BadRequestException('Debe resolverse primero el nivel de aprobación anterior.');

      aprobacion.estado = estado;
      aprobacion.fechaResolucion = new Date();
      aprobacion.comentario = comentario || '';
      await aprobaciones.save(aprobacion);

      let nuevoEstado: EstadoRequisicion = aprobacion.requisicion.estado;
      let siguienteUsuarioId: string | null = null;
      if (estado === 'RECHAZADO') {
        nuevoEstado = 'RECHAZADA';
        const cambio = await requisiciones.update(
          { id: aprobacion.requisicionId, empresaId, estado: 'PENDIENTE' },
          { estado: nuevoEstado },
        );
        if (cambio.affected !== 1) {
          throw new BadRequestException('La requisición cambió de estado durante la aprobación. Recarga e intenta nuevamente.');
        }
      } else {
        const pendientes = await aprobaciones.count({
          where: { requisicionId: aprobacion.requisicionId, estado: 'PENDIENTE' },
        });
        if (pendientes === 0) {
          nuevoEstado = 'COTIZANDO';
          const cambio = await requisiciones.update(
            { id: aprobacion.requisicionId, empresaId, estado: 'PENDIENTE' },
            { estado: nuevoEstado },
          );
          if (cambio.affected !== 1) {
            throw new BadRequestException('La requisición cambió de estado durante la aprobación. Recarga e intenta nuevamente.');
          }
        } else {
          const siguiente = await aprobaciones.findOne({
            where: { requisicionId: aprobacion.requisicionId, estado: 'PENDIENTE' },
            order: { orden: 'ASC' },
          });
          siguienteUsuarioId = siguiente?.usuarioId ?? null;
        }
      }

      return {
        aprobacion,
        requisicionId: aprobacion.requisicionId,
        solicitanteId: aprobacion.requisicion.usuarioSolicitanteId,
        aprobadorId: aprobacion.usuarioId,
        empresaId,
        nuevoEstado,
        siguienteUsuarioId,
      };
    });

    // El correo no forma parte de la consistencia transaccional. Se envía
    // después del commit y nunca deja la requisición a medias si SMTP falla.
    void this.notificarResolucionAprobacion(resultado, comentario).catch(() => undefined);
    return resultado.aprobacion;
  }

  private async notificarResolucionAprobacion(
    resultado: {
      requisicionId: string;
      solicitanteId: string | null;
      aprobadorId: string;
      empresaId: string;
      nuevoEstado: EstadoRequisicion;
      siguienteUsuarioId: string | null;
    },
    comentario: string,
  ): Promise<void> {
    const [solicitante, aprobador, req] = await Promise.all([
      resultado.solicitanteId
        ? this.usuarioRepo.findOne({ where: { id: resultado.solicitanteId } })
        : Promise.resolve(null),
      this.usuarioRepo.findOne({ where: { id: resultado.aprobadorId } }),
      this.reqRepo.findOne({
        where: { id: resultado.requisicionId },
        relations: ['detalles', 'detalles.producto'],
      }),
    ]);

    const tareas: Promise<unknown>[] = [];
    if (solicitante && resultado.nuevoEstado === 'RECHAZADA') {
      tareas.push(this.mailService.enviarCorreo({
        destinatario: solicitante.email,
        asunto: 'Tu requisición ha sido rechazada',
        cuerpo: `Tu requisición (${resultado.requisicionId}) fue rechazada. Comentario: ${comentario}`,
        cuerpoHtml: htmlRechazoRequisicion(req || { id: resultado.requisicionId }, comentario),
      }));
    } else if (solicitante && resultado.nuevoEstado === 'COTIZANDO') {
      tareas.push(this.mailService.enviarCorreo({
        destinatario: solicitante.email,
        asunto: 'Tu requisición fue aprobada y enviada a cotización',
        cuerpo: `Tu requisición (${resultado.requisicionId}) fue aprobada completamente.`,
        cuerpoHtml: htmlAprobadaRequisicion(req || { id: resultado.requisicionId }),
      }));
      const compradores = await this.usuarioRepo.find({
        where: { empresaId: resultado.empresaId, rol: 'comprador', activo: true },
      });
      for (const comp of compradores) {
        tareas.push(this.mailService.enviarCorreo({
          destinatario: comp.email,
          asunto: 'Nueva requisición lista para cotizar',
          cuerpo: `Hay una nueva requisición (${resultado.requisicionId}) en estado COTIZANDO.`,
        }));
      }
    } else if (solicitante && aprobador) {
      tareas.push(this.mailService.enviarCorreo({
        destinatario: solicitante.email,
        asunto: `Tu requisición fue aprobada por ${aprobador.nombreCompleto}`,
        cuerpo: `${aprobador.nombreCompleto} aprobó tu requisición. Aún quedan niveles pendientes.`,
      }));
    }

    if (resultado.siguienteUsuarioId) {
      const siguiente = await this.usuarioRepo.findOne({ where: { id: resultado.siguienteUsuarioId } });
      if (siguiente) {
        tareas.push(this.mailService.enviarCorreo({
          destinatario: siguiente.email,
          asunto: 'Requisición pendiente de aprobación',
          cuerpo: `Tienes una requisición (${resultado.requisicionId}) pendiente de aprobar.`,
          cuerpoHtml: htmlNuevaRequisicion(req, siguiente.nombreCompleto),
        }));
      }
    }
    await Promise.allSettled(tareas);
  }

}
