// recetas/controllers/recetas-wizard.controller.ts
import { Controller, Get, Post, Body } from '@nestjs/common';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { RecetasWizardService } from '../services/recetas-wizard.service';

// ⚠️ Ajusta rutas a tus services reales
import { CuentasContablesService } from '../../finanzas/services/cuentas-contables.service';
import { CategoriasService } from '../../catalogo/services/categorias.service';

@Controller('recetas/wizard')
export class RecetasWizardController {
  constructor(
    private readonly wizard: RecetasWizardService,
    private readonly cuentasService: CuentasContablesService,
    private readonly categoriasService: CategoriasService,
  ) {}

  // Diagnóstico: ¿está listo para crear recetas? ¿qué falta?
  @Get('diagnostico')
  diagnostico(@ActiveUser('empresaId') e: string): Promise<any> {
    return this.wizard.diagnosticar(e);
  }

  // Acción 1: crear las cuentas contables estándar (usa tu mecanismo existente)
  @Post('crear-cuentas')
  async crearCuentas(@ActiveUser('empresaId') e: string) {
    await this.cuentasService.precargarPlanEstandar(e);
    return { ok: true, mensaje: 'Cuentas contables estándar creadas.' };
  }

  // Acción 2: crear la categoría "Insumos Bar" y auto-mapear sus cuentas
  @Post('crear-categoria')
  async crearCategoria(
    @Body('nombre') nombre: string,
    @ActiveUser('empresaId') e: string,
  ) {
    const nombreCat = nombre?.trim() || 'Insumos Bar';
    // Crear la categoría
    await this.categoriasService.crearCategoria({ nombre: nombreCat }, e);
    // Auto-configurar sus cuentas por número (130→Inventario, 501→Costo, etc.)
    const resultado = await this.categoriasService.autoConfigurarCuentas(
      e,
      true,
    );
    return {
      ok: true,
      mensaje: `Categoría "${nombreCat}" creada y mapeada.`,
      resultado,
    };
  }
}
