import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  EstadoOC,
  OrdenCompra,
  estadoDerivadoOC,
  valorRecibidoOC,
} from '../entities/orden-compra.entity';
import { DetalleOrdenCompra } from '../entities/detalle-orden-compra.entity';
import { Cotizacion } from '../entities/cotizacion.entity';
import { Requisicion } from '../entities/requisicion.entity';
import { InventarioService } from '../../catalogo/services/inventario.service';
import { Producto } from '../../catalogo/entities/producto.entity';
import { MailService } from '../../common/services/mail.service';
import { NotificacionesService } from '../../notificaciones/notificaciones.service';
import { AsientosPendientesService } from '../../finanzas/services/asientos-pendientes.service';
import { TipoAsiento } from '../../finanzas/entities/asiento-pendiente.entity';
import { CajaService } from '../../caja/services/caja.service';
import {
  NaturalezaMovimientoCaja,
  TipoMovimientoCaja,
} from '../../caja/entities/movimiento-caja.entity';
import {
  EstadoContablePagoProveedor,
  PagoProveedor,
} from '../entities/pago-proveedor.entity';
import {
  CuentaBancaria,
  TipoCuentaBancaria,
} from '../../credito/entities/cuenta-bancaria.entity';
import { RecepcionCompra } from '../entities/recepcion-compra.entity';
import { RecepcionCompraDetalle } from '../entities/recepcion-compra-detalle.entity';
import { TesoreriaService } from '../../tesoreria/services/tesoreria.service';
import { esViolacionUnicidad } from '../../common/database/errores-sql';
import {
  diaCalendario,
  fechaCalendario,
} from '../../common/utils/fecha-calendario.util';
import {
  OrigenMovimiento,
  TipoMovimiento,
} from '../../tesoreria/entities/tesoreria.entity';

@Injectable()
export class OrdenesCompraService {
  constructor(
    @InjectRepository(OrdenCompra)
    private readonly ocRepo: Repository<OrdenCompra>,
    @InjectRepository(DetalleOrdenCompra)
    private readonly detalleOCRepo: Repository<DetalleOrdenCompra>,
    @InjectRepository(Cotizacion)
    private readonly cotizacionRepo: Repository<Cotizacion>,
    @InjectRepository(Requisicion)
    private readonly requisicionRepo: Repository<Requisicion>,
    private readonly inventarioService: InventarioService,
    private readonly mailService: MailService,
    private readonly dataSource: DataSource,
    private readonly asientos: AsientosPendientesService,
    private readonly tesoreria: TesoreriaService,
    private readonly notificaciones: NotificacionesService,
    private readonly caja: CajaService,
  ) {}

  async crearDesdeCotizacion(cotizacionId: string, empresaId: string) {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const cotizacion = await qr.manager
        .createQueryBuilder(Cotizacion, 'cot')
        .setLock('pessimistic_write', undefined, ['cot'])
        .leftJoinAndSelect('cot.detalles', 'detalles')
        .leftJoinAndSelect('cot.proveedor', 'proveedor')
        .where('cot.id = :cotizacionId AND cot.empresaId = :empresaId', { cotizacionId, empresaId })
        .getOne();
      if (!cotizacion) throw new NotFoundException('Cotización no encontrada');
      if (cotizacion.estado !== 'APROBADA') {
        throw new BadRequestException('La adjudicación debe estar APROBADA antes de generar la orden de compra.');
      }
      if (
        !cotizacion.proveedor ||
        cotizacion.proveedor.empresaId !== empresaId ||
        !cotizacion.proveedor.activo ||
        !['APROBADO', 'CONDICIONADO'].includes(
          cotizacion.proveedor.estadoHomologacion,
        )
      ) {
        throw new BadRequestException(
          'El proveedor está inactivo, bloqueado o ya no cuenta con homologación vigente.',
        );
      }

      const existente = await qr.manager.findOne(OrdenCompra, { where: { cotizacionId, empresaId } });
      if (existente) throw new BadRequestException('Esta cotización ya fue convertida en orden de compra.');

      const requisicion = await qr.manager
        .createQueryBuilder(Requisicion, 'req')
        .setLock('pessimistic_write')
        .where('req.id = :id AND req.empresaId = :empresaId', { id: cotizacion.requisicionId, empresaId })
        .getOne();
      if (!requisicion) throw new NotFoundException('Requisición no encontrada');
      if (requisicion.estado !== 'COTIZANDO') {
        throw new BadRequestException(`La requisición ya no puede adjudicarse; estado actual: ${requisicion.estado}.`);
      }

      const otraOrden = await qr.manager
        .createQueryBuilder(OrdenCompra, 'oc')
        .innerJoin(Cotizacion, 'c', 'c.id = oc.cotizacionId')
        .where('c.requisicionId = :requisicionId AND oc.empresaId = :empresaId', { requisicionId: requisicion.id, empresaId })
        .getOne();
      if (otraOrden) throw new BadRequestException('La requisición ya tiene una orden de compra generada.');

      const oc = await qr.manager.save(qr.manager.create(OrdenCompra, {
        empresaId, cotizacionId: cotizacion.id, proveedorId: cotizacion.proveedorId,
        total: Number(cotizacion.total), totalPagado: 0, saldoPendiente: Number(cotizacion.total),
      }));
      /*
       * La tasa y el importe de impuesto se COPIAN de la cotización. No se
       * vuelven a calcular ni se leen del catálogo: lo que se pactó con el
       * proveedor es lo que se va a recibir y lo que se va a pagar.
       */
      await qr.manager.save(cotizacion.detalles.map(det => qr.manager.create(DetalleOrdenCompra, {
        ordenCompraId: oc.id, productoId: det.productoId, cantidad: Number(det.cantidad),
        precioUnitario: Number(det.precioUnitario), subtotal: Number(det.subtotal),
        tasaIva: Number(det.tasaIva ?? 0),
        impuestoImporte: Number(det.impuestoImporte ?? 0),
      })));

      cotizacion.estado = 'SELECCIONADA';
      await qr.manager.save(cotizacion);
      await qr.manager.createQueryBuilder().update(Cotizacion)
        .set({ estado: 'RECHAZADA' })
        .where('requisicionId = :requisicionId AND empresaId = :empresaId AND id <> :id AND estado <> :seleccionada', {
          requisicionId: requisicion.id, empresaId, id: cotizacion.id, seleccionada: 'SELECCIONADA',
        }).execute();
      requisicion.estado = 'ORDEN_GENERADA';
      await qr.manager.save(requisicion);
      await qr.commitTransaction();

      const completa = await this.obtenerPorId(oc.id, empresaId);
      if (completa?.proveedor) {
        this.notificaciones.notificarOrdenCompraProveedor(completa, completa.proveedor)
          .catch((e) => console.error('[Email] OC proveedor:', e?.message));
      }
      return completa;
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  async obtenerTodas(empresaId: string) {
    return this.ocRepo.find({
      where: { empresaId },
      relations: ['detalles', 'detalles.producto', 'proveedor'],
      order: { fechaCreacion: 'DESC' },
    });
  }

  async obtenerPorId(id: string, empresaId: string) {
    let oc = await this.ocRepo.findOne({
      where: { id, empresaId },
      relations: [
        'detalles',
        'detalles.producto',
        'detalles.producto.impuesto',
        'detalles.producto.equivalencias',
        'proveedor',
        'cotizacion',
      ],
    });
    if (!oc) throw new NotFoundException('Orden de compra no encontrada');
    return oc;
  }

  /**
   * Las únicas dos transiciones que se deciden a mano: enviar y cancelar.
   *
   * El resto de la etiqueta ya no se escribe: se deriva de cuánto llegó y
   * cuánto se pagó. Antes se permitía volver de `CON_INCIDENCIAS` a `ENVIADA`,
   * que era un parche para poder seguir recibiendo; ahora recibir no depende
   * de la etiqueta, así que el parche sobra.
   *
   * Cancelar exige que no haya pasado nada: una orden con mercancía recibida o
   * con dinero pagado no se cancela, se cierra por otra vía —devolución o nota
   * de crédito— porque ya dejó rastro en inventario y en contabilidad.
   */
  async cambiarEstado(id: string, empresaId: string, nuevoEstado: EstadoOC) {
    const oc = await this.ocRepo.findOne({ where: { id, empresaId } });
    if (!oc) throw new NotFoundException('Orden de compra no encontrada');

    if (nuevoEstado === 'ENVIADA') {
      if (oc.estado !== 'PENDIENTE') {
        throw new BadRequestException(
          `Sólo una orden PENDIENTE puede enviarse; ésta está ${oc.estado}.`,
        );
      }
      oc.estado = 'ENVIADA';
      return this.ocRepo.save(oc);
    }

    if (nuevoEstado === 'CANCELADA') {
      if (oc.estado === 'CANCELADA') return oc;
      if (oc.estadoRecepcion !== 'PENDIENTE') {
        throw new BadRequestException(
          'No se puede cancelar una orden con mercancía ya recibida. Registra la devolución al proveedor.',
        );
      }
      if (oc.estadoPago !== 'PENDIENTE') {
        throw new BadRequestException(
          'No se puede cancelar una orden con pagos registrados.',
        );
      }
      oc.estado = 'CANCELADA';
      return this.ocRepo.save(oc);
    }

    throw new BadRequestException(
      `El estado ${nuevoEstado} no se asigna a mano: se deriva de las recepciones y los pagos.`,
    );
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * RECEPCIÓN DE MERCANCÍA
   * ───────────────────────────────────────────────────────────────────────────
   * CORRECCIONES SOBRE LA VERSIÓN ANTERIOR
   *
   * 1. TODO DENTRO DE UNA TRANSACCIÓN. Antes las entradas de inventario, la
   *    actualización de los detalles, la de la orden y la de la requisición
   *    ocurrían por separado. Si fallaba después de recibir dos de cinco
   *    productos, el inventario quedaba parcialmente actualizado y la orden
   *    seguía en ENVIADA — sin forma de saber qué había entrado ya.
   *
   * 2. SE PASA EL COSTO AL INVENTARIO. La orden siempre conoció el
   *    `precioUnitario` — lo usa para la póliza unas líneas abajo — pero no se
   *    lo pasaba a `registrarCompra`. Resultado: los lotes nacían con costo
   *    cero, y todas las salidas posteriores registraban costo cero. Era la
   *    mitad faltante del costeo de inventario.
   *
   * 3. NO SE PUEDE RECIBIR MÁS DE LO ORDENADO. Antes tomaba lo que enviara el
   *    frontend sin comparar. Se podían ordenar 10 piezas y recibir 1,000, lo
   *    que metía al inventario mercancía que nadie compró y generaba una
   *    póliza por un importe sin factura que la respaldara.
   *
   * 4. SE PASA `qr.manager`. Sin él, `registrarCompra` abría su propia
   *    transacción y quedaba fuera de esta: si el resto fallaba, la entrada de
   *    inventario ya estaba confirmada y no se revertía.
   *
   * Las cantidades aceptadas se acumulan por remesa. Las rechazadas se
   * conservan para auditoría, pero no consumen el saldo pendiente de entrega.
   * ═══════════════════════════════════════════════════════════════════════════
   */
  async recibir(
    id: string,
    empresaId: string,
    almacenId: string,
    detallesFront: any[],
    usuarioActual?: any,
    claveIdempotencia?: string,
  ) {
    if (!claveIdempotencia?.trim()) {
      throw new BadRequestException(
        'La clave de idempotencia es obligatoria para recibir mercancía.',
      );
    }

    const recepcionExistente = await this.dataSource
      .getRepository(RecepcionCompra)
      .findOne({
        where: {
          empresaId,
          ordenCompraId: id,
          claveIdempotencia: claveIdempotencia.trim().toLowerCase(),
        },
      });
    if (recepcionExistente) {
      const orden = await this.obtenerPorId(id, empresaId);
      return {
        ...orden,
        recepcionId: recepcionExistente.id,
        idempotente: true,
      };
    }

    let oc = await this.ocRepo.findOne({
      where: { id, empresaId },
      relations: [
        'detalles',
        'detalles.producto',
        'detalles.producto.equivalencias',
        'proveedor',
        'cotizacion',
      ],
    });

    if (!oc) throw new NotFoundException('Orden de compra no encontrada');
    this.exigirRecepcionPosible(oc);

    // ── Validación previa: nada de recibir más de lo ordenado ──
    // Se hace antes de abrir la transacción para fallar rápido y con un
    // mensaje que identifique el producto.
    for (const det of oc.detalles) {
      const captura = detallesFront.find((d) => d.id === det.id);
      if (!captura) continue;

      const recibidaOk = Number(captura.cantidadRecibidaOk || 0);
      const rechazada = Number(captura.cantidadRechazada || 0);

      if (recibidaOk < 0 || rechazada < 0) {
        throw new BadRequestException(
          `${det.producto?.nombre ?? 'Producto'}: las cantidades no pueden ser negativas.`,
        );
      }

      let factor = 1;
      if (captura.equivalenciaId && det.producto?.equivalencias) {
        const eq = det.producto.equivalencias.find(
          (e: any) => e.id === captura.equivalenciaId,
        );
        if (eq) factor = Number(eq.factorConversion) || 1;
      }

      const unidadesAceptadasBase = recibidaOk * factor;
      const ordenado = Number(det.cantidad);
      const yaRecibido = Number(det.cantidadRecibidaOk ?? 0);

      if (yaRecibido + unidadesAceptadasBase > ordenado + 0.0001) {
        throw new BadRequestException(
          `${det.producto?.nombre ?? 'Producto'}: se ordenaron ${ordenado} unidades y ` +
            `ya se aceptaron ${yaRecibido}; estás capturando ${unidadesAceptadasBase} aceptadas adicionales. ` +
            `Si el proveedor envió de más, documéntalo con una orden adicional.`,
        );
      }
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    let huboIncidencias = false;
    let ocGuardada: OrdenCompra;
    let recepcionId = '';
    let asientoRecepcionId: string | undefined;
    const detallesContables: Array<{
      productoId: string;
      cantidad: number;
      costoUnitario: number;
      tasaIva?: number;
    }> = [];

    try {
      // Bloquear y volver a leer dentro de la transacción. La validación
      // anterior solo mejora el mensaje; esta es la que evita dos recepciones
      // simultáneas sobre el mismo saldo.
      const bloqueada = await qr.manager
        .createQueryBuilder(OrdenCompra, 'oc')
        .setLock('pessimistic_write')
        .where('oc.id = :id AND oc.empresaId = :empresaId', { id, empresaId })
        .getOne();
      if (!bloqueada)
        throw new NotFoundException('Orden de compra no encontrada');
      try {
        this.exigirRecepcionPosible(bloqueada);
      } catch {
        throw new BadRequestException(
          `La orden cambió de estado mientras se recibía (${bloqueada.estado}). Recarga e intenta de nuevo.`,
        );
      }
      const actual = await qr.manager.findOne(OrdenCompra, {
        where: { id, empresaId },
        relations: [
          'detalles',
          'detalles.producto',
          'detalles.producto.impuesto',
          'detalles.producto.equivalencias',
          'proveedor',
          'cotizacion',
        ],
      });
      if (!actual) throw new NotFoundException('Orden de compra no encontrada');
      oc = actual;

      const recepcion = await qr.manager.save(
        qr.manager.create(RecepcionCompra, {
          empresaId,
          ordenCompraId: oc.id,
          almacenId,
          detalleJson: JSON.stringify(detallesFront),
          recibidoPorId: usuarioActual?.id ?? usuarioActual?.sub,
          claveIdempotencia: claveIdempotencia.trim().toLowerCase(),
        }),
      );
      recepcionId = recepcion.id;

      for (const det of oc.detalles) {
        const captura = detallesFront.find((d) => d.id === det.id);

        if (!captura) {
          huboIncidencias = true;
          continue;
        }

        const recibidaCaptura = Number(captura.cantidadRecibidaOk || 0);
        const rechazadaCaptura = Number(captura.cantidadRechazada || 0);
        det.motivoRechazo = captura.motivoRechazo || null;

        let factorMultiplicador = 1;
        if (captura.equivalenciaId && det.producto?.equivalencias) {
          const eq = det.producto.equivalencias.find(
            (e: any) => e.id === captura.equivalenciaId,
          );
          if (!eq) {
            throw new BadRequestException(
              `${det.producto?.nombre ?? 'Producto'}: el empaque seleccionado no es válido.`,
            );
          }
          factorMultiplicador = Number(eq.factorConversion) || 1;
        }

        if (recibidaCaptura > 0) {
          if (!captura.ubicacionId) {
            throw new BadRequestException(
              `${det.producto?.nombre ?? 'Producto'}: la ubicación es obligatoria.`,
            );
          }
          if (det.producto?.requiereLote && !String(captura.lote ?? '').trim()) {
            throw new BadRequestException(
              `${det.producto?.nombre ?? 'Producto'}: el lote es obligatorio.`,
            );
          }
          if (det.producto?.requiereCaducidad && !captura.fechaCaducidad) {
            throw new BadRequestException(
              `${det.producto?.nombre ?? 'Producto'}: la fecha de caducidad es obligatoria.`,
            );
          }
          if (captura.fechaCaducidad) {
            const caducidad = new Date(`${captura.fechaCaducidad}T00:00:00`);
            if (Number.isNaN(caducidad.getTime())) {
              throw new BadRequestException(
                `${det.producto?.nombre ?? 'Producto'}: la fecha de caducidad no es válida.`,
              );
            }
            const hoy = new Date();
            hoy.setHours(0, 0, 0, 0);
            if (caducidad < hoy) {
              throw new BadRequestException(
                `${det.producto?.nombre ?? 'Producto'}: no se puede recibir un lote ya vencido.`,
              );
            }
          }
        }

        const recibidasBase = recibidaCaptura * factorMultiplicador;
        const rechazadasBase = rechazadaCaptura * factorMultiplicador;
        const acumuladoAnterior = Number(det.cantidadRecibidaOk ?? 0);
        if (
          acumuladoAnterior + recibidasBase >
          Number(det.cantidad) + 0.0001
        ) {
          throw new BadRequestException(
            `${det.producto?.nombre ?? 'Producto'}: la recepción excede el saldo pendiente.`,
          );
        }

        det.cantidadRecibidaOk = acumuladoAnterior + recibidasBase;
        det.cantidadRechazada =
          Number(det.cantidadRechazada ?? 0) + rechazadasBase;

        await qr.manager.save(
          qr.manager.create(RecepcionCompraDetalle, {
            empresaId,
            recepcionId: recepcion.id,
            detalleOrdenCompraId: det.id,
            productoId: det.productoId,
            cantidadAceptada: recibidasBase,
            cantidadRechazada: rechazadasBase,
            factorConversion: factorMultiplicador,
            equivalenciaId: captura.equivalenciaId || undefined,
            ubicacionId: captura.ubicacionId,
            lote: captura.lote?.trim() || undefined,
            fechaCaducidad: captura.fechaCaducidad || undefined,
            costoUnitario: Number(det.precioUnitario || 0),
            motivoRechazo: captura.motivoRechazo?.trim() || undefined,
          }),
        );

        if (
          rechazadaCaptura > 0 ||
          Number(det.cantidadRecibidaOk) < Number(det.cantidad)
        ) {
          huboIncidencias = true;
        }

        if (recibidaCaptura > 0) {
          /*
           * ──────────────────────────────────────────────────────────────────
           * El costo se manda en la MISMA unidad que la cantidad
           * ------------------------------------------------------------------
           * `registrarCompra` recibe cantidad y costo en la unidad de empaque y
           * los baja a unidad base dividiendo entre el factor: «una caja de 12 a
           * $120 son $10 la pieza». Pero `det.precioUnitario` de la orden ya
           * viene POR UNIDAD BASE —lo confirma la validación de sobre-recepción
           * de arriba, que compara `recibida * factor` contra `det.cantidad`—,
           * así que se estaba volviendo a dividir.
           *
           * El daño: 120 piezas a $10 recibidas como «10 cajas de 12» entraban
           * al inventario valuadas a $0.83 la pieza. El lote quedaba en $100 en
           * vez de $1,200, el costo promedio absorbía el error para siempre, y
           * toda venta posterior mostraba una utilidad inflada mientras el
           * inventario valuado se separaba $1,100 de la cuenta contable.
           *
           * Se multiplica por el factor antes de mandarlo, para que al dividir
           * vuelva a ser el costo por unidad base que de verdad se pagó.
           * ──────────────────────────────────────────────────────────────────
           */
          const costoPorEmpaque =
            Number(det.precioUnitario || 0) * factorMultiplicador;

          await this.inventarioService.registrarCompra(
            det.productoId,
            almacenId,
            recibidaCaptura,
            `Recepción OC #${oc.id.slice(0, 8).toUpperCase()}`,
            empresaId,
            captura.lote,
            captura.fechaCaducidad,
            captura.equivalenciaId,
            qr.manager, // ← dentro de la transacción
            costoPorEmpaque,
            { id: recepcion.id, tipo: 'RECEPCION_COMPRA' },
            captura.ubicacionId,
          );
          /*
           * ──────────────────────────────────────────────────────────────────
           * El costo de reposición del catálogo se mantiene solo
           * ------------------------------------------------------------------
           * `producto.precioCompra` no es el costo de lo que hay en piso —ese
           * vive en los lotes y lo arma el promedio ponderado—, es el costo de
           * REPOSICIÓN: cuánto costaría comprarlo hoy. Se usa para valorar la
           * requisición antes de cotizar, para sugerir el precio de una orden
           * nueva y como red cuando una entrada llega sin costo.
           *
           * Nadie lo mantenía. Se tecleaba una vez al dar de alta el producto
           * —y lo tecleaba el almacenista, que no compra— y se quedaba ahí para
           * siempre, mientras el proveedor subía el precio cada trimestre. La
           * cifra envejecía en silencio y sólo se notaba cuando una entrada sin
           * costo la usaba de fallback y valuaba inventario con el precio de
           * hace dos años.
           *
           * La orden de compra ya sabe lo que se pagó. Se escribe aquí, en la
           * recepción, que es el momento en que ese precio deja de ser una
           * promesa: se recibió la mercancía a ese precio.
           *
           * Se escribe con `update` sobre `{ id, empresaId }` y sólo esa
           * columna: nada más de la ficha del producto viaja de vuelta.
           * ──────────────────────────────────────────────────────────────────
           */
          const costoPorUnidadBase = Number(det.precioUnitario || 0);
          if (costoPorUnidadBase > 0) {
            await qr.manager.update(
              Producto,
              { id: det.productoId, empresaId },
              { precioCompra: costoPorUnidadBase },
            );
          }

          /*
           * Y el asiento se arma en unidad base con el costo por unidad base:
           * antes multiplicaba empaques por costo unitario, así que la póliza de
           * una recepción de 10 cajas decía $100 donde la factura del proveedor
           * decía $1,200.
           */
          /*
           * La tasa sale de la PARTIDA, no del catálogo del producto.
           * Leyéndola del catálogo, cambiar el IVA de un producto entre la
           * orden y su recepción hacía que la póliza registrara un impuesto
           * distinto del que después se acreditaría al pagar, y la cuenta de
           * IVA pendiente quedaba con residuo para siempre.
           */
          detallesContables.push({
            productoId: det.productoId,
            cantidad: recibidasBase,
            costoUnitario: Number(det.precioUnitario || 0),
            tasaIva: Number(det.tasaIva ?? 0),
          });
        }
      }

      await qr.manager.save(oc.detalles);

      const completa = oc.detalles.every(
        (d) => Number(d.cantidadRecibidaOk ?? 0) >= Number(d.cantidad),
      );
      const algoRecibido = oc.detalles.some(
        (d) => Number(d.cantidadRecibidaOk ?? 0) > 0,
      );
      oc.estadoRecepcion = completa
        ? 'COMPLETA'
        : algoRecibido
          ? 'PARCIAL'
          : 'PENDIENTE';
      oc.estado = estadoDerivadoOC(oc);
      huboIncidencias = !completa || huboIncidencias;
      ocGuardada = await qr.manager.save(oc);

      if (oc.cotizacion && oc.cotizacion.requisicionId) {
        await qr.manager.update(Requisicion, oc.cotizacion.requisicionId, {
          estado: (oc.estadoRecepcion === 'COMPLETA'
            ? 'RECIBIDA'
            : 'CON_INCIDENCIAS') as any,
        });
      }

      if (detallesContables.length > 0) {
        const evento = await this.asientos.encolarEnTransaccion(
          qr.manager,
          TipoAsiento.COMPRA,
          {
            compraId: recepcionId,
            folio: recepcionId.slice(0, 8).toUpperCase(),
            /*
             * Y cómo se llama la orden en Compras. Sin esto la póliza decía
             * «Orden #<id de la recepción>» y mandaba a buscar un documento
             * que no existe con ese número.
             */
            folioOrden: `OC-${oc.id.slice(0, 8).toUpperCase()}`,
            fecha: new Date(),
            empresaId,
            detalles: detallesContables,
            totalGeneral: detallesContables.reduce(
              (suma, detalle) =>
                suma + detalle.cantidad * detalle.costoUnitario,
              0,
            ),
          },
          empresaId,
          `RECEPCION-${recepcionId.slice(0, 8)}`,
          recepcionId,
        );
        asientoRecepcionId = evento.id;
      }

      await qr.commitTransaction();
    } catch (err) {
      if (qr.isTransactionActive) await qr.rollbackTransaction();
      if (esViolacionUnicidad(err)) {
        const existente = await this.dataSource
          .getRepository(RecepcionCompra)
          .findOne({
            where: {
              empresaId,
              ordenCompraId: id,
              claveIdempotencia: claveIdempotencia!.trim().toLowerCase(),
            },
          });
        if (existente) {
          const orden = await this.obtenerPorId(id, empresaId);
          return {
            ...orden,
            recepcionId: existente.id,
            idempotente: true,
          };
        }
      }
      throw err;
    } finally {
      await qr.release();
    }

    // El evento contable quedó persistido dentro de la misma transacción que
    // la recepción. Aquí solo se intenta procesarlo; si falla, el cron podrá
    // reintentarlo sin perder la operación de negocio.
    const estadoContable = asientoRecepcionId
      ? await this.asientos.reintentarAhora(asientoRecepcionId, empresaId)
      : undefined;

    this.enviarNotificacionRecepcion(
      ocGuardada,
      usuarioActual,
      huboIncidencias,
    ).catch((err) => console.error('Error al notificar recepción:', err));

    return {
      ...ocGuardada,
      recepcionId,
      estadoContable: estadoContable
        ? estadoContable.generado
          ? 'GENERADO'
          : 'PENDIENTE'
        : 'NO_APLICA',
      asientoPendienteId: asientoRecepcionId,
      polizaId: estadoContable?.polizaId,
    };
  }

  /**
   * ¿Se puede recibir sobre esta orden?
   *
   * Depende de la recepción y no de la etiqueta. Antes exigía estar `ENVIADA`
   * o `CON_INCIDENCIAS`, y en cuanto se registraba un pago parcial la etiqueta
   * pasaba a `PARCIALMENTE_PAGADA`: la mercancía que faltaba ya no se podía
   * dar de alta nunca.
   */
  private exigirRecepcionPosible(oc: OrdenCompra): void {
    if (oc.estado === 'CANCELADA') {
      throw new BadRequestException('La orden está cancelada.');
    }
    const fueEnviada =
      oc.estado === 'ENVIADA' || oc.estadoRecepcion !== 'PENDIENTE';
    if (!fueEnviada) {
      throw new BadRequestException(
        'La orden debe enviarse al proveedor antes de poder recibir mercancía.',
      );
    }
    if (oc.estadoRecepcion === 'COMPLETA') {
      throw new BadRequestException(
        'Esta orden ya se recibió por completo.',
      );
    }
  }

  /**
   * Lo que el almacén puede tener enfrente: todo lo que se envió al proveedor
   * y no está cancelado.
   *
   * Se filtra por los ejes y no por la etiqueta. Con la etiqueta, una orden
   * recibida a medias y pagada a medias se rotulaba `PARCIALMENTE_PAGADA` y
   * desaparecía de esta lista: la mercancía que faltaba se volvía invisible
   * para quien tenía que recibirla.
   */
  async obtenerParaRecepcion(empresaId: string) {
    return this.ocRepo
      .createQueryBuilder('oc')
      .leftJoinAndSelect('oc.detalles', 'detalles')
      .leftJoinAndSelect('detalles.producto', 'producto')
      .leftJoinAndSelect('oc.proveedor', 'proveedor')
      .where('oc.empresaId = :empresaId', { empresaId })
      .andWhere('oc.estado <> :cancelada', { cancelada: 'CANCELADA' })
      .andWhere(
        '(oc.estado = :enviada OR oc.estadoRecepcion <> :sinRecibir)',
        { enviada: 'ENVIADA', sinRecibir: 'PENDIENTE' },
      )
      .orderBy('oc.fechaCreacion', 'DESC')
      .getMany();
  }

  async pagarOrden(
    id: string,
    empresaId: string,
    dto: {
      montoPagado: number;
      cuentaBancariaId: string;
      referencia?: string;
      fechaPago?: string;
      claveIdempotencia: string;
    },
    usuarioId?: string,
  ) {
    if (!dto.claveIdempotencia?.trim()) {
      throw new BadRequestException('La clave de idempotencia es obligatoria para registrar el pago.');
    }
    const pagoExistente = await this.dataSource.getRepository(PagoProveedor).findOne({
      where: { empresaId, ordenCompraId: id, claveIdempotencia: dto.claveIdempotencia.trim().toLowerCase() },
    });
    if (pagoExistente) {
      const orden = await this.obtenerPorId(id, empresaId);
      return { orden, pago: pagoExistente, ivaReclasificado: Number(pagoExistente.ivaReclasificado ?? 0), idempotente: true };
    }

    if (!dto.cuentaBancariaId) {
      throw new BadRequestException('Selecciona la cuenta bancaria o caja desde la que se realiza el pago.');
    }
    const monto = Number(dto.montoPagado);
    if (!Number.isFinite(monto) || monto <= 0) {
      throw new BadRequestException('El monto pagado debe ser mayor a cero.');
    }
    /*
     * ──────────────────────────────────────────────────────────────────────
     * La fecha de pago es un DÍA, no un instante
     * ----------------------------------------------------------------------
     * `new Date('2026-09-20')` es medianoche UTC, y TypeORM escribe las
     * columnas `date` con los captadores locales: en UTC-6 ese pago quedaba
     * registrado el 19. Peor, el movimiento de tesorería se fechaba con
     * `toISOString()`, que rinde en UTC, así que decía 20.
     *
     * Resultado: el pago y su movimiento de tesorería quedaban en días
     * distintos. Nadie lo nota hasta que alguien concilia el banco por día y
     * le falta un cargo que aparece en la víspera. Con `fechaPago` vacía
     * pasaba lo simétrico: todo pago capturado después de las 18:00 se le iba
     * al día siguiente en tesorería.
     *
     * `fechaCalendario` parsea a medianoche LOCAL y `diaCalendario` rinde con
     * los mismos captadores con los que se guarda. El día que entra es el día
     * que sale, en los dos registros.
     * ──────────────────────────────────────────────────────────────────────
     */
    const fechaPago = fechaCalendario(dto.fechaPago ?? undefined);
    if (Number.isNaN(fechaPago.getTime())) {
      throw new BadRequestException('La fecha de pago no es válida.');
    }
    const diaPago = diaCalendario(fechaPago);

    let resultado: any;
    try {
      resultado = await this.dataSource.transaction(async (em) => {
      const oc = await em
        .createQueryBuilder(OrdenCompra, 'oc')
        .setLock('pessimistic_write')
        .where('oc.id = :id AND oc.empresaId = :empresaId', { id, empresaId })
        .getOne();
      if (!oc) throw new NotFoundException('Orden de compra no encontrada');
      oc.detalles = await em.find(DetalleOrdenCompra, {
        where: { ordenCompraId: id },
      });

      /*
       * ──────────────────────────────────────────────────────────────────────
       * Se paga lo que llegó, no lo que se pidió
       * ----------------------------------------------------------------------
       * Antes el pago exigía estar `RECIBIDA`, es decir: entrega completa. Una
       * orden de 10 piezas con 8 entregadas no se podía pagar aunque el
       * proveedor ya hubiera facturado esas 8, y como la etiqueta se quedaba
       * en `CON_INCIDENCIAS` para siempre, tampoco se podía pagar después.
       *
       * Ahora basta con que haya llegado algo, y el techo es el VALOR
       * RECIBIDO con su impuesto proporcional. Pagar contra el total ordenado
       * con la entrega corta sería pagar mercancía que no está en el almacén.
       * ──────────────────────────────────────────────────────────────────────
       */
      if (oc.estado === 'CANCELADA') {
        throw new BadRequestException('La orden está cancelada.');
      }
      if (oc.estadoRecepcion === 'PENDIENTE') {
        throw new BadRequestException(
          'No se puede pagar una orden de la que no se ha recibido nada.',
        );
      }
      if (oc.estadoPago === 'PAGADA') {
        throw new BadRequestException('La orden ya está liquidada.');
      }

      {
        const cuenta = await em.findOne(CuentaBancaria, {
          where: { id: dto.cuentaBancariaId, empresaId, activo: true },
        });
        if (!cuenta) {
          throw new NotFoundException(
            'La cuenta bancaria no existe, está inactiva o pertenece a otra empresa.',
          );
        }
      }

      const pagadoAnterior = Number(oc.totalPagado ?? 0);
      const pagable = valorRecibidoOC(oc.detalles ?? []);
      const saldo = Math.max(0, pagable - pagadoAnterior);
      if (monto - saldo > 0.009) {
        throw new BadRequestException(
          oc.estadoRecepcion === 'COMPLETA'
            ? `El pago excede el saldo pendiente de ${saldo.toFixed(2)}.`
            : `De esta orden se ha recibido ${pagable.toFixed(2)} y ya se pagaron ` +
              `${pagadoAnterior.toFixed(2)}: el máximo a pagar ahora es ${saldo.toFixed(2)}. ` +
              'El resto podrá pagarse conforme llegue la mercancía.',
        );
      }

      const [acumuladoIva] = await em.query(
        `SELECT COALESCE(SUM(ivaReclasificado), 0) iva
         FROM pagos_proveedor
         WHERE empresaId = $1 AND ordenCompraId = $2`,
        [empresaId, id],
      );
      /*
       * El IVA de la orden se suma de sus propias partidas. Antes se leía de
       * `cotizacion.impuestoTotal`: si la orden se generaba de una cotización
       * que luego se tocaba, o si la cotización no venía cargada, la
       * reclasificación de IVA acreditable se calculaba sobre un número que ya
       * no correspondía —o sobre cero, y entonces no se acreditaba nunca.
       */
      const [sumaIva] = await em.query(
        `SELECT COALESCE(SUM(impuestoimporte), 0) iva
           FROM detalles_orden_compra
          WHERE ordencompraid = $1`,
        [id],
      );
      const ivaTotal = Number(sumaIva?.iva ?? 0);
      const ivaRestante = Math.max(
        0,
        Math.round(
          (ivaTotal - Number(acumuladoIva?.iva ?? 0) + Number.EPSILON) * 100,
        ) / 100,
      );
      /*
       * Liquida la orden sólo si además ya llegó todo. Con entrega parcial se
       * paga el saldo de lo recibido, pero queda pendiente lo que falta, así
       * que no se puede acreditar el IVA que todavía no se ha causado.
       */
      const liquidaOrden =
        monto + 0.009 >= saldo && oc.estadoRecepcion === 'COMPLETA';
      const ivaReclasificado =
        ivaTotal > 0 && pagable > 0
          ? liquidaOrden
            ? ivaRestante
            : Math.min(
                ivaRestante,
                Math.round(
                  ((monto * ivaTotal) / Number(oc.total || pagable) +
                    Number.EPSILON) *
                    100,
                ) / 100,
              )
          : 0;

      const pago = await em.save(
        em.create(PagoProveedor, {
          empresaId,
          ordenCompraId: id,
          monto,
          ivaReclasificado,
          cuentaBancariaId: dto.cuentaBancariaId,
          referencia: dto.referencia,
          fechaPago,
          registradoPorId: usuarioId,
          claveIdempotencia: dto.claveIdempotencia.trim().toLowerCase(),
          estadoContable: EstadoContablePagoProveedor.PENDIENTE,
        }),
      );

      const movimiento = await this.tesoreria.registrarEnTransaccion(
        {
          cuentaBancariaId: dto.cuentaBancariaId,
          fecha: diaPago,
          tipo: TipoMovimiento.EGRESO,
          importe: monto,
          concepto: `Pago a proveedor OC-${id.slice(0, 8).toUpperCase()}`,
          origen: OrigenMovimiento.PAGO_PROVEEDOR,
          referencia: dto.referencia,
          documentoId: pago.id,
          tipoDocumento: 'PAGO_PROVEEDOR',
          terceroId: oc.proveedorId,
        },
        empresaId,
        usuarioId,
        em,
      );
      pago.movimientoTesoreriaId = movimiento.id;

      /*
       * Si el pago sale de una cuenta tipo CAJA, el turno también tiene que
       * descargarse. Antes sólo se registraba en tesorería, así que el
       * efectivo salía del cajón sin que bajara `efectivoEsperado`: al cerrar
       * aparecía un faltante, y además se saltaba la validación que impide
       * sacar más efectivo del que hay en el turno.
       */
      const cuentaPago = await em.findOne(CuentaBancaria, {
        where: { id: dto.cuentaBancariaId, empresaId },
      });
      if (cuentaPago?.tipo === TipoCuentaBancaria.CAJA) {
        await this.caja.registrarEnTransaccion(
          em,
          {
            cuentaCajaId: cuentaPago.id,
            naturaleza: NaturalezaMovimientoCaja.SALIDA,
            tipo: TipoMovimientoCaja.RETIRO,
            importe: monto,
            concepto: `Pago a proveedor OC-${id.slice(0, 8).toUpperCase()}`,
            referencia: dto.referencia,
            documentoId: pago.id,
            tipoDocumento: 'PAGO_PROVEEDOR',
          },
          empresaId,
          usuarioId,
        );
      }

      const eventoContable = await this.asientos.encolarEnTransaccion(
        em,
        TipoAsiento.PAGO_PROVEEDOR,
        {
          ocId: id,
          pagoId: pago.id,
          folio: id.slice(0, 8).toUpperCase(),
          fecha: fechaPago,
          empresaId,
          montoPagado: monto,
          ivaReclasificado,
          cuentaBancariaId: dto.cuentaBancariaId,
        },
        empresaId,
        /*
         * El folio del asiento es un FOLIO, no un identificador: aquí se
         * metía el uuid entero y `PAGO-OC-` + 36 caracteres da 44, contra una
         * columna de 40. PostgreSQL abortaba la transacción con «Alguno de los
         * valores excede la longitud permitida», un mensaje que no nombra el
         * campo, y el pago a proveedor no se podía registrar NUNCA. La
         * recepción, dos pasos antes, ya usaba los primeros ocho.
         */
        `PAGO-OC-${pago.id.slice(0, 8).toUpperCase()}`,
        pago.id,
      );
      pago.asientoPendienteId = eventoContable.id;
      await em.save(pago);

      oc.totalPagado = Math.round((pagadoAnterior + monto) * 100) / 100;
      /*
       * El saldo pendiente sigue midiéndose contra el TOTAL de la orden: es lo
       * que el proveedor acabará cobrando si entrega todo. Lo que cambia es
       * cuánto de ese saldo se puede pagar hoy.
       */
      oc.saldoPendiente = Math.max(
        0,
        Math.round((Number(oc.total) - Number(oc.totalPagado)) * 100) / 100,
      );
      oc.estadoPago =
        Number(oc.saldoPendiente) <= 0
          ? 'PAGADA'
          : Number(oc.totalPagado) > 0
            ? 'PARCIAL'
            : 'PENDIENTE';
      oc.estado = estadoDerivadoOC(oc);
      const orden = await em.save(oc);
      return {
        orden,
        pago,
        ivaReclasificado,
        asientoPendienteId: eventoContable.id,
      };
      });
    } catch (err) {
      if (esViolacionUnicidad(err)) {
        const existente = await this.dataSource
          .getRepository(PagoProveedor)
          .findOne({
            where: {
              empresaId,
              ordenCompraId: id,
              claveIdempotencia: dto.claveIdempotencia.trim().toLowerCase(),
            },
          });
        if (existente) {
          const orden = await this.obtenerPorId(id, empresaId);
          return {
            orden,
            pago: existente,
            ivaReclasificado: Number(existente.ivaReclasificado ?? 0),
            idempotente: true,
          };
        }
      }
      throw err;
    }

    const estadoContable = await this.asientos.reintentarAhora(
      resultado.asientoPendienteId,
      empresaId,
    );
    await this.dataSource.getRepository(PagoProveedor).update(
      { id: resultado.pago.id, empresaId },
      {
        estadoContable: estadoContable.generado
          ? EstadoContablePagoProveedor.GENERADO
          : EstadoContablePagoProveedor.PENDIENTE,
        polizaId: estadoContable.polizaId ?? null,
        asientoPendienteId: resultado.asientoPendienteId,
      },
    );

    return {
      ...resultado,
      pago: await this.dataSource.getRepository(PagoProveedor).findOne({
        where: { id: resultado.pago.id, empresaId },
      }),
      estadoContable: estadoContable.generado ? 'GENERADO' : 'PENDIENTE',
      asientoPendienteId: resultado.asientoPendienteId,
      polizaId: estadoContable.polizaId,
    };
  }


  async contarPendientes(empresaId: string) {
    return this.ocRepo.count({ where: { empresaId, estado: 'PENDIENTE' } });
  }

  // ── Email recepción — tu HTML original mantenido intacto ─────────────────
  private async enviarNotificacionRecepcion(
    orden: any,
    almacenista: any,
    hayIncidencias: boolean,
  ) {
    const correosBrutos = [
      orden.usuario?.email,
      orden.proveedor?.email,
      orden.cotizacion?.requisicion?.solicitante?.email,
      almacenista?.email,
    ];

    const correosValidos = correosBrutos.filter(
      (email) => email && typeof email === 'string' && email.trim() !== '',
    );
    if (correosValidos.length === 0) return;

    const destinatariosStr = [...new Set(correosValidos)].join(', ');
    const ocCorta = `OC-${orden.id.substring(0, 8).toUpperCase()}`;
    const fechaActual = new Date().toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const estadoTxt = hayIncidencias
      ? 'RECIBIDO CON INCIDENCIAS'
      : 'RECEPCIÓN COMPLETA';
    const colorPrimario = hayIncidencias ? '#ef4444' : '#059669';
    const colorFondoEncabezado = hayIncidencias ? '#fef2f2' : '#ecfdf5';

    const filasProductos = orden.detalles
      .map(
        (det: any) => `
      <tr>
        <td style="padding:12px 15px;border-bottom:1px solid #e2e8f0;color:#1e293b;font-size:14px">
          <strong>${det.producto?.nombre || 'Producto sin nombre'}</strong><br/>
          <span style="color:#64748b;font-size:12px;font-family:monospace">SKU: ${det.producto?.sku || 'N/D'}</span>
        </td>
        <td style="padding:12px 15px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:14px;text-align:center">${det.cantidad}</td>
        <td style="padding:12px 15px;border-bottom:1px solid #e2e8f0;color:#059669;font-size:14px;font-weight:bold;text-align:center">${det.cantidadRecibidaOk}</td>
        <td style="padding:12px 15px;border-bottom:1px solid #e2e8f0;color:#ef4444;font-size:14px;font-weight:bold;text-align:center">${det.cantidadRechazada > 0 ? det.cantidadRechazada : '-'}</td>
        <td style="padding:12px 15px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px">${det.motivoRechazo || 'N/A'}</td>
      </tr>`,
      )
      .join('');

    const cuerpoHtml = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body{font-family:'Helvetica Neue',Arial,sans-serif;background:#f4f7f6;margin:0;padding:0}
  .container{max-width:700px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 4px 15px rgba(0,0,0,.05);border:1px solid #e2e8f0}
  .header{background:${colorFondoEncabezado};border-bottom:3px solid ${colorPrimario};padding:30px 40px;text-align:center}
  .header h1{margin:0;color:${colorPrimario};font-size:24px;text-transform:uppercase;letter-spacing:1px}
  .content{padding:40px}
  .info-grid{width:100%;margin-bottom:30px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;padding:20px}
  .table-container{width:100%;border-collapse:collapse;margin-top:10px}
  .table-container th{background:#0f172a;color:#fff;padding:12px 15px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.5px}
  .footer{background:#f8fafc;padding:25px 40px;text-align:center;border-top:1px solid #e2e8f0;color:#64748b;font-size:13px}
</style>
</head><body>
<div class="container">
  <div class="header">
    <h1>Notificación de Recepción</h1>
    <p style="margin:10px 0 0;color:#475569;font-size:15px">Ingreso físico de inventario registrado en Syncro ERP</p>
  </div>
  <div class="content">
    <table class="info-grid" cellpadding="10">
      <tr>
        <td><span style="font-size:11px;text-transform:uppercase;color:#64748b;font-weight:bold;display:block">Número de Orden</span><strong>${ocCorta}</strong></td>
        <td><span style="font-size:11px;text-transform:uppercase;color:#64748b;font-weight:bold;display:block">Estado</span><span style="padding:4px 10px;border-radius:4px;font-size:12px;font-weight:bold;color:${colorPrimario};border:1px solid ${colorPrimario};background:${colorFondoEncabezado}">${estadoTxt}</span></td>
      </tr>
      <tr>
        <td><span style="font-size:11px;text-transform:uppercase;color:#64748b;font-weight:bold;display:block">Proveedor</span>${orden.proveedor?.nombre || 'No Especificado'}</td>
        <td><span style="font-size:11px;text-transform:uppercase;color:#64748b;font-weight:bold;display:block">Recibido por</span>${almacenista?.nombreCompleto || almacenista?.nombre || 'Almacén'}</td>
      </tr>
      <tr>
        <td colspan="2"><span style="font-size:11px;text-transform:uppercase;color:#64748b;font-weight:bold;display:block">Fecha y hora</span>${fechaActual}</td>
      </tr>
    </table>
    <h3 style="color:#0f172a;font-size:16px;margin:0 0 15px;border-bottom:2px solid #e2e8f0;padding-bottom:10px">Detalle de la Captura Física</h3>
    <table class="table-container">
      <thead><tr>
        <th>Producto</th><th style="text-align:center">Esperado</th>
        <th style="text-align:center">Recibido OK</th>
        <th style="text-align:center">Rechazado</th><th>Motivo</th>
      </tr></thead>
      <tbody>${filasProductos}</tbody>
    </table>
    <div style="margin-top:30px;padding:15px;border-left:4px solid ${colorPrimario};background:#f8fafc">
      <p style="margin:0;color:#334155;font-size:14px">
        ${
          hayIncidencias
            ? '<strong>Acción Requerida:</strong> Esta recepción presenta discrepancias. El área de compras debe coordinar la devolución o nota de crédito con el proveedor.'
            : '<strong>Recepción Exitosa:</strong> Todas las partidas coinciden. El inventario ha sido actualizado.'
        }
      </p>
    </div>
  </div>
  <div class="footer">
    <p style="margin:0"><strong>Syncro ERP</strong> • Sistema de Gestión Empresarial</p>
    <p style="margin:5px 0 0;font-size:11px">Mensaje automático — No responder directamente.</p>
  </div>
</div></body></html>`;

    await this.mailService.enviarCorreo({
      destinatario: destinatariosStr,
      asunto: `[Syncro ERP] Recepción Almacén: ${ocCorta} - ${estadoTxt}`,
      cuerpo: `Recepción ${ocCorta} por ${almacenista?.nombre || 'Almacén'}. Estado: ${estadoTxt}`,
      cuerpoHtml,
    });
  }
}
