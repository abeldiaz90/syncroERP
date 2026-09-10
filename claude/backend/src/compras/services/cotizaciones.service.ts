import {
  Injectable, NotFoundException, BadRequestException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Cotizacion } from '../entities/cotizacion.entity';
import { DetalleCotizacion } from '../entities/detalle-cotizacion.entity';
import { Requisicion } from '../entities/requisicion.entity';
import { OrdenCompra } from '../entities/orden-compra.entity';
import { CrearCotizacionDto } from '../dto/crear-cotizacion.dto';
import { ConfiguracionAprobacion } from '../entities/configuracion-aprobacion.entity';
import { AprobacionDocumento } from '../entities/aprobacion-documento.entity';
import { Proveedor } from '../../proveedores/entities/proveedor.entity';

@Injectable()
export class CotizacionesService {
  constructor(
    @InjectRepository(Cotizacion) private readonly cotizacionRepo: Repository<Cotizacion>,
    @InjectRepository(DetalleCotizacion) private readonly detalleRepo: Repository<DetalleCotizacion>,
    @InjectRepository(Requisicion) private readonly requisicionRepo: Repository<Requisicion>,
    @InjectRepository(OrdenCompra) private readonly ordenRepo: Repository<OrdenCompra>,
    @InjectRepository(ConfiguracionAprobacion) private readonly configuracionRepo: Repository<ConfiguracionAprobacion>,
    @InjectRepository(AprobacionDocumento) private readonly aprobacionRepo: Repository<AprobacionDocumento>,
    @InjectRepository(Proveedor) private readonly proveedorRepo: Repository<Proveedor>,
    private readonly dataSource: DataSource,
  ) {}

  async crear(dto: CrearCotizacionDto, empresaId: string) {
    const req = await this.requisicionRepo.findOne({
      where: { id: dto.requisicionId, empresaId },
      relations: ['detalles'],
    });
    if (!req) throw new NotFoundException('Requisición no encontrada');
    if (req.estado !== 'COTIZANDO') {
      throw new BadRequestException(`La requisición debe estar COTIZANDO; estado actual: ${req.estado}.`);
    }
    const proveedor = await this.proveedorRepo.findOne({
      where: { id: dto.proveedorId, empresaId, activo: true },
    });
    if (!proveedor) {
      throw new BadRequestException(
        'El proveedor no existe, está inactivo o pertenece a otra empresa.',
      );
    }
    if (!['APROBADO', 'CONDICIONADO'].includes(proveedor.estadoHomologacion)) {
      throw new BadRequestException(
        `El proveedor no puede cotizar hasta concluir su homologación (estado: ${proveedor.estadoHomologacion}).`,
      );
    }
    if (!dto.detalles?.length) throw new BadRequestException('La cotización debe contener partidas.');

    const reqPorProducto = new Map(req.detalles.map(d => [d.productoId, Number(d.cantidadSolicitada)]));
    const vistos = new Set<string>();
    let subtotal = 0;
    for (const det of dto.detalles) {
      if (vistos.has(det.productoId)) throw new BadRequestException('No se permiten productos duplicados en una cotización.');
      vistos.add(det.productoId);
      const solicitada = reqPorProducto.get(det.productoId);
      if (solicitada == null) throw new BadRequestException('La cotización contiene un producto que no pertenece a la requisición.');
      const cantidad = Number(det.cantidad);
      const precio = Number(det.precioUnitario);
      if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad > solicitada) {
        throw new BadRequestException(`Cantidad inválida para el producto ${det.productoId}. Máximo solicitado: ${solicitada}.`);
      }
      if (!Number.isFinite(precio) || precio < 0) throw new BadRequestException('El precio unitario no puede ser negativo.');
      subtotal += cantidad * precio;
    }
    const impuestoTotal = Number(dto.impuestoTotal || 0);
    if (!Number.isFinite(impuestoTotal) || impuestoTotal < 0) throw new BadRequestException('El impuesto total es inválido.');
    const total = subtotal + impuestoTotal;

    try {
      const cotizacion = await this.cotizacionRepo.save(this.cotizacionRepo.create({
        empresaId, requisicionId: dto.requisicionId, proveedorId: dto.proveedorId,
        subtotal, impuestoTotal, total, notas: dto.notas, estado: 'PENDIENTE',
      }));
      await this.detalleRepo.save(dto.detalles.map(det => this.detalleRepo.create({
        cotizacionId: cotizacion.id, productoId: det.productoId,
        cantidad: Number(det.cantidad), precioUnitario: Number(det.precioUnitario),
        subtotal: Number(det.cantidad) * Number(det.precioUnitario),
      })));
      return this.obtenerPorId(cotizacion.id, empresaId);
    } catch (e: any) {
      if (e?.number === 2601 || e?.number === 2627) {
        throw new ConflictException('Ya existe una cotización de ese proveedor para esta requisición.');
      }
      throw e;
    }
  }

  obtenerPorRequisicion(requisicionId: string, empresaId: string) {
    return this.cotizacionRepo.find({
      where: { requisicionId, empresaId },
      relations: ['detalles', 'detalles.producto', 'proveedor', 'ordenesCompra', 'solicitadoAprobacionPor', 'aprobadoPor'],
      order: { fechaCotizacion: 'DESC' },
    });
  }

  async solicitarAprobacion(id: string, empresaId: string, usuarioId: string, motivoSeleccion: string) {
    const cot = await this.obtenerPorId(id, empresaId);
    this.validarProveedorOperable(cot.proveedor);
    if (cot.estado !== 'PENDIENTE') throw new BadRequestException(`La cotización no puede enviarse a aprobación desde ${cot.estado}.`);
    const existente = await this.ordenRepo.findOne({ where: { cotizacionId: id, empresaId } });
    if (existente) throw new ConflictException('La cotización ya tiene una orden de compra.');
    cot.estado = 'PENDIENTE_APROBACION';
    cot.motivoSeleccion = motivoSeleccion?.trim();
    cot.solicitadoAprobacionPorId = usuarioId;
    cot.fechaSolicitudAprobacion = new Date();
    const configuracion = await this.configuracionRepo.createQueryBuilder('c')
      .where('c.empresaId=:empresaId AND c.proceso=:proceso AND c.activo=true', { empresaId, proceso: 'COTIZACION' })
      .andWhere('(c.montoDesde IS NULL OR c.montoDesde<=:total) AND (c.montoHasta IS NULL OR c.montoHasta>=:total)', { total: Number(cot.total) })
      .orderBy('c.orden', 'ASC').getMany();
    if (!configuracion.length) throw new BadRequestException('Configura la ruta de aprobación de cotizaciones antes de solicitar la adjudicación.');
    await this.dataSource.transaction(async em => {
      await em.getRepository(Cotizacion).save(cot);
      await em.getRepository(AprobacionDocumento).delete({ empresaId, proceso: 'COTIZACION', documentoId: id });
      await em.getRepository(AprobacionDocumento).save(configuracion.map(c => em.getRepository(AprobacionDocumento).create({
        empresaId, proceso: 'COTIZACION', documentoId: id, nivel: c.orden,
        usuarioAprobadorId: c.usuarioId, rolAprobador: c.rolAprobador,
        solicitadoPorId: usuarioId, tiempoLimiteHoras: c.tiempoLimiteHoras,
        fechaVencimiento: new Date(Date.now() + c.tiempoLimiteHoras * 3600000),
      })));
    });
    return this.obtenerPorId(id, empresaId);
  }

  async aprobar(id: string, empresaId: string, usuarioId: string, rol: string, comentario?: string) {
    const cot = await this.obtenerPorId(id, empresaId);
    if (cot.estado !== 'PENDIENTE_APROBACION') throw new BadRequestException('La cotización no está pendiente de aprobación.');
    const paso = await this.siguientePaso(id, empresaId);
    if (cot.solicitadoAprobacionPorId === usuarioId) {
      throw new BadRequestException('Quien solicita la adjudicación no puede aprobarla.');
    }
    if (paso.usuarioAprobadorId && paso.usuarioAprobadorId !== usuarioId || paso.rolAprobador && paso.rolAprobador !== rol?.toLowerCase() && rol?.toLowerCase() !== 'admin') {
      throw new BadRequestException('Esta aprobación corresponde a otro usuario o rol.');
    }
    paso.estado = 'APROBADA'; paso.resueltoPorId = usuarioId; paso.fechaResolucion = new Date(); paso.comentario = comentario?.trim();
    await this.aprobacionRepo.save(paso);
    const pendientes = await this.aprobacionRepo.count({ where: { empresaId, proceso: 'COTIZACION', documentoId: id, estado: 'PENDIENTE' } });
    if (pendientes) return this.obtenerPorId(id, empresaId);
    cot.estado = 'APROBADA';
    cot.aprobadoPorId = usuarioId;
    cot.fechaAprobacion = new Date();
    cot.comentarioAprobacion = comentario?.trim() || null;
    return this.cotizacionRepo.save(cot);
  }

  async rechazar(id: string, empresaId: string, usuarioId: string, rol: string, comentario?: string) {
    const cot = await this.obtenerPorId(id, empresaId);
    if (cot.estado !== 'PENDIENTE_APROBACION') throw new BadRequestException('La cotización no está pendiente de aprobación.');
    const paso = await this.siguientePaso(id, empresaId);
    if (paso.usuarioAprobadorId && paso.usuarioAprobadorId !== usuarioId || paso.rolAprobador && paso.rolAprobador !== rol?.toLowerCase() && rol?.toLowerCase() !== 'admin') throw new BadRequestException('Esta aprobación corresponde a otro usuario o rol.');
    paso.estado = 'RECHAZADA'; paso.resueltoPorId = usuarioId; paso.fechaResolucion = new Date(); paso.comentario = comentario?.trim();
    await this.aprobacionRepo.save(paso);
    await this.aprobacionRepo.createQueryBuilder().update().set({ estado: 'CANCELADA' }).where('empresaId=:empresaId AND proceso=:proceso AND documentoId=:id AND estado=:estado', { empresaId, proceso: 'COTIZACION', id, estado: 'PENDIENTE' }).execute();
    cot.estado = 'RECHAZADA';
    cot.aprobadoPorId = usuarioId;
    cot.fechaAprobacion = new Date();
    cot.comentarioAprobacion = comentario?.trim() || 'Adjudicación rechazada';
    return this.cotizacionRepo.save(cot);
  }

  private async siguientePaso(documentoId: string, empresaId: string) {
    const paso = await this.aprobacionRepo.findOne({ where: { empresaId, proceso: 'COTIZACION', documentoId, estado: 'PENDIENTE' }, order: { nivel: 'ASC' } });
    if (!paso) throw new BadRequestException('La cotización no tiene un nivel pendiente configurado.');
    return paso;
  }

  /**
   * `SELECCIONADA` es el estado que marca `OrdenesCompraService` al generar la
   * orden de compra. Este endpoint lo asignaba por separado y creaba un
   * callejón sin salida: `crearDesdeCotizacion` exige estado `APROBADA`, así
   * que una cotización marcada como seleccionada por aquí ya nunca podía
   * convertirse en orden, y no existe forma de devolverla a `APROBADA`. La
   * requisición quedaba atascada en `COTIZANDO` de forma permanente.
   *
   * Se conserva el endpoint por compatibilidad, pero es idempotente y no
   * puede dejar el documento en un estado del que no se pueda salir: la
   * adjudicación real ocurre al generar la orden.
   */
  async seleccionar(id: string, empresaId: string) {
    const cot = await this.obtenerPorId(id, empresaId);
    this.validarProveedorOperable(cot.proveedor);
    if (cot.estado === 'SELECCIONADA') return cot;
    if (cot.estado !== 'APROBADA') {
      throw new BadRequestException(
        'Primero debe aprobarse la adjudicación de la cotización.',
      );
    }
    /*
     * No se persiste el cambio de estado: generar la orden de compra es lo
     * que adjudica. Marcarlo aquí sólo bloqueaba ese paso.
     */
    return cot;
  }

  async obtenerPorId(id: string, empresaId: string) {
    const cot = await this.cotizacionRepo.findOne({
      where: { id, empresaId },
      relations: ['detalles', 'detalles.producto', 'proveedor', 'requisicion', 'ordenesCompra', 'solicitadoAprobacionPor', 'aprobadoPor'],
    });
    if (!cot) throw new NotFoundException('Cotización no encontrada');
    return cot;
  }

  private validarProveedorOperable(proveedor?: Proveedor | null) {
    if (
      !proveedor ||
      !proveedor.activo ||
      !['APROBADO', 'CONDICIONADO'].includes(proveedor.estadoHomologacion)
    ) {
      throw new BadRequestException(
        'El proveedor está inactivo, bloqueado o aún no ha sido homologado.',
      );
    }
  }
}
