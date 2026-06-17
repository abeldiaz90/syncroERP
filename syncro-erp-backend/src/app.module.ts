import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IamModule } from './iam/iam.module';
import { Empresa } from './iam/entities/empresa.entity';
import { Usuario } from './iam/entities/usuario.entity';
import { Controlador } from './iam/entities/controlador.entity';
import { Endpoint } from './iam/entities/endpoint.entity';
import { RolEndpointPermiso } from './iam/entities/rol-endpoint-permiso.entity';
import { CatalogoModule } from './catalogo/catalogo.module';
import { Categoria } from './catalogo/entities/categoria.entity';
import { Producto } from './catalogo/entities/producto.entity';
import { MovimientoInventario } from './catalogo/entities/movimiento-inventario.entity';
import { Almacen } from './catalogo/entities/almacen.entity';
import { StockPorAlmacen } from './catalogo/entities/stock-por-almacen.entity';
import { Marca } from './catalogo/entities/marca.entity';
import { Impuesto } from './catalogo/entities/impuesto.entity';
import { Cliente } from './clientes/entities/cliente.entity';
import { ClientesModule } from './clientes/clientes.module';
import { Proveedor } from './proveedores/entities/proveedor.entity';
import { ProveedoresModule } from './proveedores/proveedores.module';
import { ComprasModule } from './compras/modules/compras.module';
import { CommonModule } from './common/modules/common.module';
import { DepartamentosModule } from './departamentos/module/departamentos.module';
import { VentasModule } from './ventas/modules/ventas.module';
import { DiscoveryModule } from '@nestjs/core';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermisoEndpointGuard } from './common/guards/permiso-endpoint.guard';
// 🆕 CFDI 4.0
import { CfdiModule } from './cfdi/cfdi.module';
import { Factura } from './cfdi/factura.entity';
import { PartidaFactura } from './cfdi/partida-factura.entity';
import { ConfiguracionFiscal } from './cfdi/configuracion-fiscal.entity';
// 🆕 Entidades existentes
import { LoteInventario } from './catalogo/entities/lote-inventario.entity';
import { ProductoEquivalencia } from './catalogo/entities/producto-equivalencia.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule, DiscoveryModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mssql',
        host: configService.get<string>('DB_HOST'),
        port: parseInt(configService.get<string>('DB_PORT') || '1433', 10),
        username: configService.get<string>('DB_USER'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_NAME'),
        entities: [
          Empresa,
          Usuario,
          Controlador,
          Endpoint,
          RolEndpointPermiso,
          Categoria,
          Producto,
          MovimientoInventario,
          Almacen,
          StockPorAlmacen,
          Marca,
          Impuesto,
          Cliente,
          Proveedor,
          LoteInventario,
          ProductoEquivalencia,
          Factura,               // ← CFDI
          PartidaFactura,        // ← CFDI
          ConfiguracionFiscal,   // ← CFDI
        ],
        synchronize: true,
        logging: ['schema', 'error'],
        autoLoadEntities: true,
        options: {
          encrypt: false,
          trustServerCertificate: true,
        },
      }),
    }),
    IamModule,
    CatalogoModule,
    ClientesModule,
    ProveedoresModule,
    ComprasModule,
    CommonModule,
    DepartamentosModule,
    VentasModule,
    CfdiModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermisoEndpointGuard,
    },
  ],
})
export class AppModule { }