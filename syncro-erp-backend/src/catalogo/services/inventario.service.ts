import {
  Injectable,
  BadRequestException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';

import { Producto } from '../entities/producto.entity';
import { MovimientoInventario } from '../entities/movimiento-inventario.entity';
import { LoteInventario } from '../entities/lote-inventario.entity';
import { ProductoEquivalencia } from '../entities/producto-equivalencia.entity';
import { StockPorAlmacen } from '../entities/stock-por-almacen.entity';
import { Almacen } from '../entities/almacen.entity';
import { StockService } from './stock.service';

import { MotorContableService } from '../../finanzas/services/motor-contable.service';

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
    private readonly stockService: StockService,
    private readonly dataSource: DataSource,
    private readonly motorContable: MotorContableService,
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

      /* ── Consumo ── */
      let restante = cantidadBase;
      let costoAcumulado = 0;
      const movimientos: MovimientoInventario[] = [];
      const consumos: ConsumoDeLote[] = [];

      for (const lote of lotes) {
        if (restante <= 0) break;

        const disponible = Number(lote.stockRestante);
        const aDescontar = Math.min(disponible, restante);
        const costoUnitario = Number(lote.costoUnitario ?? 0);
        const costoDelConsumo = redondear2(aDescontar * costoUnitario);

        const stockAnterior = disponible;
        const stockNuevo = disponible - aDescontar;

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
        });

        costoAcumulado += costoDelConsumo;
        restante -= aDescontar;
      }

      if (restante > 0) {
        throw new BadRequestException(
          `Stock insuficiente. Faltan ${restante} unidades.`,
        );
      }

      await em.save(movimientos);
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
    productoId: string,
    origenId: string,
    destinoId: string,
    cantidad: number,
    empresaId: string,
    manager?: EntityManager,
  ) {
    if (cantidad <= 0)
      throw new BadRequestException('La cantidad debe ser mayor a cero');
    if (origenId === destinoId)
      throw new BadRequestException('No se puede transferir al mismo almacén');

    const ejecutar = async (em: EntityManager) => {
      const producto = await em.findOne(Producto, {
        where: { id: productoId, empresaId },
      });
      if (!producto) throw new NotFoundException('Producto no encontrado');

      const salida = await this.registrarSalida(
        productoId,
        origenId,
        cantidad,
        `Transferencia a almacén ${destinoId}`,
        empresaId,
        undefined,
        undefined,
        em,
        { tipo: 'TRANSFERENCIA' },
      );

      // El costo que sale del origen es el que entra al destino.
      const costoTransferido = salida.costoUnitarioPromedio;

      const entrada = await this.registrarCompra(
        productoId,
        destinoId,
        cantidad,
        `Transferencia desde almacén ${origenId}`,
        empresaId,
        'TRANSFER',
        undefined,
        undefined,
        em,
        costoTransferido,
        { tipo: 'TRANSFERENCIA' },
      );

      return {
        mensaje: 'Transferencia realizada correctamente',
        cantidad,
        costoUnitario: costoTransferido,
        valorTransferido: salida.costoTotal,
        stockDestino: entrada.stockNuevo,
      };
    };

    if (manager) return ejecutar(manager);
    return this.dataSource.transaction(ejecutar);
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

        // El asiento usa el costo REAL de lo mermado, no el precio de lista.
        this.motorContable
          .generarAsientoDeSalida({
            movimientoId: `merma-${Date.now()}`,
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
          })
          .catch((e) =>
            this.logger.error(`Asiento de merma falló: ${e?.message}`),
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

  async obtenerMovimientosPorProducto(productoId: string, empresaId: string) {
    return this.movimientoRepository.find({
      where: { productoId, empresaId },
      relations: ['almacen'],
      order: { fechaMovimiento: 'DESC' },
    });
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
