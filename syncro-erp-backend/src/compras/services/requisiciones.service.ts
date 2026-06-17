// src/compras/services/requisiciones.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Requisicion } from '../entities/requisicion.entity';
import { DetalleRequisicion } from '../entities/detalle-requisicion.entity';
import { Aprobacion } from '../entities/aprobacion.entity';
import { ConfiguracionAprobacion } from '../entities/configuracion-aprobacion.entity';
import { Usuario } from '../../iam/entities/usuario.entity';
import { CrearRequisicionDto } from '../dto/crear-requisicion.dto';
import { MailService } from '../../common/services/mail.service';
import {
  htmlNuevaRequisicion,
  htmlRechazoRequisicion,
  htmlAprobadaRequisicion,
} from '../utils/email-templates';

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
    private readonly mailService: MailService,
  ) {}

  // ====================== CREAR REQUISICIÓN ======================
  async crear(dto: CrearRequisicionDto, empresaId: string) {
    if (!dto.detalles || dto.detalles.length === 0) {
      throw new BadRequestException('La requisición debe tener al menos un detalle');
    }
    for (const det of dto.detalles) {
      if (!det.productoId || !det.cantidadSolicitada || det.cantidadSolicitada <= 0) {
        throw new BadRequestException('Cada detalle debe tener productoId y cantidadSolicitada mayor a 0');
      }
    }

    const requisicion = this.reqRepo.create({
      empresaId,
      usuarioSolicitanteId: dto.usuarioSolicitanteId || null,
      notas: dto.notas,
    });
    const guardada = await this.reqRepo.save(requisicion);

    const detalles = dto.detalles.map((d) =>
      this.detalleRepo.create({
        requisicionId: guardada.id,
        productoId: d.productoId,
        cantidadSolicitada: d.cantidadSolicitada,
        notas: d.notas,
      }),
    );
    await this.detalleRepo.save(detalles);

    if (dto.usuarioSolicitanteId) {
      const usuario = await this.usuarioRepo.findOne({
        where: { id: dto.usuarioSolicitanteId },
        relations: ['departamento'],
      });

      if (usuario && usuario.departamentoId) {
        const configuraciones = await this.configAprobacionRepo.find({
          where: { empresaId, departamentoId: usuario.departamentoId },
          order: { orden: 'ASC' },
        });

        if (configuraciones.length > 0) {
          const aprobaciones = configuraciones.map((cfg) =>
            this.aprobacionRepo.create({
              requisicionId: guardada.id,
              usuarioId: cfg.usuarioId,
              orden: cfg.orden,
            }),
          );
          await this.aprobacionRepo.save(aprobaciones);

          const primerAprobador = await this.usuarioRepo.findOne({
            where: { id: configuraciones[0].usuarioId },
          });
          if (primerAprobador) {
            const reqCompleta = await this.reqRepo.findOne({
              where: { id: guardada.id },
              relations: ['detalles', 'detalles.producto'],
            });
            await this.mailService.enviarCorreo({
              destinatario: primerAprobador.email,
              asunto: 'Nueva requisición pendiente de aprobación',
              cuerpo: `Hola ${primerAprobador.nombreCompleto}, tienes una nueva requisición (ID: ${guardada.id}) pendiente de aprobación.`,
              cuerpoHtml: htmlNuevaRequisicion(reqCompleta, primerAprobador.nombreCompleto),
            });
          }
        }
      }
    }

    return this.reqRepo.findOne({
      where: { id: guardada.id },
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
    if (rol !== 'admin' && rol !== 'comprador' && usuarioId) {
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
  async obtenerPorId(id: string, empresaId: string) {
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
    return req;
  }

  // ====================== CAMBIAR ESTADO ======================
  async cambiarEstado(id: string, empresaId: string, estado: string) {
    const req = await this.reqRepo.findOne({ where: { id, empresaId } });
    if (!req) throw new NotFoundException('Requisición no encontrada');
    req.estado = estado as any;
    return this.reqRepo.save(req);
  }

  // ====================== OBTENER APROBACIONES PENDIENTES ======================
  async obtenerAprobacionesPendientes(usuarioId: string) {
    return this.aprobacionRepo.find({
      where: { usuarioId, estado: 'PENDIENTE' },
      relations: ['requisicion', 'requisicion.detalles', 'requisicion.detalles.producto'],
      order: { fechaAprobacion: 'ASC' },
    });
  }

  // ====================== RESOLVER APROBACIÓN (CORREGIDO + NOTIFICACIONES) ======================
  async resolverAprobacion(
    id: string,
    estado: 'APROBADO' | 'RECHAZADO',
    comentario: string,
    empresaId: string,
  ) {
    const aprobacion = await this.aprobacionRepo.findOne({
      where: { id },
      relations: ['requisicion', 'requisicion.usuarioSolicitante'],
    });
    if (!aprobacion) throw new NotFoundException('Aprobación no encontrada');
    if (aprobacion.requisicion.empresaId !== empresaId)
      throw new NotFoundException('No pertenece a tu empresa');

    aprobacion.estado = estado;
    aprobacion.comentario = comentario || '';
    await this.aprobacionRepo.save(aprobacion);

    const requisicionId = aprobacion.requisicion.id;

    if (estado === 'RECHAZADO') {
      await this.reqRepo.update(requisicionId, { estado: 'RECHAZADA' as any });

      const solicitante = await this.usuarioRepo.findOne({
        where: { id: aprobacion.requisicion.usuarioSolicitanteId },
      });
      if (solicitante) {
        const req = await this.reqRepo.findOne({ where: { id: requisicionId } });
        await this.mailService.enviarCorreo({
          destinatario: solicitante.email,
          asunto: 'Tu requisición ha sido rechazada',
          cuerpo: `Hola ${solicitante.nombreCompleto}, tu requisición (${requisicionId}) ha sido rechazada. Comentario: ${comentario}`,
          cuerpoHtml: htmlRechazoRequisicion(req || { id: requisicionId }, comentario),
        });
      }
      return aprobacion;
    }

    // APROBADO: notificar al solicitante de la aprobación parcial
    const solicitante = await this.usuarioRepo.findOne({
      where: { id: aprobacion.requisicion.usuarioSolicitanteId },
    });
    const aprobador = await this.usuarioRepo.findOne({
      where: { id: aprobacion.usuarioId },
    });

    if (solicitante && aprobador) {
      const req = await this.reqRepo.findOne({ where: { id: requisicionId } });
      await this.mailService.enviarCorreo({
        destinatario: solicitante.email,
        asunto: `Tu requisición ha sido aprobada por ${aprobador.nombreCompleto}`,
        cuerpo: `Hola ${solicitante.nombreCompleto},\n\n${aprobador.nombreCompleto} ha aprobado tu requisición #${req?.id.slice(0, 8)}.\n\nEstado: Aprobación parcial (aún falta la aprobación de otros usuarios).`,
      });
    }

    // Verificar si quedan pendientes
    const pendientes = await this.aprobacionRepo.count({
      where: { requisicionId, estado: 'PENDIENTE' },
    });

    console.log(`Requisición ${requisicionId} - Pendientes restantes: ${pendientes}`);

    if (pendientes === 0) {
      await this.reqRepo.update(requisicionId, { estado: 'COTIZANDO' as any });
      console.log(`Requisición ${requisicionId} ahora está en COTIZANDO`);

      if (solicitante) {
        const req = await this.reqRepo.findOne({ where: { id: requisicionId } });
        await this.mailService.enviarCorreo({
          destinatario: solicitante.email,
          asunto: 'Tu requisición ha sido aprobada y enviada a cotización',
          cuerpo: `Hola ${solicitante.nombreCompleto}, tu requisición (${requisicionId}) ha sido aprobada completamente y se ha enviado automáticamente a cotización.`,
          cuerpoHtml: htmlAprobadaRequisicion(req || { id: requisicionId }),
        });

        const compradores = await this.usuarioRepo.find({
          where: { empresaId, rol: 'comprador', activo: true },
        });
        for (const comp of compradores) {
          await this.mailService.enviarCorreo({
            destinatario: comp.email,
            asunto: 'Nueva requisición lista para cotizar',
            cuerpo: `Hola ${comp.nombreCompleto}, hay una nueva requisición (${requisicionId}) en estado COTIZANDO que requiere tu atención.`,
          });
        }
      }
    } else {
      const siguiente = await this.aprobacionRepo.findOne({
        where: { requisicionId, estado: 'PENDIENTE' },
        order: { orden: 'ASC' },
        relations: ['usuario'],
      });

      if (siguiente?.usuario) {
        const reqCompleta = await this.reqRepo.findOne({
          where: { id: requisicionId },
          relations: ['detalles', 'detalles.producto'],
        });
        await this.mailService.enviarCorreo({
          destinatario: siguiente.usuario.email,
          asunto: 'Requisición pendiente de aprobación',
          cuerpo: `Tienes una requisición (${requisicionId}) pendiente de aprobar.`,
          cuerpoHtml: htmlNuevaRequisicion(reqCompleta, siguiente.usuario.nombreCompleto),
        });
      }
    }

    return aprobacion;
  }
}