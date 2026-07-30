// recetas/services/recetas-wizard.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Producto } from '../../catalogo/entities/producto.entity';
import { Categoria } from '../../catalogo/entities/categoria.entity';
import { CuentaContable } from '../../finanzas/entities/cuenta-contable.entity';

// El wizard verifica que existan los cimientos para crear recetas:
//  1. Cuentas contables de inventario (1xx) y costo (5xx)
//  2. Al menos una categoría para insumos, bien mapeada
//  3. Al menos un producto que pueda usarse como insumo
export interface DiagnosticoRecetas {
  listoParaRecetas: boolean;
  checks: {
    tieneCuentaInventario: boolean;
    tieneCuentaCosto: boolean;
    tieneCategoriaInsumos: boolean;
    tieneInsumos: boolean;
  };
  detalle: {
    cuentaInventario: { numero: string; nombre: string } | null;
    cuentaCosto: { numero: string; nombre: string } | null;
    categoriasSugeridas: { id: string; nombre: string }[];
    totalProductos: number;
  };
  acciones: string[]; // qué se puede resolver automáticamente
}

@Injectable()
export class RecetasWizardService {
  constructor(
    @InjectRepository(Producto)
    private readonly productoRepo: Repository<Producto>,
    @InjectRepository(Categoria)
    private readonly categoriaRepo: Repository<Categoria>,
    @InjectRepository(CuentaContable)
    private readonly cuentaRepo: Repository<CuentaContable>,
  ) {}

  async diagnosticar(empresaId: string): Promise<DiagnosticoRecetas> {
    // 1) Cuentas contables: buscar una de inventario (1xx) y una de costo (5xx)
    const cuentas = await this.cuentaRepo.find({
      where: { empresaId, activo: true },
    });
    const cuentaInv =
      cuentas.find(
        (c) =>
          (c.numeroCuenta ?? '').startsWith('1') &&
          /inventario|almac/i.test(c.nombre ?? ''),
      ) ??
      cuentas.find((c) => (c.numeroCuenta ?? '').startsWith('13')) ?? // 130-01 típico
      null;
    const cuentaCosto =
      cuentas.find((c) => (c.numeroCuenta ?? '').startsWith('5')) ?? null;

    // 2) Categorías (para insumos). Traemos todas para mostrarlas.
    const categorias = await this.categoriaRepo.find({ where: { empresaId } });
    const categoriaInsumos = categorias.find((c) =>
      /insumo|bar|cocina|materia/i.test(c.nombre ?? ''),
    );

    // 3) Productos que puedan servir de insumo (cualquier producto sirve;
    //    lo importante es que exista al menos uno)
    const totalProductos = await this.productoRepo.count({
      where: { empresaId, activo: true },
    });

    const checks = {
      tieneCuentaInventario: !!cuentaInv,
      tieneCuentaCosto: !!cuentaCosto,
      tieneCategoriaInsumos: !!categoriaInsumos,
      tieneInsumos: totalProductos > 0,
    };

    const acciones: string[] = [];
    if (!checks.tieneCuentaInventario || !checks.tieneCuentaCosto)
      acciones.push('crear-cuentas');
    if (!checks.tieneCategoriaInsumos) acciones.push('crear-categoria');
    if (!checks.tieneInsumos) acciones.push('crear-insumos');

    return {
      listoParaRecetas:
        checks.tieneCuentaInventario &&
        checks.tieneCuentaCosto &&
        checks.tieneInsumos,
      checks,
      detalle: {
        cuentaInventario: cuentaInv
          ? { numero: cuentaInv.numeroCuenta, nombre: cuentaInv.nombre }
          : null,
        cuentaCosto: cuentaCosto
          ? { numero: cuentaCosto.numeroCuenta, nombre: cuentaCosto.nombre }
          : null,
        categoriasSugeridas: categorias
          .slice(0, 10)
          .map((c) => ({ id: c.id, nombre: c.nombre })),
        totalProductos,
      },
      acciones,
    };
  }
}
