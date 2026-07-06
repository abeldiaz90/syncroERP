import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiscoveryModule, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';                              // ← NUEVO

// IAM
import { IamModule }            from './iam/iam.module';
import { Empresa }              from './iam/entities/empresa.entity';
import { Usuario }              from './iam/entities/usuario.entity';
import { Controlador }          from './iam/entities/controlador.entity';
import { Endpoint }             from './iam/entities/endpoint.entity';
import { RolEndpointPermiso }   from './iam/entities/rol-endpoint-permiso.entity';

// Catálogo
import { CatalogoModule }       from './catalogo/catalogo.module';
import { Categoria }            from './catalogo/entities/categoria.entity';
import { Producto }             from './catalogo/entities/producto.entity';
import { MovimientoInventario } from './catalogo/entities/movimiento-inventario.entity';
import { Almacen }              from './catalogo/entities/almacen.entity';
import { StockPorAlmacen }      from './catalogo/entities/stock-por-almacen.entity';
import { Marca }                from './catalogo/entities/marca.entity';
import { Impuesto }             from './catalogo/entities/impuesto.entity';
import { LoteInventario }       from './catalogo/entities/lote-inventario.entity';
import { ProductoEquivalencia } from './catalogo/entities/producto-equivalencia.entity';

// Clientes / Proveedores
import { ClientesModule }       from './clientes/clientes.module';
import { Cliente }              from './clientes/entities/cliente.entity';
import { ProveedoresModule }    from './proveedores/proveedores.module';
import { Proveedor }            from './proveedores/entities/proveedor.entity';

// Otros módulos
import { ComprasModule }        from './compras/modules/compras.module';
import { CommonModule }         from './common/modules/common.module';
import { DepartamentosModule }  from './departamentos/module/departamentos.module';
import { VentasModule }         from './ventas/modules/ventas.module';

// CFDI
import { CfdiModule }           from './cfdi/cfdi.module';
import { Factura }              from './cfdi/factura.entity';
import { PartidaFactura }       from './cfdi/partida-factura.entity';
import { ConfiguracionFiscal }  from './cfdi/configuracion-fiscal.entity';

// Finanzas
import { FinanzasModule }       from './finanzas/modules/finanzas.module';
import { CuentaContable }       from './finanzas/entities/cuenta-contable.entity';
import { Poliza }               from './finanzas/entities/poliza.entity';
import { PartidaPoliza }        from './finanzas/entities/partida-poliza.entity';

// Crédito y Cobranza
import { CreditoModule }        from './credito/modules/credito.module';
import { CuentaBancaria }       from './credito/entities/cuenta-bancaria.entity';
import { CreditoCliente }       from './credito/entities/credito-cliente.entity';
import { AmortizacionCuota }    from './credito/entities/amortizacion-cuota.entity';
import { PagoCobranza }         from './credito/entities/pago-cobranza.entity';

// Notificaciones                                                                // ← NUEVO
import { NotificacionesModule } from './notificaciones/notificaciones.module';  // ← NUEVO

// Guards
import { JwtAuthGuard }         from './common/guards/jwt-auth.guard';
import { PermisoEndpointGuard } from './common/guards/permiso-endpoint.guard';

//RPA
import { RpaModule } from './rpa/modules/curp-rpa.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),                    // ← NUEVO: habilita los cron jobs
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule, DiscoveryModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mssql',
        host:     configService.get<string>('DB_HOST'),
        port:     parseInt(configService.get<string>('DB_PORT') || '1433', 10),
        username: configService.get<string>('DB_USER'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_NAME'),
        entities: [
          // IAM
          Empresa, Usuario, Controlador, Endpoint, RolEndpointPermiso,
          // Catálogo
          Categoria, Producto, MovimientoInventario, Almacen, StockPorAlmacen,
          Marca, Impuesto, LoteInventario, ProductoEquivalencia,
          // CRM
          Cliente, Proveedor,
          // CFDI
          Factura, PartidaFactura, ConfiguracionFiscal,
          // Finanzas
          CuentaContable, Poliza, PartidaPoliza,
          // Crédito
          CuentaBancaria, CreditoCliente, AmortizacionCuota, PagoCobranza,
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
    FinanzasModule,
    CreditoModule,
    NotificacionesModule,
    RpaModule,
  ],
  controllers: [],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermisoEndpointGuard },
  ],
})
export class AppModule {}