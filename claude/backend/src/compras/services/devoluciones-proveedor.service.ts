import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  FoliosService,
  SIN_EJERCICIO,
  TIPOS_CORRIDOS,
  TIPOS_DE_FOLIO,
  folioDe,
} from '../../common/services/folios.service';

import {
  DevolucionProveedor,
  DevolucionProveedorDetalle,
  EstadoDevolucionProveedor,
} from '../entities/devolucion-proveedor.entity';
import { OrdenCompra } from '../entities/orden-compra.entity';
import { DetalleOrdenCompra } from '../entities/detalle-orden-compra.entity';
import { InventarioService } from '../../catalogo/services/inventario.service';
import { AsientosPendientesService } from '../../finanzas/services/asientos-pendientes.service';
import { OrdenesCompraService } from './ordenes-compra.service';
import { TipoAsiento } from '../../finanzas/entities/asiento-pendiente.entity';

/**
 * ============================================================================
 * Devolución a proveedor
 * ----------------------------------------------------------------------------
 * El circuito que faltaba. Hasta el 26-sep-2026, cuando alguien intentaba
 * cancelar una orden ya recibida el sistema contestaba «Registra la devolución
 * al proveedor» y esa devolución no existía: ni endpoint, ni pantalla, ni
 * asiento. Quien llegaba ahí con mercancía rota en el andén no tenía dónde
 * ponerla, y lo único a mano era un ajuste de inventario, que dice algo
 * distinto: un ajuste es una merma nuestra; una devolución cambia lo que le
 * debemos al proveedor.
 *
 * REGLAS
 *
 * · Sólo se devuelve lo que se recibió, y sólo una vez. El tope de cada
 *   partida es `cantidadRecibidaOk` menos lo ya devuelto.
 * · Sale del inventario al costo del lote —`registrarSalida` lo calcula— pero
 *   se le cobra al proveedor al COSTO PACTADO en la orden. Que el promedio del
 *   almacén haya cambiado por otras compras no es asunto suyo.
 * · Todo en una transacción: si la salida de inventario no se puede hacer, no
 *   queda una devolución registrada sin mercancía que la respalde.
 * · La póliza se intenta en el acto y se dice cómo fue. Si no sale, la
 *   devolución no se cae —la mercancía ya salió del almacén— pero tampoco se
 *   calla.
 * ============================================================================
 */
@Injectable()
export class DevolucionesProveedorService {
  private readonly logger = new Logger(DevolucionesProveedorService.name);

  constructor(
    @InjectRepository(DevolucionProveedor)
    private readonly devoluciones: Repository<DevolucionProveedor>,
    @InjectRepository(DevolucionProveedorDetalle)
    private readonly detalles: Repository<DevolucionProveedorDetalle>,
    private readonly dataSource: DataSource,
    private readonly inventario: InventarioService,
    private readonly asientos: AsientosPendientesService,
    private readonly folios: FoliosService,
    /*
     * Para volver a derivar lo que se le debe al proveedor cuando la devolución
     * se registra. La regla vive allí, en un solo sitio; aquí sólo se la llama.
     */
    private readonly ordenes: OrdenesCompraService,
  ) {}

  private folioDeOrden(oc: { id: string; folio?: string | null }) {
    /* El folio guardado; el recorte del uuid sólo si la migración no corrió. */
    return folioDe(oc, TIPOS_DE_FOLIO.ORDEN_COMPRA);
  }

  /**
   * Qué se puede devolver de una orden: lo recibido menos lo ya devuelto.
   *
   * Es la pantalla la que necesita esto, y es también el tope que valida el
   * alta: una pantalla que ofrece más de lo que el servidor acepta termina en
   * un 400 con el formulario lleno.
   */
  async devolvible(ordenCompraId: string, empresaId: string) {
    const oc = await this.dataSource.getRepository(OrdenCompra).findOne({
      where: { id: ordenCompraId, empresaId },
      relations: ['detalles', 'detalles.producto', 'proveedor'],
    });
    if (!oc) throw new NotFoundException('La orden de compra no existe.');

    const devueltas = await this.detalles
      .createQueryBuilder('d')
      .select('d.detalleOrdenId', 'detalleOrdenId')
      .addSelect('SUM(d.cantidad)', 'cantidad')
      .innerJoin(
        DevolucionProveedor,
        'dev',
        'dev.id = d.devolucionId AND dev.estado = :vigente',
        { vigente: EstadoDevolucionProveedor.REGISTRADA },
      )
      .where('d.empresaId = :empresaId', { empresaId })
      .andWhere('dev.ordenCompraId = :ordenCompraId', { ordenCompraId })
      .groupBy('d.detalleOrdenId')
      .getRawMany<{ detalleOrdenId: string; cantidad: string }>();

    /* SUM() en PostgreSQL devuelve numeric, y numeric llega como TEXTO. */
    const yaDevuelto = new Map(
      devueltas.map((d) => [d.detalleOrdenId, Number(d.cantidad)]),
    );

    /*
     * ── De qué almacén salió, sin adivinar ────────────────────────────────
     *
     * La pantalla ofrecía TODOS los almacenes de la empresa y no decía en
     * cuál está la mercancía. Elegir el equivocado llenaba el formulario
     * entero para recibir, al final, «No existe resumen de stock para el
     * producto y almacén». Medido el 27-sep-2026 con el rol comprador.
     *
     * El dato existe: la recepción de la orden lo registró. Se devuelve para
     * que la pantalla ofrezca sólo donde de verdad entró la mercancía.
     */
    const almacenes = await this.dataSource.query(
      `SELECT DISTINCT r.almacenId AS "almacenId", a.nombre AS "nombre"
         FROM recepciones_compra r
         JOIN almacenes a ON a.id = r.almacenId
        WHERE r.empresaId = $1 AND r.ordenCompraId = $2`,
      [empresaId, ordenCompraId],
    );

    return {
      ordenCompraId: oc.id,
      folio: this.folioDeOrden(oc),
      almacenesRecepcion: (almacenes ?? []).map((a: any) => ({
        id: String(a.almacenId),
        nombre: String(a.nombre ?? ''),
      })),
      proveedorId: oc.proveedorId,
      proveedor: (oc as any).proveedor?.nombre ?? null,
      estadoPago: (oc as any).estadoPago ?? 'PENDIENTE',
      partidas: (oc.detalles ?? []).map((d) => {
        const recibido = Number((d as any).cantidadRecibidaOk ?? 0);
        const devuelto = yaDevuelto.get(d.id) ?? 0;
        return {
          detalleOrdenId: d.id,
          productoId: d.productoId,
          producto: (d as any).producto?.nombre ?? null,
          sku: (d as any).producto?.sku ?? null,
          recibido,
          devuelto,
          disponible: Math.max(0, Math.round((recibido - devuelto) * 10000) / 10000),
          costoUnitario: Number(d.precioUnitario),
          tasaIva: Number((d as any).tasaIva ?? 0),
        };
      }),
    };
  }

  async listar(empresaId: string) {
    return this.devoluciones.find({
      where: { empresaId },
      relations: ['detalles', 'detalles.producto', 'almacen'],
      order: { fechaCreacion: 'DESC' },
    });
  }

  /*
   * ==========================================================================
   * Contar no es leer el máximo y sumarle uno
   * --------------------------------------------------------------------------
   * El `SELECT MAX(...) + 1` que había aquí tiene una ventana entre leer y
   * escribir: dos devoluciones capturadas a la vez se llevan el mismo folio. Y
   * `devoluciones_proveedor` no tenía índice único sobre el folio, así que no
   * daba error: daban dos devoluciones con el mismo número, cada una con su
   * asiento, y una nota de crédito del proveedor que ya no se sabe a cuál
   * corresponde. La migración que acompaña a este cambio añade el índice.
   *
   * Se reserva con una sola sentencia atómica, y se le pasa el manager para
   * que el número se devuelva si el alta falla. El formato no cambia.
   * ==========================================================================
   */
  private async siguienteFolio(
    empresaId: string,
    manager: EntityManager = this.devoluciones.manager,
  ): Promise<string> {
    const consecutivo = await this.folios.siguienteConsecutivo(
      TIPOS_CORRIDOS.DEVOLUCION_PROVEEDOR,
      empresaId,
      manager,
      SIN_EJERCICIO,
    );
    return `DP-${String(consecutivo).padStart(6, '0')}`;
  }

  async crear(
    datos: {
      ordenCompraId: string;
      almacenId: string;
      fecha: string;
      motivo: string;
      notaCreditoProveedor?: string;
      partidas: Array<{ detalleOrdenId: string; cantidad: number }>;
    },
    empresaId: string,
    usuarioId?: string,
  ) {
    const disponible = await this.devolvible(datos.ordenCompraId, empresaId);
    const porDetalle = new Map(
      disponible.partidas.map((p) => [p.detalleOrdenId, p]),
    );

    const lineas = (datos.partidas ?? []).filter((p) => Number(p.cantidad) > 0);
    if (!lineas.length) {
      throw new BadRequestException(
        'Indica al menos una partida con cantidad a devolver.',
      );
    }

    for (const linea of lineas) {
      const partida = porDetalle.get(linea.detalleOrdenId);
      if (!partida) {
        throw new BadRequestException(
          'Una de las partidas no pertenece a esta orden de compra.',
        );
      }
      if (Number(linea.cantidad) > partida.disponible + 0.0001) {
        throw new BadRequestException(
          `${partida.producto ?? partida.productoId}: se recibieron ` +
            `${partida.recibido} y ya se devolvieron ${partida.devuelto}. ` +
            `Como mucho se pueden devolver ${partida.disponible}.`,
        );
      }
    }

    const salida = await this.dataSource.transaction(async (manager) => {
      /*
       * Con el manager de ESTA transacción: si el alta de la devolución falla
       * el número se devuelve y la numeración no queda con huecos.
       */
      const folio = await this.siguienteFolio(empresaId, manager);
      const cabecera = manager.create(DevolucionProveedor, {
        empresaId,
        folio,
        ordenCompraId: datos.ordenCompraId,
        proveedorId: disponible.proveedorId,
        almacenId: datos.almacenId,
        fecha: new Date(datos.fecha),
        motivo: datos.motivo.trim(),
        notaCreditoProveedor: datos.notaCreditoProveedor?.trim() || null,
        estado: EstadoDevolucionProveedor.REGISTRADA,
        usuarioId: usuarioId ?? null,
        subtotal: 0,
        impuestos: 0,
        total: 0,
      });
      const guardada = await manager.save(cabecera);

      let subtotal = 0;
      let impuestos = 0;
      const paraContabilidad: Array<{
        productoId: string;
        cantidad: number;
        costoUnitario: number;
        tasaIva: number;
      }> = [];

      for (const linea of lineas) {
        const partida = porDetalle.get(linea.detalleOrdenId)!;
        const cantidad = Number(linea.cantidad);
        const neto = Math.round(partida.costoUnitario * cantidad * 100) / 100;
        const iva = Math.round(neto * partida.tasaIva * 100) / 100;

        /*
         * La mercancía sale del almacén por el circuito normal de inventario:
         * consume lotes, deja kardex y devuelve el costo real. No se toca
         * `stock_por_almacen` a mano, que es como se rompe la trazabilidad.
         */
        await this.inventario.registrarSalida(
          partida.productoId,
          datos.almacenId,
          cantidad,
          `Devolución a proveedor ${folio}`,
          empresaId,
          undefined,
          undefined,
          manager,
          { id: guardada.id, tipo: 'DEVOLUCION_PROVEEDOR' },
          undefined,
          undefined,
          /* El kardex lo muestra desde el 5-oct, y aquí se sabe quién es. */
          usuarioId,
        );

        await manager.save(
          manager.create(DevolucionProveedorDetalle, {
            empresaId,
            devolucionId: guardada.id,
            detalleOrdenId: partida.detalleOrdenId,
            productoId: partida.productoId,
            cantidad,
            costoUnitario: partida.costoUnitario,
            tasaIva: partida.tasaIva,
            subtotal: neto,
            impuesto: iva,
          }),
        );

        subtotal += neto;
        impuestos += iva;
        paraContabilidad.push({
          productoId: partida.productoId,
          cantidad,
          costoUnitario: partida.costoUnitario,
          tasaIva: partida.tasaIva,
        });
      }

      guardada.subtotal = Math.round(subtotal * 100) / 100;
      guardada.impuestos = Math.round(impuestos * 100) / 100;
      guardada.total = Math.round((subtotal + impuestos) * 100) / 100;
      await manager.save(guardada);

      /*
       * ══════════════════════════════════════════════════════════════════════
       * Y lo que se le debe al proveedor cambia aquí mismo
       * ----------------------------------------------------------------------
       * Hasta hoy el saldo de la orden sólo se volvía a derivar **cuando
       * entraba un pago**, y eso dejaba fuera justo el caso que la regla viene a
       * resolver: una orden de 11,600 con 9,600 pagados debe 2,000; si se
       * devuelven esos 2,000, ya no hay nada que pagar, así que no va a haber
       * otro pago que dispare el recálculo. La orden se quedaba en PARCIAL para
       * siempre, con un saldo que nadie iba a cobrar ni a saldar.
       *
       * Va DESPUÉS de guardar el total de la devolución, porque el recálculo
       * suma los totales de las devoluciones vigentes de la orden y tiene que
       * ver ésta; y dentro de la transacción, para que si algo falla el estado
       * de la orden se deshaga con lo demás.
       * ══════════════════════════════════════════════════════════════════════
       */
      await this.ordenes.recalcularCobranzaDeLaOrden(
        manager,
        empresaId,
        datos.ordenCompraId,
      );

      /*
       * Si la orden ya estaba pagada, el IVA vive en 118 «acreditable pagado»;
       * si no, en 119 «pendiente de pago». Devolver lo pagado y lo no pagado
       * no son el mismo asiento.
       */
      const evento = await this.asientos.encolarEnTransaccion(
        manager,
        TipoAsiento.DEVOLUCION_PROVEEDOR,
        {
          devolucionId: guardada.id,
          empresaId,
          folio,
          fecha: new Date(datos.fecha),
          ivaYaPagado: disponible.estadoPago === 'PAGADA',
          detalles: paraContabilidad,
        },
        empresaId,
        folio,
        guardada.id,
      );

      return { devolucion: guardada, asientoPendienteId: evento?.id };
    });

    if (!salida.asientoPendienteId) {
      return { ...salida.devolucion, estadoContable: 'NO_APLICA' as const };
    }
    try {
      const asiento = await this.asientos.reintentarAhora(
        salida.asientoPendienteId,
        empresaId,
      );
      if (asiento?.polizaId) {
        await this.devoluciones.update(
          { id: salida.devolucion.id },
          { polizaId: asiento.polizaId },
        );
      }
      if (!asiento?.generado) {
        this.logger.warn(
          `Devolución ${salida.devolucion.folio} registrada; la póliza quedó ` +
            `pendiente: ${asiento?.mensaje ?? 'sin detalle'}`,
        );
      }
      return {
        ...salida.devolucion,
        polizaId: asiento?.polizaId ?? null,
        estadoContable: asiento?.generado ? 'GENERADO' : 'PENDIENTE',
        mensajeContable: asiento?.generado ? undefined : asiento?.mensaje,
      };
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Devolución ${salida.devolucion.folio} registrada, pero la póliza quedó pendiente: ${mensaje}`,
      );
      return {
        ...salida.devolucion,
        estadoContable: 'PENDIENTE' as const,
        mensajeContable: mensaje,
      };
    }
  }

  /**
   * Cancelar una devolución no devuelve la mercancía al almacén.
   *
   * Se deja explícitamente fuera: reingresar mercancía exige decidir a qué
   * costo entra y a qué lote, y eso es una recepción, no un deshacer. Mientras
   * ese circuito no exista, permitir «cancelar» sería ofrecer un botón que
   * deja el inventario mal. Lo honesto es decirlo.
   */
  async cancelar(): Promise<never> {
    throw new ConflictException(
      'Una devolución registrada no se cancela: la mercancía ya salió del ' +
        'almacén. Si el proveedor la regresa, regístrala como una recepción ' +
        'nueva para que entre con su costo y su lote.',
    );
  }
}
