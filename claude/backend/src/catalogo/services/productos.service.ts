import {
  Injectable,
  ConflictException,
  InternalServerErrorException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, ILike, In, Like, Repository } from 'typeorm';
import { Producto } from '../entities/producto.entity';
import { ImagenProducto } from '../entities/imagen-producto.entity';
import { ProductoPrecio } from '../entities/producto-precio.entity';
import { ProductoEquivalencia } from '../entities/producto-equivalencia.entity';
import { ProductoAtributo } from '../entities/producto-atributo.entity';
import { CrearProductoDto } from '../dto/crear-producto.dto';
import { InventarioService } from './inventario.service';
import { Categoria } from '../entities/categoria.entity';
import { UnidadMedida } from '../entities/unidad-medida.entity';
import { AsientosPendientesService } from '../../finanzas/services/asientos-pendientes.service';
import { TipoAsiento } from '../../finanzas/entities/asiento-pendiente.entity';
import { StockPorAlmacen } from '../entities/stock-por-almacen.entity';
import { ListaPrecio } from '../entities/lista-precio.entity';
import { esViolacionUnicidad } from '../../common/database/errores-sql';
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
    @InjectRepository(UnidadMedida)
    private readonly unidadRepository: Repository<UnidadMedida>,
    private readonly dataSource: DataSource,
    private readonly asientos: AsientosPendientesService,
  ) {}

  /**
   * ==========================================================================
   * La unidad de medida se guarda con el nombre EXACTO del catálogo
   * --------------------------------------------------------------------------
   * `unidadMedida` es texto libre en el producto, no una llave al catálogo, y
   * eso dejó productos con «Pieza» y otros con «PIEZA». El desplegable de la
   * ficha arma sus opciones con los nombres del catálogo, así que el producto
   * en mayúsculas no coincidía con ninguna, el campo se pintaba vacío, y como
   * la unidad base no se puede cambiar, quedaba deshabilitado. Al guardar, el
   * servidor respondía «La unidad de medida es obligatoria» sobre un campo que
   * la pantalla no deja tocar: el producto quedaba imposible de editar.
   *
   * La pantalla ya empareja sin distinguir mayúsculas. Esto cierra la puerta
   * por el otro lado: lo que entre se guarda con la grafía del catálogo, para
   * que la deriva no vuelva a acumularse. Una unidad que no esté en el catálogo
   * se respeta tal cual —puede venir de una importación vieja y borrarla sería
   * peor—, sólo se limpia de espacios.
   * ==========================================================================
   */
  private async normalizarUnidad(
    unidad: string | undefined,
    empresaId: string,
  ): Promise<string | undefined> {
    if (typeof unidad !== 'string') return unidad;
    const limpia = unidad.trim();
    if (!limpia) return limpia;
    const delCatalogo = await this.unidadRepository.findOne({
      where: { nombre: ILike(limpia), empresaId },
    });
    return delCatalogo?.nombre ?? limpia;
  }

  private validarReglasProducto(
    dto: Partial<CrearProductoDto>,
    permiteAperturaInventario = false,
  ) {
    const nombre =
      typeof dto.nombre === 'string' ? dto.nombre.trim() : dto.nombre;
    const sku = typeof dto.sku === 'string' ? dto.sku.trim() : dto.sku;
    const unidad =
      typeof dto.unidadMedida === 'string'
        ? dto.unidadMedida.trim()
        : dto.unidadMedida;

    if (dto.nombre !== undefined && !nombre) {
      throw new BadRequestException('El nombre del producto es obligatorio.');
    }
    if (dto.sku !== undefined && !sku) {
      throw new BadRequestException('El SKU es obligatorio.');
    }
    if (dto.unidadMedida !== undefined && !unidad) {
      throw new BadRequestException('La unidad de medida es obligatoria.');
    }
    if (dto.precioCompra !== undefined && Number(dto.precioCompra) < 0) {
      throw new BadRequestException(
        'El precio de compra no puede ser negativo.',
      );
    }

    /*
     * ════════════════════════════════════════════════════════════════════════
     * Lo que mueve existencias necesita categoria
     * --------------------------------------------------------------------------
     * De la categoria cuelgan las cuentas contables del producto. Sin ella, el
     * motor contable no puede armar la poliza de la compra: la recepcion ENTRA
     * igual y la poliza se encola para siempre, porque lo que falta no es un
     * dato de la operacion sino configuracion. Verificado el 21-sep-2026
     * corriendo el ciclo completo: dos recepciones dentro, dos polizas fuera, y
     * ni una linea roja en la pantalla del almacenista.
     *
     * Asi lo hacen los ERP grandes: en SAP Business One el grupo de articulos
     * es obligatorio y de el cuelga la determinacion de cuentas; en Business
     * Central el Inventory Posting Group es lo que permite registrar, y sin el
     * el asiento falla.
     *
     * Un SERVICIO no lleva inventario, asi que la regla no lo toca. Un KIT
     * tampoco: su costo lo ponen sus componentes.
     *
     * El arranque siembra la categoria «General» y acomoda ahi lo que ya
     * existia sin clasificar, para que esta regla no vuelva ineditable el
     * catalogo de nadie.
     * ════════════════════════════════════════════════════════════════════════
     */
    const TIPOS_CON_INVENTARIO = ['FISICO', 'CONSUMIBLE', 'MATERIA_PRIMA'];
    const llevaInventario =
      dto.tipo === undefined
        ? undefined
        : TIPOS_CON_INVENTARIO.includes(String(dto.tipo));
    const categoriaVacia =
      dto.categoriaId !== undefined &&
      (dto.categoriaId === null || String(dto.categoriaId).trim() === '');

    if (llevaInventario === true && (dto.categoriaId === undefined || categoriaVacia)) {
      throw new BadRequestException(
        'Un producto que lleva inventario necesita categoría: de ella cuelgan sus ' +
          'cuentas contables, y sin ellas la compra entra al almacén pero no a los libros. ' +
          'Si todavía no sabes cuál, usa «General».',
      );
    }
    if (llevaInventario !== false && categoriaVacia) {
      throw new BadRequestException(
        'No puedes dejar sin categoría un producto que lleva inventario: ' +
          'sus compras dejarían de contabilizarse. Si no sabes cuál, usa «General».',
      );
    }
    if (
      dto.stockMinimo !== undefined &&
      dto.stockMaximo != null &&
      Number(dto.stockMinimo) > Number(dto.stockMaximo)
    ) {
      throw new BadRequestException(
        'El stock mínimo no puede superar el stock máximo.',
      );
    }
    if (
      dto.puntoReorden != null &&
      dto.stockMaximo != null &&
      Number(dto.puntoReorden) > Number(dto.stockMaximo)
    ) {
      throw new BadRequestException(
        'El punto de reorden no puede superar el stock máximo.',
      );
    }
    if (
      dto.temperaturaMinC != null &&
      dto.temperaturaMaxC != null &&
      Number(dto.temperaturaMinC) > Number(dto.temperaturaMaxC)
    ) {
      throw new BadRequestException(
        'La temperatura mínima no puede superar la máxima.',
      );
    }
    if (dto.requiereCaducidad && dto.requiereLote === false) {
      throw new BadRequestException(
        'Un producto con caducidad debe controlar lotes.',
      );
    }
    if (
      permiteAperturaInventario &&
      dto.stockActual != null &&
      Number(dto.stockActual) < 0
    ) {
      throw new BadRequestException('El stock inicial no puede ser negativo.');
    }
    if (
      permiteAperturaInventario &&
      dto.stockActual != null &&
      Number(dto.stockActual) > 0 &&
      !dto.almacenId
    ) {
      throw new BadRequestException(
        'Debes seleccionar un almacén para registrar stock inicial.',
      );
    }
    if (dto.precios) {
      const ids = dto.precios.map((p) => p.listaPrecioId);
      if (new Set(ids).size !== ids.length) {
        throw new BadRequestException(
          'No puedes repetir una lista de precios.',
        );
      }
    }
    if (dto.equivalencias) {
      dto.equivalencias.forEach((eq, index) => {
        if (!eq.nombreEmpaque?.trim())
          throw new BadRequestException(
            `El empaque ${index + 1} no tiene nombre.`,
          );
        if (Number(eq.factorConversion) < 1)
          throw new BadRequestException(
            `El factor del empaque ${index + 1} debe ser al menos 1.`,
          );
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // CREAR PRODUCTO
  // ─────────────────────────────────────────────────────────────────

  async crearProducto(
    dto: CrearProductoDto,
    almacenId: string,
    empresaId: string,
  ) {
    this.validarReglasProducto(dto, true);
    dto.unidadMedida = await this.normalizarUnidad(dto.unidadMedida, empresaId);
    const {
      imagenes,
      precios,
      equivalencias,
      atributos,
      stockActual,
      ...productoData
    } = dto;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await this.validarListasPrecio(queryRunner.manager, precios, empresaId);
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
          throw new ConflictException(
            'Debes indicar un almacén para el stock inicial.',
          );
        }
        const entradaInicial = await this.inventarioService.registrarCompra(
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

        /*
         * La mercancia entraba al almacen y no a la contabilidad.
         *
         * `registrarCompra` la usan nueve sitios —ordenes de compra,
         * transferencias, conteos, recetas— y cada uno tiene su propio
         * contraasiento, asi que el asiento NO puede vivir dentro de ella:
         * marcaria como inventario inicial hasta una compra a proveedor.
         * Va aqui, en el unico camino que lo necesita y no lo tenia; el
         * importador masivo ya hacia lo mismo desde su lado.
         *
         * Sin esto, la cuenta de Inventario quedaba en saldo ACREEDOR en
         * cuanto se vendia la primera pieza: se abonaba la salida sin que
         * nadie hubiera cargado la entrada. Una cuenta deudora en saldo
         * acreedor no se puede explicar en un cierre.
         *
         * Se encola dentro de la MISMA transaccion que el alta: si el
         * producto no llega a existir, su asiento tampoco.
         */
        await this.asientos.encolarEnTransaccion(
          queryRunner.manager,
          TipoAsiento.INVENTARIO_INICIAL,
          {
            empresaId,
            fecha: new Date(),
            detalles: [
              {
                productoId: guardado.id,
                cantidad: stockInicial,
                costoUnitario: Number(entradaInicial?.costoUnitarioLote ?? 0),
              },
            ],
          },
          empresaId,
          `ALTA-${String(guardado.sku ?? guardado.id).slice(0, 24)}`,
          guardado.id,
        );
      }

      await queryRunner.commitTransaction();

      return this.obtenerProductoPorId(guardado.id, empresaId);
    } catch (error: any) {
      await queryRunner.rollbackTransaction();

      if (esViolacionUnicidad(error)) {
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
        'stocksPorAlmacen',
        'stocksPorAlmacen.almacen',
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
    soloConStock?: boolean,
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
    const stockMap = await this.calcularStockTotal(
      productos.map((p) => p.id),
      empresaId,
    );

    // 3. Mapear los productos con su stock
    let productosMapeados = productos.map((p) => ({
      ...p,
      stockActual: stockMap.get(p.id) ?? 0,
    }));

    // 4. Aplicar filtro de "Solo con stock" si está activado
    if (soloConStock) {
      productosMapeados = productosMapeados.filter((p) => p.stockActual > 0);
    }

    return {
      productos: productosMapeados,
      total: soloConStock ? productosMapeados.length : total,
      paginaActual: pagina,
      totalPaginas: Math.ceil(
        (soloConStock ? productosMapeados.length : total) / limite,
      ),
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // ACTUALIZAR PRODUCTO
  // ─────────────────────────────────────────────────────────────────

  async actualizarProducto(
    id: string,
    dto: Partial<CrearProductoDto>,
    empresaId: string,
  ) {
    this.validarReglasProducto(dto);
    dto.unidadMedida = await this.normalizarUnidad(dto.unidadMedida, empresaId);
    const {
      imagenes,
      precios,
      equivalencias,
      atributos,
      stockActual,
      almacenId,
      ...productoData
    } = dto;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const producto = await queryRunner.manager.findOne(Producto, {
        where: { id, empresaId },
      });
      if (!producto) throw new NotFoundException('El producto no existe.');

      await this.validarListasPrecio(queryRunner.manager, precios, empresaId);

      // Imágenes
      if (imagenes !== undefined) {
        await queryRunner.manager.delete(ImagenProducto, { productoId: id });
        if (imagenes.length > 0) {
          await queryRunner.manager.save(
            imagenes.map((img, index) =>
              queryRunner.manager.create(ImagenProducto, {
                productoId: id,
                url: img.url,
                orden: index,
                principal: img.principal ?? false,
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
                productoId: id,
                listaPrecioId: p.listaPrecioId,
                precio: p.precio,
              }),
            ),
          );
        }
      }

      // Equivalencias
      if (equivalencias !== undefined) {
        await queryRunner.manager.delete(ProductoEquivalencia, {
          productoId: id,
        });
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
      throw new InternalServerErrorException(
        'Error al actualizar el producto.',
      );
    } finally {
      await queryRunner.release();
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // CAMBIAR ESTADO
  // ─────────────────────────────────────────────────────────────────

  async cambiarEstado(id: string, empresaId: string) {
    const producto = await this.productoRepository.findOne({
      where: { id, empresaId },
    });
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

  async buscarProductos(
    query: string,
    empresaId: string,
    almacenId?: string,
    limite = 15,
  ) {
    const filtro = `%${String(query ?? '').trim()}%`;
    const productos = await this.productoRepository.find({
      where: [
        { empresaId, activo: true, nombre: Like(filtro) },
        { empresaId, activo: true, sku: Like(filtro) },
        { empresaId, activo: true, codigoBarras: Like(filtro) },
        { empresaId, activo: true, codigoBarras2: Like(filtro) },
      ],
      relations: [
        'imagenes',
        'preciosProducto',
        'preciosProducto.listaPrecio',
        'equivalencias',
      ],
      take: Math.min(Math.max(Number(limite) || 15, 1), 100),
      order: { nombre: 'ASC' },
    });

    if (productos.length === 0) return [];

    const stockMap = await this.calcularStockDisponible(
      productos.map((p) => p.id),
      empresaId,
      almacenId,
    );
    return productos.map((p) => ({
      ...p,
      stockActual: stockMap.get(p.id) ?? 0,
    }));
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

    const stockMap = new Map(
      stocksRaw.map((s) => [s.productoId, Number(s.totalStock)]),
    );

    // Traer productos activos con su stockMinimo
    const productos = await this.productoRepository.find({
      where: { empresaId, activo: true },
      relations: ['categoria', 'imagenes'],
      order: { nombre: 'ASC' },
    });

    // Filtrar los que están en o debajo del mínimo y ordenar por stock
    return productos
      .map((p) => ({ ...p, stockActual: stockMap.get(p.id) ?? 0 }))
      .filter((p) => p.stockActual <= p.stockMinimo)
      .sort((a, b) => a.stockActual - b.stockActual)
      .slice(0, 10);
  }

  // ─────────────────────────────────────────────────────────────────
  // ATRIBUTOS POR SECTOR — endpoint para que el frontend cargue presets
  // ─────────────────────────────────────────────────────────────────

  obtenerPresetAtributos(sector: string) {
    const preset = PRESETS_ATRIBUTOS[sector.toUpperCase()];
    if (!preset)
      throw new NotFoundException(
        `No existe preset para el sector '${sector}'.`,
      );
    return preset;
  }

  obtenerSectoresDisponibles() {
    return Object.keys(PRESETS_ATRIBUTOS).map((sector) => ({
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

    return new Map(stocks.map((s) => [s.productoId, Number(s.total)]));
  }

  private async calcularStockDisponible(
    productoIds: string[],
    empresaId: string,
    almacenId?: string,
  ): Promise<Map<string, number>> {
    if (productoIds.length === 0) return new Map();
    const consulta = this.dataSource
      .getRepository(StockPorAlmacen)
      .createQueryBuilder('stock')
      .select('stock.productoId', 'productoId')
      .addSelect(
        'COALESCE(SUM(stock.cantidad - stock.reservado - stock.bloqueado), 0)',
        'disponible',
      )
      .where('stock.productoId IN (:...productoIds)', { productoIds })
      .andWhere('stock.empresaId = :empresaId', { empresaId });
    if (almacenId) {
      consulta.andWhere('stock.almacenId = :almacenId', { almacenId });
    }
    const filas = await consulta
      .groupBy('stock.productoId')
      .getRawMany<{ productoId: string; disponible: string }>();
    return new Map(
      filas.map((fila) => [
        fila.productoId,
        Math.max(0, Number(fila.disponible)),
      ]),
    );
  }

  private async validarListasPrecio(
    manager: EntityManager,
    precios: CrearProductoDto['precios'] | undefined,
    empresaId: string,
  ): Promise<void> {
    if (precios === undefined || precios.length === 0) return;
    const ids = [...new Set(precios.map((precio) => precio.listaPrecioId))];
    const total = await manager.count(ListaPrecio, {
      where: { empresaId, id: In(ids) },
    });
    if (total !== ids.length) {
      throw new BadRequestException(
        'Una o más listas de precio no existen o pertenecen a otra empresa.',
      );
    }
  }
}
