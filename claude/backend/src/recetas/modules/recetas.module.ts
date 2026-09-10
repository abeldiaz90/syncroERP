import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Receta } from '../entities/receta.entity';
import { RecetaInsumo } from '../entities/receta-insumo.entity';
import { Producto } from '../../catalogo/entities/producto.entity';
import { Categoria } from '../../catalogo/entities/categoria.entity';
import { MovimientoInventario } from '../../catalogo/entities/movimiento-inventario.entity';
import { CuentaContable } from '../../finanzas/entities/cuenta-contable.entity';
import { RecetasService } from '../services/recetas.service';
import { RecetasWizardService } from '../services/recetas-wizard.service';
import { ConsumoRecetasService } from '../services/consumo-recetas.service';
import { RecetasController } from '../controllers/recetas.controller';
import { RecetasWizardController } from '../controllers/recetas-wizard.controller';
import { ConsumoRecetasController } from '../controllers/consumo-recetas.controller';
import { CatalogoModule } from '../../catalogo/catalogo.module';
import { FinanzasModule } from '../../finanzas/modules/finanzas.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Receta,
      RecetaInsumo,
      Producto,
      Categoria,
      MovimientoInventario,
      CuentaContable,
    ]),
    CatalogoModule,
    FinanzasModule,
  ],
  controllers: [
    RecetasController,
    RecetasWizardController,
    ConsumoRecetasController,
  ],
  providers: [RecetasService, RecetasWizardService, ConsumoRecetasService],
  exports: [RecetasService, ConsumoRecetasService],
})
export class RecetasModule {}
