import {
  Injectable,
  BadRequestException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { randomUUID } from 'crypto';

import { Producto } from '../entities/producto.entity';
import { MovimientoInventario } from '../entities/movimiento-inventario.entity';
import { LoteInventario } from '../entities/lote-inventario.entity';
import { ProductoEquivalencia } from '../entities/producto-equivalencia.entity';
import { StockPorAlmacen } from '../entities/stock-por-almacen.entity';
import { Almacen } from '../entities/almacen.entity';
import { TransferenciaInventario, EstadoTransferenciaInventario } from '../entities/transferencia-inventario.entity';
import { TransferenciaInventarioDetalle } from '../entities/transferencia-inventario-detalle.entity';
import { UbicacionAlmacen, EstadoUbicacionAlmacen } from '../entities/ubicacion-almacen.entity';
import { ProductoUbicacion } from '../entities/producto-ubicacion.entity';
import { StockUbicacion, EstadoStockUbicacion } from '../entities/stock-ubicacion.entity';
import { ReservaInventario, EstadoReservaInventario } from '../entities/reserva-inventario.entity';
import { StockService } from './stock.service';

import { AsientosPendientesService } from '../../finanzas/services/asientos-pendientes.service';
import { TipoAsiento } from '../../finanzas/entities/asiento-pendiente.entity';

/**
 * ============================================================================
 * SyncroERP · Inventario
 * ----------------------------------------------------------------------------
 * QUÉ CAMBIÓ Y POR QUÉ
 *
 * El servicio ya hacía bien lo difícil: bloqueo pesimista para que dos cajeros
 * no dejen el stock en negativo, y consumo por caducidad. Eso se conserva
 * intacto.
 *
 * Lo que faltaba era el costo. Ahora:
 *
 * 1. `registrarCompra` recibe el costo unitario y actualiza el promedio
 *    ponderado del lote.
 *
 * 2. `registrarSalida` DEVUELVE el costo real de lo que salió, desglosado por
 *    lote. Antes devolvía solo un mensaje, así que quien llamaba no tenía de
 *    dónde sacar el costo y el motor contable terminaba inventándolo con
 *    `producto.precioCompra`.
 *
 * 3. `transferirStock` arrastra el costo del origen al destino. Antes la
 *    mercancía llegaba al segundo almacén con costo cero o con el precio de
 *    lista, lo que hacía que mover una caja de un lugar a otro cambiara el
 *    valor del inventario de la empresa.
 *
 * 4. Toda salida deja registrado de qué lote salió y a qué costo. El kardex
 *    vale por sí solo y se puede auditar pieza por pieza.
 *
 * NOTA SOBRE LOS DECIMALES
 * El costo unitario usa cuatro decimales; los importes, dos. Con insumos de
 * bajo valor — un gramo de harina, un tornillo — dos decimales redondean el
 * costo a cero y la valuación se desmorona.
 * ============================================================================
 */

/** Detalle de qué lote se consumió y a qué costo: alimenta la póliza. */
export interface ConsumoDeLote {
  loteId: string;
  numeroLote: string;
  cantidad: number;
  costoUnitario: number;
  costoTotal: number;
  fechaCaducidad?: Date;
}

export interface ResultadoSalida {
  mensaje: string;
  cantidadTotal: number;
  /** Costo real de la mercancía que salió. Esto es lo que va a la póliza. */
  costoTotal: number;
  costoUnitarioPromedio: number;
  consumos: ConsumoDeLote[];
}

export interface ResultadoEntrada {
  mensaje: string;
  stockNuevo: number;
  costoUnitarioLote: number;
  costoTotal: number;
}

const redondear2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const redondear4 = (n: number) =>
  Math.round((n + Number.EPSILON) * 10_000) / 10_000;

@Injectable()
export class InventarioService {
  private readonly logger = new Logger(InventarioService.name);

  constructor(
    @InjectRepository(Producto)
    private readonly productoRepository: Repository<Producto>,
    @InjectRepository(MovimientoInventario)
    private readonly movimientoRepository: Repository<MovimientoInventario>,
    @InjectRepository(LoteInventario)
    private readonly loteInventarioRepository: Repository<LoteInventario>,
    @InjectRepository(StockPorAlmacen)
    private readonly stockRepository: Repository<StockPorAlmacen>,
    @InjectRepository(ProductoEquivalencia)
    private readonly equivalenciaRepository: Repository<ProductoEquivalencia>,
    @InjectRepository(TransferenciaInventario)
    private readonly transferenciaRepository: Repository<TransferenciaInventario>,
    private readonly stockService: StockService,
    private readonly dataSource: DataSource,
    private readonly asientos: AsientosPendientesService,
  ) {}

  /* ══ ENTRADA ═════════════════════════════════════════════════════════════ */

  /**
   * Registra una entrada y actualiza el costo promedio del lote.
   *
   * `costoUnitario` es opcional por compatibilidad: si no se envía, se usa el
   * `precioCompra` del producto como antes. Pero eso es lo que causaba el
   * problema, así que **todo llamador nuevo debe enviarlo**.
   */
  async registrarCompra(
    productoId: string,
    almacenId: string,
    cantidad: number,
    motivo: string,
    empresaId: string,
    numeroLote?: string,
    fechaCaducidad?: string,
    equivalenciaId?: string,
    manager?: EntityManager,
    costoUnitario?: number,
    documento?: { id?: string; tipo?: string },
    ubicacionId?: string,
  ): Promise<ResultadoEntrada> {
    if (!almacenId) throw new BadRequestException('El almacén es obligatorio');
    if (cantidad <= 0)
      throw new BadRequestException('La cantidad debe ser mayor a cero');
    if (costoUnitario !== undefined && costoUnitario < 0) {
      throw new BadRequestException('El costo unitario no puede ser negativo');
    }

    const ejecutar = async (em: EntityManager): Promise<ResultadoEntrada> => {
      const almacen = await em.findOne(Almacen, {
        where: { id: almacenId, empresaId },
      });
      if (!almacen)
        throw new UnauthorizedException(
          'El almacén no existe o no pertenece a tu empresa',
        );

      const producto = await em.findOne(Producto, {
        where: { id: productoId, empresaId },
        relations: ['categoria'],
      });
      if (!producto) throw new NotFoundException('Producto no encontrado');

      // El costo llega en la unidad en que se compra; hay que bajarlo a la
      // unidad base junto con la cantidad.
      let cantidadBase = cantidad;
      let costoPorUnidadBase =
        costoUnitario ?? Number(producto.precioCompra ?? 0);

      if (equivalenciaId) {
        const eq = await em.findOne(ProductoEquivalencia, {
          where: { id: equivalenciaId, productoId },
        });
        if (!eq) throw new BadRequestException('Empaque no válido');

        const factor = this.calcularFactorBase(eq);
        cantidadBase = cantidad * factor;
        // Si compraste una caja de 12 a $120, cada pieza costó $10.
        if (costoUnitario !== undefined && factor > 0) {
          costoPorUnidadBase = costoUnitario / factor;
        }
      }

      if (costoPorUnidadBase <= 0) {
        throw new BadRequestException(
          `${producto.nombre}: el costo de entrada debe ser mayor a cero. ` +
            'Captura el costo de compra antes de ingresar existencias.',
        );
      }

      const lote = await this.obtenerOCrearLote(
        em,
        productoId,
        almacenId,
        empresaId,
        numeroLote || 'ÚNICO',
        fechaCaducidad ? new Date(fechaCaducidad) : undefined,
      );

      let ubicacion: UbicacionAlmacen | null = null;
      if (ubicacionId) {
        ubicacion = await em.findOne(UbicacionAlmacen, { where: { id: ubicacionId, almacenId, empresaId, activo: true } });
        if (!ubicacion) throw new BadRequestException('La ubicación no existe, está inactiva o no pertenece al almacén seleccionado.');
        if ([EstadoUbicacionAlmacen.BLOQUEADA, EstadoUbicacionAlmacen.EMBARQUE].includes(ubicacion.estado)) {
          throw new BadRequestException(`La ubicación ${ubicacion.codigo} no admite recepciones en estado ${ubicacion.estado}.`);
        }
        /*
         * ──────────────────────────────────────────────────────────────────
         * Una mercancía que ya salió tiene que poder entrar
         * ------------------------------------------------------------------
         * Aquí había un `throw`: «primero asigna el producto a la ubicación
         * N-01-01». Y la asignación —`producto_ubicaciones`— no es un permiso
         * de almacenamiento: es SLOTTING. Guarda cuál es la posición principal
         * del producto, su capacidad asignada y sus mínimos y máximos. Nada de
         * lo que hay en esa tabla dice «este producto no puede estar aquí».
         *
         * Usarla como reja tuvo dos consecuencias, medidas el 26-sep-2026 con
         * la transferencia TRF-20260926062652-246EF8:
         *
         *   · La pantalla de recepción ofrece TODAS las posiciones DISPONIBLES
         *     del almacén destino. Ninguna de ellas funciona si el producto no
         *     estuvo antes allí, así que el almacenista elige de una lista en
         *     la que cualquier opción es un 400.
         *   · La salida del origen ya está asentada cuando la transferencia se
         *     envía. Si la entrada se rechaza, la mercancía se queda en
         *     tránsito: fuera del almacén que la mandó y sin llegar al que la
         *     espera. Inventario que no cuadra y que nadie puede cuadrar.
         *
         * Lo mismo bloqueaba la recepción de una compra en cualquier posición
         * nueva: es la misma función.
         *
         * En SAP EWM, Business Central y Odoo un putaway a una posición que el
         * operario elige crea el registro producto-posición si falta; lo que
         * impide guardar ahí es el ESTADO de la posición —bloqueada, zona de
         * embarque— y su CAPACIDAD, que se siguen comprobando arriba y abajo
         * de estas líneas. Así que se crea, no principal, y se sigue.
         * ──────────────────────────────────────────────────────────────────
         */
        let asignacion = await em.findOne(ProductoUbicacion, { where: { empresaId, productoId, almacenId, ubicacionId, activo: true } });
        if (!asignacion) {
          const previa = await em.findOne(ProductoUbicacion, { where: { empresaId, productoId, almacenId, ubicacionId } });
          if (previa) {
            // Existía desactivada: se reactiva, conservando su slotting.
            previa.activo = true;
            asignacion = await em.save(previa);
          } else {
            asignacion = await em.save(
              em.create(ProductoUbicacion, {
                empresaId,
                productoId,
                almacenId,
                ubicacionId,
                esPrincipal: false,
                activo: true,
                observaciones: 'Creada automáticamente al recibir mercancía en esta posición.',
              }),
            );
          }
        }
        const actualUb = await em.createQueryBuilder(StockUbicacion, 'su')
          .select('COALESCE(SUM(su.cantidad),0)', 'total')
          .where('su.empresaId=:empresaId AND su.ubicacionId=:ubicacionId', { empresaId, ubicacionId })
          .getRawOne();
        const capacidad = Number(ubicacion.capacidadMaxima ?? asignacion.capacidadAsignada ?? 0);
        if (capacidad > 0 && Number(actualUb?.total ?? 0) + cantidadBase > capacidad) {
          throw new BadRequestException(`La ubicación ${ubicacion.codigo} excedería su capacidad (${capacidad}).`);
        }
      }

      const loteActual = await em
        .createQueryBuilder(LoteInventario, 'lote')
        .setLock('pessimistic_write')
        .where('lote.id = :id', { id: lote.id })
        .getOne();

      if (!loteActual)
        throw new NotFoundException('Lote no encontrado durante el bloqueo');

      const stockAnterior = Number(loteActual.stockRestante);
      const costoAnterior = Number(loteActual.costoUnitario ?? 0);
      const stockNuevo = stockAnterior + cantidadBase;

      // ── Promedio ponderado ──
      // El valor que ya había, más el que entra, dividido entre el total.
      const valorAnterior = stockAnterior * costoAnterior;
      const valorEntrada = cantidadBase * costoPorUnidadBase;
      const costoPromedio =
        stockNuevo > 0
          ? redondear4((valorAnterior + valorEntrada) / stockNuevo)
          : costoPorUnidadBase;

      loteActual.stockRestante = stockNuevo;
      loteActual.costoUnitario = costoPromedio;
      loteActual.valorTotal = redondear2(stockNuevo * costoPromedio);
      await em.save(loteActual);

      if (ubicacion) {
        let stockUb = await em.findOne(StockUbicacion, { where: {
          empresaId, productoId, almacenId, ubicacionId: ubicacion.id,
          loteId: loteActual.id, estado: EstadoStockUbicacion.DISPONIBLE,
        }});
        if (!stockUb) stockUb = em.create(StockUbicacion, {
          empresaId, productoId, almacenId, ubicacionId: ubicacion.id,
          loteId: loteActual.id, estado: EstadoStockUbicacion.DISPONIBLE, cantidad: 0,
        });
        stockUb.cantidad = Number(stockUb.cantidad ?? 0) + cantidadBase;
        await em.save(stockUb);
      }

      await this.stockService.sincronizarResumen(
        productoId,
        almacenId,
        empresaId,
        em,
      );

      const costoTotalEntrada = redondear2(valorEntrada);

      await em.save(
        em.create(MovimientoInventario, {
          productoId,
          almacenId,
          cantidad: cantidadBase,
          tipo: 'ENTRADA',
          motivo: motivo || 'Entrada de inventario (compra)',
          empresaId,
          stockAnterior,
          stockNuevo,
          costoUnitario: redondear4(costoPorUnidadBase),
          costoTotal: costoTotalEntrada,
          lote: loteActual.numeroLote,
          loteId: loteActual.id,
          fechaCaducidadMovimiento: loteActual.fechaCaducidad,
          documentoId: documento?.id,
          tipoDocumento: documento?.tipo,
        }),
      );

      return {
        mensaje: 'Entrada registrada correctamente',
        stockNuevo,
        costoUnitarioLote: costoPromedio,
        costoTotal: costoTotalEntrada,
      };
    };

    if (manager) return ejecutar(manager);
    return this.dataSource.transaction(ejecutar);
  }

  /* ══ SALIDA ══════════════════════════════════════════════════════════════ */

  /**
   * Descuenta stock consumiendo lotes por caducidad y devuelve el costo REAL.
   *
   * El valor de retorno es lo importante: quien llama — una venta, una merma,
   * una producción — recibe cuánto costó exactamente lo que salió y puede
   * registrar el asiento correcto sin adivinar.
   */
  async registrarSalida(
    productoId: string,
    almacenId: string,
    cantidad: number,
    motivo: string,
    empresaId: string,
    equivalenciaId?: string,
    loteEspecificoId?: string,
    manager?: EntityManager,
    documento?: { id?: string; tipo?: string },
    ubicacionId?: string,
    reservaId?: string,
  ): Promise<ResultadoSalida> {
    if (!almacenId) throw new BadRequestException('El almacén es obligatorio');
    if (cantidad <= 0)
      throw new BadRequestException('La cantidad debe ser mayor a cero');

    const ejecutar = async (em: EntityManager): Promise<ResultadoSalida> => {
      const almacen = await em.findOne(Almacen, {
        where: { id: almacenId, empresaId },
      });
      if (!almacen)
        throw new UnauthorizedException(
          'El almacén no existe o no pertenece a tu empresa',
        );

      const producto = await em.findOne(Producto, {
        where: { id: productoId, empresaId },
        relations: ['categoria'],
      });
      if (!producto) throw new NotFoundException('Producto no encontrado');

      let cantidadBase = cantidad;
      if (equivalenciaId) {
        const eq = await em.findOne(ProductoEquivalencia, {
          where: { id: equivalenciaId, productoId },
        });
        if (!eq) throw new BadRequestException('Empaque no válido');
        cantidadBase = cantidad * this.calcularFactorBase(eq);
      }

      // La existencia física no equivale a disponibilidad. Una salida normal no
      // puede tomar unidades reservadas, comprometidas o bloqueadas por WMS.
      const stockResumen = await em
        .createQueryBuilder(StockPorAlmacen, 'stock')
        .setLock('pessimistic_write')
        .where('stock.empresaId = :empresaId', { empresaId })
        .andWhere('stock.productoId = :productoId', { productoId })
        .andWhere('stock.almacenId = :almacenId', { almacenId })
        .getOne();
      if (!stockResumen) {
        throw new BadRequestException('No existe resumen de stock para el producto y almacén.');
      }

      let reserva: ReservaInventario | null = null;
      let disponibleDeReserva = 0;
      if (reservaId) {
        reserva = await em
          .createQueryBuilder(ReservaInventario, 'reserva')
          .setLock('pessimistic_write')
          .where('reserva.id = :reservaId', { reservaId })
          .andWhere('reserva.empresaId = :empresaId', { empresaId })
          .andWhere('reserva.productoId = :productoId', { productoId })
          .andWhere('reserva.almacenId = :almacenId', { almacenId })
          .getOne();
        if (!reserva) {
          throw new BadRequestException('La reserva no existe o no corresponde al producto, almacén y empresa.');
        }
        if (![EstadoReservaInventario.ACTIVA, EstadoReservaInventario.PARCIALMENTE_CONSUMIDA].includes(reserva.estado)) {
          throw new BadRequestException(`La reserva está en estado ${reserva.estado} y no puede consumirse.`);
        }
        if (reserva.expiraEn && new Date(reserva.expiraEn).getTime() <= Date.now()) {
          throw new BadRequestException('La reserva expiró y debe liberarse antes de vender.');
        }
        disponibleDeReserva = Math.max(0, Number(reserva.cantidad) - Number(reserva.cantidadConsumida || 0));
        if (cantidadBase > disponibleDeReserva + 0.0001) {
          throw new BadRequestException(
            `La reserva solo tiene ${disponibleDeReserva} unidades disponibles y la salida solicita ${cantidadBase}.`,
          );
        }
      }

      const disponibleGeneral =
        Number(stockResumen.cantidad || 0) -
        Number(stockResumen.reservado || 0) -
        Number(stockResumen.bloqueado || 0) +
        disponibleDeReserva;
      if (disponibleGeneral + 0.0001 < cantidadBase) {
        throw new BadRequestException(
          `Disponibilidad insuficiente. Física: ${Number(stockResumen.cantidad || 0)}, ` +
          `reservada: ${Number(stockResumen.reservado || 0)}, ` +
          `bloqueada: ${Number(stockResumen.bloqueado || 0)}, ` +
          `disponible para esta salida: ${Math.max(0, disponibleGeneral)}.`,
        );
      }

      /* ── Selección de lotes ── */
      let lotes: LoteInventario[];

      if (loteEspecificoId) {
        const loteManual = await em
          .createQueryBuilder(LoteInventario, 'lote')
          .setLock('pessimistic_write')
          .where('lote.id = :id', { id: loteEspecificoId })
          .andWhere('lote.productoId = :productoId', { productoId })
          .andWhere('lote.almacenId = :almacenId', { almacenId })
          .andWhere('lote.empresaId = :empresaId', { empresaId })
          .getOne();

        if (!loteManual || Number(loteManual.stockRestante) < cantidadBase) {
          throw new BadRequestException(
            'Lote seleccionado inválido o stock insuficiente',
          );
        }
        lotes = [loteManual];
      } else {
        lotes = await em
          .createQueryBuilder(LoteInventario, 'lote')
          .setLock('pessimistic_write')
          .where('lote.productoId = :productoId', { productoId })
          .andWhere('lote.almacenId = :almacenId', { almacenId })
          .andWhere('lote.empresaId = :empresaId', { empresaId })
          .andWhere('lote.stockRestante > 0')
          .getMany();

        // Primero lo que caduca antes; lo sin caducidad al final.
        lotes.sort((a, b) => {
          if (!a.fechaCaducidad && !b.fechaCaducidad) {
            return a.fechaIngreso.getTime() - b.fechaIngreso.getTime();
          }
          if (!a.fechaCaducidad) return 1;
          if (!b.fechaCaducidad) return -1;
          return (
            new Date(a.fechaCaducidad).getTime() -
            new Date(b.fechaCaducidad).getTime()
          );
        });
      }

      // Si se solicita una ubicación concreta, debe pertenecer al almacén y estar activa.
      if (ubicacionId) {
        const ubicacion = await em.findOne(UbicacionAlmacen, {
          where: { id: ubicacionId, almacenId, empresaId, activo: true },
        });
        if (!ubicacion) {
          throw new BadRequestException(
            'La ubicación de salida no existe, está inactiva o no pertenece al almacén.',
          );
        }
      }

      /* ── Consumo ── */
      let restante = cantidadBase;
      let costoAcumulado = 0;
      const movimientos: MovimientoInventario[] = [];
      const consumos: ConsumoDeLote[] = [];

      for (const lote of lotes) {
        if (restante <= 0) break;

        const disponibleLote = Number(lote.stockRestante);

        // Mantiene sincronizada la existencia física por ubicación y excluye
        // unidades reservadas para transferencias u otros documentos.
        const qbUbicaciones = em
          .createQueryBuilder(StockUbicacion, 'su')
          .setLock('pessimistic_write')
          .where('su.empresaId = :empresaId', { empresaId })
          .andWhere('su.productoId = :productoId', { productoId })
          .andWhere('su.almacenId = :almacenId', { almacenId })
          .andWhere('su.loteId = :loteId', { loteId: lote.id })
          .andWhere('su.estado = :estado', { estado: EstadoStockUbicacion.DISPONIBLE })
          .andWhere('su.cantidad > 0');
        if (ubicacionId) {
          qbUbicaciones.andWhere('su.ubicacionId = :ubicacionId', { ubicacionId });
        }
        const stocksUbicacion = await qbUbicaciones.orderBy('su.fechaCreacion', 'ASC').getMany();
        const totalLocalizadoDisponible = stocksUbicacion.reduce(
          (acc, x) => acc + Math.max(0, Number(x.cantidad || 0) - Number(x.reservado || 0)),
          0,
        );
        // Si el lote está localizado, solo se consume la parte no reservada.
        // Si es un lote legado sin ubicaciones, se conserva la salida por lote.
        const disponibleConsumible = stocksUbicacion.length > 0
          ? Math.min(disponibleLote, totalLocalizadoDisponible)
          : disponibleLote;
        const aDescontar = Math.min(disponibleConsumible, restante);
        if (aDescontar <= 0) continue;

        const costoUnitario = Number(lote.costoUnitario ?? 0);
        const costoDelConsumo = redondear2(aDescontar * costoUnitario);
        const stockAnterior = disponibleLote;
        const stockNuevo = disponibleLote - aDescontar;

        if (stocksUbicacion.length > 0) {
          let porLocalizar = aDescontar;
          for (const su of stocksUbicacion) {
            if (porLocalizar <= 0) break;
            const disponibleUbicacion = Math.max(0, Number(su.cantidad || 0) - Number(su.reservado || 0));
            const desc = Math.min(disponibleUbicacion, porLocalizar);
            if (desc <= 0) continue;
            su.cantidad = Number(su.cantidad || 0) - desc;
            porLocalizar -= desc;
            await em.save(su);
          }
          if (porLocalizar > 0.0001) {
            throw new BadRequestException(
              `La existencia disponible por ubicación no coincide con el lote. Faltan ${porLocalizar} unidades.`,
            );
          }
        }

        lote.stockRestante = stockNuevo;
        lote.valorTotal = redondear2(stockNuevo * costoUnitario);
        await em.save(lote);

        movimientos.push(
          em.create(MovimientoInventario, {
            productoId,
            almacenId,
            cantidad: aDescontar,
            tipo: 'SALIDA',
            motivo: motivo || 'Salida de inventario',
            empresaId,
            stockAnterior,
            stockNuevo,
            costoUnitario,
            costoTotal: costoDelConsumo,
            lote: lote.numeroLote,
            loteId: lote.id,
            fechaCaducidadMovimiento: lote.fechaCaducidad,
            documentoId: documento?.id,
            tipoDocumento: documento?.tipo,
          }),
        );

        consumos.push({
          loteId: lote.id,
          numeroLote: lote.numeroLote,
          cantidad: aDescontar,
          costoUnitario,
          costoTotal: costoDelConsumo,
          fechaCaducidad: lote.fechaCaducidad,
        });

        costoAcumulado += costoDelConsumo;
        restante -= aDescontar;
      }

      if (restante > 0) {
        throw new BadRequestException(
          ubicacionId
            ? `Stock insuficiente en la ubicación seleccionada. Faltan ${restante} unidades disponibles no reservadas.`
            : `Stock insuficiente no reservado. Faltan ${restante} unidades.`,
        );
      }

      await em.save(movimientos);

      if (reserva) {
        reserva.cantidadConsumida = redondear4(Number(reserva.cantidadConsumida || 0) + cantidadBase);
        const pendiente = Math.max(0, Number(reserva.cantidad) - Number(reserva.cantidadConsumida));
        reserva.estado = pendiente <= 0.0001
          ? EstadoReservaInventario.CONSUMIDA
          : EstadoReservaInventario.PARCIALMENTE_CONSUMIDA;
        stockResumen.reservado = Math.max(0, Number(stockResumen.reservado || 0) - cantidadBase);
        await em.save(reserva);
        await em.save(stockResumen);
      }

      await this.stockService.sincronizarResumen(
        productoId,
        almacenId,
        empresaId,
        em,
      );

      const costoTotal = redondear2(costoAcumulado);

      // Salir sin costo casi siempre significa que la entrada no lo capturó.
      // Se avisa, pero no se bloquea: frenar una venta por esto sería peor.
      if (costoTotal === 0 && cantidadBase > 0) {
        this.logger.warn(
          `Salida con costo cero: producto ${productoId} (${producto.nombre ?? ''}), ` +
            `almacén ${almacenId}, cantidad ${cantidadBase}. ` +
            `Revisa que las entradas de este producto estén registrando su costo.`,
        );
      }

      return {
        mensaje: 'Salida registrada correctamente',
        cantidadTotal: cantidadBase,
        costoTotal,
        costoUnitarioPromedio:
          cantidadBase > 0 ? redondear4(costoTotal / cantidadBase) : 0,
        consumos,
      };
    };

    if (manager) return ejecutar(manager);
    return this.dataSource.transaction(ejecutar);
  }

  /* ══ TRANSFERENCIA ═══════════════════════════════════════════════════════ */

  /**
   * Mueve stock entre almacenes CONSERVANDO el costo.
   *
   * Antes la salida y la entrada eran independientes, así que la mercancía
   * llegaba al destino con el precio de lista en vez de con su costo real:
   * mover una caja de un almacén a otro cambiaba el valor del inventario de la
   * empresa sin que nadie comprara ni vendiera nada.
   */
  async transferirStock(
    productoId: string, origenId: string, destinoId: string, cantidad: number,
    empresaId: string, manager?: EntityManager, motivo = 'Transferencia entre almacenes', usuarioId?: string,
  ) {
    if (cantidad <= 0) throw new BadRequestException('La cantidad debe ser mayor a cero');
    if (origenId === destinoId) throw new BadRequestException('No se puede transferir al mismo almacén');
    if (!motivo?.trim()) throw new BadRequestException('El motivo o referencia de la transferencia es obligatorio');

    const ejecutar = async (em: EntityManager) => {
      const [producto, origen, destino] = await Promise.all([
        em.findOne(Producto, { where: { id: productoId, empresaId } }),
        em.findOne(Almacen, { where: { id: origenId, empresaId, activo: true } }),
        em.findOne(Almacen, { where: { id: destinoId, empresaId, activo: true } }),
      ]);
      if (!producto) throw new NotFoundException('Producto no encontrado');
      if (!origen || !destino) throw new BadRequestException('Ambos almacenes deben existir, pertenecer a la empresa y estar activos');

      const transferenciaId = randomUUID();
      const folio = `TRF-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}-${transferenciaId.slice(0, 6).toUpperCase()}`;
      const transferencia = em.create(TransferenciaInventario, {
        id: transferenciaId, empresaId, folio, almacenOrigenId: origenId, almacenDestinoId: destinoId,
        estado: EstadoTransferenciaInventario.COMPLETADA, motivo: motivo.trim(), usuarioId, valorTotal: 0,
      });
      await em.save(transferencia);

      const salida = await this.registrarSalida(
        productoId, origenId, cantidad, `Transferencia ${folio} a ${destino.nombre}: ${motivo}`,
        empresaId, undefined, undefined, em, { id: transferenciaId, tipo: 'TRANSFERENCIA' },
      );

      const detalles: TransferenciaInventarioDetalle[] = [];
      for (const consumo of salida.consumos) {
        await this.registrarCompra(
          productoId, destinoId, consumo.cantidad, `Transferencia ${folio} desde ${origen.nombre}: ${motivo}`,
          empresaId, consumo.numeroLote, consumo.fechaCaducidad ? new Date(consumo.fechaCaducidad).toISOString() : undefined, undefined, em,
          consumo.costoUnitario, { id: transferenciaId, tipo: 'TRANSFERENCIA' },
        );
        detalles.push(em.create(TransferenciaInventarioDetalle, {
          transferenciaId, productoId, numeroLote: consumo.numeroLote,
          fechaCaducidad: consumo.fechaCaducidad, cantidad: consumo.cantidad,
          costoUnitario: consumo.costoUnitario, costoTotal: consumo.costoTotal,
        }));
      }
      await em.save(detalles);
      transferencia.valorTotal = salida.costoTotal;
      await em.save(transferencia);

      return {
        id: transferenciaId, folio, estado: transferencia.estado, mensaje: 'Transferencia realizada correctamente',
        cantidad: salida.cantidadTotal, valorTransferido: salida.costoTotal, lotesTransferidos: detalles.length,
      };
    };
    if (manager) return ejecutar(manager);
    return this.dataSource.transaction(ejecutar);
  }

  async listarTransferencias(empresaId: string, pagina = 1, limite = 20) {
    const take = Math.min(Math.max(Number(limite) || 20, 1), 100);
    const page = Math.max(Number(pagina) || 1, 1);
    const [data, total] = await this.transferenciaRepository.findAndCount({
      where: { empresaId }, relations: ['almacenOrigen', 'almacenDestino', 'detalles', 'detalles.producto'],
      order: { fechaCreacion: 'DESC' }, skip: (page - 1) * take, take,
    });
    return { data, total, pagina: page, limite: take, paginas: Math.ceil(total / take) };
  }

  /* ══ AJUSTES ═════════════════════════════════════════════════════════════ */

  async ajusteManual(
    productoId: string,
    almacenId: string,
    cantidad: number,
    tipo: 'INGRESO' | 'MERMA',
    motivo: string,
    empresaId: string,
    loteEspecificoId?: string,
    manager?: EntityManager,
    costoUnitario?: number,
  ) {
    if (!almacenId) throw new BadRequestException('El almacén es obligatorio');
    if (cantidad <= 0)
      throw new BadRequestException('La cantidad debe ser mayor a cero');

    const ejecutar = async (em: EntityManager) => {
      if (tipo === 'MERMA') {
        const salida = await this.registrarSalida(
          productoId,
          almacenId,
          cantidad,
          `Merma: ${motivo}`,
          empresaId,
          undefined,
          loteEspecificoId,
          em,
          { tipo: 'MERMA' },
        );

        // Outbox atómico: inventario y evento contable confirman juntos.
        const movimientoId = randomUUID();
        await this.asientos.encolarEnTransaccion(
          em,
          TipoAsiento.SALIDA_INVENTARIO,
          {
            movimientoId,
            tipo: 'MERMA',
            motivo,
            fecha: new Date(),
            empresaId,
            detalles: [
              {
                productoId,
                cantidad: salida.cantidadTotal,
                costoUnitario: salida.costoUnitarioPromedio,
              },
            ],
          },
          empresaId,
          `MERMA-${movimientoId.slice(0, 8)}`,
          movimientoId,
        );

        return {
          mensaje: 'Merma registrada',
          costoTotal: salida.costoTotal,
          consumos: salida.consumos,
        };
      }

      const entrada = await this.registrarCompra(
        productoId,
        almacenId,
        cantidad,
        `Ajuste manual (ingreso): ${motivo}`,
        empresaId,
        'AJUSTE',
        undefined,
        undefined,
        em,
        costoUnitario,
        { tipo: 'AJUSTE' },
      );

      return { mensaje: 'Ajuste realizado', ...entrada };
    };

    if (manager) return ejecutar(manager);
    return this.dataSource.transaction(ejecutar);
  }

  /* ══ CONSULTAS ═══════════════════════════════════════════════════════════ */

  async obtenerMovimientosPorProducto(
    productoId: string, empresaId: string, pagina = 1, limite = 50, almacenId?: string,
  ) {
    const take = Math.min(Math.max(Number(limite) || 50, 1), 200);
    const page = Math.max(Number(pagina) || 1, 1);
    const qb = this.movimientoRepository.createQueryBuilder('m')
      .leftJoinAndSelect('m.almacen', 'almacen')
      .where('m.productoId = :productoId', { productoId })
      .andWhere('m.empresaId = :empresaId', { empresaId });
    if (almacenId) qb.andWhere('m.almacenId = :almacenId', { almacenId });
    qb.orderBy('m.fechaMovimiento', 'DESC').skip((page - 1) * take).take(take);
    const [data, total] = await qb.getManyAndCount();
    return { data, total, pagina: page, limite: take, paginas: Math.ceil(total / take) };
  }

  async obtenerStockEnAlmacen(
    productoId: string,
    almacenId: string,
    empresaId: string,
  ) {
    return this.stockService.obtenerResumen(productoId, almacenId, empresaId);
  }

  async obtenerLotesPorProducto(
    productoId: string,
    empresaId: string,
    almacenId?: string,
  ) {
    const where: Record<string, unknown> = { productoId, empresaId };
    if (almacenId) where.almacenId = almacenId;

    return this.loteInventarioRepository.find({
      where,
      order: { fechaCaducidad: 'ASC' },
      relations: ['almacen'],
    });
  }

  /**
   * Valuación del inventario a la fecha actual.
   * Este es el número que debe cuadrar contra el saldo de la cuenta contable
   * de inventarios. Si no cuadra, la diferencia está en asientos que fallaron.
   */
  async valuacion(empresaId: string, almacenId?: string) {
    const q = this.loteInventarioRepository
      .createQueryBuilder('l')
      .innerJoin('l.producto', 'p')
      .select('p.id', 'productoId')
      .addSelect('p.nombre', 'producto')
      .addSelect('SUM(l.stockRestante)', 'existencia')
      .addSelect('SUM(l.valorTotal)', 'valor')
      .where('l.empresaId = :empresaId', { empresaId })
      .andWhere('l.stockRestante > 0')
      .groupBy('p.id')
      .addGroupBy('p.nombre');

    if (almacenId) q.andWhere('l.almacenId = :almacenId', { almacenId });

    const filas = await q.getRawMany<{
      productoId: string;
      producto: string;
      existencia: string;
      valor: string;
    }>();

    const detalle = filas.map((f) => {
      const existencia = Number(f.existencia);
      const valor = Number(f.valor);
      return {
        productoId: f.productoId,
        producto: f.producto,
        existencia,
        valor: redondear2(valor),
        costoPromedio: existencia > 0 ? redondear4(valor / existencia) : 0,
      };
    });

    return {
      valorTotal: redondear2(detalle.reduce((s, d) => s + d.valor, 0)),
      productos: detalle.length,
      sinCosto: detalle.filter((d) => d.valor === 0 && d.existencia > 0).length,
      detalle: detalle.sort((a, b) => b.valor - a.valor),
    };
  }

  /* ══ INTERNOS ════════════════════════════════════════════════════════════ */

  private async obtenerOCrearLote(
    em: EntityManager,
    productoId: string,
    almacenId: string,
    empresaId: string,
    numeroLote: string,
    fechaCaducidad?: Date,
  ): Promise<LoteInventario> {
    let lote = await em.findOne(LoteInventario, {
      where: { productoId, almacenId, empresaId, numeroLote },
    });

    if (!lote) {
      lote = em.create(LoteInventario, {
        productoId,
        almacenId,
        empresaId,
        numeroLote,
        fechaCaducidad: fechaCaducidad ?? undefined,
        stockRestante: 0,
        costoUnitario: 0,
        valorTotal: 0,
        activo: true,
      });
      await em.save(lote);
    } else if (fechaCaducidad) {
      lote.fechaCaducidad = fechaCaducidad;
      await em.save(lote);
    }

    return lote;
  }

  private calcularFactorBase(equivalencia: ProductoEquivalencia): number {
    // Se conserva el comportamiento original, pero con red de seguridad:
    // un factor 0 o nulo convertía toda la cantidad en cero silenciosamente.
    const factor = Number(equivalencia.factorConversion);
    return Number.isFinite(factor) && factor > 0 ? factor : 1;
  }
}
