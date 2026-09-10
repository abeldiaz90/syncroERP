/**
 * ============================================================================
 * SyncroERP · Arranque de la API
 * ----------------------------------------------------------------------------
 * CORRECCIONES SOBRE LA VERSIÓN ANTERIOR
 *
 * 1. `origin: '*'` junto a `credentials: true` es una combinación que los
 *    navegadores rechazan y que, si funcionara, permitiría a cualquier sitio
 *    llamar a la API con las credenciales del usuario. Ahora hay lista blanca.
 *
 * 2. El puerto estaba fijo en 4000. En cualquier PaaS eso impide desplegar.
 *
 * 3. Swagger quedaba público en producción, exponiendo el mapa completo de
 *    endpoints. Ahora sólo se monta fuera de producción o con clave.
 *
 * 4. No había filtro de excepciones: un error de TypeORM devolvía el stack y
 *    el nombre de las tablas al cliente.
 *
 * 5. `bootstrap()` sin `.catch()`: un fallo de conexión a la base dejaba el
 *    proceso vivo con una promesa rechazada sin manejar.
 *
 * 6. Sin `enableShutdownHooks`, los cron de @nestjs/schedule y el pool de
 *    conexiones no se cerraban al recibir SIGTERM.
 *
 * Requiere: npm i helmet compression
 * ============================================================================
 */

import { ValidationPipe, BadRequestException, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';

// `compression` es CommonJS puro y no expone un `default` real. El tsconfig de
// este proyecto tiene `allowSyntheticDefaultImports` pero NO `esModuleInterop`,
// así que `import compression from 'compression'` compila sin quejarse y en
// tiempo de ejecución da `undefined`. Esta forma es la importación CJS de
// TypeScript: conserva los tipos y funciona con o sin interoperabilidad.
import compression = require('compression');
import { join } from 'path';

import { AppModule } from './app.module';
import { FiltroGlobalExcepciones } from './common/filters/filtro-global-excepciones';
import { InterceptorRegistro } from './common/interceptors/interceptor-registro';
import { contextoPeticion } from './common/contexto/contexto-peticion.middleware';

async function bootstrap() {
  const logger = new Logger('Arranque');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // El logger de Nest respeta el nivel configurado; `debug` sólo en desarrollo.
    logger:
      process.env.NODE_ENV === 'production'
        ? ['error', 'warn', 'log']
        : ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const config = app.get(ConfigService);
  const enProduccion = config.get('NODE_ENV') === 'production';

  /* ── Seguridad de cabeceras ───────────────────────────────────────────── */
  app.use(
    helmet({
      // Los archivos de /uploads se sirven a un frontend en otro origen.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: enProduccion ? undefined : false,
    }),
  );
  app.use(compression());

  /*
   * Identidad de la petición en un almacén asíncrono. Va antes de las rutas
   * para que cualquier servicio pueda saber quién está actuando —lo usa la
   * integración con Fineract para reenviar el token del usuario— sin arrastrar
   * el `request` por toda la cadena de llamadas.
   */
  app.use(contextoPeticion);

  /* ── CORS por lista blanca ────────────────────────────────────────────── */
  const origenesConfigurados = config.get<string>('CORS_ORIGINS');
  const origenesPorDefecto = enProduccion
    ? []
    : [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001',
      ];
  const permitidos = Array.from(
    new Set([
      ...origenesPorDefecto,
      ...(origenesConfigurados ?? '')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ]),
  );

  if (enProduccion && permitidos.length === 0) {
    throw new Error(
      'CORS_ORIGINS es obligatorio en producción. Define los orígenes permitidos separados por coma.',
    );
  }

  app.enableCors({
    origin: (origin, cb) => {
      // Peticiones sin Origin (curl, health checks, apps móviles) se permiten.
      if (!origin || permitidos.includes(origin)) return cb(null, true);
      logger.warn(`CORS rechazado para origen: ${origin}`);
      cb(new Error('Origen no permitido por CORS'), false);
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-Requested-With',
      'Idempotency-Key',
      'X-Idempotency-Key',
    ],
    exposedHeaders: ['Content-Disposition'], // necesario para descargar Excel/PDF
    maxAge: 86_400,
  });

  /* ── Rutas ────────────────────────────────────────────────────────────── */
  // `salud` queda fuera del prefijo para que los balanceadores lo consulten
  // sin conocer el esquema de la API.
  app.setGlobalPrefix('api', { exclude: ['salud'] });

  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads/',
    maxAge: '7d',
    index: false,
    dotfiles: 'deny',
  });

  /* ── Validación ───────────────────────────────────────────────────────── */
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true, // avisa si mandan campos que no existen
      transformOptions: { enableImplicitConversion: true },
      exceptionFactory: (errores) => {
        const aplanar = (errs: any[], prefijo = ''): string[] =>
          errs.flatMap((e) => {
            const ruta = prefijo ? `${prefijo}.${e.property}` : e.property;
            const propios = Object.values(e.constraints ?? {});
            const hijos = e.children?.length ? aplanar(e.children, ruta) : [];
            return [...propios.map((m) => `${ruta}: ${m}`), ...hijos];
          });
        return new BadRequestException(aplanar(errores as any[]));
      },
    }),
  );

  /* ── Transversales ────────────────────────────────────────────────────── */
  app.useGlobalFilters(new FiltroGlobalExcepciones());
  app.useGlobalInterceptors(new InterceptorRegistro());
  app.enableShutdownHooks();

  /* ── Documentación ────────────────────────────────────────────────────── */
  if (!enProduccion || config.get('SWAGGER_HABILITADO') === 'true') {
    const doc = new DocumentBuilder()
      .setTitle('SyncroERP API')
      .setDescription(
        'ERP multiempresa: ventas, compras, inventario, finanzas, RRHH y activos.',
      )
      .setVersion(process.env.npm_package_version ?? '1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'jwt',
      )
      .addTag('IAM')
      .addTag('Catálogo')
      .addTag('Ventas')
      .addTag('Compras')
      .addTag('Finanzas')
      .addTag('Crédito')
      .addTag('Tesorería')
      .addTag('Activos fijos')
      .addTag('RRHH')
      .addTag('CRM')
      .addTag('Hotelería')
      .build();

    SwaggerModule.setup(
      'swagger',
      app,
      SwaggerModule.createDocument(app, doc),
      {
        swaggerOptions: {
          persistAuthorization: true,
          tagsSorter: 'alpha',
          operationsSorter: 'alpha',
        },
      },
    );
  }

  /* ── Escuchar ─────────────────────────────────────────────────────────── */
  const puerto = Number(config.get('PORT') ?? 4000);
  await app.listen(puerto, '0.0.0.0');

  logger.log(`API escuchando en http://localhost:${puerto}/api`);
  if (!enProduccion)
    logger.log(`Swagger en http://localhost:${puerto}/swagger`);
  logger.log(`Orígenes CORS permitidos: ${permitidos.join(', ')}`);
}

bootstrap().catch((e) => {
  new Logger('Arranque').error(
    'No se pudo iniciar la API',
    e instanceof Error ? e.stack : String(e),
  );
  process.exit(1);
});
