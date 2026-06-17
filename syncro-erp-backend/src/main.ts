import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 🔥 CONFIGURACIÓN DE CORS REFORZADA
  app.enableCors({
    origin: '*', // O puedes poner 'http://localhost:3000' para ser más estricto
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true, // Crucial para permitir el paso de tokens de autenticación
    allowedHeaders: 'Content-Type, Authorization, Accept', // Aseguramos que Authorization sea aceptado
  });

  app.setGlobalPrefix('api');

  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads/',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      exceptionFactory: (errors) => {
        const messages = errors.map(err => {
          const constraints = err.constraints || {};
          const firstMessage = Object.values(constraints)[0] || 'Valor inválido';
          return `${err.property}: ${firstMessage}`;
        });
        console.error('Errores de validación:', messages);
        return new BadRequestException(messages);
      },
    }),
  );

  await app.listen(4000);
}
bootstrap();