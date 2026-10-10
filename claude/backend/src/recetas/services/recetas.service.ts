// recetas/services/recetas.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { randomUUID } from 'crypto';
import { Receta } from '../entities/receta.entity';
import { RecetaInsumo } from '../entities/receta-insumo.entity';
import { Producto, TipoProducto } from '../../catalogo/entities/producto.entity';
import { AsientosPendientesService } from '../../finanzas/services/asientos-pendientes.service';
import { TipoAsiento } from '../../finanzas/entities/asiento-pendiente.entity';
import { fechaContableNegocio } from '../../common/utils/business-time.util';
import { InventarioService } from '../../catalogo/services/inventario.service';
import { GuardarRecetaDto, ProducirDto } from '../dtos/recetas.dtos';

// Resultado de explotar y producir una receta
export interface ResultadoProduccion {
  productoId: string;
  cantidadProducida: number;
  insumosDescontados: {
    insumoId: string;
    insumoNombre: string | null;
    cantidadDescontada: number;
    unidad: string;
  }[];
  costoTotal: number;
  advertencias: string[];
}

@Injectable()
export class RecetasService {
  private readonly logger = new Logger(RecetasService.name);

  constructor(
    @InjectRepository(Receta) private readonly recetaRepo: Repository<Receta>,
    private readonly inventarioService: InventarioService,
    private readonly dataSource: DataSource,
    private readonly asientos: AsientosPendientesService,
  ) {}

  // ── GUARDAR RECETA (crea o reemplaza) ────────────────────────────────────
  async guardarReceta(dto: GuardarRecetaDto, empresaId: string) {
    const insumos = Array.isArray(dto.insumos) ? dto.insumos : [];
    const ids = insumos.map((item) => item.insumoId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException(
        'No se puede repetir un insumo en la receta',
      );
    }
    if (ids.includes(dto.productoId)) {
      throw new BadRequestException(
        'Un producto no puede ser insumo de sí mismo',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const productos = await manager.find(Producto, {
        where: {
          id: In([dto.productoId, ...ids]),
          empresaId,
          activo: true,
        },
      });
      const porId = new Map(
        productos.map((producto) => [producto.id, producto]),
      );
      const terminado = porId.get(dto.productoId);
      if (!terminado) {
        throw new BadRequestException(
          'El producto terminado no existe, está inactivo o pertenece a otra empresa',
        );
      }
      const faltantes = ids.filter((id) => !porId.has(id));
      if (faltantes.length) {
        throw new BadRequestException(
          'Uno o más insumos no existen, están inactivos o pertenecen a otra empresa',
        );
      }

      let receta = await manager.findOne(Receta, {
        where: { productoId: dto.productoId, empresaId },
      });
      if (!receta) {
        receta = manager.create(Receta, {
          empresaId,
          productoId: dto.productoId,
          activa: true,
          costoTeorico: 0,
        });
      }
      receta.rendimiento = dto.rendimiento ?? 1;
      receta.notas = dto.notas?.trim() || null;
      receta.productoNombre = terminado.nombre;
      receta = await manager.save(receta);
      await manager.delete(RecetaInsumo, { recetaId: receta.id, empresaId });

      let costoTeorico = 0;
      const nuevos = insumos.map((item) => {
        const producto = porId.get(item.insumoId)!;
        const costoUnitario = Number(producto.precioCompra) || 0;
        const merma = Number(item.mermaPorcentaje ?? 0);
        costoTeorico +=
          costoUnitario * Number(item.cantidad) * (1 + merma / 100);
        return manager.create(RecetaInsumo, {
          empresaId,
          recetaId: receta.id,
          insumoId: item.insumoId,
          insumoNombre: producto.nombre,
          cantidad: item.cantidad,
          unidad: item.unidad?.trim() || producto.unidadMedida || 'PIEZA',
          mermaPorcentaje: merma,
          costoUnitario,
        });
      });
      await manager.save(nuevos);
      receta.costoTeorico = Math.round(costoTeorico * 10_000) / 10_000;
      await manager.save(receta);

      return {
        ok: true,
        recetaId: receta.id,
        costoTeorico: receta.costoTeorico,
        insumos: nuevos.length,
      };
    });
  }

  // ── OBTENER RECETA de un producto ────────────────────────────────────────
  async obtenerReceta(productoId: string, empresaId: string) {
    const receta = await this.recetaRepo.findOne({
      where: { productoId, empresaId },
      relations: ['insumos'],
    });
    return receta ?? null;
  }

  // ── LISTAR todas las recetas ─────────────────────────────────────────────
  listarRecetas(empresaId: string) {
    return this.recetaRepo.find({
      where: { empresaId, activa: true },
      order: { productoNombre: 'ASC' },
    });
  }

  // ── EXPLOTAR RECETA (sin descontar) — para previsualizar ─────────────────
  async explotar(productoId: string, cantidad: number, empresaId: string) {
    const receta = await this.recetaRepo.findOne({
      where: { productoId, empresaId },
      relations: ['insumos'],
    });
    if (!receta) return null;
    const rendimiento = Number(receta.rendimiento) || 1;
    const factor = cantidad / rendimiento;
    return receta.insumos.map((ins) => ({
      insumoId: ins.insumoId,
      insumoNombre: ins.insumoNombre,
      cantidadBase: Number(ins.cantidad),
      cantidadConMerma:
        Number(ins.cantidad) * (1 + Number(ins.mermaPorcentaje) / 100),
      cantidadTotal:
        Number(ins.cantidad) * (1 + Number(ins.mermaPorcentaje) / 100) * factor,
      unidad: ins.unidad,
    }));
  }

  // ── PRODUCIR/VENDER: explota la receta y descuenta insumos del inventario ─
  // Este es el corazón. Cuando se vende una margarita, se llama aquí con
  // cantidad=1, y descuenta el tequila, licor, etc. del almacén.
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * PRODUCIR SACABA VALOR DEL INVENTARIO Y NO PONÍA NADA A CAMBIO
   * --------------------------------------------------------------------------
   * Esto descontaba los insumos con `registrarSalida` y devolvía el costo. Nada
   * más. Y `registrarSalida` no encola asiento a propósito —lo encola quien
   * tiene el documento—, así que aquí no lo encolaba nadie.
   *
   * O sea que cada producción bajaba el valor del inventario y el mayor no se
   * enteraba. Producir cien litros de salsa restaba del almacén el costo de la
   * carne, el tomate y la sal, y la contabilidad seguía valorando el inventario
   * como si siguieran ahí. Descuadre permanente, en la dirección que nadie
   * sospecha: la balanza dice que hay más mercancía de la que hay.
   *
   * Y faltaba la otra mitad, que el barrido no vio: **no se registraba lo
   * producido**. Los insumos salían y el producto terminado no entraba por
   * ningún lado. El valor no se movía de sitio: se evaporaba.
   *
   * Qué pasa con el valor depende de qué se produce, y eso lo dice el catálogo:
   *
   *   · FISICO o MATERIA_PRIMA → es mercancía que se almacena. Entra al almacén
   *     con el costo REAL de los lotes que se consumieron, no con el teórico de
   *     la receta. El valor sólo cambia de renglón, así que el mayor no tiene
   *     nada que registrar: inventario contra inventario.
   *
   *   · KIT, SERVICIO o CONSUMIBLE → no se almacena. Entonces el costo de los
   *     insumos es un consumo de verdad y tiene que llegar al mayor, que es lo
   *     que ahora se encola. Se manda como CONSUMO y no como MERMA: no se echó
   *     a perder nada, se usó.
   *
   * Y la receta tiene que estar ACTIVA. `tieneReceta` y `ConsumoRecetasService`
   * ya filtran por `activa: true`; este camino era el único que no, así que una
   * receta retirada seguía pudiendo descontar insumos por esta puerta.
   * ══════════════════════════════════════════════════════════════════════════
   */
  async producir(
    dto: ProducirDto,
    empresaId: string,
    usuarioId?: string,
  ): Promise<ResultadoProduccion> {
    if (!Number.isFinite(Number(dto.cantidad)) || Number(dto.cantidad) <= 0) {
      throw new BadRequestException(
        'La cantidad a producir debe ser mayor a cero',
      );
    }
    const receta = await this.recetaRepo.findOne({
      where: { productoId: dto.productoId, empresaId, activa: true },
      relations: ['insumos'],
    });
    if (!receta)
      throw new NotFoundException(
        'Este producto no tiene una receta activa. Si la receta existe pero está retirada, actívala antes de producir.',
      );
    if (!receta.insumos?.length)
      throw new BadRequestException('La receta no tiene insumos');

    const rendimiento = Number(receta.rendimiento) || 1;
    const factor = dto.cantidad / rendimiento;

    return this.dataSource.transaction(async (manager) => {
      const descontados: ResultadoProduccion['insumosDescontados'] = [];
      const consumidos: Array<{ productoId: string; cantidad: number; costoUnitario: number }> = [];
      let costoTotal = 0;

      for (const ins of receta.insumos) {
        const cantidadReal =
          Number(ins.cantidad) *
          (1 + Number(ins.mermaPorcentaje) / 100) *
          factor;
        const salida = await this.inventarioService.registrarSalida(
          ins.insumoId,
          dto.almacenId,
          cantidadReal,
          dto.motivo ?? `Producción de ${receta.productoNombre ?? 'producto'}`,
          empresaId,
          undefined,
          undefined,
          manager,
          { id: receta.id, tipo: 'PRODUCCION_RECETA' },
        );
        // Usa el costo real de los lotes consumidos, no el costo teórico
        // congelado cuando se creó la receta.
        costoTotal += Number(salida.costoTotal);
        consumidos.push({
          productoId: ins.insumoId,
          cantidad: Number(salida.cantidadTotal),
          costoUnitario: Number(salida.costoUnitarioPromedio),
        });
        descontados.push({
          insumoId: ins.insumoId,
          insumoNombre: ins.insumoNombre,
          cantidadDescontada: Math.round(cantidadReal * 10000) / 10000,
          unidad: ins.unidad,
        });
      }

      const costo = Math.round(costoTotal * 100) / 100;
      const advertencias: string[] = [];

      const producto = await manager.findOne(Producto, {
        where: { id: dto.productoId, empresaId },
      });
      const seAlmacena =
        !!producto &&
        [TipoProducto.FISICO, TipoProducto.MATERIA_PRIMA].includes(producto.tipo);

      if (seAlmacena) {
        await this.inventarioService.registrarCompra(
          dto.productoId,
          dto.almacenId,
          dto.cantidad,
          `Producción de ${receta.productoNombre ?? producto!.nombre}`,
          empresaId,
          undefined,
          undefined,
          undefined,
          manager,
          costo / dto.cantidad,
          { id: receta.id, tipo: 'PRODUCCION_RECETA' },
          undefined,
          usuarioId,
        );
      } else {
        /*
         * No se almacena, así que el costo de los insumos salió del inventario
         * para quedarse fuera. Va al mayor como consumo, en un solo asiento con
         * un renglón por insumo: así la póliza dice QUÉ se consumió, que es lo
         * que el contador necesita cuando pregunta de dónde salió el importe.
         */
        const movimientoId = randomUUID();
        await this.asientos.encolarEnTransaccion(
          manager,
          TipoAsiento.SALIDA_INVENTARIO,
          {
            movimientoId,
            tipo: 'CONSUMO',
            motivo:
              dto.motivo ??
              `Producción de ${receta.productoNombre ?? dto.productoId} (${dto.cantidad})`,
            fecha: fechaContableNegocio(),
            empresaId,
            detalles: consumidos.map((c) => ({
              productoId: c.productoId,
              cantidad: c.cantidad,
              costoUnitario: c.costoUnitario,
            })),
          },
          empresaId,
          `PRODUCCION-${movimientoId.slice(0, 8)}`,
          movimientoId,
        );
        advertencias.push(
          `«${receta.productoNombre ?? 'El producto'}» no se almacena (${producto?.tipo ?? 'sin tipo'}), ` +
            'así que el costo de los insumos se registró como consumo en la contabilidad ' +
            'en vez de entrar al almacén.',
        );
      }

      return {
        productoId: dto.productoId,
        cantidadProducida: dto.cantidad,
        insumosDescontados: descontados,
        costoTotal: costo,
        advertencias,
      };
    });
  }

  // ── VERIFICAR si un producto tiene receta (para el POS) ──────────────────
  async tieneReceta(productoId: string, empresaId: string): Promise<boolean> {
    const count = await this.recetaRepo.count({
      where: { productoId, empresaId, activa: true },
    });
    return count > 0;
  }
}
