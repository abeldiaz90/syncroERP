import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';

import { Producto } from '../entities/producto.entity';
import { ProductoPrecio } from '../entities/producto-precio.entity';
import { ListaPrecio } from '../entities/lista-precio.entity';

/**
 * ============================================================================
 * SyncroERP · Precios autoritativos
 * ----------------------------------------------------------------------------
 * EL HUECO QUE CIERRA
 *
 * La corrección anterior hizo que el backend recalcule la ARITMÉTICA de la
 * venta: ya no acepta un `total` enviado por el navegador, lo suma él mismo.
 * Eso cerró un ataque, pero dejó el otro abierto:
 *
 *     // ventas.service.ts — lo que sigue pasando hoy
 *     if (!Number.isFinite(d.precioUnitario) || d.precioUnitario < 0) {
 *       throw new BadRequestException('El precio unitario no puede ser negativo.');
 *     }
 *     const bruto = redondear(d.cantidad * d.precioUnitario);
 *                                          ↑ del navegador, sin verificar
 *
 * El servidor comprueba que el precio no sea negativo, y nada más. No consulta
 * cuánto cuesta el producto. Así que el ataque solo cambia de forma:
 *
 *     antes:  { total: 1 }              → ya se rechaza
 *     ahora:  { precioUnitario: 1 }     → se acepta, y el total sale en 1.16
 *
 * Lo mismo con `impuestoPorcentaje`: se valida el rango 0–100, pero nadie
 * verifica que sea el impuesto que le toca al producto. Se puede vender un
 * producto gravado con 0 % de IVA.
 *
 * ── EL PRINCIPIO ───────────────────────────────────────────────────────────
 *
 * El navegador dice QUÉ se vende. El servidor decide A CUÁNTO.
 *
 * El frontend manda producto, cantidad, lista de precios y descuento
 * solicitado. Nada más. Todo importe se resuelve aquí, contra la base.
 *
 * ── SOBRE LOS DESCUENTOS ───────────────────────────────────────────────────
 *
 * Un descuento sí es una decisión humana legítima, así que no puede prohibirse
 * sin más. Pero tampoco puede ser ilimitado: se acota con un tope por rol.
 * Un cajero puede dar 5 %, un gerente 20 %, y más que eso requiere
 * autorización explícita.
 * ============================================================================
 */

const redondear2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Lo que el frontend tiene permitido enviar. */
export interface RenglonSolicitado {
  productoId: string;
  cantidad: number;
  /** Descuento pedido, en importe. Se valida contra el tope del rol. */
  descuentoSolicitado?: number;
  /** Alternativa: descuento en porcentaje. */
  descuentoPorcentaje?: number;
  equivalenciaId?: string;
  loteEspecificoId?: string;
  /**
   * Precio que el frontend cree que aplica. NO se usa para calcular:
   * solo se compara para detectar que la pantalla está desactualizada.
   */
  precioMostrado?: number;
}

/** Lo que el servidor determina. Esto es lo que se guarda. */
export interface RenglonResuelto {
  productoId: string;
  productoNombre: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  subtotal: number;
  impuestoId?: string;
  impuestoPorcentaje: number;
  impuestoMonto: number;
  total: number;
  equivalenciaId?: string;
  loteEspecificoId?: string;
}

export interface VentaResuelta {
  detalles: RenglonResuelto[];
  subtotal: number;
  descuento: number;
  impuestoTotal: number;
  total: number;
  /** Renglones donde el precio de la pantalla no coincidía con el real. */
  discrepancias: Array<{
    productoNombre: string;
    precioMostrado: number;
    precioReal: number;
    diferencia: number;
  }>;
}

/** Tope de descuento por rol, en porcentaje sobre el subtotal del renglón. */
const TOPE_DESCUENTO: Record<string, number> = {
  admin: 100,
  SUPER_ADMIN: 100,
  gerente: 20,
  supervisor: 15,
  cajero: 5,
  vendedor: 5,
  empleado: 0,
};

@Injectable()
export class PreciosService {
  private readonly logger = new Logger(PreciosService.name);

  constructor(
    @InjectRepository(Producto)
    private readonly productoRepo: Repository<Producto>,
    @InjectRepository(ProductoPrecio)
    private readonly precioRepo: Repository<ProductoPrecio>,
    @InjectRepository(ListaPrecio)
    private readonly listaRepo: Repository<ListaPrecio>,
  ) {}

  /* ══ RESOLUCIÓN ══════════════════════════════════════════════════════════ */

  /**
   * Convierte lo que pidió el frontend en importes que el servidor respalda.
   *
   * Es el único punto donde se decide cuánto cuesta algo. Si un día hay
   * promociones, precios por volumen o precios por cliente, se agregan aquí y
   * toda la aplicación los respeta sin tocar nada más.
   */
  async resolverVenta(
    renglones: RenglonSolicitado[],
    empresaId: string,
    opciones: {
      listaPrecioId?: string;
      rolUsuario?: string;
      /** Autorización explícita para pasar del tope. */
      descuentoAutorizadoPorId?: string;
    } = {},
    manager?: EntityManager,
  ): Promise<VentaResuelta> {
    if (!renglones?.length) {
      throw new BadRequestException('La venta necesita al menos un producto.');
    }

    const repoProd = manager
      ? manager.getRepository(Producto)
      : this.productoRepo;

    // Una sola consulta para todos los productos: no N+1 en una venta de
    // treinta renglones.
    const ids = Array.from(new Set(renglones.map((r) => r.productoId)));
    const productos = await repoProd.find({
      where: { id: In(ids), empresaId },
      relations: ['impuesto'],
    });

    const porId = new Map(productos.map((p) => [p.id, p]));

    // Un producto que no aparece es de otra empresa o no existe. Ambos casos
    // son intento de manipulación o error grave del frontend.
    for (const id of ids) {
      if (!porId.has(id)) {
        throw new NotFoundException(
          `El producto ${id} no existe o no pertenece a tu empresa.`,
        );
      }
    }

    const listaId = await this.resolverLista(
      opciones.listaPrecioId,
      empresaId,
      manager,
    );
    const preciosDeLista = await this.cargarPreciosDeLista(
      ids,
      listaId,
      empresaId,
      manager,
    );

    const topeRol = this.topeDescuento(opciones.rolUsuario);
    const resueltos: RenglonResuelto[] = [];
    const discrepancias: VentaResuelta['discrepancias'] = [];

    for (const r of renglones) {
      const producto = porId.get(r.productoId);

      if (!Number.isFinite(r.cantidad) || r.cantidad <= 0) {
        throw new BadRequestException(
          `${producto.nombre}: la cantidad debe ser mayor que cero.`,
        );
      }
      if (producto.activo === false) {
        throw new BadRequestException(
          `${producto.nombre} está dado de baja y no se puede vender.`,
        );
      }

      /* ── El precio lo pone el servidor ── */
      const precioUnitario = this.precioDe(
        producto,
        preciosDeLista.get(r.productoId),
      );

      if (precioUnitario <= 0) {
        throw new BadRequestException(
          `${producto.nombre} no tiene precio en la lista aplicable. ` +
            `En este ERP el precio de venta vive en las listas de precios: ` +
            `agrégalo en Catálogos → Listas de precio antes de venderlo.`,
        );
      }

      // Si la pantalla mostraba otro precio, se reporta. No se acepta el de la
      // pantalla: se avisa para que el cajero sepa que el ticket cambió.
      if (
        r.precioMostrado !== undefined &&
        Math.abs(r.precioMostrado - precioUnitario) >= 0.01
      ) {
        discrepancias.push({
          productoNombre: producto.nombre,
          precioMostrado: redondear2(r.precioMostrado),
          precioReal: precioUnitario,
          diferencia: redondear2(precioUnitario - r.precioMostrado),
        });
      }

      const bruto = redondear2(r.cantidad * precioUnitario);

      /* ── Descuento, acotado por el rol ── */
      let descuento = 0;
      if (r.descuentoPorcentaje !== undefined) {
        if (r.descuentoPorcentaje < 0 || r.descuentoPorcentaje > 100) {
          throw new BadRequestException(
            'El porcentaje de descuento no es válido.',
          );
        }
        descuento = redondear2((bruto * r.descuentoPorcentaje) / 100);
      } else if (r.descuentoSolicitado !== undefined) {
        descuento = redondear2(r.descuentoSolicitado);
      }

      if (descuento < 0) {
        throw new BadRequestException('El descuento no puede ser negativo.');
      }
      if (descuento > bruto) {
        throw new BadRequestException(
          `${producto.nombre}: el descuento (${descuento}) excede el importe (${bruto}).`,
        );
      }

      const porcentajeDescuento = bruto > 0 ? (descuento / bruto) * 100 : 0;

      if (porcentajeDescuento > topeRol && !opciones.descuentoAutorizadoPorId) {
        throw new ForbiddenException(
          `El descuento de ${porcentajeDescuento.toFixed(1)}% en ${producto.nombre} ` +
            `supera el máximo de ${topeRol}% para tu perfil. ` +
            `Requiere autorización de un supervisor.`,
        );
      }

      const subtotal = redondear2(bruto - descuento);

      /* ── El impuesto lo pone el producto, no el navegador ── */
      const impuestoPorcentaje = Number(producto.impuesto?.porcentaje ?? 0);
      const impuestoMonto = redondear2((subtotal * impuestoPorcentaje) / 100);

      resueltos.push({
        productoId: producto.id,
        productoNombre: producto.nombre,
        cantidad: r.cantidad,
        precioUnitario,
        descuento,
        subtotal,
        impuestoId: producto.impuestoId ?? undefined,
        impuestoPorcentaje,
        impuestoMonto,
        total: redondear2(subtotal + impuestoMonto),
        equivalenciaId: r.equivalenciaId,
        loteEspecificoId: r.loteEspecificoId,
      });
    }

    if (discrepancias.length > 0) {
      this.logger.warn(
        `${discrepancias.length} renglones con precio distinto al mostrado en pantalla. ` +
          `Se aplicó el precio del catálogo.`,
      );
    }

    const subtotal = redondear2(resueltos.reduce((s, d) => s + d.subtotal, 0));
    const descuento = redondear2(
      resueltos.reduce((s, d) => s + d.descuento, 0),
    );
    const impuestoTotal = redondear2(
      resueltos.reduce((s, d) => s + d.impuestoMonto, 0),
    );

    return {
      detalles: resueltos,
      subtotal,
      descuento,
      impuestoTotal,
      total: redondear2(subtotal + impuestoTotal),
      discrepancias,
    };
  }

  /* ══ CONSULTA PARA EL PUNTO DE VENTA ═════════════════════════════════════ */

  /**
   * Precio e impuesto de un producto, tal como el servidor los va a aplicar.
   * El POS lo consulta al agregar al carrito, así que lo que se muestra en
   * pantalla es exactamente lo que se va a cobrar.
   */
  async consultarPrecio(
    productoId: string,
    empresaId: string,
    listaPrecioId?: string,
  ) {
    const producto = await this.productoRepo.findOne({
      where: { id: productoId, empresaId },
      relations: ['impuesto'],
    });
    if (!producto) throw new NotFoundException('El producto no existe.');

    const listaId = await this.resolverLista(listaPrecioId, empresaId);
    const precios = await this.cargarPreciosDeLista(
      [productoId],
      listaId,
      empresaId,
    );
    const precioUnitario = this.precioDe(producto, precios.get(productoId));

    return {
      productoId,
      nombre: producto.nombre,
      precioUnitario,
      impuestoPorcentaje: Number(producto.impuesto?.porcentaje ?? 0),
      impuestoNombre: producto.impuesto?.nombre ?? 'Sin impuesto',
      listaPrecioId: listaId,
      sinPrecio: precioUnitario <= 0,
    };
  }

  /* ══ INTERNOS ════════════════════════════════════════════════════════════ */

  /** La lista pedida, o la marcada por omisión de la empresa. */
  private async resolverLista(
    listaPrecioId: string | undefined,
    empresaId: string,
    manager?: EntityManager,
  ): Promise<string | undefined> {
    const repo = manager ? manager.getRepository(ListaPrecio) : this.listaRepo;

    if (listaPrecioId) {
      const lista = await repo.findOne({
        where: { id: listaPrecioId, empresaId },
      });
      if (!lista) {
        throw new BadRequestException(
          'La lista de precios no existe o no es de tu empresa.',
        );
      }
      return lista.id;
    }

    const porOmision = await repo.findOne({
      where: { empresaId, esPorDefecto: true },
    });
    return porOmision?.id;
  }

  private async cargarPreciosDeLista(
    productoIds: string[],
    listaPrecioId: string | undefined,
    empresaId: string,
    manager?: EntityManager,
  ): Promise<Map<string, number>> {
    if (!listaPrecioId) return new Map();

    const repo = manager
      ? manager.getRepository(ProductoPrecio)
      : this.precioRepo;
    const filas = await repo.find({
      where: { listaPrecioId, productoId: In(productoIds) },
    });

    return new Map(filas.map((f) => [f.productoId, Number(f.precio)]));
  }

  /**
   * El precio de venta vive ÚNICAMENTE en las listas de precios.
   *
   * `Producto` no tiene campo de precio de venta: solo `precioCompra` y
   * `costoEstandar`. Eso es una decisión de diseño del ERP y aquí se respeta —
   * no hay precio "de catálogo" al que caer.
   *
   * La consecuencia práctica: un producto que no esté en ninguna lista NO se
   * puede vender. Es lo correcto: vender sin precio configurado produce
   * ventas en cero que después nadie sabe explicar.
   */
  private precioDe(_producto: Producto, precioDeLista?: number): number {
    if (precioDeLista === undefined || precioDeLista <= 0) return 0;
    return redondear2(precioDeLista);
  }

  private topeDescuento(rol?: string): number {
    if (!rol) return 0;
    return TOPE_DESCUENTO[rol] ?? 0;
  }
}
