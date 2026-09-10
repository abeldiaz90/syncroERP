import { SetMetadata } from '@nestjs/common';

export const NAVEGABLE_KEY = 'syncro:navegable';

export interface NavegableMeta {
  rutaFrontend: string;
  titulo: string;
  ordenMenu?: number;
}

/**
 * Marca un endpoint como página navegable del menú lateral.
 *
 * Admite ambos formatos para mantener compatibilidad:
 *   @Navegable('/dashboard/finanzas/balance-general', 'Balance General', 55)
 *   @Navegable({ rutaFrontend: '/dashboard/finanzas/balance-general', titulo: 'Balance General', ordenMenu: 55 })
 */
export function Navegable(
  metadata: NavegableMeta,
): ReturnType<typeof SetMetadata>;
export function Navegable(
  rutaFrontend: string,
  titulo: string,
  ordenMenu?: number,
): ReturnType<typeof SetMetadata>;
export function Navegable(
  rutaOMetadata: string | NavegableMeta,
  titulo?: string,
  ordenMenu = 99,
): ReturnType<typeof SetMetadata> {
  const metadata: Required<NavegableMeta> =
    typeof rutaOMetadata === 'string'
      ? {
          rutaFrontend: rutaOMetadata,
          titulo: titulo ?? rutaOMetadata,
          ordenMenu,
        }
      : {
          rutaFrontend: rutaOMetadata.rutaFrontend,
          titulo: rutaOMetadata.titulo,
          ordenMenu: rutaOMetadata.ordenMenu ?? 99,
        };

  return SetMetadata(NAVEGABLE_KEY, metadata);
}
