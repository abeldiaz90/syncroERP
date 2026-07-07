import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// ── Entidades ─────────────────────────────────────────────────────
import { Categoria }           from './entities/categoria.entity';
import { Producto }            from './entities/producto.entity';
import { MovimientoInventario } from './entities/movimiento-inventario.entity';
import { Almacen }             from './entities/almacen.entity';
import { StockPorAlmacen }     from './entities/stock-por-almacen.entity';
import { Marca }               from './entities/marca.entity';
import { Impuesto }            from './entities/impuesto.entity';
import { ImagenProducto }      from './entities/imagen-producto.entity';
import { ProductoAtributo }    from './entities/producto-atributo.entity';
import { ListaPrecio }         from './entities/lista-precio.entity';
import { ProductoPrecio }      from './entities/producto-precio.entity';
import { Pais }                from './entities/pais.entity';
import { Estado }              from './entities/estado.entity';
import { Banco }               from './entities/banco.entity';
import { FormaPago }           from './entities/forma-pago.entity';
import { ProductoEquivalencia } from './entities/producto-equivalencia.entity';
import { LoteInventario }      from './entities/lote-inventario.entity';
import { UnidadMedida }        from './entities/unidad-medida.entity'; // ← NUEVO

// ── Controladores ─────────────────────────────────────────────────
import { CategoriasController }   from './controllers/categorias.controller';
import { ProductosController }    from './controllers/productos.controller';
import { InventarioController }   from './controllers/inventario.controller';
import { AlmacenesController }    from './controllers/almacenes.controller';
import { MarcaController }        from './controllers/marca.controller';
import { ImpuestoController }     from './controllers/impuesto.controller';
import { ListasPrecioController } from './controllers/listas-precio.controller';
import { PaisesController }       from './controllers/paises.controller';
import { EstadosController }      from './controllers/estados.controller';
import { BancosController }       from './controllers/bancos.controller';
import { FormasPagoController }   from './controllers/formas-pago.controller';
import { UnidadesMedidaController } from './controllers/unidades-medida.controller'; // ← NUEVO

// ── Servicios ─────────────────────────────────────────────────────
import { CategoriasService }   from './services/categorias.service';
import { ProductosService }    from './services/productos.service';
import { InventarioService }   from './services/inventario.service';
import { AlmacenesService }    from './services/almacenes.service';
import { StockService }        from './services/stock.service';
import { MarcaService }        from './services/marca.service';
import { ImpuestoService }     from './services/impuesto.service';
import { ListasPrecioService } from './services/listas-precio.service';
import { PaisesService }       from './services/paises.service';
import { EstadosService }      from './services/estados.service';
import { BancosService }       from './services/bancos.service';
import { FormasPagoService }   from './services/formas-pago.service';
import { UnidadesMedidaService } from './services/unidades-medida.service'; // ← NUEVO
import { CuentaContable } from './../finanzas/entities/cuenta-contable.entity';

// ── FinanzasModule — necesario porque InventarioService usa PolizasService ──
import { FinanzasModule } from '../finanzas/modules/finanzas.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Categoria, Producto, MovimientoInventario, Almacen, StockPorAlmacen,
      Marca, Impuesto, ImagenProducto, ListaPrecio, ProductoPrecio,
      Pais, Estado, Banco, FormaPago,
      ProductoEquivalencia, LoteInventario, ProductoAtributo, CuentaContable,
      UnidadMedida, // ← NUEVO
    ]),
    FinanzasModule,   // ← provee PolizasService y MotorContableService a InventarioService
  ],
  controllers: [
    CategoriasController, ProductosController, InventarioController,
    AlmacenesController, MarcaController, ImpuestoController,
    ListasPrecioController, PaisesController, EstadosController,
    BancosController, FormasPagoController,
    UnidadesMedidaController, // ← NUEVO
  ],
  providers: [
    CategoriasService, ProductosService, InventarioService,
    AlmacenesService, StockService, MarcaService, ImpuestoService,
    ListasPrecioService, PaisesService, EstadosService,
    BancosService, FormasPagoService,
    UnidadesMedidaService, // ← NUEVO
  ],
  exports: [
    InventarioService,
    StockService,
    FinanzasModule,   // re-exportar: todo módulo que importe CatalogoModule recibe PolizasService y MotorContableService
  ],
})
export class CatalogoModule {}