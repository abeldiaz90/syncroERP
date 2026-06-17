import { SetMetadata } from '@nestjs/common';

/**
 * Marca un endpoint para que el PermisoEndpointGuard lo omita.
 *
 * Úsalo en endpoints que:
 * - Requieren JWT (necesitan saber quién es el usuario)
 * - Pero NO deben consultarse contra la tabla de permisos
 *
 * Ejemplos: GET /auth/menu, GET /auth/mis-permisos
 *
 * DIFERENCIA con @Public():
 * - @Public()       → omite JWT + omite permisos (rutas sin autenticación)
 * - @SkipPermisos() → requiere JWT + omite permisos (rutas del sistema IAM)
 */
export const SKIP_PERMISOS_KEY = 'skipPermisos';
export const SkipPermisos = () => SetMetadata(SKIP_PERMISOS_KEY, true);