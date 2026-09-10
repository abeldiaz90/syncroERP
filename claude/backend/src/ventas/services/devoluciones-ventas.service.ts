import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Venta } from '../entities/venta.entity';
import { DetalleVenta } from '../entities/detalle-venta.entity';
import {
  DevolucionVenta,
  EstadoDevolucion,
  EstadoFiscalDevolucion,
  ResolucionDevolucion,
} from '../entities/devolucion-venta.entity';
import {
  CondicionDevolucion,
  DetalleDevolucionVenta,
} from '../entities/detalle-devolucion-venta.entity';
import { AplicacionLoteDevolucion } from '../entities/aplicacion-lote-devolucion.entity';
import {
  CrearDevolucionVentaDto,
  DestinoImporteDevolucion,
  MetodoReembolso,
} from '../dto/crear-devolucion-venta.dto';
import { MovimientoInventario } from '../../catalogo/entities/movimiento-inventario.entity';
import { LoteInventario } from '../../catalogo/entities/lote-inventario.entity';
import {
  Producto,
  TipoProducto,
} from '../../catalogo/entities/producto.entity';
import { StockService } from '../../catalogo/services/stock.service';
import {
  CreditoCliente,
  EstadoCredito,
} from '../../credito/entities/credito-cliente.entity';
import {
  AmortizacionCuota,
  EstadoCuota,
} from '../../credito/entities/amortizacion-cuota.entity';
import {
  CuentaBancaria,
  TipoCuentaBancaria,
} from '../../credito/entities/cuenta-bancaria.entity';
import { AsientosPendientesService } from '../../finanzas/services/asientos-pendientes.service';
import { TipoAsiento } from '../../finanzas/entities/asiento-pendiente.entity';
import { TesoreriaService } from '../../tesoreria/services/tesoreria.service';
import {
  OrigenMovimiento,
  TipoMovimiento,
} from '../../tesoreria/entities/tesoreria.entity';
import { EstadoFactura, Factura } from '../../cfdi/factura.entity';
import { SaldosFavorService } from './saldos-favor.service';
import { CarteraPublicadorService } from '../../integracion/services/cartera-publicador.service';
import { CfdiService } from '../../cfdi/cfdi.service';
import { CierreContable } from '../../finanzas/entities/cierre-contable.entity';
import { fechaCalendarioNegocio } from '../../common/utils/business-time.util';
import { CajaService } from '../../caja/services/caja.service';
import {
  NaturalezaMovimientoCaja,
  TipoMovimientoCaja,
} from '../../caja/entities/movimiento-caja.entity';

const redondear = (valor: number, decimales = 2) => {
  const factor = 10 ** decimales;
  return Math.round((Number(valor) + Number.EPSILON) * factor) / factor;
};

const enteroConfiguracion = (nombre: string, defecto: number, minimo = 0) => {
  const valor = Number(process.env[nombre]);
  return Number.isInteger(valor) && valor >= minimo ? valor : defecto;
};

const numeroConfiguracion = (nombre: string, defecto: number, minimo = 0) => {
  const valor = Number(process.env[nombre]);
  return Number.isFinite(valor) && valor >= minimo ? valor : defecto;
};

const normalizarRol = (rol?: string) =>
  (rol ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');

const rolesAutorizadoresDevolucion = () =>
  new Set(
    (process.env.DEVOLUCIONES_ROLES_AUTORIZADORES ??
      'ADMIN,ADMINISTRADOR,SUPER_ADMIN,GERENTE,SUPERVISOR')
      .split(',')
      .map(normalizarRol)
      .filter(Boolean),
  );

const diasCalendarioEntre = (desde: string, hasta: string) => {
  const a = Date.parse(`${desde}T00:00:00.000Z`);
  const b = Date.parse(`${hasta}T00:00:00.000Z`);
  return Math.floor((b - a) / 86_400_000);
};

type ResultadoProceso = {
  devolucion: DevolucionVenta;
  ivaCobrado: number;
  ivaNoCobrado: number;
  detallesContables: Array<{
    productoId: string;
    cantidad: number;
    subtotal: number;
    impuestoMonto: number;
    costoReintegrado: number;
    costoDanado: number;
  }>;
  advertencias: string[];
  asientoPendienteId?: string;
};

@Injectable()
export class DevolucionesVentasService {
  private readonly logger = new Logger(DevolucionesVentasService.name);

  constructor(
    @InjectRepository(DevolucionVenta)
    private readonly devoluciones: Repository<DevolucionVenta>,
    private readonly dataSource: DataSource,
    private readonly stock: StockService,
    private readonly asientos: AsientosPendientesService,
    private readonly tesoreria: TesoreriaService,
    private readonly caja: CajaService,
    private readonly saldosFavorService: SaldosFavorService,
    private readonly cfdi: CfdiService,
    private readonly cartera: CarteraPublicadorService,
  ) {}

  async disponible(ventaId: string, empresaId: string) {
    const venta = await this.dataSource.getRepository(Venta).findOne({
      where: { id: ventaId, empresaId },
      relations: ['cliente', 'detalles', 'detalles.producto'],
    });
    if (!venta) throw new NotFoundException('Venta no encontrada.');

    const devoluciones = await this.devoluciones.find({
      where: { empresaId, ventaId },
      relations: ['detalles'],
      order: { fechaDevolucion: 'DESC' },
    });
    const credito = await this.dataSource
      .getRepository(CreditoCliente)
      .findOne({
        where: { empresaId, ventaId },
      });

    return {
      venta,
      credito: credito
        ? {
            id: credito.id,
            folio: credito.folio,
            estado: credito.estado,
            saldoPendiente: Number(credito.saldoPendiente),
            montoAjustesDevolucion: Number(credito.montoAjustesDevolucion ?? 0),
          }
        : null,
      detalles: venta.detalles.map((detalle) => ({
        ...detalle,
        cantidad: Number(detalle.cantidad),
        cantidadDevuelta: Number(detalle.cantidadDevuelta ?? 0),
        cantidadDisponible: redondear(
          Number(detalle.cantidad) - Number(detalle.cantidadDevuelta ?? 0),
          4,
        ),
      })),
      devoluciones,
    };
  }

  listar(empresaId: string, ventaId?: string) {
    return this.devoluciones.find({
      where: { empresaId, ...(ventaId ? { ventaId } : {}) },
      relations: [
        'venta',
        'venta.cliente',
        'detalles',
        'detalles.producto',
        'cuentaBancaria',
      ],
      order: { fechaDevolucion: 'DESC' },
      take: 200,
    });
  }

  async obtenerPorId(id: string, empresaId: string) {
    const devolucion = await this.devoluciones.findOne({
      where: { id, empresaId },
      relations: [
        'venta',
        'venta.cliente',
        'detalles',
        'detalles.producto',
        'detalles.aplicacionesLote',
        'cuentaBancaria',
      ],
    });
    if (!devolucion) throw new NotFoundException('Devolución no encontrada.');
    return devolucion;
  }

  async crear(
    ventaId: string,
    dto: CrearDevolucionVentaDto,
    empresaId: string,
    usuarioId?: string,
    rolUsuario?: string,
  ) {
    const repetida = await this.devoluciones.findOne({
      where: { empresaId, claveIdempotencia: dto.claveIdempotencia },
    });
    if (repetida) return this.obtenerPorId(repetida.id, empresaId);

    const resultado = await this.dataSource.transaction((em) =>
      this.procesar(
        em,
        ventaId,
        dto,
        empresaId,
        usuarioId,
        rolUsuario,
      ),
    );

    // También cubre dos solicitudes simultáneas con la misma clave: la segunda
    // encuentra el registro después de adquirir el candado y no debe intentar
    // generar una póliza con un payload vacío.
    if (resultado.detallesContables.length === 0) {
      return {
        ...(await this.obtenerPorId(resultado.devolucion.id, empresaId)),
        advertencias: resultado.advertencias,
      };
    }

    let estadoContable: { generado: boolean; polizaId?: string } | undefined;
    if (resultado.asientoPendienteId) {
      try {
        estadoContable = await this.asientos.reintentarAhora(
          resultado.asientoPendienteId,
          empresaId,
        );
      } catch (error) {
        const mensaje = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Devolución DEV-${resultado.devolucion.folio} confirmada, pero falló la póliza inmediata: ${mensaje}`,
        );
        resultado.advertencias.push(
          'La devolución fue confirmada; la póliza contable quedó pendiente para el procesador automático.',
        );
      }
    }

    if (resultado.devolucion.facturaOrigenId) {
      try {
        await this.cfdi.crearNotaCreditoDesdeDevolucion(
          resultado.devolucion.id,
          empresaId,
        );
      } catch (error) {
        const mensaje = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Devolución DEV-${resultado.devolucion.folio} confirmada, pero falló la nota de crédito: ${mensaje}`,
        );
        resultado.advertencias.push(
          'La devolución fue confirmada; la nota de crédito quedó pendiente para reintento desde Facturación.',
        );
      }
    }

    return {
      ...(await this.obtenerPorId(resultado.devolucion.id, empresaId)),
      advertencias: resultado.advertencias,
      estadoContable: estadoContable
        ? estadoContable.generado
          ? 'GENERADO'
          : 'PENDIENTE'
        : 'NO_APLICA',
      asientoPendienteId: resultado.asientoPendienteId,
      polizaId: estadoContable?.polizaId,
    };
  }

  private async procesar(
    em: EntityManager,
    ventaId: string,
    dto: CrearDevolucionVentaDto,
    empresaId: string,
    usuarioId?: string,
    rolUsuario?: string,
  ): Promise<ResultadoProceso> {
    await em.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))`,
      [`devolucion:${empresaId}:${ventaId}`],
    );

    const existente = await em.findOne(DevolucionVenta, {
      where: { empresaId, claveIdempotencia: dto.claveIdempotencia },
    });
    if (existente) {
      const completa = await em.findOne(DevolucionVenta, {
        where: { id: existente.id },
        relations: ['venta', 'detalles'],
      });
      return {
        devolucion: completa!,
        ivaCobrado: 0,
        ivaNoCobrado: 0,
        detallesContables: [],
        advertencias: ['La solicitud ya había sido procesada.'],
      };
    }

    const bloqueada = await em
      .createQueryBuilder(Venta, 'venta')
      .setLock('pessimistic_write')
      .where('venta.id = :ventaId AND venta.empresaId = :empresaId', {
        ventaId,
        empresaId,
      })
      .getOne();
    if (!bloqueada) throw new NotFoundException('Venta no encontrada.');
    if (!['COMPLETADA', 'PARCIALMENTE_DEVUELTA'].includes(bloqueada.estado)) {
      throw new ConflictException(
        `La venta está en estado ${bloqueada.estado} y no admite devoluciones.`,
      );
    }

    const venta = await em.findOne(Venta, {
      where: { id: ventaId, empresaId },
      relations: ['cliente', 'detalles', 'detalles.producto'],
    });
    if (!venta) throw new NotFoundException('Venta no encontrada.');

    const hoyNegocio = fechaCalendarioNegocio();
    const fechaVentaNegocio = fechaCalendarioNegocio(venta.fechaVenta);
    const diasTranscurridos = diasCalendarioEntre(
      fechaVentaNegocio,
      hoyNegocio,
    );
    const diasMaximos = enteroConfiguracion(
      'DEVOLUCIONES_DIAS_MAXIMOS',
      30,
      1,
    );
    if (diasTranscurridos < 0) {
      throw new ConflictException(
        'La fecha de la venta es posterior al día de negocio actual. Revisa la zona horaria y el reloj del servidor.',
      );
    }
    if (diasTranscurridos > diasMaximos) {
      throw new ConflictException(
        `La venta tiene ${diasTranscurridos} días y la política permite devoluciones hasta ${diasMaximos} días.`,
      );
    }

    const [anioActual, mesActual] = hoyNegocio.split('-').map(Number);
    const periodoCerrado = await em.findOne(CierreContable, {
      where: { empresaId, anio: anioActual, mes: mesActual },
    });
    if (periodoCerrado) {
      throw new ConflictException(
        `El periodo contable ${mesActual.toString().padStart(2, '0')}/${anioActual} está cerrado. No se puede registrar la devolución.`,
      );
    }

    const idsSolicitados = dto.detalles.map(
      (detalle) => detalle.detalleVentaId,
    );
    if (new Set(idsSolicitados).size !== idsSolicitados.length) {
      throw new BadRequestException(
        'Un producto de la venta aparece más de una vez en la devolución.',
      );
    }

    const detallePorId = new Map(
      venta.detalles.map((detalle) => [detalle.id, detalle]),
    );
    for (const solicitado of dto.detalles) {
      const detalle = detallePorId.get(solicitado.detalleVentaId);
      if (!detalle) {
        throw new BadRequestException(
          'Uno de los renglones no pertenece a la venta.',
        );
      }
      const disponible =
        Number(detalle.cantidad) - Number(detalle.cantidadDevuelta ?? 0);
      if (Number(solicitado.cantidad) - disponible > 0.0001) {
        throw new BadRequestException(
          `${detalle.producto?.nombre ?? detalle.productoId}: sólo quedan ${redondear(disponible, 4)} unidades disponibles para devolver.`,
        );
      }
    }

    const [ultima] = await em.query<Array<{ folio: number }>>(
      `SELECT folio
       FROM devoluciones_venta
       WHERE empresaId = $1
       ORDER BY folio DESC
       LIMIT 1 FOR UPDATE`,
      [empresaId],
    );
    const folio = Number(ultima?.folio ?? 0) + 1;

    const previos = await em
      .getRepository(DetalleDevolucionVenta)
      .createQueryBuilder('detalle')
      .select('detalle.detalleVentaId', 'detalleVentaId')
      .addSelect('SUM(detalle.subtotal)', 'subtotal')
      .addSelect('SUM(detalle.impuestoMonto)', 'impuesto')
      .innerJoin('detalle.devolucion', 'devolucion')
      .where('devolucion.empresaId = :empresaId', { empresaId })
      .andWhere('devolucion.ventaId = :ventaId', { ventaId })
      .groupBy('detalle.detalleVentaId')
      .getRawMany<{
        detalleVentaId: string;
        subtotal: string;
        impuesto: string;
      }>();
    const monetarioPrevio = new Map(
      previos.map((fila) => [
        fila.detalleVentaId,
        {
          subtotal: Number(fila.subtotal),
          impuesto: Number(fila.impuesto),
        },
      ]),
    );

    const movimientosSalida = await em.find(MovimientoInventario, {
      where: { empresaId, documentoId: venta.id, tipo: 'SALIDA' },
      order: { fechaMovimiento: 'ASC', id: 'ASC' },
    });
    const aplicadas = await em
      .getRepository(AplicacionLoteDevolucion)
      .createQueryBuilder('aplicacion')
      .select('aplicacion.movimientoSalidaId', 'movimientoSalidaId')
      .addSelect('SUM(aplicacion.cantidad)', 'cantidad')
      .innerJoin('aplicacion.detalle', 'detalle')
      .innerJoin('detalle.devolucion', 'devolucion')
      .where('devolucion.empresaId = :empresaId', { empresaId })
      .andWhere('devolucion.ventaId = :ventaId', { ventaId })
      .groupBy('aplicacion.movimientoSalidaId')
      .getRawMany<{ movimientoSalidaId: string; cantidad: string }>();
    const cantidadAplicada = new Map(
      aplicadas.map((fila) => [fila.movimientoSalidaId, Number(fila.cantidad)]),
    );

    const calculados: Array<{
      solicitado: (typeof dto.detalles)[number];
      venta: DetalleVenta;
      subtotal: number;
      impuesto: number;
    }> = [];
    let subtotalTotal = 0;
    let impuestoTotal = 0;
    for (const solicitado of dto.detalles) {
      const detalle = detallePorId.get(solicitado.detalleVentaId)!;
      const disponible =
        Number(detalle.cantidad) - Number(detalle.cantidadDevuelta ?? 0);
      const previo = monetarioPrevio.get(detalle.id) ?? {
        subtotal: 0,
        impuesto: 0,
      };
      const esUltimo =
        Math.abs(Number(solicitado.cantidad) - disponible) <= 0.0001;
      const proporcion = Number(solicitado.cantidad) / Number(detalle.cantidad);
      const subtotal = esUltimo
        ? redondear(Number(detalle.subtotal) - previo.subtotal, 4)
        : redondear(Number(detalle.subtotal) * proporcion, 4);
      const impuesto = esUltimo
        ? redondear(Number(detalle.impuestoMonto ?? 0) - previo.impuesto, 4)
        : redondear(Number(detalle.impuestoMonto ?? 0) * proporcion, 4);
      calculados.push({ solicitado, venta: detalle, subtotal, impuesto });
      subtotalTotal += subtotal;
      impuestoTotal += impuesto;
    }
    subtotalTotal = redondear(subtotalTotal, 4);
    impuestoTotal = redondear(impuestoTotal, 4);
    const total = redondear(subtotalTotal + impuestoTotal, 4);
    if (total <= 0) {
      throw new BadRequestException('El importe de la devolución es inválido.');
    }

    const umbralAutorizacion = numeroConfiguracion(
      'DEVOLUCIONES_MONTO_APROBACION',
      5000,
      0,
    );
    if (
      umbralAutorizacion > 0 &&
      total >= umbralAutorizacion &&
      !rolesAutorizadoresDevolucion().has(normalizarRol(rolUsuario))
    ) {
      throw new ConflictException(
        `La devolución por $${total.toFixed(2)} requiere autorización de supervisor porque supera el umbral de $${umbralAutorizacion.toFixed(2)}.`,
      );
    }

    const devolucion = await em.save(
      em.create(DevolucionVenta, {
        empresaId,
        ventaId,
        folio,
        estado: EstadoDevolucion.PROCESADA,
        motivo: dto.motivo.trim(),
        resolucion: ResolucionDevolucion.REEMBOLSO,
        subtotal: subtotalTotal,
        impuestoTotal,
        total,
        costoReintegrado: 0,
        costoDanado: 0,
        ajusteCxC: 0,
        importeReembolso: 0,
        saldoFavorGenerado: 0,
        cuentaBancariaId: null,
        metodoReembolso: null,
        referenciaReembolso: null,
        estadoFiscal: EstadoFiscalDevolucion.NO_REQUERIDO,
        facturaOrigenId: null,
        notaCreditoId: null,
        claveIdempotencia: dto.claveIdempotencia,
        usuarioId: usuarioId ?? null,
      }),
    );

    const advertencias: string[] = [];
    const combinacionesStock = new Set<string>();
    const detallesContables: ResultadoProceso['detallesContables'] = [];
    let costoReintegrado = 0;
    let costoDanado = 0;

    for (const calculado of calculados) {
      const producto = calculado.venta.producto as Producto;
      const esServicio = producto?.tipo === TipoProducto.SERVICIO;
      const detalleDevolucion = await em.save(
        em.create(DetalleDevolucionVenta, {
          devolucionId: devolucion.id,
          detalleVentaId: calculado.venta.id,
          productoId: calculado.venta.productoId,
          cantidad: calculado.solicitado.cantidad,
          condicion: calculado.solicitado.condicion,
          subtotal: calculado.subtotal,
          impuestoMonto: calculado.impuesto,
          costoTotal: 0,
        }),
      );

      let porAsignar = Number(calculado.solicitado.cantidad);
      let costoDetalle = 0;
      if (!esServicio) {
        const candidatos = movimientosSalida.filter(
          (movimiento) =>
            movimiento.productoId === calculado.venta.productoId &&
            Number(movimiento.cantidad) -
              Number(cantidadAplicada.get(movimiento.id) ?? 0) >
              0.0001,
        );
        for (const movimiento of candidatos) {
          if (porAsignar <= 0.0001) break;
          const yaAplicado = Number(cantidadAplicada.get(movimiento.id) ?? 0);
          const disponible = Number(movimiento.cantidad) - yaAplicado;
          const cantidad = Math.min(porAsignar, disponible);
          const costoUnitario = Number(movimiento.costoUnitario ?? 0);
          const costo = redondear(cantidad * costoUnitario, 4);

          await em.save(
            em.create(AplicacionLoteDevolucion, {
              detalleDevolucionId: detalleDevolucion.id,
              movimientoSalidaId: movimiento.id,
              loteId: movimiento.loteId ?? null,
              almacenId: movimiento.almacenId,
              cantidad,
              costoUnitario,
              costoTotal: costo,
            }),
          );
          cantidadAplicada.set(movimiento.id, yaAplicado + cantidad);
          costoDetalle += costo;
          porAsignar -= cantidad;

          if (
            calculado.solicitado.condicion !==
            CondicionDevolucion.NO_REINTEGRABLE
          ) {
            if (!movimiento.loteId) {
              throw new ConflictException(
                `${producto?.nombre ?? movimiento.productoId}: la salida histórica no identifica lote. ` +
                  'Usa "No reintegrable" o regulariza el movimiento antes de devolverlo a existencia.',
              );
            }
            const lote = await em
              .createQueryBuilder(LoteInventario, 'lote')
              .setLock('pessimistic_write')
              .where('lote.id = :id', { id: movimiento.loteId })
              .getOne();
            if (!lote) {
              throw new ConflictException(
                `${producto?.nombre ?? movimiento.productoId}: el lote original ya no existe.`,
              );
            }

            const anterior = Number(lote.stockRestante);
            const despuesEntrada = anterior + cantidad;
            lote.stockRestante = despuesEntrada;
            lote.valorTotal = redondear(
              despuesEntrada * Number(lote.costoUnitario),
            );
            await em.save(lote);
            await em.save(
              em.create(MovimientoInventario, {
                empresaId,
                productoId: movimiento.productoId,
                almacenId: movimiento.almacenId,
                tipo: 'ENTRADA',
                cantidad,
                stockAnterior: anterior,
                stockNuevo: despuesEntrada,
                costoUnitario,
                costoTotal: costo,
                motivo: `Devolución DEV-${folio} de venta #${venta.folio}`,
                usuarioId,
                documentoId: devolucion.id,
                tipoDocumento: 'DEVOLUCION_VENTA',
                lote: lote.numeroLote,
                loteId: lote.id,
              }),
            );

            if (calculado.solicitado.condicion === CondicionDevolucion.DANADO) {
              lote.stockRestante = anterior;
              lote.valorTotal = redondear(
                anterior * Number(lote.costoUnitario),
              );
              await em.save(lote);
              await em.save(
                em.create(MovimientoInventario, {
                  empresaId,
                  productoId: movimiento.productoId,
                  almacenId: movimiento.almacenId,
                  tipo: 'SALIDA',
                  cantidad,
                  stockAnterior: despuesEntrada,
                  stockNuevo: anterior,
                  costoUnitario,
                  costoTotal: costo,
                  motivo: `Merma por devolución dañada DEV-${folio}`,
                  usuarioId,
                  documentoId: devolucion.id,
                  tipoDocumento: 'MERMA_DEVOLUCION',
                  lote: lote.numeroLote,
                  loteId: lote.id,
                }),
              );
              costoDanado += costo;
            } else {
              costoReintegrado += costo;
            }
            combinacionesStock.add(
              `${movimiento.productoId}|${movimiento.almacenId}`,
            );
          }
        }
        if (porAsignar > 0.0001) {
          throw new ConflictException(
            `${producto?.nombre ?? calculado.venta.productoId}: no existe trazabilidad suficiente de la salida original para ${redondear(porAsignar, 4)} unidades.`,
          );
        }
      } else if (
        calculado.solicitado.condicion !== CondicionDevolucion.NO_REINTEGRABLE
      ) {
        advertencias.push(
          `${producto?.nombre ?? 'Servicio'} no maneja existencia; se procesó sólo el importe.`,
        );
      }

      detalleDevolucion.costoTotal = redondear(costoDetalle, 4);
      await em.save(detalleDevolucion);
      calculado.venta.cantidadDevuelta = redondear(
        Number(calculado.venta.cantidadDevuelta ?? 0) +
          Number(calculado.solicitado.cantidad),
        4,
      );
      await em.save(calculado.venta);
      detallesContables.push({
        productoId: calculado.venta.productoId,
        cantidad: Number(calculado.solicitado.cantidad),
        subtotal: calculado.subtotal,
        impuestoMonto: calculado.impuesto,
        costoReintegrado:
          calculado.solicitado.condicion === CondicionDevolucion.REINTEGRABLE
            ? redondear(costoDetalle, 4)
            : 0,
        costoDanado:
          calculado.solicitado.condicion === CondicionDevolucion.DANADO
            ? redondear(costoDetalle, 4)
            : 0,
      });
    }

    for (const combinacion of combinacionesStock) {
      const [productoId, almacenId] = combinacion.split('|');
      await this.stock.sincronizarResumen(productoId, almacenId, empresaId, em);
    }

    let ajusteCxC = 0;
    let excedente = total;
    const credito = await em
      .createQueryBuilder(CreditoCliente, 'credito')
      .setLock('pessimistic_write')
      .where('credito.empresaId = :empresaId AND credito.ventaId = :ventaId', {
        empresaId,
        ventaId,
      })
      .getOne();
    if (credito && credito.estado !== EstadoCredito.CANCELADO) {
      ajusteCxC = Math.min(total, Number(credito.saldoPendiente));
      excedente = redondear(total - ajusteCxC, 4);
      if (ajusteCxC > 0) {
        credito.saldoPendiente = redondear(
          Number(credito.saldoPendiente) - ajusteCxC,
          4,
        );
        credito.montoAjustesDevolucion = redondear(
          Number(credito.montoAjustesDevolucion ?? 0) + ajusteCxC,
          4,
        );
        credito.notas =
          `${credito.notas ?? ''}\nAjuste DEV-${folio}: -${ajusteCxC.toFixed(2)}. ${dto.motivo}`.trim();
        if (Number(credito.saldoPendiente) <= 0.0001) {
          credito.saldoPendiente = 0;
          credito.estado = EstadoCredito.LIQUIDADO;
        } else if (credito.estado === EstadoCredito.LIQUIDADO) {
          credito.estado = EstadoCredito.ACTIVO;
        }
        await em.save(credito);
        await this.reducirCuotas(em, credito.id, ajusteCxC);

        /*
         * La devolución baja el saldo del crédito y eso hay que contarlo
         * afuera. Va como devolución y no como pago: el efecto en el saldo es
         * el mismo, pero un pago cuenta como cumplimiento del cliente y una
         * devolución no, y esa diferencia acaba en su historial crediticio.
         */
        await this.cartera.ajusteDevolucion(
          empresaId,
          {
            creditoId: credito.id,
            devolucionId: devolucion.id,
            monto: ajusteCxC,
            folio: `DEV-${folio}`,
          },
          em,
        );
        if (credito.estado !== EstadoCredito.LIQUIDADO) {
          const vencidas = await em
            .createQueryBuilder(AmortizacionCuota, 'cuota')
            .where('cuota.creditoId = :creditoId', { creditoId: credito.id })
            .andWhere('cuota.estado IN (:...estados)', {
              estados: [
                EstadoCuota.PENDIENTE,
                EstadoCuota.PAGO_PARCIAL,
                EstadoCuota.VENCIDA,
              ],
            })
            .andWhere('cuota.fechaVencimiento < CAST(CURRENT_TIMESTAMP AS date)')
            .getCount();
          credito.estado =
            vencidas > 0 ? EstadoCredito.VENCIDO : EstadoCredito.ACTIVO;
          await em.save(credito);
        }
      }
    }

    let importeReembolso = 0;
    let saldoFavor = 0;
    const saldoRestituible = Math.max(
      0,
      Number(venta.saldoFavorAplicado ?? 0) -
        Number(venta.saldoFavorRestituido ?? 0),
    );
    const saldoRestituido = Math.min(excedente, saldoRestituible);
    if (saldoRestituido > 0) {
      saldoFavor = redondear(saldoRestituido, 4);
      excedente = redondear(excedente - saldoRestituido, 4);
      venta.saldoFavorRestituido = redondear(
        Number(venta.saldoFavorRestituido ?? 0) + saldoRestituido,
        4,
      );
    }
    let resolucion: ResolucionDevolucion;
    let cuentaBancariaId: string | null = null;
    if (excedente <= 0.0001) {
      resolucion =
        saldoFavor > 0
          ? ajusteCxC > 0
            ? ResolucionDevolucion.MIXTA
            : ResolucionDevolucion.SALDO_FAVOR
          : ResolucionDevolucion.AJUSTE_CXC;
    } else if (dto.destinoImporte === DestinoImporteDevolucion.SALDO_FAVOR) {
      if (!venta.clienteId) {
        throw new BadRequestException(
          'Para generar saldo a favor la venta debe tener un cliente identificado.',
        );
      }
      saldoFavor = redondear(saldoFavor + excedente, 4);
      resolucion =
        ajusteCxC > 0
          ? ResolucionDevolucion.MIXTA
          : ResolucionDevolucion.SALDO_FAVOR;
    } else {
      cuentaBancariaId = dto.cuentaBancariaId ?? venta.cuentaBancariaId ?? null;
      if (!cuentaBancariaId) {
        throw new BadRequestException(
          'Selecciona la caja o cuenta bancaria desde la que saldrá el reembolso.',
        );
      }
      const cuenta = await em.findOne(CuentaBancaria, {
        where: { id: cuentaBancariaId, empresaId, activo: true },
      });
      if (!cuenta) {
        throw new BadRequestException(
          'La cuenta de reembolso no existe, está inactiva o pertenece a otra empresa.',
        );
      }
      const metodoReembolso = dto.metodoReembolso ?? MetodoReembolso.EFECTIVO;
      if (
        metodoReembolso === MetodoReembolso.EFECTIVO &&
        cuenta.tipo !== TipoCuentaBancaria.CAJA
      ) {
        throw new BadRequestException(
          'Un reembolso en efectivo debe salir de una cuenta de tipo CAJA.',
        );
      }
      if (
        [MetodoReembolso.TRANSFERENCIA, MetodoReembolso.CHEQUE].includes(
          metodoReembolso,
        ) &&
        cuenta.tipo !== TipoCuentaBancaria.BANCO
      ) {
        throw new BadRequestException(
          'Una transferencia o cheque debe salir de una cuenta de tipo BANCO.',
        );
      }
      if (
        metodoReembolso === MetodoReembolso.TARJETA &&
        ![TipoCuentaBancaria.TPV, TipoCuentaBancaria.BANCO].includes(
          cuenta.tipo,
        )
      ) {
        throw new BadRequestException(
          'Un reembolso a tarjeta debe salir de una cuenta de tipo TPV o BANCO.',
        );
      }
      importeReembolso = excedente;
      await this.tesoreria.registrarEnTransaccion(
        {
          cuentaBancariaId,
          fecha: hoyNegocio,
          tipo: TipoMovimiento.EGRESO,
          importe: importeReembolso,
          concepto: `Reembolso devolución DEV-${folio} · Venta #${venta.folio}`,
          origen: OrigenMovimiento.DEVOLUCION_VENTA,
          referencia: dto.referenciaReembolso,
          documentoId: devolucion.id,
          tipoDocumento: 'DEVOLUCION_VENTA',
          terceroId: venta.clienteId,
          nombreTercero: venta.cliente?.nombre,
        },
        empresaId,
        usuarioId,
        em,
      );
      if (cuenta.tipo === TipoCuentaBancaria.CAJA) {
        await this.caja.registrarEnTransaccion(
          em,
          {
            cuentaCajaId: cuenta.id,
            naturaleza: NaturalezaMovimientoCaja.SALIDA,
            tipo: TipoMovimientoCaja.REEMBOLSO,
            importe: importeReembolso,
            concepto: `Reembolso devolución DEV-${folio} · Venta #${venta.folio}`,
            referencia: dto.referenciaReembolso,
            documentoId: devolucion.id,
            tipoDocumento: 'DEVOLUCION_VENTA',
          },
          empresaId,
          usuarioId,
        );
      }
      resolucion =
        ajusteCxC > 0
          ? ResolucionDevolucion.MIXTA
          : ResolucionDevolucion.REEMBOLSO;
    }

    if (saldoFavor > 0 && venta.clienteId) {
      await this.saldosFavorService.abonar(em, {
        empresaId,
        clienteId: venta.clienteId,
        devolucionId: devolucion.id,
        importe: saldoFavor,
        concepto: `Saldo restituido/generado por devolución DEV-${folio}`,
        usuarioId,
      });
    }

    const factura = await em.findOne(Factura, {
      where: { empresaId, ventaId, estado: EstadoFactura.TIMBRADA },
    });
    if (factura) {
      devolucion.estadoFiscal = EstadoFiscalDevolucion.PENDIENTE_NOTA_CREDITO;
      devolucion.facturaOrigenId = factura.id;
      advertencias.push(
        'La venta tiene CFDI timbrado. La nota de crédito quedó marcada como pendiente de generación.',
      );
    }

    devolucion.resolucion = resolucion;
    devolucion.ajusteCxC = ajusteCxC;
    devolucion.importeReembolso = importeReembolso;
    devolucion.saldoFavorGenerado = saldoFavor;
    devolucion.cuentaBancariaId = cuentaBancariaId;
    devolucion.metodoReembolso =
      importeReembolso > 0 ? (dto.metodoReembolso ?? 'EFECTIVO') : null;
    devolucion.referenciaReembolso = dto.referenciaReembolso ?? null;
    devolucion.costoReintegrado = redondear(costoReintegrado, 4);
    devolucion.costoDanado = redondear(costoDanado, 4);
    await em.save(devolucion);

    venta.subtotalDevuelto = redondear(
      Number(venta.subtotalDevuelto ?? 0) + subtotalTotal,
      4,
    );
    venta.impuestoDevuelto = redondear(
      Number(venta.impuestoDevuelto ?? 0) + impuestoTotal,
      4,
    );
    venta.totalDevuelto = redondear(
      Number(venta.totalDevuelto ?? 0) + total,
      4,
    );
    venta.fechaUltimaDevolucion = new Date();
    const totalmenteDevuelta = venta.detalles.every(
      (detalle) =>
        Number(detalle.cantidadDevuelta ?? 0) + 0.0001 >=
        Number(detalle.cantidad),
    );
    venta.estado = totalmenteDevuelta ? 'DEVUELTA' : 'PARCIALMENTE_DEVUELTA';
    await em.save(venta);

    const proporcionCxC = total > 0 ? ajusteCxC / total : 0;
    const ivaNoCobrado = redondear(impuestoTotal * proporcionCxC, 4);
    const ivaCobrado = redondear(impuestoTotal - ivaNoCobrado, 4);
    devolucion.venta = venta;
    devolucion.detalles = [];
    const eventoContable = await this.asientos.encolarEnTransaccion(
      em,
      TipoAsiento.DEVOLUCION_VENTA,
      {
        devolucionId: devolucion.id,
        ventaId,
        folio: devolucion.folio,
        folioVenta: venta.folio,
        fecha: devolucion.fechaDevolucion ?? new Date(),
        empresaId,
        motivo: devolucion.motivo,
        cuentaBancariaId: devolucion.cuentaBancariaId ?? undefined,
        ajusteCxC: Number(devolucion.ajusteCxC),
        importeReembolso: Number(devolucion.importeReembolso),
        saldoFavorGenerado: Number(devolucion.saldoFavorGenerado),
        ivaCobrado,
        ivaNoCobrado,
        detalles: detallesContables,
      },
      empresaId,
      `DEV-${devolucion.folio}`,
      devolucion.id,
    );
    return {
      devolucion,
      ivaCobrado,
      ivaNoCobrado,
      detallesContables,
      advertencias,
      asientoPendienteId: eventoContable.id,
    };
  }

  private async reducirCuotas(
    em: EntityManager,
    creditoId: string,
    importe: number,
  ) {
    const cuotas = await em.find(AmortizacionCuota, {
      where: { creditoId },
      order: { numeroCuota: 'DESC' },
    });
    let pendiente = importe;
    for (const cuota of cuotas) {
      if (pendiente <= 0.0001) break;
      const disponible = Math.max(
        0,
        Number(cuota.montoCuota) - Number(cuota.montoPagado),
      );
      if (disponible <= 0) continue;
      const reducir = Math.min(pendiente, disponible);
      const capitalReducido = Math.min(reducir, Number(cuota.montoCapital));
      const interesReducido = reducir - capitalReducido;
      cuota.montoCapital = redondear(
        Number(cuota.montoCapital) - capitalReducido,
        4,
      );
      cuota.montoInteres = redondear(
        Math.max(0, Number(cuota.montoInteres) - interesReducido),
        4,
      );
      cuota.montoCuota = redondear(Number(cuota.montoCuota) - reducir, 4);
      cuota.saldoRestante = redondear(
        Math.max(0, Number(cuota.saldoRestante) - reducir),
        4,
      );
      if (Number(cuota.montoCuota) <= Number(cuota.montoPagado) + 0.0001) {
        cuota.estado = EstadoCuota.PAGADA;
        cuota.fechaPago = cuota.fechaPago ?? new Date();
      }
      await em.save(cuota);
      pendiente -= reducir;
    }
    if (pendiente > 0.01) {
      throw new ConflictException(
        'No fue posible distribuir completamente el ajuste entre las cuotas del crédito.',
      );
    }
  }

  async saldoFavorCliente(clienteId: string, empresaId: string) {
    return this.saldosFavorService.consultar(clienteId, empresaId);
  }
}
