/**
 * ============================================================================
 * SyncroERP · Validación del entorno
 * ----------------------------------------------------------------------------
 * Antes, si faltaba DB_PASSWORD la aplicación arrancaba y fallaba en la
 * primera consulta con un error de driver ilegible. Y si faltaba JWT_SECRET,
 * `@nestjs/jwt` firmaba con `undefined`, lo que en la práctica significa que
 * cualquiera podía forjar un token. Esto se detecta ahora al arrancar.
 *
 * No requiere dependencias nuevas: usa class-validator y class-transformer,
 * que ya están instalados.
 *
 * ── CORRECCIONES SOBRE LA PRIMERA VERSIÓN ──────────────────────────────────
 *
 * 1. `enableImplicitConversion` no bastaba para los puertos. Todo lo que
 *    viene de `.env` es texto, y la conversión implícita depende de que
 *    reflect-metadata haya registrado el tipo de diseño, cosa que no siempre
 *    ocurre según el orden de carga. Resultado: "PORT must be an integer"
 *    aunque el valor fuera perfectamente válido. Ahora hay `@Type(() => Number)`
 *    explícito, que no depende de eso.
 *
 * 2. `@IsEmail()` rechazaba MAIL_FROM cuando venía en el formato habitual de
 *    los servidores de correo: `SyncroERP <no-reply@dominio.com>`. Eso es
 *    válido según RFC 5322 y es lo que casi todo mundo configura. Ahora se
 *    acepta con o sin nombre para mostrar.
 *
 * 3. Las variables declaradas pero vacías en `.env` llegaban como cadena
 *    vacía y pisaban los valores por omisión. Ahora se descartan.
 * ============================================================================
 */

import { plainToInstance, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum Entorno {
  Desarrollo = 'development',
  Produccion = 'production',
  Pruebas = 'test',
}

/**
 * Acepta `correo@dominio.com` y también `Nombre <correo@dominio.com>`.
 * No pretende validar RFC 5322 completo: solo atrapar errores de dedo.
 */
const CORREO_O_REMITENTE =
  /^(?:[^<>]{1,80}\s)?<?[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}>?$/;

class VariablesEntorno {
  @IsEnum(Entorno, {
    message: 'NODE_ENV debe ser development, production o test',
  })
  @IsOptional()
  NODE_ENV: Entorno = Entorno.Desarrollo;

  @Type(() => Number)
  @IsInt({ message: 'PORT debe ser un número entero' })
  @Min(1)
  @Max(65535)
  @IsOptional()
  PORT = 4000;

  /* ── Base de datos ─────────────────────────────────────────────────────── */

  @IsString({ message: 'Falta DB_HOST' })
  DB_HOST!: string;

  @Type(() => Number)
  @IsInt({ message: 'DB_PORT debe ser un número entero' })
  @Min(1)
  @Max(65535)
  @IsOptional()
  DB_PORT = 1433;

  @IsString({ message: 'Falta DB_USER' })
  DB_USER!: string;

  @IsString({ message: 'Falta DB_PASSWORD' })
  DB_PASSWORD!: string;

  @IsString({ message: 'Falta DB_NAME' })
  DB_NAME!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  @IsOptional()
  DB_POOL_MAX = 20;

  /* ── Autenticación ─────────────────────────────────────────────────────── */

  @IsString({ message: 'Falta JWT_SECRET' })
  @MinLength(32, {
    message:
      'JWT_SECRET debe tener al menos 32 caracteres. Genera uno con: ' +
      "node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\" " +
      '— ojo: al cambiarlo se cierran todas las sesiones abiertas.',
  })
  JWT_SECRET!: string;

  @IsString()
  @IsOptional()
  JWT_EXPIRATION = '8h';

  /* ── Correo (opcional: sin esto solo se pierden las invitaciones) ──────── */

  @IsString() @IsOptional() MAIL_HOST?: string;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  MAIL_PORT?: number;

  @IsString() @IsOptional() MAIL_USER?: string;
  @IsString() @IsOptional() MAIL_PASS?: string;

  @Matches(CORREO_O_REMITENTE, {
    message:
      'MAIL_FROM debe ser un correo válido. Se acepta "correo@dominio.com" ' +
      'o "Nombre Visible <correo@dominio.com>".',
  })
  @IsOptional()
  MAIL_FROM?: string;

  /* ── Frontend ──────────────────────────────────────────────────────────── */

  @IsString()
  @IsOptional()
  FRONTEND_URL = 'http://localhost:3000';

  /** Lista separada por comas de orígenes permitidos por CORS. */
  @IsString()
  @IsOptional()
  CORS_ORIGINS = 'http://localhost:3000';

  /* ── Banderas ──────────────────────────────────────────────────────────── */

  /**
   * Sincronización automática del esquema. Solo 'true' en desarrollo:
   * en producción TypeORM puede borrar columnas al detectar diferencias.
   */
  @IsString()
  @IsOptional()
  DB_SYNC = 'false';

  @IsString()
  @IsOptional()
  DB_ENCRYPT = 'false';

  @IsString()
  @IsOptional()
  SWAGGER_HABILITADO = 'false';
}

export function validarEntorno(config: Record<string, unknown>) {
  // Las variables declaradas pero vacías en .env llegan como cadena vacía y
  // pisan los valores por omisión. Se descartan antes de validar.
  const limpio: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(config)) {
    if (valor !== '' && valor !== undefined) limpio[clave] = valor;
  }

  const instancia = plainToInstance(VariablesEntorno, limpio, {
    enableImplicitConversion: true,
  });

  const errores = validateSync(instancia, {
    skipMissingProperties: false,
    // Solo interesa lo declarado arriba; el resto del entorno se ignora.
    forbidUnknownValues: false,
  });

  if (errores.length) {
    const detalle = errores
      .flatMap((e) => Object.values(e.constraints ?? {}))
      .map((m) => `  · ${m}`)
      .join('\n');

    throw new Error(
      `\n\nLa configuración del entorno no es válida:\n${detalle}\n\n` +
        `Revisa el archivo .env (usa .env.example como referencia).\n`,
    );
  }

  // Un secreto de ejemplo en producción es tan malo como no tener ninguno.
  if (
    instancia.NODE_ENV === Entorno.Produccion &&
    /^(secret|changeme|test|123|syncro|password)/i.test(instancia.JWT_SECRET)
  ) {
    throw new Error(
      'JWT_SECRET parece un valor de ejemplo. Cámbialo antes de desplegar a producción.',
    );
  }

  return instancia;
}
