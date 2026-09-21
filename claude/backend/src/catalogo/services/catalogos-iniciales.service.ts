import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { CuentasContablesService } from '../../finanzas/services/cuentas-contables.service';
import { CatalogosSatService } from '../../finanzas/services/catalogos-sat.service';
import { CategoriasService } from './categorias.service';
import { FormaPago } from '../entities/forma-pago.entity';
import { Categoria } from '../entities/categoria.entity';
import { Producto, TipoProducto } from '../entities/producto.entity';

/**
 * Garantiza que una instalación recién creada y las empresas existentes
 * tengan los catálogos base sin botones ni scripts manuales.
 */
@Injectable()
export class CatalogosInicialesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CatalogosInicialesService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly cuentas: CuentasContablesService,
    private readonly catalogosSat: CatalogosSatService,
    private readonly categorias: CategoriasService,
  ) {}

  async onApplicationBootstrap() {
    await this.catalogosSat.asegurarCatalogo2026();
    await this.asegurarFormasDePago();
    const empresas = await this.dataSource.query<Array<{ id: string }>>(
      'SELECT id FROM Empresas',
    );
    for (const empresa of empresas) {
      const resultado = await this.cuentas.precargarPlanEstandar(
        String(empresa.id),
      );
      if (resultado.creadas > 0) {
        this.logger.log(
          `Plan mexicano inicial: ${resultado.creadas} cuentas creadas para ${empresa.id}.`,
        );
      }
      await this.asegurarCategoriaPorDefecto(String(empresa.id));
      await this.asegurarCuentasDeCategorias(String(empresa.id));
      await this.acomodarProductosSinCategoria(String(empresa.id));
    }
  }

  /**
   * Formas de pago del SAT (c_FormaPago).
   *
   * La tabla estaba VACIA y el campo es obligatorio en el alta de proveedor:
   * el comprador abria el formulario, llenaba todo y se topaba con un combo
   * "Forma de Pago *" sin una sola opcion. No hay forma de salir de ahi, y la
   * pantalla no dice por que. Verificado el 21-sep-2026 con el usuario de
   * Compras.
   *
   * Es un catalogo publicado por el SAT: no cambia por empresa, no lo decide
   * nadie de la operacion y no tiene por que capturarse a mano. Nace con el
   * sistema, igual que los bancos y el plan de cuentas.
   *
   * Idempotente: se siembra solo lo que falta, comparando por nombre. Lo que
   * SUMA no use se desactiva desde el catalogo, que para eso existe `activo`;
   * el arranque no vuelve a encender lo que alguien apago, porque solo crea.
   */
  private async asegurarFormasDePago() {
    const repo = this.dataSource.getRepository(FormaPago);
    const existentes = await repo.find();
    if (existentes.length > 0) return;

    const oficiales = [
      '01 - Efectivo',
      '02 - Cheque nominativo',
      '03 - Transferencia electronica',
      '04 - Tarjeta de credito',
      '05 - Monedero electronico',
      '06 - Dinero electronico',
      '08 - Vales de despensa',
      '12 - Dacion en pago',
      '13 - Pago por subrogacion',
      '14 - Pago por consignacion',
      '15 - Condonacion',
      '17 - Compensacion',
      '23 - Novacion',
      '24 - Confusion',
      '25 - Remision de deuda',
      '26 - Prescripcion o caducidad',
      '27 - A satisfaccion del acreedor',
      '28 - Tarjeta de debito',
      '29 - Tarjeta de servicios',
      '30 - Aplicacion de anticipos',
      '31 - Intermediario pagos',
      '99 - Por definir',
    ];

    await repo.save(
      oficiales.map((nombre) => repo.create({ nombre, activo: true })),
    );
    this.logger.log(
      `Formas de pago del SAT: ${oficiales.length} sembradas (el catalogo estaba vacio).`,
    );
  }


  /**
   * Cada categoria nace con sus cuentas contables.
   *
   * Sin `cuentaInventarioId` en la categoria del producto, el motor contable
   * no puede armar la poliza de la compra: lanza «falta la cuenta de
   * inventario», AsientosPendientesService lo encola y lo reintenta, y el
   * reintento vuelve a fallar para siempre porque lo que falta no es un dato
   * de la operacion sino configuracion que nadie cargo.
   *
   * Lo grave no es que falle: es que la RECEPCION SI entra. La mercancia queda
   * en el inventario y la poliza en una cola. Verificado el 21-sep-2026
   * corriendo el ciclo completo: dos recepciones entraron, dos polizas
   * quedaron pendientes, y el almacenista no tenia forma de enterarse.
   *
   * `autoConfigurarCuentas(empresaId, true)` solo llena las categorias que no
   * tienen cuentas: no pisa lo que Contabilidad haya decidido. Y corre despues
   * de precargar el plan, porque sin cuentas en el catalogo no hay nada que
   * asignar.
   */
  private async asegurarCuentasDeCategorias(empresaId: string) {
    try {
      const r = await this.categorias.autoConfigurarCuentas(empresaId, true);
      const tocadas = Number((r as { actualizadas?: number })?.actualizadas ?? 0);
      if (tocadas > 0) {
        this.logger.log(
          `Cuentas de categoria: ${tocadas} categoria(s) sin cuentas quedaron configuradas en ${empresaId}.`,
        );
      }
    } catch (error) {
      /*
       * Una empresa sin catalogo de cuentas todavia no puede tenerlas, y eso
       * no es motivo para impedir que el sistema arranque. Se dice y se sigue.
       */
      this.logger.warn(
        `No se pudieron configurar las cuentas de categoria en ${empresaId}: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }


  /** Nombre de la categoria que recoge lo que nadie clasifico todavia. */
  private static readonly CATEGORIA_POR_DEFECTO = 'General';

  /**
   * Toda empresa tiene una categoria donde cae lo que aun no se clasifica.
   *
   * La categoria es lo que le da cuenta contable a un producto. Sin ella, cada
   * compra encola una poliza que jamas va a poder generarse. Los ERP grandes lo
   * resuelven igual: SAP Business One trae un grupo de articulos de fabrica y
   * la determinacion de cuentas cuelga de el; Business Central exige el
   * Inventory Posting Group para poder registrar y ofrece crear uno provisional
   * cuando falta.
   *
   * Aqui se siembra «General» por empresa. No pretende ser una buena
   * clasificacion —para eso estan las categorias de verdad—: pretende que
   * ningun producto quede sin cuenta.
   */
  private async asegurarCategoriaPorDefecto(empresaId: string) {
    const repo = this.dataSource.getRepository(Categoria);
    const nombre = CatalogosInicialesService.CATEGORIA_POR_DEFECTO;
    const existente = await repo.findOne({ where: { empresaId, nombre } });
    if (existente) {
      if (!existente.activo) await repo.update({ id: existente.id }, { activo: true });
      return;
    }
    await repo.save(
      repo.create({
        empresaId,
        nombre,
        descripcion:
          'Categoría inicial: recoge los productos que todavía no tienen una propia. ' +
          'De la categoría cuelgan las cuentas contables del producto.',
        activo: true,
      } as Partial<Categoria>),
    );
    this.logger.log(`Categoría «${nombre}» creada para ${empresaId}.`);
  }

  /**
   * Ningun producto con inventario se queda sin categoria.
   *
   * Un producto FISICO, CONSUMIBLE o MATERIA_PRIMA mueve existencias, y mover
   * existencias tiene consecuencia contable. Sin categoria no hay cuenta de
   * inventario, y la recepcion entra mientras la poliza se encola para siempre
   * —verificado el 21-sep-2026 corriendo el ciclo completo—.
   *
   * Los servicios no llevan inventario y por eso no necesitan categoria: la
   * regla no los toca.
   *
   * Esto acomoda lo que ya existe. Que no vuelva a entrar uno sin categoria lo
   * impide `ProductosService`.
   */
  private async acomodarProductosSinCategoria(empresaId: string) {
    const categorias = this.dataSource.getRepository(Categoria);
    const productos = this.dataSource.getRepository(Producto);
    const porDefecto = await categorias.findOne({
      where: { empresaId, nombre: CatalogosInicialesService.CATEGORIA_POR_DEFECTO },
    });
    if (!porDefecto) return;

    const conInventario = [
      TipoProducto.FISICO,
      TipoProducto.CONSUMIBLE,
      TipoProducto.MATERIA_PRIMA,
    ];
    const huerfanos = await productos
      .createQueryBuilder('p')
      .where('p.empresaId = :empresaId', { empresaId })
      .andWhere('p.categoriaId IS NULL')
      .andWhere('p.tipo IN (:...tipos)', { tipos: conInventario })
      .getMany();
    if (!huerfanos.length) return;

    await productos.update(
      { empresaId, id: In(huerfanos.map((p) => p.id)) },
      { categoriaId: porDefecto.id },
    );
    this.logger.warn(
      `${huerfanos.length} producto(s) con inventario no tenían categoría y por tanto ` +
        `ninguna cuenta contable: quedaron en «${porDefecto.nombre}». ` +
        'Reclasifícalos cuando puedas; mientras tanto, sus compras ya pueden contabilizarse.',
    );
  }

}
