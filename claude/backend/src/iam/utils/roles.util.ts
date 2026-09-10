/** Normaliza roles históricos y evita diferencias por mayúsculas, espacios o guiones. */
export function normalizarRol(valor: unknown): string {
  return String(valor ?? '')
    .trim()
    .toUpperCase()
    .replace(/[ÁÀÄÂ]/g, 'A')
    .replace(/[ÉÈËÊ]/g, 'E')
    .replace(/[ÍÌÏÎ]/g, 'I')
    .replace(/[ÓÒÖÔ]/g, 'O')
    .replace(/[ÚÙÜÛ]/g, 'U')
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
