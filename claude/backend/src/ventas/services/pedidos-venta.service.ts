import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { Almacen } from '../../catalogo/entities/almacen.entity';
import { StockPorAlmacen } from '../../catalogo/entities/stock-por-almacen.entity';
import {
  EstadoReservaInventario,
  ReservaInventario,
} from '../../catalogo/entities/reserva-inventario.entity';
import { PreciosService } from '../../catalogo/services/precios.service';
import { Cliente } from '../../clientes/entities/cliente.entity';
import {
  FoliosService,
  TIPOS_DE_FOLIO,
} from '../../common/services/folios.service';
import { diaDeCalendarioAFecha } from '../../common/utils/business-time.util';
import {
  DetallePedidoVenta,
  EstadoPedidoVenta,
  PedidoVenta,
} from '../entities/pedido-venta.entity';
import {
  EPSILON,
  estadoDerivadoPedido,
  loQueFalta,
  tieneBackorder,
} from '../utils/lo-que-falta-por-surtir';
import { VentasService } from './ventas.service';

const redondear4 = (n: number) =>
  Math.round((Number(n) + Number.EPSILON) * 10000) / 10000;
const redondear2 = (n: number) =>
  Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** `PEDIDO_VENTA` en `reservas_inventario.referenciaTipo`. */
export const REFERENCIA_PEDIDO = 'PEDIDO_VENTA';

@Injectable()
export class PedidosVentaService {
  constructor(
    @InjectRepository(PedidoVenta)
    private readonly repo: Repository<PedidoVenta>,
    @InjectRepository(DetallePedidoVenta)
    private readonly detallesRepo: Repository<DetallePedidoVenta>,
    private readonly dataSource: DataSource,
    private readonly folios: FoliosService,
    private readonly precios: PreciosService,
    private readonly ventas: VentasService,
  ) {}

  async listar(
    empresaId: string,
    filtros: { estado?: string; clienteId?: string } = {},
  ) {
    const donde: Record<string, unknown> = { empresaId };
    if (filtros.estado) donde.estado = filtros.estado;
    if (filtros.clienteId) donde.clienteId = filtros.clienteId;
    return this.repo.find({
      where: donde,
      relations: ['cliente'],
      order: { fechaPedido: 'DESC' },
    });
  }

  async obtener(id: string, empresaId: string) {
    const pedido = await this.repo.findOne({
      where: { id, empresaId },
      relations: ['cliente'],
    });
    if (!pedido) throw new NotFoundException('El pedido no existe.');
    const detalles = await this.detallesRepo.find({
      where: { pedidoId: id },
      relations: ['producto'],
    });
    return {
      ...pedido,
      detalles: detalles.map((d) => ({ ...d, ...loQueFalta(d) })),
      backorder: tieneBackorder(detalles),
    };
  }

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * CAPTURAR EL PEDIDO
   * --------------------------------------------------------------------------
   * Nace en BORRADOR y no reserva nada. Capturar no es comprometer: mientras
   * el vendedor está tecleando, la mercancía tiene que seguir disponible para
   * quien llegue al mostrador.
   *
   * Los precios los resuelve el MISMO servicio que los de la venta. No se
   * acepta el que manda la pantalla —igual que en el mostrador— y no se
   * reimplementa la lista de precios aquí: dos calculadoras de precio es como
   * se acaba cobrando distinto por la misma caja según por dónde entró.
   * ══════════════════════════════════════════════════════════════════════════
   */
  async crear(empresaId: string, usuarioId: string | undefined, dto: any) {
    const lineas = Array.isArray(dto.detalles) ? dto.detalles : [];
    if (!lineas.length) {
      throw new BadRequestException('El pedido necesita al menos un producto.');
    }
    const fechaPedido = diaDeCalendarioAFecha(dto.fechaPedido) ?? new Date();
    const fechaCompromiso = diaDeCalendarioAFecha(dto.fechaCompromiso);
    if (fechaCompromiso && fechaCompromiso.getTime() < fechaPedido.getTime()) {
      throw new BadRequestException(
        'La fecha de compromiso es anterior a la del pedido: se estaría prometiendo entregar antes de recibirlo.',
      );
    }

    const resuelta = await this.precios.resolverVenta(
      lineas.map((l: any) => ({
        productoId: l.productoId,
        cantidad: Number(l.cantidad),
        descuentoSolicitado: l.descuento,
        precioMostrado: l.precioUnitario,
      })),
      empresaId,
      { listaPrecioId: dto.listaPrecioId, rolUsuario: dto.rolUsuario },
    );

    return this.dataSource.transaction(async (em) => {
      if (dto.clienteId) {
        const cliente = await em.findOne(Cliente, {
          where: { id: dto.clienteId, empresaId, activo: true },
        });
        if (!cliente) {
          throw new BadRequestException(
            'El cliente no existe, está inactivo o es de otra empresa.',
          );
        }
      }
      if (dto.almacenId) {
        const almacen = await em.findOne(Almacen, {
          where: { id: dto.almacenId, empresaId, activo: true },
        });
        if (!almacen) {
          throw new BadRequestException(
            'El almacén no existe, está inactivo o es de otra empresa.',
          );
        }
      }

      const folio = await this.folios.siguiente(
        TIPOS_DE_FOLIO.PEDIDO_VENTA,
        empresaId,
        em,
        fechaPedido,
      );

      const pedido = await em.save(
        em.create(PedidoVenta, {
          empresaId,
          folio,
          clienteId: dto.clienteId ?? null,
          almacenId: dto.almacenId ?? null,
          listaPrecioId: resuelta.listaPrecioId ?? dto.listaPrecioId ?? null,
          fechaPedido,
          fechaCompromiso,
          estado: 'BORRADOR' as EstadoPedidoVenta,
          subtotal: resuelta.subtotal,
          descuento: resuelta.descuento,
          impuestoTotal: resuelta.impuestoTotal,
          total: resuelta.total,
          notas: dto.notas?.trim() || null,
          motivoCancelacion: null,
          creadoPorId: usuarioId ?? null,
        }),
      );

      await em.save(
        DetallePedidoVenta,
        resuelta.detalles.map((d) =>
          em.create(DetallePedidoVenta, {
            pedidoId: pedido.id,
            productoId: d.productoId,
            cantidad: d.cantidad,
            cantidadSurtida: 0,
            cantidadReservada: 0,
            reservaId: null,
            precioUnitario: d.precioUnitario,
            descuento: d.descuento,
            impuestoPorcentaje: d.impuestoPorcentaje,
            impuestoMonto: d.impuestoMonto,
            subtotal: d.subtotal,
          }),
        ),
      );

      return this.obtener(pedido.id, empresaId);
    });
  }

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * CONFIRMAR: APARTAR LO QUE HAY, ANOTAR LO QUE FALTA
   * --------------------------------------------------------------------------
   * Aquí está la decisión del módulo entero.
   *
   * Confirmar reserva lo que el almacén tenga y **no falla por lo que no
   * tenga**. Un pedido existe para registrar un compromiso con el cliente;
   * negarse a registrarlo porque falta mercancía es exactamente lo que hace
   * que los pedidos se sigan apuntando en una libreta, y entonces el sistema
   * no se entera ni de los que sí podía surtir.
   *
   * Lo que falta no desaparece: queda como *backorder* en el renglón, que es
   * el número por el que el cliente llama y que hoy no existe en ninguna
   * parte. La pantalla lo pinta y el reporte lo filtra.
   *
   * La reserva se apoya en `reservas_inventario`, que ya existía con su
   * bloqueo y su consumo resueltos. No se construye un segundo apartado: *la
   * pieza buena existe y hasta hoy el camino real no la usaba*.
   * ══════════════════════════════════════════════════════════════════════════
   */
  async confirmar(id: string, empresaId: string, usuarioId?: string) {
    return this.dataSource.transaction(async (em) => {
      const pedido = await em
        .createQueryBuilder(PedidoVenta, 'p')
        .setLock('pessimistic_write')
        .where('p.id = :id AND p.empresaId = :empresaId', { id, empresaId })
        .getOne();
      if (!pedido) throw new NotFoundException('El pedido no existe.');
      if (pedido.estado !== 'BORRADOR') {
        throw new ConflictException(
          `El pedido está ${pedido.estado} y sólo se confirma un borrador.`,
        );
      }
      if (!pedido.almacenId) {
        throw new BadRequestException(
          'Dile de qué almacén se compromete la mercancía: la reserva se hace ahí.',
        );
      }
      const detalles = await em.find(DetallePedidoVenta, {
        where: { pedidoId: id },
      });

      for (const d of detalles) {
        await this.reservarRenglon(em, pedido, d, usuarioId);
        await em.save(d);
      }

      pedido.estado = 'CONFIRMADO';
      await em.save(pedido);
      return this.obtener(id, empresaId);
    });
  }

  /**
   * Aparta para un renglón lo que el almacén tenga disponible.
   *
   * El orden de bloqueo es stock → reserva, el mismo que usan `registrarSalida`
   * y `liberarReserva`. Invertirlo aquí habría creado un abrazo mortal entre
   * confirmar un pedido y cobrar una venta del mismo producto, que es de los
   * defectos que sólo aparecen con dos personas trabajando a la vez.
   */
  private async reservarRenglon(
    em: EntityManager,
    pedido: PedidoVenta,
    d: DetallePedidoVenta,
    usuarioId?: string,
  ) {
    const falta = loQueFalta(d);
    if (falta.pendiente <= EPSILON) return;

    const stock = await em
      .createQueryBuilder(StockPorAlmacen, 's')
      .setLock('pessimistic_write')
      .where(
        's.empresaId = :empresaId AND s.productoId = :productoId AND s.almacenId = :almacenId',
        {
          empresaId: pedido.empresaId,
          productoId: d.productoId,
          almacenId: pedido.almacenId,
        },
      )
      .getOne();

    const disponible = stock
      ? Math.max(
          0,
          Number(stock.cantidad ?? 0) -
            Number(stock.reservado ?? 0) -
            Number((stock as any).bloqueado ?? 0),
        )
      : 0;

    /*
     * Ya reservado para este mismo renglón: confirmar dos veces —o reintentar
     * tras un fallo a la mitad— no puede apartar el doble.
     */
    const yaReservado = Math.min(falta.pendiente, Number(d.cantidadReservada ?? 0));
    const porApartar = redondear4(
      Math.min(falta.pendiente - yaReservado, disponible),
    );
    if (porApartar <= EPSILON) return;

    stock!.reservado = redondear4(Number(stock!.reservado ?? 0) + porApartar);
    await em.save(stock!);

    let reserva = d.reservaId
      ? await em
          .createQueryBuilder(ReservaInventario, 'r')
          .setLock('pessimistic_write')
          .where('r.id = :id AND r.empresaId = :empresaId', {
            id: d.reservaId,
            empresaId: pedido.empresaId,
          })
          .getOne()
      : null;

    if (
      reserva &&
      ![
        EstadoReservaInventario.ACTIVA,
        EstadoReservaInventario.PARCIALMENTE_CONSUMIDA,
      ].includes(reserva.estado)
    ) {
      /* Una reserva liberada o expirada no se revive: se abre otra. Revivirla
       * dejaría el stock reservado dos veces si alguien ya lo devolvió. */
      reserva = null;
      d.reservaId = null;
    }

    if (reserva) {
      reserva.cantidad = redondear4(Number(reserva.cantidad) + porApartar);
      reserva.estado = EstadoReservaInventario.ACTIVA;
      await em.save(reserva);
    } else {
      reserva = await em.save(
        em.create(ReservaInventario, {
          empresaId: pedido.empresaId,
          productoId: d.productoId,
          almacenId: pedido.almacenId!,
          cantidad: porApartar,
          cantidadConsumida: 0,
          referenciaTipo: REFERENCIA_PEDIDO,
          /* El renglón, no el pedido: el índice único de `reservas_inventario`
           * es por referencia + producto + almacén, y dos renglones del mismo
           * pedido pueden traer el mismo producto. */
          referenciaId: d.id,
          estado: EstadoReservaInventario.ACTIVA,
          usuarioId,
          motivo: `Pedido ${pedido.folio ?? pedido.id}`,
        }),
      );
      d.reservaId = reserva.id;
    }

    d.cantidadReservada = redondear4(Number(d.cantidadReservada ?? 0) + porApartar);
  }

  /**
   * Vuelve a intentar apartar lo que quedó en espera.
   *
   * Hace falta porque el *backorder* se resuelve solo cuando entra mercancía,
   * y sin este botón el pedido se quedaría esperando para siempre aunque el
   * almacén ya tuviera de sobra. Es el mismo razonamiento que el de volver a
   * cotejar una factura de proveedor: el apartado es una foto del momento en
   * que se confirmó.
   */
  async reintentarApartado(id: string, empresaId: string, usuarioId?: string) {
    return this.dataSource.transaction(async (em) => {
      const pedido = await em
        .createQueryBuilder(PedidoVenta, 'p')
        .setLock('pessimistic_write')
        .where('p.id = :id AND p.empresaId = :empresaId', { id, empresaId })
        .getOne();
      if (!pedido) throw new NotFoundException('El pedido no existe.');
      if (pedido.estado !== 'CONFIRMADO' && pedido.estado !== 'SURTIDO_PARCIAL') {
        throw new ConflictException(
          `Un pedido ${pedido.estado} no aparta mercancía.`,
        );
      }
      const detalles = await em.find(DetallePedidoVenta, {
        where: { pedidoId: id },
      });
      for (const d of detalles) {
        await this.reservarRenglon(em, pedido, d, usuarioId);
        await em.save(d);
      }
      return this.obtener(id, empresaId);
    });
  }

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * SURTIR: LA VENTA DE SIEMPRE, CON LA RESERVA EN LA MANO
   * --------------------------------------------------------------------------
   * Surtir NO mueve inventario ni asienta nada por su cuenta: arma la venta y
   * la manda por el camino de siempre, pasándole la reserva de cada renglón.
   * `registrarSalida` ya sabe consumirla.
   *
   * Es deliberado y es la mitad del valor de este módulo. Si surtir descargara
   * el inventario por su cuenta, el ERP tendría dos formas de vender, y la
   * segunda nacería sin CFDI, sin caja, sin política de crédito y sin póliza
   * —y nadie lo notaría hasta cerrar el mes—.
   *
   * ── EL PRECIO PACTADO ─────────────────────────────────────────────────────
   *
   * La venta recalcula precios con la lista vigente. Si la lista cambió entre
   * el pedido y la entrega, lo que se cobraría no es lo que se pactó. Eso NO
   * se deja pasar en silencio: se compara antes de vender y, si no coincide,
   * se niega nombrando los dos números. Quien decida respetar el precio nuevo
   * lo dice explícitamente con `aceptarPrecioVigente`, y queda en las notas de
   * la venta.
   *
   * Congelar el precio de verdad —que la venta acepte un precio autorizado—
   * es una decisión sobre quién puede saltarse la lista, y ésa vive con los
   * permisos y la doble firma, no aquí.
   * ══════════════════════════════════════════════════════════════════════════
   */
  async surtir(
    id: string,
    empresaId: string,
    dto: {
      lineas?: Array<{ detalleId: string; cantidad: number }>;
      metodoPago: string;
      cuentaBancariaId?: string;
      aceptarPrecioVigente?: boolean;
      notas?: string;
    },
    usuarioId?: string,
    rolUsuario?: string,
  ) {
    const pedido = await this.repo.findOne({ where: { id, empresaId } });
    if (!pedido) throw new NotFoundException('El pedido no existe.');
    if (pedido.estado === 'BORRADOR') {
      throw new ConflictException(
        'El pedido todavía es un borrador: confírmalo antes de surtir.',
      );
    }
    if (pedido.estado === 'CANCELADO') {
      throw new ConflictException('El pedido está cancelado.');
    }
    if (pedido.estado === 'SURTIDO') {
      throw new ConflictException('Este pedido ya se surtió completo.');
    }

    const detalles = await this.detallesRepo.find({ where: { pedidoId: id } });
    const porId = new Map(detalles.map((d) => [d.id, d]));

    /* Sin lista explícita se surte todo lo que esté apartado. Lo que está en
     * espera no se puede surtir: no hay mercancía que sacar. */
    const pedidas =
      dto.lineas?.length
        ? dto.lineas
        : detalles
            .map((d) => ({ detalleId: d.id, cantidad: loQueFalta(d).reservado }))
            .filter((l) => l.cantidad > EPSILON);

    if (!pedidas.length) {
      throw new BadRequestException(
        'No hay nada apartado que surtir. Si entró mercancía, vuelve a intentar el apartado.',
      );
    }

    const renglones: Array<{
      detalle: DetallePedidoVenta;
      cantidad: number;
    }> = [];
    for (const l of pedidas) {
      const d = porId.get(l.detalleId);
      if (!d) {
        throw new BadRequestException(
          'Una de las partidas no pertenece a este pedido.',
        );
      }
      const cantidad = redondear4(Number(l.cantidad));
      if (!(cantidad > 0)) continue;
      const falta = loQueFalta(d);
      if (cantidad > falta.reservado + EPSILON) {
        throw new BadRequestException(
          `De «${d.productoId}» sólo hay ${falta.reservado} apartadas y se piden ${cantidad}. ` +
            (falta.enEspera > EPSILON
              ? `Quedan ${falta.enEspera} en espera de mercancía: entra la remesa, vuelve a intentar el apartado y surte después.`
              : 'Revisa la cantidad.'),
        );
      }
      renglones.push({ detalle: d, cantidad });
    }
    if (!renglones.length) {
      throw new BadRequestException('No se indicó ninguna cantidad a surtir.');
    }

    /*
     * El precio se comprueba ANTES de vender, contra el mismo resolvedor que
     * usará la venta. Comprobarlo después sería descubrir el cobro equivocado
     * con el dinero ya en la caja.
     */
    const resuelta = await this.precios.resolverVenta(
      renglones.map((r) => ({
        productoId: r.detalle.productoId,
        cantidad: r.cantidad,
        precioMostrado: r.detalle.precioUnitario,
      })),
      empresaId,
      { listaPrecioId: pedido.listaPrecioId ?? undefined, rolUsuario },
    );

    const movidos = resuelta.detalles
      .map((r, i) => ({
        producto: r.productoNombre,
        pactado: redondear2(Number(renglones[i].detalle.precioUnitario)),
        vigente: redondear2(Number(r.precioUnitario)),
      }))
      .filter((x) => Math.abs(x.vigente - x.pactado) > 0.005);

    if (movidos.length && !dto.aceptarPrecioVigente) {
      throw new ConflictException(
        'El precio cambió desde que se pactó el pedido: ' +
          movidos
            .map(
              (m) =>
                `${m.producto} se pactó a $${m.pactado.toFixed(2)} y hoy vale $${m.vigente.toFixed(2)}`,
            )
            .join('; ') +
          '. Si vas a cobrar el precio de hoy, dilo explícitamente; si vale el pactado, corrige la lista de precios antes de surtir.',
      );
    }

    const entrega = await this.cuantasEntregasLleva(empresaId, id);
    const venta = await this.ventas.crear(
      {
        clienteId: pedido.clienteId ?? undefined,
        metodoPago: dto.metodoPago as any,
        cuentaBancariaId: dto.cuentaBancariaId ?? undefined,
        almacenId: pedido.almacenId ?? undefined,
        listaPrecioId: pedido.listaPrecioId ?? undefined,
        notas:
          `Pedido ${pedido.folio ?? id} · entrega ${entrega + 1}` +
          (movidos.length ? ' · se cobró el precio vigente, no el pactado' : '') +
          (dto.notas ? ` · ${dto.notas}` : ''),
        detalles: renglones.map((r) => ({
          productoId: r.detalle.productoId,
          cantidad: r.cantidad,
          precioUnitario: Number(r.detalle.precioUnitario),
          reservaId: r.detalle.reservaId ?? undefined,
        })),
      } as any,
      empresaId,
      usuarioId,
      rolUsuario,
      /* La clave de idempotencia la arma el pedido, no la pantalla: dos clics
       * sobre «surtir» son una entrega, no dos. */
      `pedido-${id}-entrega-${entrega + 1}`.slice(0, 100),
    );

    /*
     * Lo surtido se escribe desde lo que la VENTA de verdad sacó, renglón por
     * renglón, y no desde lo que se pidió surtir. Si la venta entregó menos
     * —el almacén no tenía todo, un lote no alcanzó—, el renglón no puede
     * quedar marcado como completo: ése es el cliente al que nadie vuelve a
     * llamar.
     */
    const salidoPorProducto = new Map<string, number>();
    for (const dv of (venta as any)?.detalles ?? []) {
      const previo = salidoPorProducto.get(dv.productoId) ?? 0;
      salidoPorProducto.set(dv.productoId, previo + Number(dv.cantidad ?? 0));
    }

    await this.dataSource.transaction(async (em) => {
      for (const r of renglones) {
        const disponibleDelProducto =
          salidoPorProducto.get(r.detalle.productoId) ?? 0;
        const salido = Math.min(r.cantidad, disponibleDelProducto);
        salidoPorProducto.set(
          r.detalle.productoId,
          redondear4(disponibleDelProducto - salido),
        );
        if (salido <= EPSILON) continue;
        r.detalle.cantidadSurtida = redondear4(
          Number(r.detalle.cantidadSurtida ?? 0) + salido,
        );
        r.detalle.cantidadReservada = Math.max(
          0,
          redondear4(Number(r.detalle.cantidadReservada ?? 0) - salido),
        );
        await em.save(r.detalle);
      }
      const todos = await em.find(DetallePedidoVenta, { where: { pedidoId: id } });
      const fresco = await em.findOne(PedidoVenta, { where: { id, empresaId } });
      if (fresco) {
        fresco.estado = estadoDerivadoPedido(todos, fresco.estado);
        await em.save(fresco);
      }
    });

    return { venta, pedido: await this.obtener(id, empresaId) };
  }

  /** Cuántas entregas lleva el pedido, para numerar la clave de idempotencia. */
  private async cuantasEntregasLleva(empresaId: string, pedidoId: string) {
    const filas = (await this.dataSource.query(
      `SELECT COUNT(*)::int AS cuantas
         FROM ventas
        WHERE empresaid = $1
          AND claveidempotencia LIKE $2`,
      [empresaId, `pedido-${pedidoId}-entrega-%`],
    )) as Array<{ cuantas: number }>;
    return Number(filas?.[0]?.cuantas ?? 0);
  }

  /**
   * Cancelar devuelve a disponible lo que estaba apartado.
   *
   * Lo ya surtido no se toca: esa mercancía salió y su venta existe. Cancelar
   * un pedido no deshace una venta, y pretenderlo dejaría inventario y
   * contabilidad discrepando.
   */
  async cancelar(id: string, empresaId: string, motivo: string) {
    if (!motivo?.trim() || motivo.trim().length < 5) {
      throw new BadRequestException(
        'Di por qué se cancela el pedido: es lo único que explicará dentro de seis meses por qué se soltó la mercancía.',
      );
    }
    return this.dataSource.transaction(async (em) => {
      const pedido = await em
        .createQueryBuilder(PedidoVenta, 'p')
        .setLock('pessimistic_write')
        .where('p.id = :id AND p.empresaId = :empresaId', { id, empresaId })
        .getOne();
      if (!pedido) throw new NotFoundException('El pedido no existe.');
      if (pedido.estado === 'CANCELADO') {
        throw new ConflictException('El pedido ya está cancelado.');
      }
      if (pedido.estado === 'SURTIDO') {
        throw new ConflictException(
          'El pedido ya se surtió completo: lo que corresponde es una devolución de venta, no una cancelación.',
        );
      }

      const detalles = await em.find(DetallePedidoVenta, { where: { pedidoId: id } });
      for (const d of detalles) {
        await this.soltarReserva(em, pedido, d);
        await em.save(d);
      }

      pedido.estado = 'CANCELADO';
      pedido.motivoCancelacion = motivo.trim().slice(0, 300);
      await em.save(pedido);
      return this.obtener(id, empresaId);
    });
  }

  /** Devuelve a disponible lo apartado de un renglón. Orden: stock → reserva. */
  private async soltarReserva(
    em: EntityManager,
    pedido: PedidoVenta,
    d: DetallePedidoVenta,
  ) {
    const apartado = Number(d.cantidadReservada ?? 0);
    if (apartado <= EPSILON) {
      d.cantidadReservada = 0;
      return;
    }
    const stock = await em
      .createQueryBuilder(StockPorAlmacen, 's')
      .setLock('pessimistic_write')
      .where(
        's.empresaId = :empresaId AND s.productoId = :productoId AND s.almacenId = :almacenId',
        {
          empresaId: pedido.empresaId,
          productoId: d.productoId,
          almacenId: pedido.almacenId,
        },
      )
      .getOne();
    if (stock) {
      stock.reservado = Math.max(
        0,
        redondear4(Number(stock.reservado ?? 0) - apartado),
      );
      await em.save(stock);
    }
    if (d.reservaId) {
      const reserva = await em
        .createQueryBuilder(ReservaInventario, 'r')
        .setLock('pessimistic_write')
        .where('r.id = :id AND r.empresaId = :empresaId', {
          id: d.reservaId,
          empresaId: pedido.empresaId,
        })
        .getOne();
      if (
        reserva &&
        [
          EstadoReservaInventario.ACTIVA,
          EstadoReservaInventario.PARCIALMENTE_CONSUMIDA,
        ].includes(reserva.estado)
      ) {
        reserva.estado = EstadoReservaInventario.LIBERADA;
        await em.save(reserva);
      }
    }
    d.cantidadReservada = 0;
  }

  /** Los pedidos con algo en espera de mercancía: el reporte de backorder. */
  async enEspera(empresaId: string) {
    return this.dataSource.query(
      `SELECT p.id, p.folio, p.fechacompromiso AS "fechaCompromiso",
              c.nombre AS cliente,
              d.productoid AS "productoId", pr.nombre AS producto,
              (d.cantidad - d.cantidadsurtida - d.cantidadreservada)::float AS "enEspera"
         FROM pedidos_venta_detalle d
         JOIN pedidos_venta p ON p.id = d.pedidoid
         LEFT JOIN clientes c ON c.id = p.clienteid
         LEFT JOIN productos pr ON pr.id = d.productoid
        WHERE p.empresaid = $1
          AND p.estado IN ('CONFIRMADO', 'SURTIDO_PARCIAL')
          AND (d.cantidad - d.cantidadsurtida - d.cantidadreservada) > 0.0001
        ORDER BY p.fechacompromiso NULLS LAST, p.folio`,
      [empresaId],
    );
  }
}
