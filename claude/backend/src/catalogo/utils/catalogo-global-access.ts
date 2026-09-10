import { ForbiddenException } from '@nestjs/common';
import { normalizarRol } from '../../iam/utils/roles.util';

const ROLES_PLATAFORMA = new Set([
  'SUPER_ADMIN',
  'SUPERADMIN',
  'SUPER_ADMINISTRADOR',
  'PLATFORM_ADMIN',
  'ADMIN_PLATAFORMA',
]);

/**
 * Países, estados, bancos y formas de pago son tablas compartidas por todos
 * los inquilinos. Un administrador de empresa no puede mutarlas porque el
 * cambio afectaría a las demás empresas.
 */
export function exigirAdministradorDePlataforma(rol: unknown): void {
  if (!ROLES_PLATAFORMA.has(normalizarRol(rol))) {
    throw new ForbiddenException(
      'Este catálogo es global. Solo un administrador de plataforma puede modificarlo.',
    );
  }
}
