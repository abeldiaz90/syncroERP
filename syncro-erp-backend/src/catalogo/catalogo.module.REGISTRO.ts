/**
 * FRAGMENTO DE REGISTRO — NO es un archivo nuevo.
 * Muestra qué agregar al catalogo.module.ts existente.
 * Copia las líneas marcadas con  // + AGREGAR  a tu módulo real.
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// ...tus imports existentes (entidades, servicios, controladores)...

// + AGREGAR estos imports:
import { ImportacionController } from './controllers/importacion.controller';
import { ImportacionProductosService } from './services/importacion-productos.service';
import { PlantillaInventarioService } from './services/plantilla-inventario.service';

@Module({
  imports: [
    // TypeOrmModule.forFeature([...]) ya debe incluir Producto y las entidades del catálogo.
    // No se agregan entidades nuevas: el importador reutiliza Producto.
  ],
  controllers: [
    // ...tus controladores existentes...
    ImportacionController, // + AGREGAR
  ],
  providers: [
    // ...tus servicios existentes (MarcaService, CategoriasService, ImpuestoService,
    //     UnidadesMedidaService, AlmacenesService, InventarioService, ProductosService...)...
    ImportacionProductosService, // + AGREGAR
    PlantillaInventarioService, // + AGREGAR
  ],
})
export class CatalogoModule {}
