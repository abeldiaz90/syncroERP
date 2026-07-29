import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, EntityManager, Repository } from 'typeorm';

import { Receta } from '../entities/receta.entity';
import { RecetaInsumo } from '../entities/receta-insumo.entity';
import { InventarioService } from '../../catalogo/services/inventario.service';
import { MovimientoInventario } from '../../catalogo/entities/movimiento-inventario.entity';

/**
 * ============================================================================
 * SyncroERP · Consumo de recetas
 * ----------------------------------------------------------------------------
 * EL PROBLEMA QUE RESUELVE
 *
 * El módulo de recetas permitía definir el escandallo de una hamburguesa con
 * todo detalle: carne, pan, queso, mermas. Pero vender cien hamburguesas
 * **no movía un gramo de carne del inventario**. No había ninguna conexión
 * entre `ventas` y `recetas`.
 *
 * El efecto práctico: el restaurante ve su inventario de insumos intacto
 * mientras la cocina lo vacía. Nadie sabe cuánto queda de nada, la compra se
 * hace por corazonada, y el costo real de los platillos es un misterio.
 *
 * ── QUÉ HACE ESTE SERVICIO ─────────────────────────────────────────────────
 *
 * 1. Al vender un producto con receta, explota el escandallo y descuenta cada
 *    insumo del inventario, con su merma.
 *
 * 2. Devuelve el costo REAL de los insumos consumidos, tomado de los lotes.
 *    Ese número reemplaza al `costoTeorico` guardado, que es una foto vieja.
 *
 * 3. Compara teórico contra real por periodo. Esa diferencia es el corazón
 *    del control en alimentos y bebidas: merma no registrada, porciones mal
 *    servidas o robo.
 *
 * ── DECISIONES ─────────────────────────────────────────────────────────────
 *
 * **Si falta un insumo, la venta NO se detiene.** En un mostrador, frenar el
 * cobro porque el inventario dice que no hay lechuga —cuando la cocina sí la
 * tiene— es peor que registrar un faltante. Se consume lo que se pueda y se
 * reporta la diferencia para que alguien la corrija.
 *
 * **El costo teórico se recalcula al vuelo.** El campo `costoTeorico` de la
 * receta se calcula al guardarla y se queda viejo en cuanto sube un insumo.
 * Aquí siempre se consulta el costo actual del inventario.
 * ============================================================================
 */

const redondear2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const redondear4 = (n: number) => Math.round((n + Number.EPSILON) * 10_000) / 10_000;

export interface InsumoConsumido {
  insumoId: string;
  insumoNombre: string;
  cantidadRequerida: number;
  cantidadConsumida: number;
  unidad: string;
  costoUnitario: number;
  costoTotal: number;
  faltante: number;
}

export interface ResultadoConsumo {
  recetaId: string;
  productoId: string;
  porciones: number;
  costoTotal: number;
  costoPorPorcion: number;
  insumos: InsumoConsumido[];
  /** Insumos que no alcanzaron. La venta siguió; esto hay que revisarlo. */
  faltantes: Array<{ insumoNombre: string; requerido: number; consumido: number }>;
}

@Injectable()
export class ConsumoRecetasService {
  private readonly logger = new Logger(ConsumoRecetasService.name);

  constructor(
    @InjectRepository(Receta) private readonly recetaRepo: Repository<Receta>,
    @InjectRepository(RecetaInsumo) private readonly insumoRepo: Repository<RecetaInsumo>,
    @InjectRepository(MovimientoInventario) private readonly movRepo: Repository<MovimientoInventario>,
    private readonly inventario: InventarioService,
  ) {}

  /* ══ CONSUMO ═════════════════════════════════════════════════════════════ */

  /**
   * ¿Este producto se fabrica con receta?
   * Consulta barata: se llama por cada renglón de cada venta.
   */
  async tieneReceta(productoId: string, empresaId: string): Promise<boolean> {
    const n = await this.recetaRepo.count({
      where: { productoId, empresaId, activa: true },
    });
    return n > 0;
  }

  /**
   * Descuenta del inventario los insumos de un producto vendido.
   *
   * `cantidadVendida` está en unidades del producto terminado. El escandallo
   * está expresado para `receta.rendimiento` porciones, así que hay que
   * escalar: una receta que rinde 10 porciones y se venden 3 consume 3/10 de
   * cada insumo.
   */
  async consumirPorVenta(
    datos: {
      productoId: string;
      cantidadVendida: number;
      almacenId: string;
      documentoId?: string;
      folio?: string;
    },
    empresaId: string,
    manager: EntityManager,
  ): Promise<ResultadoConsumo | null> {
    const receta = await manager.findOne(Receta, {
      where: { productoId: datos.productoId, empresaId, activa: true },
      relations: ['insumos'],
    });

    if (!receta || !receta.insumos?.length) return null;

    const rendimiento = Number(receta.rendimiento) || 1;
    const factor = datos.cantidadVendida / rendimiento;

    const consumidos: InsumoConsumido[] = [];
    const faltantes: ResultadoConsumo['faltantes'] = [];
    let costoAcumulado = 0;

    for (const insumo of receta.insumos) {
      const merma = Number(insumo.mermaPorcentaje ?? 0);
      // La merma es cuánto se pierde al preparar: hay que tomar de más.
      const requerido = redondear4(Number(insumo.cantidad) * (1 + merma / 100) * factor);

      if (requerido <= 0) continue;

      try {
        const salida = await this.inventario.registrarSalida(
          insumo.insumoId,
          datos.almacenId,
          requerido,
          `Consumo de receta${datos.folio ? ` · venta #${datos.folio}` : ''}`,
          empresaId,
          undefined,
          undefined,
          manager,
          { id: datos.documentoId, tipo: 'CONSUMO_RECETA' },
        );

        consumidos.push({
          insumoId: insumo.insumoId,
          insumoNombre: insumo.insumoNombre ?? '—',
          cantidadRequerida: requerido,
          cantidadConsumida: salida.cantidadTotal,
          unidad: insumo.unidad,
          costoUnitario: salida.costoUnitarioPromedio,
          costoTotal: salida.costoTotal,
          faltante: 0,
        });

        costoAcumulado += salida.costoTotal;
      } catch (e) {
        // Stock insuficiente. NO se detiene la venta: en un mostrador, frenar
        // el cobro porque el inventario dice que no hay lechuga —cuando la
        // cocina sí la tiene— es peor que registrar el faltante y corregirlo.
        const mensaje = e instanceof Error ? e.message : String(e);

        faltantes.push({
          insumoNombre: insumo.insumoNombre ?? insumo.insumoId,
          requerido,
          consumido: 0,
        });

        consumidos.push({
          insumoId: insumo.insumoId,
          insumoNombre: insumo.insumoNombre ?? '—',
          cantidadRequerida: requerido,
          cantidadConsumida: 0,
          unidad: insumo.unidad,
          costoUnitario: 0,
          costoTotal: 0,
          faltante: requerido,
        });

        this.logger.warn(
          `Insumo sin existencia al vender ${receta.productoNombre ?? datos.productoId}: ` +
          `${insumo.insumoNombre} requiere ${requerido} ${insumo.unidad}. ${mensaje}`,
        );
      }
    }

    if (faltantes.length > 0) {
      this.logger.warn(
        `Venta${datos.folio ? ` #${datos.folio}` : ''}: ${faltantes.length} insumos sin ` +
        `existencia suficiente. El inventario de esos productos quedará mal hasta que ` +
        `se registre la entrada faltante.`,
      );
    }

    return {
      recetaId: receta.id,
      productoId: datos.productoId,
      porciones: datos.cantidadVendida,
      costoTotal: redondear2(costoAcumulado),
      costoPorPorcion: datos.cantidadVendida > 0
        ? redondear4(costoAcumulado / datos.cantidadVendida)
        : 0,
      insumos: consumidos,
      faltantes,
    };
  }

  /**
   * Reintegra los insumos al anular una venta.
   * Lee los movimientos originales para devolver al mismo lote y costo.
   */
  async revertirPorAnulacion(
    documentoId: string,
    empresaId: string,
    manager: EntityManager,
    folio?: string,
  ): Promise<{ insumosDevueltos: number; costoTotal: number }> {
    const movimientos = await manager.find(MovimientoInventario, {
      where: { documentoId, tipoDocumento: 'CONSUMO_RECETA', empresaId, tipo: 'SALIDA' },
    });

    let costo = 0;

    for (const mov of movimientos) {
      await this.inventario.registrarCompra(
        mov.productoId,
        mov.almacenId,
        Number(mov.cantidad),
        `Reversión de consumo de receta${folio ? ` · anulación venta #${folio}` : ''}`,
        empresaId,
        mov.lote,
        undefined,
        undefined,
        manager,
        Number(mov.costoUnitario),
        { id: documentoId, tipo: 'REVERSION_RECETA' },
      );
      costo += Number(mov.costoTotal);
    }

    return { insumosDevueltos: movimientos.length, costoTotal: redondear2(costo) };
  }

  /* ══ COSTO TEÓRICO ═══════════════════════════════════════════════════════ */

  /**
   * Costo de la receta **con los precios de hoy**.
   *
   * El campo `costoTeorico` de la entidad se calcula al guardar y se queda
   * viejo: cuando sube la carne, la receta sigue diciendo el costo del mes
   * pasado. Esto siempre consulta el costo actual del inventario.
   */
  async costoActual(recetaId: string, empresaId: string, almacenId?: string) {
    const receta = await this.recetaRepo.findOne({
      where: { id: recetaId, empresaId },
      relations: ['insumos'],
    });
    if (!receta) return null;

    const detalle: Array<{
      insumoNombre: string; cantidad: number; unidad: string;
      costoUnitario: number; costoTotal: number; sinCosto: boolean;
    }> = [];

    let total = 0;

    for (const insumo of receta.insumos ?? []) {
      const lotes = await this.inventario.obtenerLotesPorProducto(
        insumo.insumoId, empresaId, almacenId,
      );

      // Promedio ponderado de los lotes con existencia.
      const conStock = lotes.filter((l) => Number(l.stockRestante) > 0);
      const stockTotal = conStock.reduce((s, l) => s + Number(l.stockRestante), 0);
      const valorTotal = conStock.reduce((s, l) => s + Number(l.valorTotal ?? 0), 0);
      const costoUnitario = stockTotal > 0 ? redondear4(valorTotal / stockTotal) : 0;

      const merma = Number(insumo.mermaPorcentaje ?? 0);
      const cantidad = redondear4(Number(insumo.cantidad) * (1 + merma / 100));
      const costoTotal = redondear2(cantidad * costoUnitario);

      detalle.push({
        insumoNombre: insumo.insumoNombre ?? '—',
        cantidad,
        unidad: insumo.unidad,
        costoUnitario,
        costoTotal,
        sinCosto: costoUnitario === 0,
      });

      total += costoTotal;
    }

    const rendimiento = Number(receta.rendimiento) || 1;

    return {
      recetaId: receta.id,
      producto: receta.productoNombre,
      rendimiento,
      costoTotal: redondear2(total),
      costoPorPorcion: redondear4(total / rendimiento),
      costoGuardado: Number(receta.costoTeorico),
      /** Cuánto se ha desviado el costo guardado del real. */
      desviacion: redondear2(total - Number(receta.costoTeorico)),
      insumosSinCosto: detalle.filter((d) => d.sinCosto).length,
      detalle,
    };
  }

  /** Actualiza el `costoTeorico` de todas las recetas con los precios de hoy. */
  async recalcularTodas(empresaId: string) {
    const recetas = await this.recetaRepo.find({ where: { empresaId, activa: true } });

    let actualizadas = 0;
    const cambios: Array<{ producto: string; antes: number; ahora: number }> = [];

    for (const r of recetas) {
      const calculo = await this.costoActual(r.id, empresaId);
      if (!calculo) continue;

      if (Math.abs(calculo.desviacion) >= 0.01) {
        cambios.push({
          producto: r.productoNombre ?? r.productoId,
          antes: Number(r.costoTeorico),
          ahora: calculo.costoTotal,
        });
        r.costoTeorico = calculo.costoTotal;
        await this.recetaRepo.save(r);
        actualizadas++;
      }
    }

    return {
      revisadas: recetas.length,
      actualizadas,
      cambios: cambios.sort((a, b) =>
        Math.abs(b.ahora - b.antes) - Math.abs(a.ahora - a.antes),
      ),
    };
  }

  /* ══ TEÓRICO CONTRA REAL ═════════════════════════════════════════════════ */

  /**
   * El reporte que sostiene el control de costos en alimentos y bebidas.
   *
   * Compara lo que **debiste** consumir según lo vendido, contra lo que
   * **saliste** de verdad del almacén. La diferencia es merma no registrada,
   * porciones mal servidas o robo — y suele ser el margen completo de un
   * restaurante.
   */
  async teoricoContraReal(
    empresaId: string,
    desde: string,
    hasta: string,
    almacenId?: string,
  ) {
    const inicio = new Date(desde);
    const fin = new Date(hasta);

    // Lo que salió por consumo de receta: el teórico, ya escalado por venta.
    const consumos = await this.movRepo.find({
      where: {
        empresaId,
        tipoDocumento: 'CONSUMO_RECETA',
        tipo: 'SALIDA',
        fechaMovimiento: Between(inicio, fin),
        ...(almacenId ? { almacenId } : {}),
      },
    });

    // Todo lo demás que salió de esos mismos insumos: mermas y ajustes.
    const insumosAfectados = new Set(consumos.map((c) => c.productoId));

    const otrasSalidas = insumosAfectados.size === 0 ? [] : await this.movRepo
      .createQueryBuilder('m')
      .where('m.empresaId = :empresaId', { empresaId })
      .andWhere('m.tipo = :tipo', { tipo: 'SALIDA' })
      .andWhere('m.fechaMovimiento BETWEEN :inicio AND :fin', { inicio, fin })
      .andWhere('m.productoId IN (:...ids)', { ids: Array.from(insumosAfectados) })
      .andWhere('(m.tipoDocumento IS NULL OR m.tipoDocumento != :consumo)', {
        consumo: 'CONSUMO_RECETA',
      })
      .getMany();

    const porInsumo = new Map<string, {
      teoricoCant: number; teoricoCosto: number;
      otrasCant: number; otrasCosto: number;
    }>();

    const acumular = (
      id: string, campo: 'teorico' | 'otras', cant: number, costo: number,
    ) => {
      const a = porInsumo.get(id) ?? {
        teoricoCant: 0, teoricoCosto: 0, otrasCant: 0, otrasCosto: 0,
      };
      if (campo === 'teorico') { a.teoricoCant += cant; a.teoricoCosto += costo; }
      else { a.otrasCant += cant; a.otrasCosto += costo; }
      porInsumo.set(id, a);
    };

    for (const m of consumos) {
      acumular(m.productoId, 'teorico', Number(m.cantidad), Number(m.costoTotal));
    }
    for (const m of otrasSalidas) {
      acumular(m.productoId, 'otras', Number(m.cantidad), Number(m.costoTotal));
    }

    const filas = Array.from(porInsumo.entries()).map(([productoId, v]) => {
      const realCosto = v.teoricoCosto + v.otrasCosto;
      return {
        productoId,
        consumoTeorico: redondear4(v.teoricoCant),
        costoTeorico: redondear2(v.teoricoCosto),
        salidasAdicionales: redondear4(v.otrasCant),
        costoAdicional: redondear2(v.otrasCosto),
        costoReal: redondear2(realCosto),
        desviacion: redondear2(v.otrasCosto),
        // Qué tanto se pasó del costo esperado
        porcentajeDesviacion: v.teoricoCosto > 0
          ? Math.round((v.otrasCosto / v.teoricoCosto) * 1000) / 10
          : 0,
      };
    });

    const totalTeorico = filas.reduce((s, f) => s + f.costoTeorico, 0);
    const totalReal = filas.reduce((s, f) => s + f.costoReal, 0);

    return {
      periodo: { desde, hasta },
      costoTeorico: redondear2(totalTeorico),
      costoReal: redondear2(totalReal),
      desviacion: redondear2(totalReal - totalTeorico),
      porcentajeDesviacion: totalTeorico > 0
        ? Math.round(((totalReal - totalTeorico) / totalTeorico) * 1000) / 10
        : 0,
      // Los peores primero: por ahí empieza la investigación.
      filas: filas.sort((a, b) => b.desviacion - a.desviacion),
    };
  }
}
