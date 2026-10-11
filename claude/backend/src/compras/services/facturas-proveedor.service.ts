import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { FoliosService, TIPOS_DE_FOLIO } from '../../common/services/folios.service';
import { diaDeCalendarioAFecha, fechaContableNegocio } from '../../common/utils/business-time.util';
import { DetalleOrdenCompra } from '../entities/detalle-orden-compra.entity';
import {
  FacturaProveedor,
  FacturaProveedorDetalle,
} from '../entities/factura-proveedor.entity';
import { OrdenCompra } from '../entities/orden-compra.entity';
import { Proveedor } from '../../proveedores/entities/proveedor.entity';
import { cotejarTresVias, ResultadoCotejo } from '../utils/el-cotejo-de-tres-vias';
import {
  TechoDeFacturas,
  techoDeFacturas,
} from '../utils/el-techo-que-pone-la-factura';

const redondear = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** El UUID de un CFDI: 8-4-4-4-12 hexadecimales. */
const UUID_CFDI = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

@Injectable()
export class FacturasProveedorService {
  constructor(
    @InjectRepository(FacturaProveedor)
    private readonly repo: Repository<FacturaProveedor>,
    @InjectRepository(FacturaProveedorDetalle)
    private readonly detallesRepo: Repository<FacturaProveedorDetalle>,
    private readonly dataSource: DataSource,
    private readonly folios: FoliosService,
  ) {}

  async listar(
    empresaId: string,
    filtros: { ordenCompraId?: string; proveedorId?: string; estado?: string } = {},
  ) {
    const donde: any = { empresaId };
    if (filtros.ordenCompraId) donde.ordenCompraId = filtros.ordenCompraId;
    if (filtros.proveedorId) donde.proveedorId = filtros.proveedorId;
    if (filtros.estado) donde.estado = filtros.estado;
    return this.repo.find({ where: donde, order: { fechaEmision: 'DESC' } });
  }

  async obtener(id: string, empresaId: string) {
    const factura = await this.repo.findOne({ where: { id, empresaId } });
    if (!factura) throw new NotFoundException('Factura de proveedor no encontrada.');
    const detalles = await this.detallesRepo.find({ where: { facturaId: id } });
    return {
      ...factura,
      detalles,
      cotejo: factura.resultadoCotejoJson
        ? (JSON.parse(factura.resultadoCotejoJson) as ResultadoCotejo)
        : null,
    };
  }

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * REGISTRAR LA FACTURA Y COTEJARLA EN EL MISMO ACTO
   * --------------------------------------------------------------------------
   * El cotejo no es un paso aparte que alguien pueda saltarse: se hace al
   * guardar y el resultado queda escrito en la factura. Un control que hay que
   * acordarse de ejecutar no es un control, es una pantalla.
   *
   * Lo que NO hace es bloquear la captura cuando hay diferencias. La factura
   * se registra igual, en estado CON_DIFERENCIAS. Rechazarla dejaría al
   * sistema sin rastro del documento que de verdad llegó, y el proveedor
   * seguiría reclamando su cobro con un papel que el ERP no conoce. Lo que se
   * bloquea es el PAGO, que es donde el dinero sale.
   * ══════════════════════════════════════════════════════════════════════════
   */
  async registrar(empresaId: string, usuarioId: string | undefined, dto: any) {
    const uuidFiscal = String(dto.uuidFiscal ?? '').trim().toUpperCase() || null;
    if (uuidFiscal && !UUID_CFDI.test(uuidFiscal)) {
      throw new BadRequestException(
        'El UUID fiscal no tiene la forma de un folio fiscal del SAT (8-4-4-4-12). ' +
          'Si el comprobante no es un CFDI —un proveedor del extranjero, un recibo simple—, déjalo vacío.',
      );
    }
    const fechaEmision = diaDeCalendarioAFecha(dto.fechaEmision);
    if (!fechaEmision) {
      throw new BadRequestException('La fecha de emisión de la factura es obligatoria.');
    }
    /*
     * Una factura no puede estar emitida mañana. Es la misma regla que ya
     * gobierna las pólizas —la contabilidad registra lo que ya pasó— y aquí
     * tiene un filo extra: una factura futura se acredita en un periodo que
     * todavía no existe.
     */
    if (fechaEmision.getTime() > fechaContableNegocio().getTime()) {
      throw new BadRequestException(
        `La factura dice estar emitida el ${dto.fechaEmision}, que todavía no llega.`,
      );
    }
    const lineas = Array.isArray(dto.detalles) ? dto.detalles : [];
    if (!lineas.length) {
      throw new BadRequestException('La factura tiene que traer al menos una partida.');
    }

    return this.dataSource.transaction(async (em) => {
      const proveedor = await em.findOne(Proveedor, {
        where: { id: dto.proveedorId, empresaId },
      });
      if (!proveedor) {
        throw new BadRequestException('El proveedor no existe o es de otra empresa.');
      }

      let orden: OrdenCompra | null = null;
      let partidas: DetalleOrdenCompra[] = [];
      if (dto.ordenCompraId) {
        orden = await em.findOne(OrdenCompra, {
          where: { id: dto.ordenCompraId, empresaId },
        });
        if (!orden) {
          throw new BadRequestException('La orden de compra no existe o es de otra empresa.');
        }
        /*
         * El proveedor de la factura tiene que ser el de la orden. Sin esta
         * comprobación, una factura capturada contra la orden equivocada
         * pasaría el cotejo —las cantidades podrían coincidir— y se le pagaría
         * a quien no entregó.
         */
        if (orden.proveedorId !== dto.proveedorId) {
          throw new BadRequestException(
            'La factura es de un proveedor distinto al de la orden de compra. ' +
              'Si la orden está mal, corrígela; si la factura es de otra compra, búscale su orden.',
          );
        }
        if (orden.estado === 'CANCELADA') {
          throw new ConflictException('La orden de compra está cancelada.');
        }
        partidas = await em.find(DetalleOrdenCompra, {
          where: { ordenCompraId: orden.id },
        });
      }

      if (uuidFiscal) {
        const yaEstaba = await em.findOne(FacturaProveedor, {
          where: { empresaId, uuidFiscal },
        });
        if (yaEstaba) {
          /*
           * Capturar dos veces la misma factura es cómo se paga dos veces, y
           * es un error que sólo se ve conciliando el estado de cuenta del
           * proveedor meses después. La negativa nombra la que ya está.
           */
          throw new ConflictException(
            `Ese CFDI ya está capturado como ${yaEstaba.folio ?? yaEstaba.id} ` +
              `(${new Date(yaEstaba.fechaEmision).toISOString().slice(0, 10)}, ` +
              `$${Number(yaEstaba.total).toFixed(2)}). Capturarlo dos veces es cómo se paga dos veces.`,
          );
        }
      }

      /* Importes calculados aquí, no tomados del DTO: lo que manda la pantalla
       * es materia prima, no el total que se va a pagar. */
      const detallesCalculados = lineas.map((l: any) => {
        const cantidad = Number(l.cantidad ?? 0);
        const precio = Number(l.precioUnitario ?? 0);
        if (!(cantidad > 0)) {
          throw new BadRequestException('Cada partida de la factura necesita una cantidad mayor a cero.');
        }
        if (precio < 0) {
          throw new BadRequestException('El precio unitario no puede ser negativo.');
        }
        const subtotal = redondear(cantidad * precio);
        const tasaIva = Number(l.tasaIva ?? 0);
        return {
          detalleOrdenId: l.detalleOrdenId ?? null,
          productoId: l.productoId ?? null,
          descripcion: l.descripcion ?? null,
          cantidad,
          precioUnitario: precio,
          subtotal,
          tasaIva,
          impuesto: redondear(subtotal * tasaIva),
        };
      });

      const subtotal = redondear(
        detallesCalculados.reduce((a: number, d: any) => a + d.subtotal, 0),
      );
      const impuestos = redondear(
        detallesCalculados.reduce((a: number, d: any) => a + d.impuesto, 0),
      );
      const total = redondear(subtotal + impuestos);

      /*
       * Si quien captura trajo el total del CFDI, se compara. No se usa el
       * suyo: se usa el calculado, y la diferencia se denuncia. Aceptar el
       * total del papel sin comprobar las partidas es exactamente lo que el
       * cotejo viene a evitar, un renglón más arriba.
       */
      if (dto.total !== undefined && Math.abs(Number(dto.total) - total) > 0.05) {
        throw new BadRequestException(
          `El total del comprobante dice $${Number(dto.total).toFixed(2)} y sus partidas suman ` +
            `$${total.toFixed(2)}. Revisa la captura: la diferencia no es un redondeo.`,
        );
      }

      const folio = await this.folios.siguiente(
        TIPOS_DE_FOLIO.FACTURA_PROVEEDOR,
        empresaId,
        em,
        fechaEmision,
      );

      const cotejo = orden
        ? cotejarTresVias({
            partidasDeLaOrden: partidas.map((p) => ({
              id: p.id,
              descripcion: (p as any).descripcion ?? null,
              cantidad: Number(p.cantidad),
              cantidadRecibidaOk: Number(p.cantidadRecibidaOk ?? 0),
              precioUnitario: Number(p.precioUnitario),
            })),
            lineasDeLaFactura: detallesCalculados,
            facturadoPrevio: await this.facturadoPorPartida(em, empresaId, orden.id),
          })
        : null;

      const factura = await em.save(
        em.create(FacturaProveedor, {
          empresaId,
          folio,
          proveedorId: dto.proveedorId,
          ordenCompraId: orden?.id ?? null,
          uuidFiscal,
          folioProveedor: dto.folioProveedor?.trim() || null,
          fechaEmision,
          fechaVencimiento: diaDeCalendarioAFecha(dto.fechaVencimiento),
          subtotal,
          impuestos,
          total,
          moneda: dto.moneda ?? 'MXN',
          estado: cotejo ? (cotejo.conciliado ? 'CONCILIADA' : 'CON_DIFERENCIAS') : 'REGISTRADA',
          resultadoCotejoJson: cotejo ? JSON.stringify(cotejo) : null,
          fechaCotejo: cotejo ? new Date() : null,
          xml: dto.xml ?? null,
          registradaPorId: usuarioId ?? null,
          notas: dto.notas?.trim() || null,
        }),
      );

      await em.save(
        FacturaProveedorDetalle,
        detallesCalculados.map((d: any) =>
          em.create(FacturaProveedorDetalle, { ...d, facturaId: factura.id }),
        ),
      );

      return { ...factura, cotejo };
    });
  }

  /**
   * Cuánto se lleva facturado de cada partida de una orden, sumando TODAS sus
   * facturas vigentes.
   *
   * Sin esto, dos facturas por la mitad de la orden cada una pasarían las dos
   * y juntas cobrarían el doble. Es el mismo razonamiento del tope de las
   * devoluciones, que mira lo ya devuelto y no sólo la devolución en curso.
   */
  async facturadoPorPartida(
    em: EntityManager,
    empresaId: string,
    ordenCompraId: string,
    excluirFacturaId?: string,
  ): Promise<Map<string, number>> {
    /*
     * `facturas_proveedor_detalle` no lleva empresa —cuelga de su factura— así
     * que la consulta une con la madre y filtra por `empresaid` ahí. El id de
     * la orden ya viene de una orden comprobada, pero un filtro que depende de
     * que el llamador haya hecho bien su trabajo es el que se olvida el día
     * que alguien llama desde otro sitio.
     */
    const filas = await em.query(
      `SELECT d.detalleordenid AS "detalleOrdenId",
              COALESCE(SUM(d.cantidad), 0)::float AS "cantidad"
         FROM facturas_proveedor_detalle d
         JOIN facturas_proveedor f ON f.id = d.facturaid
        WHERE f.empresaid = $1
          AND f.ordencompraid = $2
          AND f.estado <> 'CANCELADA'
          AND ($3::uuid IS NULL OR f.id <> $3::uuid)
          AND d.detalleordenid IS NOT NULL
        GROUP BY d.detalleordenid`,
      [empresaId, ordenCompraId, excluirFacturaId ?? null],
    );
    return new Map(filas.map((f: any) => [f.detalleOrdenId, Number(f.cantidad)]));
  }

  /**
   * Vuelve a cotejar una factura ya registrada.
   *
   * Hace falta porque el cotejo es una FOTO: una factura que llegó antes que
   * la mercancía nace CON_DIFERENCIAS —factura más de lo recibido, porque no
   * había llegado nada— y se concilia sola en cuanto la remesa entra. Sin este
   * botón, esa factura se quedaría marcada para siempre y alguien acabaría
   * pagando por encima del control.
   */
  async recotejar(id: string, empresaId: string) {
    const factura = await this.repo.findOne({ where: { id, empresaId } });
    if (!factura) throw new NotFoundException('Factura de proveedor no encontrada.');
    if (factura.estado === 'CANCELADA') {
      throw new ConflictException('Una factura cancelada no se vuelve a cotejar.');
    }
    if (!factura.ordenCompraId) {
      throw new BadRequestException(
        'Esta factura no tiene orden de compra, así que no hay contra qué cotejarla. ' +
          'Las facturas sin orden —luz, honorarios— se revisan a mano.',
      );
    }
    return this.dataSource.transaction(async (em) => {
      const partidas = await em.find(DetalleOrdenCompra, {
        where: { ordenCompraId: factura.ordenCompraId! },
      });
      const lineas = await em.find(FacturaProveedorDetalle, {
        where: { facturaId: id },
      });
      const cotejo = cotejarTresVias({
        partidasDeLaOrden: partidas.map((p) => ({
          id: p.id,
          descripcion: (p as any).descripcion ?? null,
          cantidad: Number(p.cantidad),
          cantidadRecibidaOk: Number(p.cantidadRecibidaOk ?? 0),
          precioUnitario: Number(p.precioUnitario),
        })),
        lineasDeLaFactura: lineas.map((l) => ({
          detalleOrdenId: l.detalleOrdenId,
          descripcion: l.descripcion,
          cantidad: Number(l.cantidad),
          precioUnitario: Number(l.precioUnitario),
        })),
        /* Excluyéndose a sí misma: si se contara, se vería a sí misma como
         * «ya facturado» y acusaría de doble facturación a la primera. */
        facturadoPrevio: await this.facturadoPorPartida(
          em,
          empresaId,
          factura.ordenCompraId!,
          id,
        ),
      });
      factura.resultadoCotejoJson = JSON.stringify(cotejo);
      factura.fechaCotejo = new Date();
      factura.estado = cotejo.conciliado ? 'CONCILIADA' : 'CON_DIFERENCIAS';
      await em.save(factura);
      return { ...factura, cotejo };
    });
  }

  async cancelar(id: string, empresaId: string, motivo: string) {
    if (!motivo?.trim()) {
      throw new BadRequestException('Di por qué se cancela la factura: queda en la bitácora.');
    }
    const factura = await this.repo.findOne({ where: { id, empresaId } });
    if (!factura) throw new NotFoundException('Factura de proveedor no encontrada.');
    if (factura.estado === 'CANCELADA') {
      throw new ConflictException('La factura ya está cancelada.');
    }
    const [{ total }] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total
         FROM pagos_proveedor
        WHERE empresaid = $1 AND facturaproveedorid = $2`,
      [empresaId, id],
    );
    if (Number(total) > 0) {
      /*
       * Una factura pagada no se cancela por aquí: el dinero ya salió y
       * borrarle el documento al pago lo dejaría sin respaldo, que es el
       * estado que ninguna auditoría perdona. Si el proveedor la canceló ante
       * el SAT, lo que corresponde es su nota de crédito.
       */
      throw new ConflictException(
        `Esta factura tiene ${total} pago(s) registrados y no se cancela: el pago quedaría sin ` +
          'documento que lo respalde. Si el proveedor la canceló ante el SAT, registra su nota de crédito.',
      );
    }
    factura.estado = 'CANCELADA';
    factura.notas = `${factura.notas ?? ''}\nCancelada: ${motivo.trim()}`.trim().slice(0, 300);
    await this.repo.save(factura);
    return { mensaje: `Factura ${factura.folio} cancelada.` };
  }

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * EL TECHO QUE IMPONE LA FACTURA, Y POR QUÉ SÓLO CUANDO LA HAY
   * --------------------------------------------------------------------------
   * Lo que se le puede pagar a un proveedor es el MENOR de dos números: lo que
   * llegó y lo que facturó. Pagar más de lo recibido es pagar mercancía que no
   * está; pagar más de lo facturado es pagar sin comprobante, y en México eso
   * significa además acreditar un IVA que ningún CFDI respalda.
   *
   * Pero esto devuelve `null` cuando la orden no tiene ninguna factura
   * capturada, y entonces el pago se comporta exactamente como antes. Es la
   * misma decisión que con los centros de costo: **un documento nuevo no puede
   * apagar la operación**. Una instalación que todavía no captura facturas de
   * proveedor no se entera de que esto existe; la que empieza a capturarlas
   * gana el control desde la primera.
   * ══════════════════════════════════════════════════════════════════════════
   */
  async techoPorFacturas(
    em: EntityManager,
    empresaId: string,
    ordenCompraId: string,
  ): Promise<TechoDeFacturas | null> {
    /* Una sola implementación del número. `pagarOrden` llama a la misma
     * función dentro de su propia transacción; dos consultas que calculan el
     * mismo tope son dos topes que pueden separarse. */
    return techoDeFacturas(em, empresaId, ordenCompraId);
  }
}
