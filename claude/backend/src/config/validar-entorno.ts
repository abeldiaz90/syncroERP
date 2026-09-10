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
  DB_PORT = 5432;

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

  @Matches(/^(keycloak|local)$/, {
    message: 'AUTH_MODE debe ser keycloak o local',
  })
  @IsOptional()
  AUTH_MODE = 'keycloak';

  @IsString()
  @IsOptional()
  KEYCLOAK_ISSUER_URL = 'https://key-access.sumamexico.com/realms/suma';

  @IsString()
  @IsOptional()
  KEYCLOAK_CLIENT_ID = 'syncro-erp';

  /** 32 bytes en Base64 o 64 caracteres hex para cifrar secretos del PAC. */
  @IsString()
  @IsOptional()
  CFDI_ENCRYPTION_KEY?: string;

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
  DB_SYNC = 'true';

  /** Ejecutar migraciones pendientes al arrancar. Recomendado: false y ejecutarlas en despliegue. */
  @IsString()
  @IsOptional()
  DB_MIGRATIONS_RUN = 'false';

  /** Confirmación destructiva usada únicamente por db:rebuild:dev. */
  @IsString()
  @IsOptional()
  DB_REBUILD_CONFIRM?: string;

  @IsString()
  @IsOptional()
  DB_SSL = 'false';

  @IsString()
  @IsOptional()
  DB_SSL_REJECT_UNAUTHORIZED = 'true';

  @IsString()
  @IsOptional()
  SWAGGER_HABILITADO = 'false';

  /**
   * El scraping del portal CURP queda deshabilitado por defecto. Solo puede
   * habilitarse tras confirmar autorización legal e institucional.
   */
  @IsString()
  @IsOptional()
  CURP_RPA_HABILITADO = 'false';

  /* ── Cartera con registro externo ──────────────────────────────────────── */

  /**
   * Techo global de autoridad del registro externo de cartera:
   * APAGADO · SOMBRA · AUTORIDAD. Una empresa puede quedarse por debajo, nunca
   * por encima. Ver INTEGRACION-FINERACT.md.
   */
  @Matches(/^(APAGADO|SOMBRA|AUTORIDAD)$/, {
    message: 'CARTERA_MODO debe ser APAGADO, SOMBRA o AUTORIDAD',
  })
  @IsOptional()
  CARTERA_MODO = 'APAGADO';

  /**
   * Techo global del espejo contable: APAGADO · ESPEJO.
   *
   * No existe un modo en el que el externo decida el asiento. El motor contable
   * del ERP es siempre quien calcula el cargo y el abono —es el único que
   * conoce el IVA, el catálogo SAT y el CFDI—; el externo recibe el espejo.
   */
  @Matches(/^(APAGADO|ESPEJO)$/, {
    message: 'CONTABILIDAD_EXTERNA_MODO debe ser APAGADO o ESPEJO',
  })
  @IsOptional()
  CONTABILIDAD_EXTERNA_MODO = 'APAGADO';

  /* ── Proveedor: Apache Fineract ────────────────────────────────────────── */

  /**
   * Sin FINERACT_URL el adaptador queda inerte y el ERP se comporta como antes.
   * Es deliberado: la contabilidad y la cartera no pueden depender de que un
   * servicio externo esté configurado para que el sistema arranque.
   */
  @IsString() @IsOptional() FINERACT_URL?: string;

  @IsString() @IsOptional() FINERACT_TENANT = 'default';

  /** Interfaz web del proveedor, para el acceso con la sesión de Keycloak. */
  @IsString() @IsOptional() FINERACT_WEB_APP_URL?: string;

  /**
   * Certificado de la autoridad que firma el de Fineract. Se añade al almacén
   * de confianza; nunca se desactiva la verificación TLS.
   */
  @IsString() @IsOptional() FINERACT_CA_CERT?: string;

  @Type(() => Number) @IsInt() @Min(1) @IsOptional() FINERACT_OFICINA_ID = 1;

  @IsString() @IsOptional() FINERACT_MONEDA = 'MXN';

  /** Alias heredado de CARTERA_MODO. Se conserva para no romper .env viejos. */
  @Matches(/^(APAGADO|SOMBRA|AUTORIDAD)$/, {
    message: 'FINERACT_MODO debe ser APAGADO, SOMBRA o AUTORIDAD',
  })
  @IsOptional()
  FINERACT_MODO?: string;

  /** Cliente de servicio en el mismo Keycloak que autentica al ERP. */
  @IsString() @IsOptional() FINERACT_KEYCLOAK_ISSUER_URL?: string;
  @IsString() @IsOptional() FINERACT_CLIENT_ID?: string;
  @IsString() @IsOptional() FINERACT_CLIENT_SECRET?: string;

  /** Respaldo de autenticación básica, sólo para desarrollo local. */
  @IsString() @IsOptional() FINERACT_BASIC_USER?: string;
  @IsString() @IsOptional() FINERACT_BASIC_PASSWORD?: string;

  /** El punto de venta no espera más que esto por una consulta de crédito. */
  @Type(() => Number) @IsInt() @Min(100) @Max(10000) @IsOptional()
  FINERACT_TIMEOUT_POS_MS = 1200;

  @Type(() => Number) @IsInt() @Min(1000) @IsOptional()
  FINERACT_TIMEOUT_FONDO_MS = 15000;

  @Type(() => Number) @IsInt() @Min(1) @Max(50) @IsOptional()
  FINERACT_OUTBOX_MAX_INTENTOS = 8;
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
    !instancia.CFDI_ENCRYPTION_KEY
  ) {
    throw new Error(
      'Falta CFDI_ENCRYPTION_KEY. En producción es obligatoria para proteger las credenciales del PAC.',
    );
  }

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
