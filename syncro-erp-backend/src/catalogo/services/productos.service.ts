import {
  Injectable,
  ConflictException,
  InternalServerErrorException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Like } from 'typeorm';
import { Producto } from '../entities/producto.entity';
import { ImagenProducto } from '../entities/imagen-producto.entity';
import { ProductoPrecio } from '../entities/producto-precio.entity';
import { ProductoEquivalencia } from '../entities/producto-equivalencia.entity';
import { ProductoAtributo } from '../entities/producto-atributo.entity';
import { CrearProductoDto } from '../dto/crear-producto.dto';
import { InventarioService } from './inventario.service';
import { Categoria } from '../entities/categoria.entity';
import { StockPorAlmacen } from '../entities/stock-por-almacen.entity';
import {
  ATRIBUTOS_FARMACEUTICO,
  ATRIBUTOS_CARNICO,
  ATRIBUTOS_PETROLERO,
  ATRIBUTOS_HOTELERO,
} from '../entities/producto-atributo.entity';

// Mapa de presets por sector
const PRESETS_ATRIBUTOS: Record<string, typeof ATRIBUTOS_FARMACEUTICO> = {
  FARMACEUTICO: ATRIBUTOS_FARMACEUTICO,
  CARNICO: ATRIBUTOS_CARNICO,
  PETROLERO: ATRIBUTOS_PETROLERO,
  HOTELERO: ATRIBUTOS_HOTELERO,
};

@Injectable()
export class ProductosService {
  constructor(
    @InjectRepository(Producto)
    private readonly productoRepository: Repository<Producto>,
    @InjectRepository(ImagenProducto)
    private readonly imagenProductoRepository: Repository<ImagenProducto>,
    @InjectRepository(ProductoAtributo)
    private readonly atributoRepository: Repository<ProductoAtributo>,
    private readonly inventarioService: InventarioService,
    @InjectRepository(Categoria)
    private readonly categoriaRepository: Repository<Categoria>,
    private readonly dataSource: DataSource,
  ) { }

  // ─────────────────────────────────────────────────────────────────
  // CREAR PRODUCTO
  // ─────────────────────────────────────────────────────────────────

  async crearProducto(dto: CrearProductoDto, almacenId: string, empresaId: string) {
    const { imagenes, precios, equivalencias, atributos, stockActual, ...productoData } = dto;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Crear producto principal
      const productoNuevo = queryRunner.manager.create(Producto, {
        ...productoData,
        empresaId,
      });
      const guardado = await queryRunner.manager.save(productoNuevo);

      // Imágenes
      if (imagenes && imagenes.length > 0) {
        const nuevasImagenes = imagenes.map((img, index) =>
          queryRunner.manager.create(ImagenProducto, {
            productoId: guardado.id,
            url: img.url,
            orden: index,
            principal: img.principal ?? false,
          }),
        );
        await queryRunner.manager.save(nuevasImagenes);
      }

      // Precios por lista
      if (precios && precios.length > 0) {
        const nuevosPrecios = precios.map((p) =>
          queryRunner.manager.create(ProductoPrecio, {
            productoId: guardado.id,
            listaPrecioId: p.listaPrecioId,
            precio: p.precio,
          }),
        );
        await queryRunner.manager.save(nuevosPrecios);
      }

      // Equivalencias (cajas, costales, etc.)
      if (equivalencias && equivalencias.length > 0) {
        const nuevasEquivalencias = equivalencias.map((eq) =>
          queryRunner.manager.create(ProductoEquivalencia, {
            productoId: guardado.id,
            nombreEmpaque: eq.nombreEmpaque,
            factorConversion: eq.factorConversion,
            codigoBarras: eq.codigoBarras,
          }),
        );
        await queryRunner.manager.save(nuevasEquivalencias);
      }

      // Atributos sectoriales
      if (atributos && atributos.length > 0) {
        const nuevosAtributos = atributos.map((a) =>
          queryRunner.manager.create(ProductoAtributo, {
            productoId: guardado.id,
            clave: a.clave,
            etiqueta: a.etiqueta,
            valor: a.valor,
            tipoValor: a.tipoValor ?? 'TEXT',
            unidad: a.unidad,
            sector: a.sector,
            orden: a.orden ?? 0,
          }),
        );
        await queryRunner.manager.save(nuevosAtributos);
      }

      // Stock inicial
      const stockInicial = stockActual ?? dto.stockActual ?? 0;
      if (stockInicial > 0) {
        const almacen = almacenId ?? dto.almacenId;
        if (!almacen) {
          throw new ConflictException('Debes indicar un almacén para el stock inicial.');
        }
        await this.inventarioService.registrarCompra(
          guardado.id,
          almacen,
          stockInicial,
          'Registro inicial de producto',
          empresaId,
          undefined,
          undefined,
          undefined,
          queryRunner.manager,
        );
      }

      await queryRunner.commitTransaction();

      return this.obtenerProductoPorId(guardado.id, empresaId);

    } catch (error: any) {
      await queryRunner.rollbackTransaction();

      if (error.number === 2627 || error.number === 2601) {
        throw new ConflictException(`El SKU '${dto.sku}' ya está registrado.`);
      }
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // OBTENER PRODUCTO POR ID
  // ─────────────────────────────────────────────────────────────────

  async obtenerProductoPorId(id: string, empresaId: string) {
    const producto = await this.productoRepository.findOne({
      where: { id, empresaId },
      relations: [
        'categoria',
        'marca',
        'impuesto',
        'imagenes',
        'preciosProducto',
        'preciosProducto.listaPrecio',
        'equivalencias',
        'atributos',
      ],
    });

    if (!producto) throw new NotFoundException('Producto no encontrado.');

    // Agregar stock total calculado
    const stock = await this.calcularStockTotal([id], empresaId);
    return { ...producto, stockActual: stock.get(id) ?? 0 };
  }



  // ─────────────────────────────────────────────────────────────────
  // OBTENER PRODUCTOS PAGINADOS (CON FILTROS)
  // ─────────────────────────────────────────────────────────────────

  async obtenerProductos(
    empresaId: string,
    pagina: number,
    limite: number,
    categoriaId?: string,
    marcaId?: string,
    soloConStock?: boolean
  ) {
    const skip = (pagina - 1) * limite;

    // 1. Construir la consulta WHERE dinámicamente
    const whereClause: any = { empresaId };

    if (categoriaId) {
      whereClause.categoriaId = categoriaId;
    }

    if (marcaId) {
      whereClause.marcaId = marcaId;
    }

    const [productos, total] = await this.productoRepository.findAndCount({
      where: whereClause, // <--- Aquí inyectamos los filtros
      relations: [
        'categoria',
        'imagenes',
        'preciosProducto',
        'preciosProducto.listaPrecio',
        'marca',
        'equivalencias',
        'atributos',
      ],
      order: { activo: 'DESC', nombre: 'ASC' },
      skip,
      take: limite,
    });

    if (productos.length === 0) {
      return { productos: [], total: 0, paginaActual: pagina, totalPaginas: 0 };
    }

    // 2. Calcular el stock
    const stockMap = await this.calcularStockTotal(productos.map(p => p.id), empresaId);

    // 3. Mapear los productos con su stock
    let productosMapeados = productos.map(p => ({
      ...p,
      stockActual: stockMap.get(p.id) ?? 0
    }));

    // 4. Aplicar filtro de "Solo con stock" si está activado
    if (soloConStock) {
      productosMapeados = productosMapeados.filter(p => p.stockActual > 0);
    }

    return {
      productos: productosMapeados,
      total: soloConStock ? productosMapeados.length : total,
      paginaActual: pagina,
      totalPaginas: Math.ceil((soloConStock ? productosMapeados.length : total) / limite),
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // ACTUALIZAR PRODUCTO
  // ─────────────────────────────────────────────────────────────────

  async actualizarProducto(id: string, dto: Partial<CrearProductoDto>, empresaId: string) {
    const { imagenes, precios, equivalencias, atributos, stockActual, ...productoData } = dto;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const producto = await queryRunner.manager.findOne(Producto, {
        where: { id, empresaId },
      });
      if (!producto) throw new NotFoundException('El producto no existe.');

      // Imágenes
      if (imagenes !== undefined) {
        await queryRunner.manager.delete(ImagenProducto, { productoId: id });
        if (imagenes.length > 0) {
          await queryRunner.manager.save(
            imagenes.map((img, index) =>
              queryRunner.manager.create(ImagenProducto, {
                productoId: id, url: img.url, orden: index, principal: img.principal ?? false,
              }),
            ),
          );
        }
      }

      // Precios
      if (precios !== undefined) {
        await queryRunner.manager.delete(ProductoPrecio, { productoId: id });
        if (precios.length > 0) {
          await queryRunner.manager.save(
            precios.map((p) =>
              queryRunner.manager.create(ProductoPrecio, {
                productoId: id, listaPrecioId: p.listaPrecioId, precio: p.precio,
              }),
            ),
          );
        }
      }

      // Equivalencias
      if (equivalencias !== undefined) {
        await queryRunner.manager.delete(ProductoEquivalencia, { productoId: id });
        if (equivalencias.length > 0) {
          await queryRunner.manager.save(
            equivalencias.map((eq) =>
              queryRunner.manager.create(ProductoEquivalencia, {
                productoId: id,
                nombreEmpaque: eq.nombreEmpaque,
                factorConversion: eq.factorConversion,
                codigoBarras: eq.codigoBarras,
              }),
            ),
          );
        }
      }

      // Atributos sectoriales — upsert por clave
      if (atributos !== undefined) {
        await queryRunner.manager.delete(ProductoAtributo, { productoId: id });
        if (atributos.length > 0) {
          await queryRunner.manager.save(
            atributos.map((a) =>
              queryRunner.manager.create(ProductoAtributo, {
                productoId: id,
                clave: a.clave,
                etiqueta: a.etiqueta,
                valor: a.valor,
                tipoValor: a.tipoValor ?? 'TEXT',
                unidad: a.unidad,
                sector: a.sector,
                orden: a.orden ?? 0,
              }),
            ),
          );
        }
      }

      Object.assign(producto, productoData);
      await queryRunner.manager.save(producto);
      await queryRunner.commitTransaction();

      return this.obtenerProductoPorId(id, empresaId);

    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Error al actualizar el producto.');
    } finally {
      await queryRunner.release();
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // CAMBIAR ESTADO
  // ─────────────────────────────────────────────────────────────────

  async cambiarEstado(id: string, empresaId: string) {
    const producto = await this.productoRepository.findOne({ where: { id, empresaId } });
    if (!producto) throw new NotFoundException('Producto no encontrado.');
    producto.activo = !producto.activo;
    await this.productoRepository.save(producto);
    return { activo: producto.activo };
  }

  // ─────────────────────────────────────────────────────────────────
  // MÉTRICAS DASHBOARD
  // ─────────────────────────────────────────────────────────────────

  async obtenerMetricas(empresaId: string) {
    const [totalProductos, totalCategorias] = await Promise.all([
      this.productoRepository.count({ where: { empresaId } }),
      this.categoriaRepository.count({ where: { empresaId } }),
    ]);
    return { totalProductos, totalCategorias, ventasDelDia: 0 };
  }

  // ─────────────────────────────────────────────────────────────────
  // BUSCAR PRODUCTOS
  // ─────────────────────────────────────────────────────────────────

  async buscarProductos(query: string, empresaId: string) {
    const productos = await this.productoRepository.find({
      where: { empresaId, activo: true, nombre: Like(`%${query}%`) },
      relations: ['imagenes', 'preciosProducto', 'preciosProducto.listaPrecio', 'equivalencias'],
      take: 15,
      order: { nombre: 'ASC' },
    });

    if (productos.length === 0) return [];

    const stockMap = await this.calcularStockTotal(productos.map(p => p.id), empresaId);
    return productos.map(p => ({ ...p, stockActual: stockMap.get(p.id) ?? 0 }));
  }

  // ─────────────────────────────────────────────────────────────────
  // STOCK BAJO — FIX del bug TypeORMError alias COALESCE
  // ─────────────────────────────────────────────────────────────────

  async obtenerStockBajo(empresaId: string) {
    // Usamos getRawAndEntities para evitar el bug de alias en orderBy
    const stocksRaw = await this.dataSource
      .getRepository(StockPorAlmacen)
      .createQueryBuilder('s')
      .select('s.productoId', 'productoId')
      .addSelect('COALESCE(SUM(s.cantidad), 0)', 'totalStock')
      .where('s.empresaId = :empresaId', { empresaId })
      .groupBy('s.productoId')
      .getRawMany<{ productoId: string; totalStock: string }>();

    const stockMap = new Map(stocksRaw.map(s => [s.productoId, Number(s.totalStock)]));

    // Traer productos activos con su stockMinimo
    const productos = await this.productoRepository.find({
      where: { empresaId, activo: true },
      relations: ['categoria', 'imagenes'],
      order: { nombre: 'ASC' },
    });

    // Filtrar los que están en o debajo del mínimo y ordenar por stock
    return productos
      .map(p => ({ ...p, stockActual: stockMap.get(p.id) ?? 0 }))
      .filter(p => p.stockActual <= p.stockMinimo)
      .sort((a, b) => a.stockActual - b.stockActual)
      .slice(0, 10);
  }

  // ─────────────────────────────────────────────────────────────────
  // ATRIBUTOS POR SECTOR — endpoint para que el frontend cargue presets
  // ─────────────────────────────────────────────────────────────────

  obtenerPresetAtributos(sector: string) {
    const preset = PRESETS_ATRIBUTOS[sector.toUpperCase()];
    if (!preset) throw new NotFoundException(`No existe preset para el sector '${sector}'.`);
    return preset;
  }

  obtenerSectoresDisponibles() {
    return Object.keys(PRESETS_ATRIBUTOS).map(sector => ({
      sector,
      totalAtributos: PRESETS_ATRIBUTOS[sector].length,
    }));
  }

  // ─────────────────────────────────────────────────────────────────
  // UTILIDAD INTERNA — calcular stock de múltiples productos
  // ─────────────────────────────────────────────────────────────────

  private async calcularStockTotal(
    productoIds: string[],
    empresaId: string,
  ): Promise<Map<string, number>> {
    if (productoIds.length === 0) return new Map();

    const stocks = await this.dataSource
      .getRepository(StockPorAlmacen)
      .createQueryBuilder('s')
      .select('s.productoId', 'productoId')
      .addSelect('COALESCE(SUM(s.cantidad), 0)', 'total')
      .where('s.productoId IN (:...productoIds)', { productoIds })
      .andWhere('s.empresaId = :empresaId', { empresaId })
      .groupBy('s.productoId')
      .getRawMany<{ productoId: string; total: string }>();

    return new Map(stocks.map(s => [s.productoId, Number(s.total)]));
  }
}