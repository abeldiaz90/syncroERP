export function normalizarRol(valor: unknown): string {
  return String(valor ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const ROLES_ADMIN = new Set([
  'ADMIN',
  'ADMINISTRADOR',
  'ADMINISTRATOR',
  'SUPER_ADMIN',
  'SUPERADMIN',
  'SUPER_ADMINISTRADOR',
]);

export function esRolAdministrador(valor: unknown): boolean {
  return ROLES_ADMIN.has(normalizarRol(valor));
}
