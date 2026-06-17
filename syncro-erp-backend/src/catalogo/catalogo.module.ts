import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// ---------- ENTIDADES ----------
// Catálogo de productos
import { Categoria } from './entities/categoria.entity';
import { Producto } from './entities/producto.entity';
import { MovimientoInventario } from './entities/movimiento-inventario.entity';
import { Almacen } from './entities/almacen.entity';
import { StockPorAlmacen } from './entities/stock-por-almacen.entity';
import { Marca } from './entities/marca.entity';
import { Impuesto } from './entities/impuesto.entity';
import { ImagenProducto } from './entities/imagen-producto.entity';
import { ProductoAtributo } from './entities/producto-atributo.entity';

// 👇 NUEVAS ENTIDADES DE PRECIOS
import { ListaPrecio } from './entities/lista-precio.entity';
import { ProductoPrecio } from './entities/producto-precio.entity';

// Catálogos generales
import { Pais } from './entities/pais.entity';
import { Estado } from './entities/estado.entity';
import { Banco } from './entities/banco.entity';
import { FormaPago } from './entities/forma-pago.entity';

// 🆕 Entidades faltantes
import { ProductoEquivalencia } from './entities/producto-equivalencia.entity';
import { LoteInventario } from './entities/lote-inventario.entity';   // <-- Agregada

// ---------- CONTROLADORES ----------
import { CategoriasController } from './controllers/categorias.controller';
import { ProductosController } from './controllers/productos.controller';
import { InventarioController } from './controllers/inventario.controller';
import { AlmacenesController } from './controllers/almacenes.controller';
import { MarcaController } from './controllers/marca.controller';
import { ImpuestoController } from './controllers/impuesto.controller';

// 👇 NUEVO CONTROLADOR DE PRECIOS
import { ListasPrecioController } from './controllers/listas-precio.controller';

import { PaisesController } from './controllers/paises.controller';
import { EstadosController } from './controllers/estados.controller';
import { BancosController } from './controllers/bancos.controller';
import { FormasPagoController } from './controllers/formas-pago.controller';

// ---------- SERVICIOS ----------
import { CategoriasService } from './services/categorias.service';
import { ProductosService } from './services/productos.service';
import { InventarioService } from './services/inventario.service';
import { AlmacenesService } from './services/almacenes.service';
import { StockService } from './services/stock.service';
import { MarcaService } from './services/marca.service';
import { ImpuestoService } from './services/impuesto.service';

// 👇 NUEVO SERVICIO DE PRECIOS
import { ListasPrecioService } from './services/listas-precio.service';

import { PaisesService } from './services/paises.service';
import { EstadosService } from './services/estados.service';
import { BancosService } from './services/bancos.service';
import { FormasPagoService } from './services/formas-pago.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      // Productos
      Categoria,
      Producto,
      MovimientoInventario,
      Almacen,
      StockPorAlmacen,
      Marca,
      Impuesto,
      ImagenProducto,
      ListaPrecio,
      ProductoPrecio,
      Pais,
      Estado,
      Banco,
      FormaPago,
      ProductoEquivalencia,
      LoteInventario,
      ProductoAtributo, 
    ]),
  ],
  controllers: [
    CategoriasController,
    ProductosController,
    InventarioController,
    AlmacenesController,
    MarcaController,
    ImpuestoController,
    ListasPrecioController,
    PaisesController,
    EstadosController,
    BancosController,
    FormasPagoController,
  ],
  providers: [
    CategoriasService,
    ProductosService,
    InventarioService,
    AlmacenesService,
    StockService,
    MarcaService,
    ImpuestoService,
    ListasPrecioService, // ✅ AÑADIDO AQUÍ
    PaisesService,
    EstadosService,
    BancosService,
    FormasPagoService,
  ],
})
export class CatalogoModule {}