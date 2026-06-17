// src/ventas/ventas.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entidades propias de ventas
import { Venta } from '../entities/venta.entity';
import { DetalleVenta } from '../entities/detalle-venta.entity';

// Entidades de catálogo que se usan en ventas
import { Producto } from '../../catalogo/entities/producto.entity';
import { Cliente } from '../../clientes/entities/cliente.entity';
import { Almacen } from '../../catalogo/entities/almacen.entity';
import { MovimientoInventario } from '../../catalogo/entities/movimiento-inventario.entity';
import { StockPorAlmacen } from '../../catalogo/entities/stock-por-almacen.entity';

// 🆕 Entidades nuevas requeridas por InventarioService / StockService
import { LoteInventario } from '../../catalogo/entities/lote-inventario.entity';
import { ProductoEquivalencia } from '../../catalogo/entities/producto-equivalencia.entity';

// Controladores y servicios
import { VentasController } from '../controllers/ventas.controller';
import { VentasService } from '../services/ventas.service';
import { InventarioService } from '../../catalogo/services/inventario.service';
import { StockService } from '../../catalogo/services/stock.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Venta,
      DetalleVenta,
      Producto,
      Cliente,
      Almacen,
      MovimientoInventario,
      StockPorAlmacen,
      LoteInventario,        // ← añadida
      ProductoEquivalencia,  // ← añadida (por si acaso InventarioService la inyecta)
    ]),
  ],
  controllers: [VentasController],
  providers: [VentasService, InventarioService, StockService],
})
export class VentasModule {}