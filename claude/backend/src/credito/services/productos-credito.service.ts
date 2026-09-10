import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  EstadoProductoCredito,
  OrigenProductoCredito,
  ProductoCredito,
  UnidadPlazo,
} from '../entities/producto-credito.entity';
import {
  ActualizarProductoCreditoDto,
  CrearProductoCreditoDto,
} from '../dto/producto-credito.dto';

/**
 * ============================================================================
 * Catálogo de productos de crédito
 * ----------------------------------------------------------------------------
 * Vive en el ERP y funciona solo. Este servicio no sabe que existe Fineract:
 * crea, valida y activa productos con lo que hay en la fila. Es lo que permite
 * que una empresa sin registro externo tenga su catálogo completo.
 *
 * La única concesión a la integración es el interruptor `exigirCorrespondencia`
 * que recibe `activar`: cuando la empresa tiene el externo contratado, quien
 * llama —el servicio de sincronización— exige que el producto ya esté vinculado
 * y verificado antes de dejarlo vender. Este servicio no averigua eso; lo
 * recibe. Preguntarlo aquí metería el proveedor dentro del catálogo comercial,
 * que es justo lo que se está deshaciendo.
 * ============================================================================
 */

/** El catálogo con el que arranca una empresa nueva. */
/*
 * Se exporta para que el alta de empresas pueda sembrar el catálogo sin
 * inyectar este servicio: el módulo de integración no importa el de crédito a
 * propósito —sería un ciclo—, y una constante es un import normal que no crea
 * dependencia entre módulos.
 */
export const CATALOGO_POR_OMISION: Array<Partial<ProductoCredito>> = [
  {
    codigo: 'CRED-30D',
    nombre: 'Crédito simple a 30 días',
    unidadPlazo: UnidadPlazo.DIAS,
    cadaCuantos: 30,
    cuotasMinimas: 1,
    cuotasMaximas: 1,
    sinInteres: true,
    tasaInteresMensual: 0,
    orden: 10,
    tipoCreditoHeredado: 'CREDITO_30D',
  },
  {
    codigo: 'CRED-60D',
    nombre: 'Crédito simple a 60 días',
    unidadPlazo: UnidadPlazo.DIAS,
    cadaCuantos: 60,
    cuotasMinimas: 1,
    cuotasMaximas: 1,
    sinInteres: true,
    tasaInteresMensual: 0,
    orden: 20,
    tipoCreditoHeredado: 'CREDITO_60D',
  },
  {
    codigo: 'CRED-90D',
    nombre: 'Crédito simple a 90 días',
    unidadPlazo: UnidadPlazo.DIAS,
    cadaCuantos: 90,
    cuotasMinimas: 1,
    cuotasMaximas: 1,
    sinInteres: true,
    tasaInteresMensual: 0,
    orden: 30,
    tipoCreditoHeredado: 'CREDITO_90D',
  },
  {
    codigo: 'MSI',
    nombre: 'Meses sin intereses',
    unidadPlazo: UnidadPlazo.MESES,
    cadaCuantos: 1,
    cuotasMinimas: 3,
    cuotasMaximas: 24,
    sinInteres: true,
    tasaInteresMensual: 0,
    orden: 40,
    tipoCreditoHeredado: 'MENSUALIDADES',
  },
  {
    codigo: 'MENS-CI',
    nombre: 'Mensualidades con interés',
    unidadPlazo: UnidadPlazo.MESES,
    cadaCuantos: 1,
    cuotasMinimas: 3,
    cuotasMaximas: 60,
    sinInteres: false,
    tasaInteresMensual: 2.5,
    orden: 50,
    tipoCreditoHeredado: 'MENSUALIDADES',
  },
];

@Injectable()
export class ProductosCreditoService {
  constructor(
    @InjectRepository(ProductoCredito)
    private readonly repo: Repository<ProductoCredito>,
  ) {}

  private acceso(em?: EntityManager) {
    return em ? em.getRepository(ProductoCredito) : this.repo;
  }

  // ── Consulta ─────────────────────────────────────────────────────────────

  async listar(
    empresaId: string,
    opciones: { soloVendibles?: boolean } = {},
  ): Promise<ProductoCredito[]> {
    const filas = await this.repo.find({
      where: { empresaId },
      order: { orden: 'ASC', nombre: 'ASC' },
    });
    return opciones.soloVendibles
      ? filas.filter((p) => p.estado === EstadoProductoCredito.ACTIVO)
      : filas;
  }

  async obtener(
    empresaId: string,
    id: string,
    em?: EntityManager,
  ): Promise<ProductoCredito> {
    const fila = await this.acceso(em).findOne({ where: { id, empresaId } });
    if (!fila) {
      throw new NotFoundException(
        'El producto de crédito no existe o pertenece a otra empresa.',
      );
    }
    return fila;
  }

  async porCodigo(
    empresaId: string,
    codigo: string,
    em?: EntityManager,
  ): Promise<ProductoCredito | null> {
    return this.acceso(em).findOne({ where: { empresaId, codigo } });
  }

  /**
   * Resuelve el producto con el que se va a vender y comprueba que lo pedido
   * cabe dentro de él.
   *
   * Es el portero: aquí se rechaza un plazo fuera de rango o una tasa que el
   * producto no permite mover. Sin esto el catálogo sería decorativo —la
   * captura podría pedir lo que quisiera— y volveríamos a tener las reglas
   * repartidas por la pantalla y el servicio.
   */
  async resolverParaVenta(
    empresaId: string,
    productoCreditoId: string,
    solicitud: {
      numeroCuotas: number;
      importe: number;
      tasaInteresMensual?: number;
    },
    em?: EntityManager,
  ): Promise<ProductoCredito> {
    const producto = await this.obtener(empresaId, productoCreditoId, em);

    if (producto.estado !== EstadoProductoCredito.ACTIVO) {
      throw new BadRequestException(
        `El producto ${producto.codigo} no está activo: ${producto.estado.toLowerCase()}.`,
      );
    }
    if (
      solicitud.numeroCuotas < producto.cuotasMinimas ||
      solicitud.numeroCuotas > producto.cuotasMaximas
    ) {
      throw new BadRequestException(
        `${producto.nombre} admite de ${producto.cuotasMinimas} a ${producto.cuotasMaximas} cuotas; se pidieron ${solicitud.numeroCuotas}.`,
      );
    }
    // Un importe no positivo no es «por debajo del mínimo»: es una captura
    // rota más arriba —típicamente un enganche mayor que la venta— y decirlo
    // como límite del producto manda a revisar el lugar equivocado.
    if (!Number.isFinite(solicitud.importe) || solicitud.importe <= 0) {
      throw new BadRequestException(
        'El importe a financiar debe ser mayor a cero. Revisa el enganche y el saldo a favor aplicados.',
      );
    }
    if (solicitud.importe < producto.montoMinimo) {
      throw new BadRequestException(
        `${producto.nombre} exige un importe mínimo de ${producto.montoMinimo}.`,
      );
    }
    if (producto.montoMaximo > 0 && solicitud.importe > producto.montoMaximo) {
      throw new BadRequestException(
        `${producto.nombre} admite hasta ${producto.montoMaximo}; se pidieron ${solicitud.importe}.`,
      );
    }

    const tasaPedida = Number(solicitud.tasaInteresMensual ?? producto.tasaInteresMensual);
    if (
      !producto.tasaEditable &&
      Math.abs(tasaPedida - Number(producto.tasaInteresMensual)) >= 0.0001
    ) {
      throw new BadRequestException(
        `La tasa de ${producto.nombre} es de ${producto.tasaInteresMensual}% y no es editable.`,
      );
    }
    if (producto.sinInteres && tasaPedida !== 0) {
      throw new BadRequestException(
        `${producto.nombre} es sin intereses: la tasa debe ser cero.`,
      );
    }

    return producto;
  }

  // ── Alta y cambios ───────────────────────────────────────────────────────

  async crear(
    empresaId: string,
    dto: CrearProductoCreditoDto,
    origen = OrigenProductoCredito.ERP,
  ): Promise<ProductoCredito> {
    const codigo = dto.codigo.trim().toUpperCase();
    if (await this.porCodigo(empresaId, codigo)) {
      throw new BadRequestException(
        `Ya existe un producto con el código ${codigo}.`,
      );
    }
    const fila = this.repo.create({
      ...this.normalizar(dto),
      empresaId,
      codigo,
      origen,
      // Nace en borrador SIEMPRE. Que un producto de crédito quede vendible
      // por el solo hecho de capturarse es cómo se vende con una tasa que
      // nadie revisó.
      estado: EstadoProductoCredito.BORRADOR,
    });
    return this.repo.save(fila);
  }

  async actualizar(
    empresaId: string,
    id: string,
    dto: ActualizarProductoCreditoDto,
  ): Promise<ProductoCredito> {
    const producto = await this.obtener(empresaId, id);
    const cambios = this.normalizar(dto);

    /*
     * Cambiar el precio o el plazo de un producto ya vendible lo devuelve a
     * borrador: la correspondencia probada con el externo dejó de ser cierta en
     * el momento en que se movió el plazo, y un producto verificado que ya no
     * corresponde es peor que uno sin verificar, porque nadie lo va a revisar.
     */
    const tocaLaForma = (
      ['unidadPlazo', 'cadaCuantos', 'cuotasMinimas', 'cuotasMaximas', 'sinInteres', 'tasaInteresMensual', 'moneda'] as const
    ).some(
      (campo) =>
        cambios[campo] !== undefined &&
        String(cambios[campo]) !== String(producto[campo]),
    );

    Object.assign(producto, cambios);

    if (tocaLaForma && producto.estado === EstadoProductoCredito.ACTIVO) {
      producto.estado = EstadoProductoCredito.BORRADOR;
      producto.verificadoEn = null;
      producto.resultadoVerificacion = {
        motivo:
          'Se modificó el plazo o el precio; hay que volver a verificar la correspondencia antes de vender.',
      };
    }

    this.validarForma(producto);
    return this.repo.save(producto);
  }

  /**
   * Deja el producto vendible.
   *
   * `exigirCorrespondencia` lo pone quien sabe si la empresa tiene el registro
   * externo contratado. Con él encendido, un producto sin vínculo o sin
   * verificar no se activa: vender aquí lo que allá no existe es exactamente la
   * divergencia que este rediseño evita.
   */
  async activar(
    empresaId: string,
    id: string,
    exigirCorrespondencia: boolean,
    tieneVinculo = false,
  ): Promise<ProductoCredito> {
    const producto = await this.obtener(empresaId, id);
    this.validarForma(producto);

    if (exigirCorrespondencia) {
      if (!tieneVinculo) {
        throw new BadRequestException(
          `La empresa lleva su cartera en un registro externo: ${producto.codigo} no puede venderse hasta que exista allá. Sincronízalo primero.`,
        );
      }
      if (!producto.verificadoEn) {
        throw new BadRequestException(
          `${producto.codigo} no ha pasado la verificación de correspondencia. Verifícalo antes de activarlo.`,
        );
      }
    }

    producto.estado = EstadoProductoCredito.ACTIVO;
    return this.repo.save(producto);
  }

  /**
   * Cambia el código de un producto que todavía no se ha vendido.
   *
   * Sólo para corregir un código malo recién nacido —típicamente uno importado
   * del registro externo con un nombre corto ilegible—. No se toca un producto
   * activo: el código es lo que aparece en los dos catálogos y en los reportes,
   * y moverlo debajo de operaciones vivas rompe la trazabilidad que este código
   * existe para dar.
   */
  async renombrarCodigo(
    empresaId: string,
    id: string,
    codigo: string,
  ): Promise<ProductoCredito> {
    const producto = await this.obtener(empresaId, id);
    if (producto.estado === EstadoProductoCredito.ACTIVO) {
      throw new BadRequestException(
        `${producto.codigo} está activo: suspéndelo antes de cambiarle el código.`,
      );
    }
    const nuevo = codigo.trim().toUpperCase();
    const choca = await this.porCodigo(empresaId, nuevo);
    if (choca && choca.id !== id) {
      throw new BadRequestException(`Ya existe un producto con el código ${nuevo}.`);
    }
    producto.codigo = nuevo;
    return this.repo.save(producto);
  }

  async suspender(empresaId: string, id: string): Promise<ProductoCredito> {
    const producto = await this.obtener(empresaId, id);
    producto.estado = EstadoProductoCredito.SUSPENDIDO;
    return this.repo.save(producto);
  }

  /** Marca el resultado de la última comprobación contra el registro externo. */
  async registrarVerificacion(
    empresaId: string,
    id: string,
    resultado: { cuadra: boolean; detalle: Record<string, unknown> },
  ): Promise<ProductoCredito> {
    const producto = await this.obtener(empresaId, id);
    producto.verificadoEn = resultado.cuadra ? new Date() : null;
    producto.resultadoVerificacion = resultado.detalle;
    if (!resultado.cuadra && producto.estado === EstadoProductoCredito.ACTIVO) {
      producto.estado = EstadoProductoCredito.BORRADOR;
    }
    return this.repo.save(producto);
  }

  // ── Siembra ──────────────────────────────────────────────────────────────

  /**
   * Deja a una empresa nueva con un catálogo con el que se puede vender hoy.
   *
   * Es idempotente por código, así que correrlo dos veces no duplica nada, y no
   * pisa lo que la empresa ya haya editado. Los productos sembrados quedan
   * ACTIVOS sólo si la empresa no tiene registro externo; con externo contratado
   * quedan en borrador hasta que se sincronicen y verifiquen.
   */
  async sembrar(
    empresaId: string,
    opciones: { activar: boolean } = { activar: true },
  ): Promise<{ creados: string[]; existentes: string[] }> {
    const creados: string[] = [];
    const existentes: string[] = [];

    for (const plantilla of CATALOGO_POR_OMISION) {
      const codigo = String(plantilla.codigo);
      if (await this.porCodigo(empresaId, codigo)) {
        existentes.push(codigo);
        continue;
      }
      await this.repo.save(
        this.repo.create({
          ...plantilla,
          empresaId,
          origen: OrigenProductoCredito.ERP,
          estado: opciones.activar
            ? EstadoProductoCredito.ACTIVO
            : EstadoProductoCredito.BORRADOR,
        }),
      );
      creados.push(codigo);
    }

    return { creados, existentes };
  }

  // ── Interno ──────────────────────────────────────────────────────────────

  private normalizar(
    dto: CrearProductoCreditoDto | ActualizarProductoCreditoDto,
  ): Partial<ProductoCredito> {
    const limpio: Partial<ProductoCredito> = { ...dto } as Partial<ProductoCredito>;
    if (limpio.nombre) limpio.nombre = limpio.nombre.trim();
    // Sin interés y con tasa es una contradicción que hay que resolver en algún
    // lado; se resuelve a favor de lo declarado, que es lo que ve el cliente.
    if (limpio.sinInteres === true) limpio.tasaInteresMensual = 0;
    return limpio;
  }

  private validarForma(producto: ProductoCredito): void {
    if (producto.cadaCuantos < 1) {
      throw new BadRequestException(
        'El periodo entre cuotas debe ser al menos uno.',
      );
    }
    if (producto.cuotasMinimas < 1) {
      throw new BadRequestException('El mínimo de cuotas debe ser al menos uno.');
    }
    if (producto.cuotasMaximas < producto.cuotasMinimas) {
      throw new BadRequestException(
        'El máximo de cuotas no puede ser menor que el mínimo.',
      );
    }
    if (producto.cuotasMaximas > 60) {
      throw new BadRequestException('El crédito no puede exceder 60 cuotas.');
    }
    if (!producto.sinInteres && Number(producto.tasaInteresMensual) <= 0) {
      throw new BadRequestException(
        'Un producto con interés necesita una tasa mensual mayor a cero.',
      );
    }
    if (producto.sinInteres && Number(producto.tasaInteresMensual) !== 0) {
      throw new BadRequestException(
        'Un producto sin intereses debe tener tasa cero.',
      );
    }
    if (
      producto.montoMaximo > 0 &&
      producto.montoMaximo < producto.montoMinimo
    ) {
      throw new BadRequestException(
        'El importe máximo no puede ser menor que el mínimo.',
      );
    }
  }
}
