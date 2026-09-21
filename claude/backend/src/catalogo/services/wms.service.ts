import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { Almacen } from '../entities/almacen.entity';
import { Producto } from '../entities/producto.entity';
import { StockPorAlmacen } from '../entities/stock-por-almacen.entity';
import { TransferenciaInventario, EstadoTransferenciaInventario } from '../entities/transferencia-inventario.entity';
import { TransferenciaInventarioDetalle } from '../entities/transferencia-inventario-detalle.entity';
import { UbicacionAlmacen, EstadoUbicacionAlmacen } from '../entities/ubicacion-almacen.entity';
import { ReservaInventario, EstadoReservaInventario } from '../entities/reserva-inventario.entity';
import { ConteoInventario, EstadoConteoInventario } from '../entities/conteo-inventario.entity';
import { ConteoInventarioDetalle } from '../entities/conteo-inventario-detalle.entity';
import { InventarioService } from './inventario.service';
import { ProductoUbicacion } from '../entities/producto-ubicacion.entity';
import { StockUbicacion, EstadoStockUbicacion } from '../entities/stock-ubicacion.entity';
import { LoteInventario } from '../entities/lote-inventario.entity';
import { AsientosPendientesService } from '../../finanzas/services/asientos-pendientes.service';
import { TipoAsiento } from '../../finanzas/entities/asiento-pendiente.entity';
import { omitirTareaProgramada } from '../../common/utils/tareas-programadas.util';
const n = (v: unknown) => Number(v ?? 0);
const folio = (prefijo: string) => `${prefijo}-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}-${randomUUID().slice(0, 6).toUpperCase()}`;
@Injectable()
export class WmsService {
    private readonly logger = new Logger(WmsService.name);
    constructor(private readonly dataSource: DataSource, private readonly inventario: InventarioService, private readonly asientos: AsientosPendientesService, 
    @InjectRepository(TransferenciaInventario)
    private readonly transferencias: Repository<TransferenciaInventario>, 
    @InjectRepository(TransferenciaInventarioDetalle)
    private readonly transferenciaDetalles: Repository<TransferenciaInventarioDetalle>, 
    @InjectRepository(StockPorAlmacen)
    private readonly stocks: Repository<StockPorAlmacen>, 
    @InjectRepository(UbicacionAlmacen)
    private readonly ubicaciones: Repository<UbicacionAlmacen>, 
    @InjectRepository(ReservaInventario)
    private readonly reservas: Repository<ReservaInventario>, 
    @InjectRepository(ConteoInventario)
    private readonly conteos: Repository<ConteoInventario>, 
    @InjectRepository(ConteoInventarioDetalle)
    private readonly conteoDetalles: Repository<ConteoInventarioDetalle>, 
    @InjectRepository(ProductoUbicacion)
    private readonly productoUbicaciones: Repository<ProductoUbicacion>, 
    @InjectRepository(StockUbicacion)
    private readonly stockUbicaciones: Repository<StockUbicacion>) { }
    private async resolverCostoSobranteConteo(em: EntityManager, empresaId: string, productoId: string, almacenId: string, costoLote?: number): Promise<number> {
        const costoExplicito = n(costoLote);
        if (costoExplicito > 0)
            return costoExplicito;
        const loteConCosto = await em
            .getRepository(LoteInventario)
            .createQueryBuilder('lote')
            .where('lote.empresaId = :empresaId', { empresaId })
            .andWhere('lote.productoId = :productoId', { productoId })
            .andWhere('lote.almacenId = :almacenId', { almacenId })
            .andWhere('lote.costoUnitario > 0')
            .orderBy('lote.fechaIngreso', 'DESC')
            .addOrderBy('lote.id', 'DESC')
            .getOne();
        if (n(loteConCosto?.costoUnitario) > 0) {
            return n(loteConCosto?.costoUnitario);
        }
        const producto = await em.findOne(Producto, {
            where: { id: productoId, empresaId, activo: true },
        });
        const costoCatalogo = n(producto?.costoEstandar) || n(producto?.precioCompra);
        if (costoCatalogo > 0)
            return costoCatalogo;
        throw new BadRequestException(`No se puede ajustar el sobrante del producto ${producto?.sku ?? productoId}: ` +
            'no existe costo de lote, costo estándar ni precio de compra. Captura un costo antes de cerrar el conteo.');
    }
    async disponibilidad(empresaId: string, productoId: string, almacenId: string) {
        const stock = await this.stocks.findOne({ where: { empresaId, productoId, almacenId } });
        const fisica = n(stock?.cantidad), reservado = n(stock?.reservado), comprometido = n(stock?.comprometido), bloqueado = n(stock?.bloqueado), enTransito = n(stock?.enTransito);
        // `comprometido` se conserva por compatibilidad, pero no se descuenta hasta
        // existir una entidad fuente con creación, consumo y liberación simétricos.
        const disponibleCalculado = fisica - reservado - bloqueado;
        return {
            fisica, reservado, comprometido, bloqueado, enTransito,
            disponible: Math.max(0, disponibleCalculado),
            disponibleCalculado,
            inconsistente: disponibleCalculado < -0.0001,
        };
    }
    async reservar(empresaId: string, usuarioId: string | undefined, dto: any) {
        const cantidad = n(dto.cantidad);
        if (cantidad <= 0)
            throw new BadRequestException('La cantidad a reservar debe ser mayor a cero');
        return this.dataSource.transaction(async (em) => {
            const stock = await em.createQueryBuilder(StockPorAlmacen, 's').setLock('pessimistic_write')
                .where('s.empresaId=:empresaId AND s.productoId=:productoId AND s.almacenId=:almacenId', { empresaId, productoId: dto.productoId, almacenId: dto.almacenId }).getOne();
            if (!stock)
                throw new BadRequestException('No existe stock para el producto y almacén indicados');
            const disponible = n(stock.cantidad) - n(stock.reservado) - n(stock.bloqueado);
            if (disponible < cantidad)
                throw new BadRequestException(`Disponibilidad insuficiente. Disponible: ${disponible}`);
            const existente = await em.findOne(ReservaInventario, { where: { empresaId, referenciaTipo: dto.referenciaTipo, referenciaId: String(dto.referenciaId), productoId: dto.productoId, almacenId: dto.almacenId } });
            if (existente && [EstadoReservaInventario.ACTIVA, EstadoReservaInventario.PARCIALMENTE_CONSUMIDA].includes(existente.estado)) {
                throw new BadRequestException('Ya existe una reserva activa para esta referencia');
            }
            stock.reservado = n(stock.reservado) + cantidad;
            await em.save(stock);
            const reserva = existente ?? em.create(ReservaInventario, { empresaId, productoId: dto.productoId, almacenId: dto.almacenId, referenciaTipo: dto.referenciaTipo, referenciaId: String(dto.referenciaId) });
            reserva.usuarioId = usuarioId;
            reserva.cantidad = cantidad;
            reserva.cantidadConsumida = 0;
            reserva.estado = EstadoReservaInventario.ACTIVA;
            reserva.expiraEn = dto.expiraEn ? new Date(dto.expiraEn) : undefined;
            reserva.motivo = dto.motivo;
            return em.save(reserva);
        });
    }
    async liberarReserva(empresaId: string, id: string, consumir = false) {
        if (consumir) {
            throw new BadRequestException('Una reserva solo puede consumirse junto con la salida física de inventario. ' +
                'Envía reservaId en el detalle de la venta o del documento que genera la salida.');
        }
        return this.dataSource.transaction(async (em) => {
            // Lectura sin bloqueo para conocer la clave del resumen. El orden de
            // bloqueo es siempre stock -> reserva, igual que en registrarSalida(),
            // evitando el ciclo stock/reserva entre venta y liberación.
            const referencia = await em.findOne(ReservaInventario, { where: { id, empresaId } });
            if (!referencia)
                throw new NotFoundException('Reserva no encontrada');
            const stock = await em.createQueryBuilder(StockPorAlmacen, 's').setLock('pessimistic_write')
                .where('s.empresaId=:empresaId AND s.productoId=:productoId AND s.almacenId=:almacenId', { empresaId, productoId: referencia.productoId, almacenId: referencia.almacenId }).getOne();
            const reserva = await em.createQueryBuilder(ReservaInventario, 'r').setLock('pessimistic_write')
                .where('r.id=:id AND r.empresaId=:empresaId', { id, empresaId }).getOne();
            if (!reserva)
                throw new NotFoundException('Reserva no encontrada');
            if (![EstadoReservaInventario.ACTIVA, EstadoReservaInventario.PARCIALMENTE_CONSUMIDA].includes(reserva.estado))
                return reserva;
            const restante = Math.max(0, n(reserva.cantidad) - n(reserva.cantidadConsumida));
            if (stock) {
                stock.reservado = Math.max(0, n(stock.reservado) - restante);
                await em.save(stock);
            }
            reserva.estado = EstadoReservaInventario.LIBERADA;
            return em.save(reserva);
        });
    }
    @Cron('0 */15 * * * *', { name: 'wms-liberar-reservas-expiradas' })
    async liberarReservasExpiradas(empresaId?: string) {
        /*
         * Sin `empresaId` la llamada viene del planificador. Con `empresaId`
         * la disparo un usuario desde la pantalla, y esa si debe correr
         * aunque los crons esten apagados en esta instancia.
         */
        if (!empresaId && omitirTareaProgramada('wms-liberar-reservas-expiradas')) {
            return { liberadas: 0, omitida: true };
        }

        return this.dataSource.transaction(async (em) => {
            const qb = em.createQueryBuilder(ReservaInventario, 'r')
                .where('r.estado IN (:...estados)', { estados: [EstadoReservaInventario.ACTIVA, EstadoReservaInventario.PARCIALMENTE_CONSUMIDA] })
                .andWhere('r.expiraEn IS NOT NULL AND r.expiraEn <= :ahora', { ahora: new Date() });
            if (empresaId)
                qb.andWhere('r.empresaId = :empresaId', { empresaId });
            const candidatas = await qb.orderBy('r.productoId', 'ASC').addOrderBy('r.almacenId', 'ASC').addOrderBy('r.id', 'ASC').getMany();
            let liberadas = 0;
            for (const candidata of candidatas) {
                // Mismo orden universal: resumen de stock y después reserva.
                const stock = await em.createQueryBuilder(StockPorAlmacen, 's').setLock('pessimistic_write')
                    .where('s.empresaId=:empresaId AND s.productoId=:productoId AND s.almacenId=:almacenId', {
                    empresaId: candidata.empresaId, productoId: candidata.productoId, almacenId: candidata.almacenId,
                }).getOne();
                const reserva = await em.createQueryBuilder(ReservaInventario, 'r').setLock('pessimistic_write')
                    .where('r.id=:id', { id: candidata.id }).getOne();
                if (!reserva || ![EstadoReservaInventario.ACTIVA, EstadoReservaInventario.PARCIALMENTE_CONSUMIDA].includes(reserva.estado))
                    continue;
                if (!reserva.expiraEn || new Date(reserva.expiraEn).getTime() > Date.now())
                    continue;
                const pendiente = Math.max(0, n(reserva.cantidad) - n(reserva.cantidadConsumida));
                if (stock) {
                    stock.reservado = Math.max(0, n(stock.reservado) - pendiente);
                    await em.save(stock);
                }
                reserva.estado = EstadoReservaInventario.EXPIRADA;
                await em.save(reserva);
                liberadas += 1;
            }
            if (liberadas)
                this.logger.log(`Reservas WMS expiradas liberadas: ${liberadas}`);
            return { liberadas };
        });
    }
    async crearTransferencia(empresaId: string, usuarioId: string | undefined, dto: any) {
        if (dto.almacenOrigenId === dto.almacenDestinoId)
            throw new BadRequestException('Origen y destino deben ser distintos');
        if (!Array.isArray(dto.detalles) || !dto.detalles.length)
            throw new BadRequestException('Agrega al menos un producto');
        return this.dataSource.transaction(async (em) => {
            const almacenes = await em.find(Almacen, { where: { empresaId, id: In([dto.almacenOrigenId, dto.almacenDestinoId]), activo: true } });
            if (almacenes.length !== 2)
                throw new BadRequestException('Los almacenes deben existir y estar activos');
            const t = em.create(TransferenciaInventario, { empresaId, folio: folio('TRF'), almacenOrigenId: dto.almacenOrigenId, almacenDestinoId: dto.almacenDestinoId, estado: EstadoTransferenciaInventario.SOLICITADA, motivo: String(dto.motivo || 'Transferencia interna').trim(), usuarioId, valorTotal: 0 });
            await em.save(t);
            const detallesOrdenados = [...dto.detalles].sort((a: any, b: any) => `${a.productoId}:${a.ubicacionOrigenId ?? ''}`.localeCompare(`${b.productoId}:${b.ubicacionOrigenId ?? ''}`));
            for (const item of detallesOrdenados) {
                const cantidad = n(item.cantidad);
                if (cantidad <= 0)
                    throw new BadRequestException('Todas las cantidades deben ser mayores a cero');
                if (!item.ubicacionOrigenId)
                    throw new BadRequestException('Selecciona la ubicación física de origen');
                const stock = await em.createQueryBuilder(StockPorAlmacen, 's').setLock('pessimistic_write')
                    .where('s.empresaId=:empresaId AND s.productoId=:productoId AND s.almacenId=:almacenId', { empresaId, productoId: item.productoId, almacenId: dto.almacenOrigenId }).getOne();
                const disponible = n(stock?.cantidad) - n(stock?.reservado) - n(stock?.bloqueado);
                if (!stock || disponible < cantidad)
                    throw new BadRequestException(`Stock insuficiente para ${item.productoId}. Disponible: ${Math.max(0, disponible)}`);
                const fisicos = await em.createQueryBuilder(StockUbicacion, 'su').setLock('pessimistic_write')
                    .where('su.empresaId=:empresaId AND su.productoId=:productoId AND su.almacenId=:almacenId AND su.ubicacionId=:ubicacionId AND su.estado=:estado', { empresaId, productoId: item.productoId, almacenId: dto.almacenOrigenId, ubicacionId: item.ubicacionOrigenId, estado: EstadoStockUbicacion.DISPONIBLE })
                    .andWhere('su.cantidad-su.reservado>0').orderBy('su.fechaCreacion', 'ASC').getMany();
                const disponibleFisico = fisicos.reduce((a, x) => a + n(x.cantidad) - n(x.reservado), 0);
                if (disponibleFisico < cantidad)
                    throw new BadRequestException(`La ubicación de origen no tiene disponibilidad física suficiente. Disponible: ${disponibleFisico}`);
                stock.reservado = n(stock.reservado) + cantidad;
                await em.save(stock);
                let porReservar = cantidad;
                for (const fisico of fisicos) {
                    const x = Math.min(n(fisico.cantidad) - n(fisico.reservado), porReservar);
                    fisico.reservado = n(fisico.reservado) + x;
                    porReservar -= x;
                    await em.save(fisico);
                    if (porReservar <= 0)
                        break;
                }
                await em.save(em.create(TransferenciaInventarioDetalle, { transferenciaId: t.id, productoId: item.productoId, ubicacionOrigenId: item.ubicacionOrigenId, numeroLote: 'RESERVADO', cantidad, cantidadSolicitada: cantidad, cantidadEnviada: 0, cantidadRecibida: 0, cantidadDanada: 0, costoUnitario: 0, costoTotal: 0 }));
            }
            return em.findOne(TransferenciaInventario, { where: { id: t.id }, relations: ['almacenOrigen', 'almacenDestino', 'detalles', 'detalles.producto', 'detalles.ubicacionOrigen', 'detalles.ubicacionDestino'] });
        });
    }
    async cambiarEstadoTransferencia(empresaId: string, id: string, accion: 'autorizar' | 'enviar' | 'recibir' | 'cancelar', usuarioId?: string, dto: any = {}) {
        return this.dataSource.transaction(async (em) => {
            const t = await em.createQueryBuilder(TransferenciaInventario, 't').setLock('pessimistic_write').where('t.id=:id AND t.empresaId=:empresaId', { id, empresaId }).getOne();
            if (!t)
                throw new NotFoundException('Transferencia no encontrada');
            if (accion === 'autorizar') {
                if (t.estado !== EstadoTransferenciaInventario.SOLICITADA)
                    throw new BadRequestException('Solo una transferencia solicitada puede autorizarse');
                if (!usuarioId || t.usuarioId === usuarioId)
                    throw new BadRequestException('Quien solicita la transferencia no puede autorizarla.');
                t.estado = EstadoTransferenciaInventario.AUTORIZADA;
                t.autorizadoPor = usuarioId;
                t.fechaAutorizacion = new Date();
                return em.save(t);
            }
            if (accion === 'cancelar') {
                if ([EstadoTransferenciaInventario.EN_TRANSITO, EstadoTransferenciaInventario.RECIBIDA, EstadoTransferenciaInventario.RECIBIDA_CON_DIFERENCIAS, EstadoTransferenciaInventario.COMPLETADA].includes(t.estado))
                    throw new BadRequestException('Una transferencia enviada o recibida no puede cancelarse');
                const pendientes = (await em.find(TransferenciaInventarioDetalle, { where: { transferenciaId: t.id } }))
                    .sort((a, b) => `${a.productoId}:${a.ubicacionOrigenId ?? ''}`.localeCompare(`${b.productoId}:${b.ubicacionOrigenId ?? ''}`));
                for (const d of pendientes) {
                    const cant = n(d.cantidadSolicitada || d.cantidad);
                    const stock = await em.createQueryBuilder(StockPorAlmacen, 's').setLock('pessimistic_write').where('s.empresaId=:empresaId AND s.productoId=:productoId AND s.almacenId=:almacenId', { empresaId, productoId: d.productoId, almacenId: t.almacenOrigenId }).getOne();
                    if (stock) {
                        stock.reservado = Math.max(0, n(stock.reservado) - cant);
                        await em.save(stock);
                    }
                    if (d.ubicacionOrigenId) {
                        const fisicos = await em.find(StockUbicacion, { where: { empresaId, productoId: d.productoId, almacenId: t.almacenOrigenId, ubicacionId: d.ubicacionOrigenId } });
                        let restante = cant;
                        for (const f of fisicos) {
                            const x = Math.min(n(f.reservado), restante);
                            f.reservado = Math.max(0, n(f.reservado) - x);
                            restante -= x;
                            await em.save(f);
                            if (restante <= 0)
                                break;
                        }
                    }
                }
                t.estado = EstadoTransferenciaInventario.CANCELADA;
                return em.save(t);
            }
            if (accion === 'enviar') {
                if (t.estado !== EstadoTransferenciaInventario.AUTORIZADA)
                    throw new BadRequestException('La transferencia debe estar autorizada antes del envío');
                const solicitados = (await em.find(TransferenciaInventarioDetalle, { where: { transferenciaId: t.id } }))
                    .sort((a, b) => `${a.productoId}:${a.ubicacionOrigenId ?? ''}`.localeCompare(`${b.productoId}:${b.ubicacionOrigenId ?? ''}`));
                await em.delete(TransferenciaInventarioDetalle, { transferenciaId: t.id });
                let valor = 0;
                for (const solicitud of solicitados) {
                    const productoId = solicitud.productoId, cantidad = n(solicitud.cantidadSolicitada || solicitud.cantidad);
                    const origenStock = await em.createQueryBuilder(StockPorAlmacen, 's').setLock('pessimistic_write').where('s.empresaId=:empresaId AND s.productoId=:productoId AND s.almacenId=:almacenId', { empresaId, productoId, almacenId: t.almacenOrigenId }).getOne();
                    if (origenStock) {
                        origenStock.reservado = Math.max(0, n(origenStock.reservado) - cantidad);
                        await em.save(origenStock);
                    }
                    if (solicitud.ubicacionOrigenId) {
                        const fisicos = await em.find(StockUbicacion, { where: { empresaId, productoId, almacenId: t.almacenOrigenId, ubicacionId: solicitud.ubicacionOrigenId } });
                        let restante = cantidad;
                        for (const f of fisicos) {
                            const x = Math.min(n(f.reservado), restante);
                            f.reservado = Math.max(0, n(f.reservado) - x);
                            restante -= x;
                            await em.save(f);
                            if (restante <= 0)
                                break;
                        }
                    }
                    const salida = await this.inventario.registrarSalida(productoId, t.almacenOrigenId, cantidad, `Transferencia ${t.folio} en tránsito`, empresaId, undefined, undefined, em, { id: t.id, tipo: 'TRANSFERENCIA_SALIDA' }, solicitud.ubicacionOrigenId);
                    for (const c of salida.consumos) {
                        valor += c.costoTotal;
                        await em.save(em.create(TransferenciaInventarioDetalle, { transferenciaId: t.id, productoId, ubicacionOrigenId: solicitud.ubicacionOrigenId, numeroLote: c.numeroLote, fechaCaducidad: c.fechaCaducidad, cantidad: c.cantidad, cantidadSolicitada: c.cantidad, cantidadEnviada: c.cantidad, cantidadRecibida: 0, cantidadDanada: 0, costoUnitario: c.costoUnitario, costoTotal: c.costoTotal }));
                    }
                    let dest = await em.findOne(StockPorAlmacen, { where: { empresaId, productoId, almacenId: t.almacenDestinoId } });
                    if (!dest)
                        dest = em.create(StockPorAlmacen, { empresaId, productoId, almacenId: t.almacenDestinoId, cantidad: 0, reservado: 0, comprometido: 0, bloqueado: 0, enTransito: 0 });
                    dest.enTransito = n(dest.enTransito) + cantidad;
                    await em.save(dest);
                }
                t.estado = EstadoTransferenciaInventario.EN_TRANSITO;
                t.enviadoPor = usuarioId;
                t.fechaEnvio = new Date();
                t.valorTotal = Math.round(valor * 100) / 100;
                return em.save(t);
            }
            if (t.estado !== EstadoTransferenciaInventario.EN_TRANSITO)
                throw new BadRequestException('Solo una transferencia en tránsito puede recibirse');
            if (!usuarioId || t.enviadoPor === usuarioId)
                throw new BadRequestException('Quien envía la mercancía no puede registrar su recepción.');
            const detalles = (await em.find(TransferenciaInventarioDetalle, { where: { transferenciaId: t.id } }))
                .sort((a, b) => `${a.productoId}:${a.ubicacionDestinoId ?? ''}`.localeCompare(`${b.productoId}:${b.ubicacionDestinoId ?? ''}`));
            const recepciones = Array.isArray(dto.detalles) ? dto.detalles : [];
            let diferencias = false;
            for (const d of detalles) {
                const r = recepciones.find((x: any) => x.detalleId === d.id) || {};
                const enviada = n(d.cantidadEnviada || d.cantidad);
                if (!r.ubicacionDestinoId)
                    throw new BadRequestException('Selecciona la ubicación física de destino para cada partida');
                const danada = Math.max(0, n(r.cantidadDanada));
                const recibida = r.cantidadRecibida === undefined ? Math.max(0, enviada - danada) : Math.max(0, n(r.cantidadRecibida));
                if (recibida + danada > enviada)
                    throw new BadRequestException('La cantidad recibida más dañada no puede superar la enviada');
                if (recibida !== enviada || danada > 0)
                    diferencias = true;
                if (recibida > 0)
                    await this.inventario.registrarCompra(d.productoId, t.almacenDestinoId, recibida, `Recepción transferencia ${t.folio}`, empresaId, d.numeroLote, d.fechaCaducidad ? new Date(d.fechaCaducidad).toISOString() : undefined, undefined, em, n(d.costoUnitario), { id: t.id, tipo: 'TRANSFERENCIA_RECEPCION' }, r.ubicacionDestinoId);
                d.ubicacionDestinoId = r.ubicacionDestinoId;
                d.cantidadRecibida = recibida;
                d.cantidadDanada = danada;
                await em.save(d);
                const dest = await em.findOne(StockPorAlmacen, { where: { empresaId, productoId: d.productoId, almacenId: t.almacenDestinoId } });
                if (dest) {
                    dest.enTransito = Math.max(0, n(dest.enTransito) - enviada);
                    await em.save(dest);
                }
            }
            t.estado = diferencias ? EstadoTransferenciaInventario.RECIBIDA_CON_DIFERENCIAS : EstadoTransferenciaInventario.RECIBIDA;
            t.recibidoPor = usuarioId;
            t.fechaRecepcion = new Date();
            t.observacionesRecepcion = dto.observaciones;
            return em.save(t);
        });
    }
    async listarTransferencias(empresaId: string, pagina = 1, limite = 20, estado?: EstadoTransferenciaInventario) { const take = Math.min(Math.max(n(limite) || 20, 1), 100), page = Math.max(n(pagina) || 1, 1); const where: any = { empresaId }; if (estado)
        where.estado = estado; const [data, total] = await this.transferencias.findAndCount({ where, relations: ['almacenOrigen', 'almacenDestino', 'detalles', 'detalles.producto', 'detalles.ubicacionOrigen', 'detalles.ubicacionDestino'], order: { fechaCreacion: 'DESC' }, skip: (page - 1) * take, take }); return { data, total, pagina: page, limite: take, paginas: Math.ceil(total / take) }; }
    async crearUbicacion(empresaId: string, dto: any) { const almacen = await this.dataSource.getRepository(Almacen).findOne({ where: { id: dto.almacenId, empresaId } }); if (!almacen)
        throw new NotFoundException('Almacén no encontrado'); const codigo = String(dto.codigo || '').trim().toUpperCase(); if (!codigo)
        throw new BadRequestException('El código es obligatorio'); return this.ubicaciones.save(this.ubicaciones.create({ ...dto, empresaId, codigo, estado: dto.estado || EstadoUbicacionAlmacen.DISPONIBLE, activo: true })); }
    async listarUbicaciones(empresaId: string, almacenId?: string) { const where: any = { empresaId }; if (almacenId)
        where.almacenId = almacenId; return this.ubicaciones.find({ where, relations: ['almacen'], order: { almacenId: 'ASC', codigo: 'ASC' } }); }
    async actualizarUbicacion(empresaId: string, id: string, dto: any) { const u = await this.ubicaciones.findOne({ where: { id, empresaId } }); if (!u)
        throw new NotFoundException('Ubicación no encontrada'); for (const campo of ['zona', 'pasillo', 'rack', 'nivel', 'posicion', 'estado', 'capacidadMaxima', 'descripcion', 'activo'] as const) {
        if (dto[campo] !== undefined)
            (u as any)[campo] = dto[campo];
    } if (dto.codigo !== undefined)
        u.codigo = String(dto.codigo).trim().toUpperCase(); return this.ubicaciones.save(u); }
    async listarUbicacionesProducto(empresaId: string, productoId: string) {
        const producto = await this.dataSource.getRepository(Producto).findOne({ where: { id: productoId, empresaId } });
        if (!producto)
            throw new NotFoundException('Producto no encontrado');
        return this.productoUbicaciones.find({ where: { empresaId, productoId, activo: true }, relations: ['almacen', 'ubicacion'], order: { esPrincipal: 'DESC', fechaCreacion: 'ASC' } });
    }
    async asignarUbicacionProducto(empresaId: string, productoId: string, dto: any) {
        const producto = await this.dataSource.getRepository(Producto).findOne({ where: { id: productoId, empresaId } });
        if (!producto)
            throw new NotFoundException('Producto no encontrado');
        if (producto.tipo === 'SERVICIO')
            throw new BadRequestException('Un servicio no puede asignarse a una ubicación física');
        const ubicacion = await this.ubicaciones.findOne({ where: { id: dto.ubicacionId, empresaId }, relations: ['almacen'] });
        if (!ubicacion || !ubicacion.activo)
            throw new NotFoundException('Ubicación no encontrada o inactiva');
        if (ubicacion.estado !== EstadoUbicacionAlmacen.DISPONIBLE)
            throw new BadRequestException(`La ubicación está en estado ${ubicacion.estado}`);
        const existente = await this.productoUbicaciones.findOne({ where: { empresaId, productoId, ubicacionId: ubicacion.id } });
        if (dto.esPrincipal) {
            await this.productoUbicaciones.update({ empresaId, productoId, almacenId: ubicacion.almacenId }, { esPrincipal: false });
        }
        const entidad = existente ?? this.productoUbicaciones.create({ empresaId, productoId, almacenId: ubicacion.almacenId, ubicacionId: ubicacion.id });
        entidad.esPrincipal = Boolean(dto.esPrincipal);
        entidad.activo = true;
        entidad.capacidadAsignada = dto.capacidadAsignada === undefined ? entidad.capacidadAsignada : n(dto.capacidadAsignada);
        entidad.stockMinimo = dto.stockMinimo === undefined ? entidad.stockMinimo : n(dto.stockMinimo);
        entidad.stockMaximo = dto.stockMaximo === undefined ? entidad.stockMaximo : n(dto.stockMaximo);
        entidad.observaciones = dto.observaciones;
        if (n(entidad.stockMaximo) > 0 && n(entidad.stockMinimo) > n(entidad.stockMaximo))
            throw new BadRequestException('El stock mínimo no puede superar el máximo');
        return this.productoUbicaciones.save(entidad);
    }
    async actualizarAsignacionProducto(empresaId: string, id: string, dto: any) {
        const a = await this.productoUbicaciones.findOne({ where: { id, empresaId } });
        if (!a)
            throw new NotFoundException('Asignación no encontrada');
        if (dto.esPrincipal) {
            await this.productoUbicaciones.update({ empresaId, productoId: a.productoId, almacenId: a.almacenId }, { esPrincipal: false });
            a.esPrincipal = true;
        }
        if (dto.activo !== undefined)
            a.activo = Boolean(dto.activo);
        for (const k of ['capacidadAsignada', 'stockMinimo', 'stockMaximo'] as const)
            if (dto[k] !== undefined)
                (a as any)[k] = n(dto[k]);
        if (dto.observaciones !== undefined)
            a.observaciones = dto.observaciones;
        if (n(a.stockMaximo) > 0 && n(a.stockMinimo) > n(a.stockMaximo))
            throw new BadRequestException('El stock mínimo no puede superar el máximo');
        return this.productoUbicaciones.save(a);
    }
    async listarStockUbicaciones(empresaId: string, filtros: any = {}) {
        const where: any = { empresaId };
        for (const k of ['productoId', 'almacenId', 'ubicacionId', 'estado'] as const) {
            if (filtros?.[k])
                where[k] = filtros[k];
        }
        return this.stockUbicaciones.find({
            where,
            relations: ['producto', 'almacen', 'ubicacion', 'lote'],
            order: { almacenId: 'ASC', ubicacionId: 'ASC', fechaCreacion: 'ASC' },
        });
    }
    async reubicar(empresaId: string, usuarioId: string | undefined, dto: any) {
        const cantidad = n(dto.cantidad);
        if (cantidad <= 0)
            throw new BadRequestException('La cantidad a reubicar debe ser mayor a cero');
        if (!dto.stockUbicacionId)
            throw new BadRequestException('Selecciona la existencia de origen');
        if (!dto.ubicacionDestinoId)
            throw new BadRequestException('Selecciona la ubicación destino');
        return this.dataSource.transaction(async (em) => {
            const origen = await em.createQueryBuilder(StockUbicacion, 'su').setLock('pessimistic_write')
                .where('su.id=:id AND su.empresaId=:empresaId', { id: dto.stockUbicacionId, empresaId }).getOne();
            if (!origen)
                throw new NotFoundException('Existencia por ubicación no encontrada');
            if (origen.ubicacionId === dto.ubicacionDestinoId)
                throw new BadRequestException('La ubicación origen y destino deben ser diferentes');
            if (n(origen.cantidad) < cantidad)
                throw new BadRequestException(`Cantidad insuficiente en origen. Disponible: ${n(origen.cantidad)}`);
            const destinoUb = await em.findOne(UbicacionAlmacen, { where: { id: dto.ubicacionDestinoId, empresaId, almacenId: origen.almacenId, activo: true } });
            if (!destinoUb)
                throw new BadRequestException('La ubicación destino no existe, está inactiva o pertenece a otro almacén');
            if (destinoUb.estado !== EstadoUbicacionAlmacen.DISPONIBLE)
                throw new BadRequestException(`La ubicación destino está en estado ${destinoUb.estado}`);
            const asignacion = await em.findOne(ProductoUbicacion, { where: { empresaId, productoId: origen.productoId, almacenId: origen.almacenId, ubicacionId: destinoUb.id, activo: true } });
            if (!asignacion)
                throw new BadRequestException('El producto no está asignado a la ubicación destino');
            const totalDestino = await em.createQueryBuilder(StockUbicacion, 'su').select('COALESCE(SUM(su.cantidad),0)', 'total')
                .where('su.empresaId=:empresaId AND su.ubicacionId=:ubicacionId', { empresaId, ubicacionId: destinoUb.id }).getRawOne();
            const capacidad = n(destinoUb.capacidadMaxima || asignacion.capacidadAsignada);
            if (capacidad > 0 && n(totalDestino?.total) + cantidad > capacidad)
                throw new BadRequestException(`La ubicación destino excedería su capacidad (${capacidad})`);
            let destino = await em.findOne(StockUbicacion, { where: { empresaId, productoId: origen.productoId, almacenId: origen.almacenId, ubicacionId: destinoUb.id, loteId: origen.loteId, estado: origen.estado } });
            if (!destino)
                destino = em.create(StockUbicacion, { empresaId, productoId: origen.productoId, almacenId: origen.almacenId, ubicacionId: destinoUb.id, loteId: origen.loteId, estado: origen.estado, cantidad: 0 });
            origen.cantidad = n(origen.cantidad) - cantidad;
            destino.cantidad = n(destino.cantidad) + cantidad;
            await em.save([origen, destino]);
            return { mensaje: 'Reubicación registrada correctamente', usuarioId, productoId: origen.productoId, loteId: origen.loteId, ubicacionOrigenId: origen.ubicacionId, ubicacionDestinoId: destinoUb.id, cantidad, estado: origen.estado };
        });
    }
    async verificarConsistenciaUbicaciones(empresaId: string) {
        const resumen = await this.dataSource.query(`
      SELECT s.productoId, s.almacenId, CAST(s.cantidad AS float) stockAlmacen,
             CAST(COALESCE(SUM(su.cantidad),0) AS float) stockUbicado
      FROM stock_por_almacen s
      LEFT JOIN stock_ubicaciones su ON su.empresaId=s.empresaId AND su.productoId=s.productoId AND su.almacenId=s.almacenId
      WHERE s.empresaId=$1
      GROUP BY s.productoId,s.almacenId,s.cantidad
      HAVING ABS(CAST(s.cantidad AS float)-CAST(COALESCE(SUM(su.cantidad),0) AS float))>0.0001
    `, [empresaId]);
        return { ok: resumen.length === 0, totalDiferencias: resumen.length, diferencias: resumen };
    }
    async crearConteo(empresaId: string, usuarioId: string | undefined, dto: any) {
        return this.dataSource.transaction(async (em) => {
            const almacen = await em.findOne(Almacen, { where: { id: dto.almacenId, empresaId, activo: true } });
            if (!almacen)
                throw new NotFoundException('Almacén no encontrado');
            const c = em.create(ConteoInventario, { empresaId, folio: folio('CNT'), almacenId: dto.almacenId, estado: EstadoConteoInventario.ABIERTO, motivo: dto.motivo || 'Conteo físico por ubicación', conteoCiego: dto.conteoCiego !== false, creadoPor: usuarioId, fechaApertura: new Date() });
            await em.save(c);
            const where: any = { empresaId, almacenId: dto.almacenId };
            if (dto.ubicacionId)
                where.ubicacionId = dto.ubicacionId;
            if (dto.productoId)
                where.productoId = dto.productoId;
            const fisicos = await em.find(StockUbicacion, { where, relations: ['producto', 'ubicacion', 'lote'] });
            if (!fisicos.length)
                throw new BadRequestException('No existe inventario localizado para los filtros del conteo');
            for (const su of fisicos) {
                await em.save(em.create(ConteoInventarioDetalle, { conteoId: c.id, productoId: su.productoId, ubicacionId: su.ubicacionId, loteId: su.loteId, estadoStock: su.estado, existenciaTeorica: n(su.cantidad), diferencia: 0 }));
            }
            return em.findOne(ConteoInventario, { where: { id: c.id }, relations: ['almacen', 'detalles', 'detalles.producto', 'detalles.ubicacion', 'detalles.lote'] });
        });
    }
    async capturarConteo(empresaId: string, id: string, usuarioId: string, dto: any) { const c = await this.conteos.findOne({ where: { id, empresaId } }); if (!c)
        throw new NotFoundException('Conteo no encontrado'); if (![EstadoConteoInventario.ABIERTO, EstadoConteoInventario.EN_CONTEO].includes(c.estado))
        throw new BadRequestException('El conteo ya no admite captura'); for (const x of dto.detalles || []) {
        const d = await this.conteoDetalles.findOne({ where: { id: x.detalleId, conteoId: id } });
        if (!d)
            throw new BadRequestException('La captura contiene una partida ajena al conteo.');
        if (x.reconteo !== undefined)
            d.reconteo = n(x.reconteo);
        else
            d.primerConteo = n(x.cantidad);
        /*
         * `!= null` y no `!== undefined`: la columna `reconteo` es NULLABLE y el
         * transformador de decimales devuelve `null` tal cual, así que en la
         * primera captura la condición era verdadera y `cantidadFinal` quedaba
         * en `Number(null)` = **0**.
         *
         * No era un redondeo: el almacenista contaba 500 piezas, el detalle
         * guardaba `diferencia = -500`, y al cerrar el conteo se registraba una
         * salida por las 500 y su póliza de merma. El rack quedaba en cero con
         * la mercancía puesta ahí. Y era el único camino posible, porque la
         * pantalla nunca manda `reconteo`.
         */
        d.cantidadFinal = d.reconteo != null ? n(d.reconteo) : n(d.primerConteo);
        d.diferencia = n(d.cantidadFinal) - n(d.existenciaTeorica);
        d.observaciones = x.observaciones;
        await this.conteoDetalles.save(d);
    } c.capturadoPor = usuarioId; c.estado = EstadoConteoInventario.PENDIENTE_AUTORIZACION; await this.conteos.save(c); return this.obtenerConteo(empresaId, id); }
    async cerrarConteo(empresaId: string, id: string, usuarioId?: string) {
        const resultado = await this.dataSource.transaction('SERIALIZABLE', async (em) => {
            const c = await em
                .createQueryBuilder(ConteoInventario, 'conteo')
                .setLock('pessimistic_write', undefined, ['conteo'])
                .leftJoinAndSelect('conteo.detalles', 'detalle')
                .leftJoinAndSelect('detalle.lote', 'lote')
                .where('conteo.id = :id AND conteo.empresaId = :empresaId', {
                id,
                empresaId,
            })
                .getOne();
            if (!c)
                throw new NotFoundException('Conteo no encontrado');
            if (c.estado !== EstadoConteoInventario.PENDIENTE_AUTORIZACION) {
                throw new BadRequestException('El conteo debe estar pendiente de autorización');
            }
            if (!usuarioId ||
                c.creadoPor === usuarioId ||
                c.capturadoPor === usuarioId) {
                throw new BadRequestException('La autorización del ajuste debe realizarla una persona distinta de quien abrió o capturó el conteo.');
            }
            const ajustes: Array<{
                productoId: string;
                diferencia: number;
                costoUnitario: number;
            }> = [];
            for (const d of c.detalles) {
                const diferencia = n(d.diferencia);
                if (Math.abs(diferencia) < 0.0001)
                    continue;
                if (diferencia > 0) {
                    const costoUnitario = await this.resolverCostoSobranteConteo(em, empresaId, d.productoId, c.almacenId, n(d.lote?.costoUnitario));
                    await this.inventario.registrarCompra(d.productoId, c.almacenId, diferencia, `Ajuste por conteo ${c.folio}`, empresaId, d.lote?.numeroLote ?? `CONTEO-${c.folio}`, d.lote?.fechaCaducidad
                        ? new Date(d.lote.fechaCaducidad).toISOString()
                        : undefined, undefined, em, costoUnitario, { id: c.id, tipo: 'CONTEO' }, d.ubicacionId);
                    ajustes.push({
                        productoId: d.productoId,
                        diferencia,
                        costoUnitario,
                    });
                }
                else {
                    const salida = await this.inventario.registrarSalida(d.productoId, c.almacenId, Math.abs(diferencia), `Ajuste por conteo ${c.folio}`, empresaId, undefined, d.loteId, em, { id: c.id, tipo: 'CONTEO' }, d.ubicacionId);
                    ajustes.push({
                        productoId: d.productoId,
                        diferencia,
                        costoUnitario: n(salida.costoUnitarioPromedio),
                    });
                }
            }
            let asientoPendienteId: string | undefined;
            if (ajustes.length) {
                const asiento = await this.asientos.encolarEnTransaccion(em, TipoAsiento.AJUSTE_INVENTARIO, {
                    ajusteId: c.id,
                    folio: c.folio,
                    fecha: new Date(),
                    empresaId,
                    detalles: ajustes,
                }, empresaId, c.folio, c.id);
                asientoPendienteId = asiento.id;
            }
            c.estado = EstadoConteoInventario.CERRADO;
            c.autorizadoPor = usuarioId;
            c.fechaCierre = new Date();
            const conteo = await em.save(c);
            return { conteo, asientoPendienteId, ajustes: ajustes.length };
        });
        if (resultado.asientoPendienteId) {
            try {
                await this.asientos.reintentarAhora(resultado.asientoPendienteId, empresaId);
            }
            catch (error) {
                const mensaje = error instanceof Error ? error.message : String(error);
                this.logger.error(`Conteo ${resultado.conteo.folio} cerrado, pero la póliza de ajuste quedó pendiente: ${mensaje}`);
            }
        }
        return {
            ...resultado.conteo,
            ajustesAplicados: resultado.ajustes,
            estadoContable: resultado.asientoPendienteId ? 'EN_COLA' : 'NO_APLICA',
            asientoPendienteId: resultado.asientoPendienteId,
        };
    }
    async listarConteos(empresaId: string) { return this.conteos.find({ where: { empresaId }, relations: ['almacen'], order: { fechaCreacion: 'DESC' } }); }
    async obtenerConteo(empresaId: string, id: string) { const c = await this.conteos.findOne({ where: { id, empresaId }, relations: ['almacen', 'detalles', 'detalles.producto', 'detalles.ubicacion', 'detalles.lote'] }); if (!c)
        throw new NotFoundException('Conteo no encontrado'); return c; }
}

