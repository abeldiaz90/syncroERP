import { SetMetadata } from '@nestjs/common';

export const NAVEGABLE_KEY = 'syncro:navegable';

export interface NavegableMeta {
  rutaFrontend: string;
  titulo:       string;
  ordenMenu?:   number;
}

/**
 * Marca un endpoint como página navegable del menú lateral.
 * Al arrancar el backend, el auto-healer lo registra automáticamente en la BD.
 *
 * @example
 * @Navegable('/dashboard/finanzas/balance-general', 'Balance General', 55)
 * @Get('balance')
 * obtenerBalance() { ... }
 */
export const Navegable = (
  rutaFrontend: string,
  titulo: string,
  ordenMenu = 99,
) => SetMetadata(NAVEGABLE_KEY, { rutaFrontend, titulo, ordenMenu } as NavegableMeta);