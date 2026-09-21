/**
 * ============================================================================
 * SyncroERP · Módulo raíz
 * ----------------------------------------------------------------------------
 * CONFIGURACIÓN ACTUAL
 *
 * 1. Registra todos los módulos funcionales del ERP.
 *
 * 2. En desarrollo, DB_SYNC=true materializa el esquema directamente desde
 *    las entidades. En producción siempre queda deshabilitado.
 *
 * 3. Las migraciones están habilitadas y su ejecución automática exige DB_MIGRATIONS_RUN=true.
 *
 * 4. autoLoadEntities descubre las entidades registradas por cada módulo
 *    mediante TypeOrmModule.forFeature().
 *
 * 5. La validación de entorno evita iniciar con variables obligatorias
 *    incompletas.
 *
 * IMPORTANTE:
 * DB_SYNC=true sólo debe emplearse en una base local o de desarrollo.
 * ============================================================================
 */

import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, DiscoveryModule } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';

import { validarEntorno } from './config/validar-entorno';
import { debeEjecutarMigraciones, debeSincronizarEsquema } from './config/esquema-database';

// ── Módulos del ERP ──────────────────────────────────────────────────────────
import { AuditoriaModule } from './auditoria/modules/auditoria.module';
import { CatalogoModule } from './catalogo/catalogo.module';
import { CfdiModule } from './cfdi/cfdi.module';
import { ClientesModule } from './clientes/clientes.module';
import { CommonModule } from './common/modules/common.module';
import { ComprasModule } from './compras/modules/compras.module';
import { ConfiguracionModule } from './configuracion/modules/configuracion.module';
import { CreditoModule } from './credito/modules/credito.module';
import { CrmModule } from './crm/modules/crm.module';
import { DepartamentosModule } from './departamentos/module/departamentos.module';
import { FinanzasModule } from './finanzas/modules/finanzas.module';
import { IntegracionModule } from './integracion/modules/integracion.module';
import { HoteleriaModule } from './hoteleria/modules/hoteleria.module';
import { IamModule } from './iam/iam.module';
import { NotificacionesModule } from './notificaciones/notificaciones.module';
import { ProveedoresModule } from './proveedores/proveedores.module';
import { RecetasModule } from './recetas/modules/recetas.module';
import { RpaModule } from './rpa/modules/curp-rpa.module';
import { VentasModule } from './ventas/modules/ventas.module';
import { CajaModule } from './caja/modules/caja.module';
import { AprobacionesModule } from './aprobaciones/modules/aprobaciones.module';

// ── Módulos funcionales adicionales ─────────────────────────────────────────
import { ActivosModule } from './activos/modules/activos.module';
import { RrhhModule } from './rrhh/modules/rrhh.module';
import { TesoreriaModule } from './tesoreria/modules/tesoreria.module';

// ── Guards globales ──────────────────────────────────────────────────────────
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { LowercaseNamingStrategy } from './database/lowercase-naming.strategy';
import { PermisoEndpointGuard } from './common/guards/permiso-endpoint.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validarEntorno,
      envFilePath: ['.env.local', '.env'],
    }),

    ScheduleModule.forRoot(),

    /*
     * Dos ventanas:
     * - corta: controla ráfagas;
     * - larga: controla tráfico sostenido.
     */
    ThrottlerModule.forRoot([
      {
        name: 'corta',
        ttl: 10_000,
        limit: 40,
      },
      {
        name: 'larga',
        ttl: 60_000,
        limit: 250,
      },
    ]),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule, DiscoveryModule],
      inject: [ConfigService],

      useFactory: (cfg: ConfigService) => {
        const enProduccion = cfg.get<string>('NODE_ENV') === 'production';
        const sincronizarEsquema = debeSincronizarEsquema(
          cfg.get<string>('NODE_ENV'),
          cfg.get<string>('DB_SYNC'),
        );

        return {
          type: 'postgres' as const,

          host: cfg.get<string>('DB_HOST'),
          port: Number(cfg.get<string>('DB_PORT') ?? 5432),
          username: cfg.get<string>('DB_USER'),
          password: cfg.get<string>('DB_PASSWORD'),
          database: cfg.get<string>('DB_NAME'),
          namingStrategy: new LowercaseNamingStrategy(),

          /*
           * Las entidades se obtienen automáticamente de los módulos que
           * utilizan TypeOrmModule.forFeature([...]).
           */
          autoLoadEntities: true,

          migrations: [
            __dirname + '/database/migrations/postgres/*{.ts,.js}',
          ],
          migrationsRun: debeEjecutarMigraciones(
            cfg.get<string>('NODE_ENV'),
            cfg.get<string>('DB_MIGRATIONS_RUN'),
          ),

          /*
           * La base se crea y actualiza directamente desde las entidades.
           *
           * En producción se ignora DB_SYNC aunque alguien lo configure por
           * accidente. En desarrollo puede activarse para construir una base
           * nueva directamente desde la versión actual de las entidades.
           */
          synchronize: sincronizarEsquema,

          logging: enProduccion ? ['error'] : ['error', 'warn'],

          // Registra consultas que tarden más de dos segundos.
          maxQueryExecutionTime: 2000,

          // Reintentos de conexión a PostgreSQL.
          retryAttempts: 5,
          retryDelay: 3000,

          extra: {
            max: Number(cfg.get<string>('DB_POOL_MAX') ?? 20),
            idleTimeoutMillis: 30_000,
          },

          ssl:
            cfg.get<string>('DB_SSL') === 'true'
              ? {
                  rejectUnauthorized:
                    cfg.get<string>('DB_SSL_REJECT_UNAUTHORIZED') !== 'false',
                }
              : false,
        };
      },
    }),

    // ── Módulos de dominio ──────────────────────────────────────────────────
    AuditoriaModule,
    IamModule,
    CommonModule,
    CatalogoModule,
    ClientesModule,
    AprobacionesModule,
    ProveedoresModule,
    DepartamentosModule,
    VentasModule,
    CajaModule,
    ComprasModule,
    CfdiModule,
    FinanzasModule,
    IntegracionModule,
    CreditoModule,
    TesoreriaModule,
    ActivosModule,
    RrhhModule,
    CrmModule,
    ConfiguracionModule,
    HoteleriaModule,
    RecetasModule,
    NotificacionesModule,
    RpaModule,
  ],

  /* Viveza y disponibilidad. Fuera del prefijo `api`, públicas. */
  controllers: [AppController],

  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermisoEndpointGuard,
    },
    /*
     * Va después del de permisos y no lo sustituye: uno pregunta «¿este rol
     * tiene este módulo?» y el otro «¿este endpoint es de administración?».
     * Hasta hoy las 47 anotaciones `@Roles(...)` no las leía nadie.
     */
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
