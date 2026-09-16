import {
  Injectable,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Categoria } from '../entities/categoria.entity';
import { CrearCategoriaDto } from '../dto/crear-categoria.dto';
// ⚠️ Ajusta la ruta si tu entidad de cuentas está en otra ubicación
import { CuentaContable } from '../../finanzas/entities/cuenta-contable.entity';
import { RolCuentaSistema } from '../../finanzas/entities/cuenta-contable.entity';

@Injectable()
export class CategoriasService {
  constructor(
    @InjectRepository(Categoria)
    private readonly categoriaRepository: Repository<Categoria>,
    @InjectRepository(CuentaContable)
    private readonly cuentaRepository: Repository<CuentaContable>,
  ) {}

  async crearCategoria(dto: CrearCategoriaDto, empresaId: string) {
    // Nos aseguramos de que el campo 'activo' tenga un valor predeterminado
    const nueva = this.categoriaRepository.create({
      ...dto,
      empresaId,
      activo: true, // Aseguramos que no llegue como null/undefined
    });

    try {
      return await this.categoriaRepository.save(nueva);
    } catch (error: any) {
      // El código 2627/2601 es específico de SQL Server
      if (
        error.number === 2627 ||
        error.number === 2601 ||
        error.code === '23505'
      ) {
        throw new ConflictException(
          'Ya existe una categoría con este nombre en tu cuenta.',
        );
      }
      throw new InternalServerErrorException(
        'Error al crear la categoría: ' + error.message,
      );
    }
  }

  async obtenerCategorias(empresaId: string) {
    return await this.categoriaRepository.find({
      where: { empresaId },
      relations: [
        'categoriaPadre',
        'cuentaVentas',
        'cuentaCostoVentas',
        'cuentaInventario',
        'cuentaDevoluciones',
        'cuentaMermas',
      ],
      order: { nombre: 'ASC' },
    });
  }

  async actualizarCategoria(
    id: string,
    dto: Partial<CrearCategoriaDto>,
    empresaId: string,
  ) {
    const categoria = await this.categoriaRepository.findOne({
      where: { id, empresaId },
    });
    if (!categoria)
      throw new NotFoundException(
        'La categoría no existe o no tienes permisos.',
      );

    Object.assign(categoria, dto);

    try {
      return await this.categoriaRepository.save(categoria);
    } catch (error: any) {
      if (
        error.number === 2627 ||
        error.number === 2601 ||
        error.code === '23505'
      ) {
        throw new ConflictException(
          `Ya existe otra categoría con el nombre '${dto.nombre}'.`,
        );
      }
      throw new InternalServerErrorException(
        'Error al actualizar la categoría.',
      );
    }
  }

  async cambiarEstadoCategoria(id: string, empresaId: string) {
    const categoria = await this.categoriaRepository.findOne({
      where: { id, empresaId },
    });
    if (!categoria) throw new NotFoundException('Categoría no encontrada.');

    categoria.activo = !categoria.activo;
    return await this.categoriaRepository.save(categoria);
  }

  /**
   * Auto-configura las cuentas contables de las categorías según el número
   * de cuenta (401→Ventas, 501→Costo, 115→Inventario, 601→Mermas,
   * 402.01→Devoluciones).
   *
   * @param empresaId   empresa del usuario
   * @param soloVacias  si true (default), solo toca categorías sin configurar;
   *                    si false, sobrescribe TODAS.
   *
   * Devuelve un resumen de cuántas configuró y qué cuentas usó.
   */
  async autoConfigurarCuentas(empresaId: string, soloVacias = true) {
    // 1) Traer las cuentas afectables de la empresa
    const cuentas = await this.cuentaRepository.find({
      where: { empresaId, activo: true, esAfectable: true },
    });

    if (cuentas.length === 0) {
      throw new NotFoundException(
        'No hay cuentas contables. Créalas primero en Finanzas → Catálogo de Cuentas.',
      );
    }

    /*
     * 2) Resolver qué cuenta va en cada rol.
     *
     * PRIMERO por `rolSistema`, que es la respuesta inequívoca: la propia
     * cuenta declara para qué sirve, y hay un índice único por empresa y rol
     * que garantiza que no haya dos candidatas.
     *
     * Esto se resolvía sólo por número, y los respaldos de un dígito
     * —`porPrefijo('4')`, `porPrefijo('5')`— toman la PRIMERA cuenta que
     * empiece por ahí, en el orden que devuelva la base, que no está
     * garantizado. En un catálogo SAT de mil cuentas eso es una lotería: la
     * cuenta de ventas podía acabar siendo «Devoluciones sobre ventas».
     *
     * El número se conserva como respaldo, para catálogos donde nadie haya
     * marcado los roles todavía. Y se conserva entero, incluida la variante
     * con guion: hay instalaciones con `501-01` y otras con `501.01`.
     *
     * Devoluciones no tiene rol de sistema declarado, así que ésa sigue
     * resolviéndose por número. No se inventa un rol que el catálogo no tiene.
     */
    const sinGuion = (n: string) => n.replace(/-/g, '');
    const porExacto = (num: string) =>
      cuentas.find((c) => c.numeroCuenta === num);
    const porPrefijo = (pref: string) =>
      cuentas.find((c) => sinGuion(c.numeroCuenta).startsWith(pref));
    const porRol = (rol: RolCuentaSistema) =>
      cuentas.find((c) => c.rolSistema === rol);

    const ventas =
      porRol(RolCuentaSistema.VENTAS) ||
      porExacto('401-01') || porPrefijo('401') || porPrefijo('4');
    const costo =
      porRol(RolCuentaSistema.COSTO_VENTAS) ||
      porExacto('501-01') || porPrefijo('501') || porPrefijo('5');
    const inventario =
      porRol(RolCuentaSistema.INVENTARIO) ||
      porExacto('115.01') ||
      porExacto('130-01') ||
      porPrefijo('115') ||
      porPrefijo('13');
    const devoluciones =
      porExacto('402.01') || porExacto('401-02') || porPrefijo('402');
    const mermas =
      porRol(RolCuentaSistema.MERMAS) ||
      porExacto('601.84') || porExacto('601-01') || porPrefijo('601');

    const mapeo = {
      cuentaVentasId: ventas?.id ?? null,
      cuentaCostoVentasId: costo?.id ?? null,
      cuentaInventarioId: inventario?.id ?? null,
      cuentaDevolucionesId: devoluciones?.id ?? null,
      cuentaMermasId: mermas?.id ?? null,
    };

    const cuentasResueltas = Object.values(mapeo).filter(Boolean).length;
    if (cuentasResueltas === 0) {
      throw new NotFoundException(
        'No se encontraron cuentas con la numeración esperada (4xx, 5xx, 13x, 6xx).',
      );
    }

    // 3) Traer las categorías de la empresa
    const categorias = await this.categoriaRepository.find({
      where: { empresaId },
    });

    // 4) Aplicar el mapeo
    let configuradas = 0;
    let omitidas = 0;

    for (const cat of categorias) {
      const yaCompleta =
        cat.cuentaVentasId &&
        cat.cuentaCostoVentasId &&
        cat.cuentaInventarioId &&
        cat.cuentaDevolucionesId &&
        cat.cuentaMermasId;

      if (soloVacias && yaCompleta) {
        omitidas++;
        continue;
      }

      cat.cuentaVentasId = mapeo.cuentaVentasId;
      cat.cuentaCostoVentasId = mapeo.cuentaCostoVentasId;
      cat.cuentaInventarioId = mapeo.cuentaInventarioId;
      cat.cuentaDevolucionesId = mapeo.cuentaDevolucionesId;
      cat.cuentaMermasId = mapeo.cuentaMermasId;
      configuradas++;
    }

    if (configuradas > 0) {
      await this.categoriaRepository.save(categorias);
    }

    return {
      ok: true,
      totalCategorias: categorias.length,
      configuradas,
      omitidas,
      cuentasResueltas,
      mapeo: {
        ventas: ventas?.numeroCuenta ?? null,
        costo: costo?.numeroCuenta ?? null,
        inventario: inventario?.numeroCuenta ?? null,
        devoluciones: devoluciones?.numeroCuenta ?? null,
        mermas: mermas?.numeroCuenta ?? null,
      },
    };
  }
}
