// ═══════════════════════════════════════════════════════════════════════
// INTEGRAR EL WIZARD DE RECETAS en recetas.module.ts
// ═══════════════════════════════════════════════════════════════════════
//
// El wizard necesita:
//  - RecetasWizardService (nuevo)
//  - RecetasWizardController (nuevo)
//  - CuentasContablesService (de Finanzas) → para precargarPlanEstandar
//  - CategoriasService (de Catálogo) → para crearCategoria y autoConfigurarCuentas
//  - Repos de Producto, Categoria, CuentaContable (para el diagnóstico)
//
// ── PASO 1: Verifica que estos services estén EXPORTADOS ──
//
// En FinanzasModule → exports debe incluir CuentasContablesService
// En CatalogoModule → exports debe incluir CategoriasService
//   (Si no lo están, agrégalos al array `exports` de cada módulo.)
//
// ── PASO 2: recetas.module.ts completo ──

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Receta } from '../entities/receta.entity';
import { RecetaInsumo } from '../entities/receta-insumo.entity';
import { Producto } from '../../catalogo/entities/producto.entity';
import { Categoria } from '../../catalogo/entities/categoria.entity';
import { CuentaContable } from '../../finanzas/entities/cuenta-contable.entity';

import { RecetasService } from '../services/recetas.service';
import { RecetasWizardService } from '../services/recetas-wizard.service';
import { RecetasController } from '../controllers/recetas.controller';
import { RecetasWizardController } from '../controllers/recetas-wizard.controller';

// ⚠️ Ajusta las rutas a tus módulos reales
import { CatalogoModule } from '../../catalogo/catalogo.module';
import { FinanzasModule } from '../../finanzas/modules/finanzas.module'; // o '../finanzas/modules/finanzas.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Receta, RecetaInsumo,
      Producto, Categoria, CuentaContable,  // ← para el diagnóstico del wizard
    ]),
    CatalogoModule,   // InventarioService + CategoriasService
    FinanzasModule,   // CuentasContablesService
  ],
  controllers: [
    RecetasController,
    RecetasWizardController,   // ← NUEVO
  ],
  providers: [
    RecetasService,
    RecetasWizardService,      // ← NUEVO
  ],
  exports: [RecetasService],
})
export class RecetasModule {}

// ── PASO 3: Coloca los archivos ──
//   src/recetas/services/recetas-wizard.service.ts
//   src/recetas/controllers/recetas-wizard.controller.ts
//   app/dashboard/hoteleria/recetas/WizardRecetas.tsx  (frontend, junto a page.tsx)
//
// ── PASO 4: Reinicia. El flujo queda:
//   Recetas → "Nueva receta" → el wizard verifica cuentas/categoría/insumos
//   → resuelve lo que falte con un clic → abre el editor de receta.