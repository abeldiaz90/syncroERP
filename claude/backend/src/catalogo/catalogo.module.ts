import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// ── Entidades ─────────────────────────────────────────────────────
import { Categoria } from './entities/categoria.entity';
import { Producto } from './entities/producto.entity';
import { MovimientoInventario } from './entities/movimiento-inventario.entity';
import { Almacen } from './entities/almacen.entity';
import { StockPorAlmacen } from './entities/stock-por-almacen.entity';
import { Marca } from './entities/marca.entity';
import { Impuesto } from './entities/impuesto.entity';
import { ImagenProducto } from './entities/imagen-producto.entity';
import { ProductoAtributo } from './entities/producto-atributo.entity';
import { ListaPrecio } from './entities/lista-precio.entity';
import { ProductoPrecio } from './entities/producto-precio.entity';
import { Pais } from './entities/pais.entity';
import { Estado } from './entities/estado.entity';
import { CodigoPostal } from './entities/codigo-postal.entity';
import { CodigosPostalesCarga } from './entities/codigos-postales-carga.entity';
import { Banco } from './entities/banco.entity';
import { FormaPago } from './entities/forma-pago.entity';
import { ProductoEquivalencia } from './entities/producto-equivalencia.entity';
import { LoteInventario } from './entities/lote-inventario.entity';
import { UnidadMedida } from './entities/unidad-medida.entity';
import { CuentaContable } from './../finanzas/entities/cuenta-contable.entity';
import { AtributoGrupo } from './entities/atributo-grupo.entity'; // ← atributos dinámicos
import { AtributoDefinicion } from './entities/atributo-definicion.entity';
import { TransferenciaInventario } from './entities/transferencia-inventario.entity';
import { TransferenciaInventarioDetalle } from './entities/transferencia-inventario-detalle.entity'; // ← atributos dinámicos
import { UbicacionAlmacen } from './entities/ubicacion-almacen.entity';
import { ReservaInventario } from './entities/reserva-inventario.entity';
import { ConteoInventario } from './entities/conteo-inventario.entity';
import { ConteoInventarioDetalle } from './entities/conteo-inventario-detalle.entity';
import { ProductoUbicacion } from './entities/producto-ubicacion.entity';
import { StockUbicacion } from './entities/stock-ubicacion.entity';
import { ImportacionInventario } from './entities/importacion-inventario.entity';
import { ImportacionInventarioError } from './entities/importacion-inventario-error.entity';
import { ImportacionInventarioFilaAplicada } from './entities/importacion-inventario-fila-aplicada.entity';

// ── Controladores ─────────────────────────────────────────────────
import { CategoriasController } from './controllers/categorias.controller';
import { ProductosController } from './controllers/productos.controller';
import { InventarioController } from './controllers/inventario.controller';
import { AlmacenesController } from './controllers/almacenes.controller';
import { MarcaController } from './controllers/marca.controller';
import { ImpuestoController } from './controllers/impuesto.controller';
import { ListasPrecioController } from './controllers/listas-precio.controller';
import { PaisesController } from './controllers/paises.controller';
import { EstadosController } from './controllers/estados.controller';
import { CodigosPostalesController } from './controllers/codigos-postales.controller';
import { BancosController } from './controllers/bancos.controller';
import { FormasPagoController } from './controllers/formas-pago.controller';
import { UnidadesMedidaController } from './controllers/unidades-medida.controller';
import { ImportacionController } from './controllers/importacion.controller'; // importador de catálogo
import { ImportacionStockController } from './controllers/importacion-stock.controller'; // ← NUEVO: stock inicial
import { AtributosPersonalizadosController } from './controllers/atributos-personalizados.controller'; // ← atributos dinámicos
import { WmsController } from './controllers/wms.controller';

// ── Servicios ─────────────────────────────────────────────────────
import { CategoriasService } from './services/categorias.service';
import { ProductosService } from './services/productos.service';
import { InventarioService } from './services/inventario.service';
import { AlmacenesService } from './services/almacenes.service';
import { StockService } from './services/stock.service';
import { MarcaService } from './services/marca.service';
import { ImpuestoService } from './services/impuesto.service';
import { ListasPrecioService } from './services/listas-precio.service';
import { PaisesService } from './services/paises.service';
import { EstadosService } from './services/estados.service';
import { CodigosPostalesService } from './services/codigos-postales.service';
import { BancosService } from './services/bancos.service';
import { FormasPagoService } from './services/formas-pago.service';
import { UnidadesMedidaService } from './services/unidades-medida.service';
import { ImportacionProductosService } from './services/importacion-productos.service'; // importador de catálogo
import { PlantillaInventarioService } from './services/plantilla-inventario.service'; // importador de catálogo
import { ImportacionStockInicialMasivaService } from './services/importacion-stock-inicial-masiva.service';
import { PlantillaStockInicialService } from './services/plantilla-stock-inicial.service'; // ← NUEVO
import { AtributosPersonalizadosService } from './services/atributos-personalizados.service'; // ← atributos dinámicos
import { PreciosService } from './services/precios.service'; // ← precios autoritativos
import { CatalogosInicialesService } from './services/catalogos-iniciales.service';
import { CatalogosGeograficosService } from './services/catalogos-geograficos.service';
import { WmsService } from './services/wms.service';

// ── FinanzasModule — necesario porque InventarioService usa PolizasService
//    y la carga de stock inicial usa MotorContableService ──
import { FinanzasModule } from '../finanzas/modules/finanzas.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
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
      CodigoPostal,
      CodigosPostalesCarga,
      Banco,
      FormaPago,
      ProductoEquivalencia,
      LoteInventario,
      ProductoAtributo,
      CuentaContable,
      UnidadMedida,
      AtributoGrupo,
      AtributoDefinicion, // ← atributos dinámicos
      TransferenciaInventario,
      TransferenciaInventarioDetalle,
      UbicacionAlmacen,
      ReservaInventario,
      ConteoInventario,
      ConteoInventarioDetalle,
      ProductoUbicacion,
      StockUbicacion,
      ImportacionInventario,
      ImportacionInventarioError,
      ImportacionInventarioFilaAplicada,
    ]),
    FinanzasModule, // ← provee PolizasService y MotorContableService
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
    CodigosPostalesController,
    BancosController,
    FormasPagoController,
    UnidadesMedidaController,
    ImportacionController, // importador de catálogo (productos)
    ImportacionStockController, // ← NUEVO: carga de stock inicial
    AtributosPersonalizadosController, // ← atributos dinámicos
    WmsController,
  ],
  providers: [
    CategoriasService,
    ProductosService,
    InventarioService,
    AlmacenesService,
    StockService,
    MarcaService,
    ImpuestoService,
    ListasPrecioService,
    PaisesService,
    EstadosService,
    CodigosPostalesService,
    BancosService,
    FormasPagoService,
    UnidadesMedidaService,
    ImportacionProductosService, // importador de catálogo
    PlantillaInventarioService, // importador de catálogo
    ImportacionStockInicialMasivaService,
    PlantillaStockInicialService, // ← NUEVO
    AtributosPersonalizadosService, // ← atributos dinámicos
    PreciosService, // ← precios autoritativos
    CatalogosInicialesService,
    CatalogosGeograficosService,
    WmsService,
  ],
  exports: [
    CategoriasService,
    InventarioService,
    StockService,
    PreciosService, // ← lo necesita VentasModule para resolver precios en el servidor
    ImpuestoService,
    CodigosPostalesService, // lo consulta cualquier módulo con domicilio
    FinanzasModule, // re-exportar: todo módulo que importe CatalogoModule recibe PolizasService y MotorContableService
  ],
})
export class CatalogoModule {}
