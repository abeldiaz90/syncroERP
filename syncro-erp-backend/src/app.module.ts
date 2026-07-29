/**
 * ============================================================================
 * SyncroERP · Módulo raíz
 * ----------------------------------------------------------------------------
 * CORRECCIONES SOBRE LA VERSIÓN ANTERIOR
 *
 * 1. `RecetasModule` estaba escrito completo (entidades, servicio,
 *    controlador) pero NUNCA se importaba aquí. La pantalla
 *    /dashboard/hoteleria/recetas llamaba a endpoints que no existían en el
 *    router: 404 en todas sus peticiones. Ya está registrado.
 *
 * 2. `synchronize: true` fijo. TypeORM altera el esquema en cada arranque
 *    comparándolo con las entidades; en producción eso puede eliminar
 *    columnas con datos. Ahora depende de DB_SYNC y se ignora en producción.
 *
 * 3. `entities: [...]` listaba 27 entidades a mano Y además tenía
 *    `autoLoadEntities: true`. La lista manual estaba desactualizada (faltaban
 *    las de compras, hotelería, recetas y auditoría) y sólo servía para
 *    confundir. Con autoLoadEntities basta.
 *
 * 4. Sin validación de entorno: faltar JWT_SECRET significaba firmar tokens
 *    con `undefined`.
 *
 * 5. Un solo límite de peticiones para todo. Ahora hay dos ventanas
 *    (corta y larga) para frenar tanto ráfagas como el goteo constante.
 * ============================================================================
 */

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiscoveryModule, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

import { validarEntorno } from './config/validar-entorno';

// ── Módulos existentes ─────────────────────────────────────────────────────
import { AuditoriaModule }      from './auditoria/modules/auditoria.module';
import { IamModule }            from './iam/iam.module';
import { CatalogoModule }       from './catalogo/catalogo.module';
import { ClientesModule }       from './clientes/clientes.module';
import { ProveedoresModule }    from './proveedores/proveedores.module';
import { ComprasModule }        from './compras/modules/compras.module';
import { CommonModule }         from './common/modules/common.module';
import { DepartamentosModule }  from './departamentos/module/departamentos.module';
import { VentasModule }         from './ventas/modules/ventas.module';
import { CfdiModule }           from './cfdi/cfdi.module';
import { FinanzasModule }       from './finanzas/modules/finanzas.module';
import { CreditoModule }        from './credito/modules/credito.module';
import { NotificacionesModule } from './notificaciones/notificaciones.module';
import { RpaModule }            from './rpa/modules/curp-rpa.module';
import { HoteleriaModule }      from './hoteleria/modules/hoteleria.module';
import { RecetasModule }        from './recetas/modules/recetas.module';   // ← faltaba

// ── Módulos nuevos ─────────────────────────────────────────────────────────
import { RrhhModule }           from './rrhh/modules/rrhh.module';
import { ActivosModule }        from './activos/modules/activos.module';
import { TesoreriaModule }      from './tesoreria/modules/tesoreria.module';
import { CrmModule }            from './crm/modules/crm.module';

// ── Guards ─────────────────────────────────────────────────────────────────
import { JwtAuthGuard }         from './common/guards/jwt-auth.guard';
import { PermisoEndpointGuard } from './common/guards/permiso-endpoint.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validarEntorno,
      envFilePath: ['.env.local', '.env'],
    }),

    ScheduleModule.forRoot(),

    // Dos ventanas: frena la ráfaga y también el goteo sostenido.
    ThrottlerModule.forRoot([
      { name: 'corta', ttl: 10_000,  limit: 40  },
      { name: 'larga', ttl: 60_000,  limit: 250 },
    ]),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule, DiscoveryModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const enProduccion = cfg.get('NODE_ENV') === 'production';
        return {
          type: 'mssql' as const,
          host: cfg.get<string>('DB_HOST'),
          port: Number(cfg.get('DB_PORT') ?? 1433),
          username: cfg.get<string>('DB_USER'),
          password: cfg.get<string>('DB_PASSWORD'),
          database: cfg.get<string>('DB_NAME'),

          // Descubre las entidades desde los módulos: una sola fuente de verdad.
          autoLoadEntities: true,

          // Nunca en producción, ni por accidente.
          synchronize: !enProduccion && cfg.get('DB_SYNC') === 'true',

          logging: enProduccion ? ['error'] : ['error', 'warn', 'schema'],
          maxQueryExecutionTime: 2000, // registra las consultas lentas

          // Reintentos: SQL Server tarda en aceptar conexiones al levantar.
          retryAttempts: 5,
          retryDelay: 3000,

          extra: {
            // Pool acotado: sin esto una ráfaga agota las conexiones del servidor.
            max: Number(cfg.get('DB_POOL_MAX') ?? 20),
            min: 2,
            idleTimeoutMillis: 30_000,
          },

          options: {
            encrypt: cfg.get('DB_ENCRYPT') === 'true',
            trustServerCertificate: !enProduccion,
            useUTC: false,
          },
        };
      },
    }),

    // Dominio
    AuditoriaModule,
    IamModule,
    CommonModule,
    CatalogoModule,
    ClientesModule,
    ProveedoresModule,
    DepartamentosModule,
    VentasModule,
    ComprasModule,
    CfdiModule,
    FinanzasModule,
    CreditoModule,
    TesoreriaModule,
    ActivosModule,
    RrhhModule,
    CrmModule,
    HoteleriaModule,
    RecetasModule,
    NotificacionesModule,
    RpaModule,
  ],
  controllers: [],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermisoEndpointGuard },
  ],
})
export class AppModule {}
