export function extraerLista<T>(respuesta: unknown): T[] {
  if (Array.isArray(respuesta)) return respuesta as T[];
  if (!respuesta || typeof respuesta !== 'object') return [];

  const nivel1 = (respuesta as { data?: unknown }).data;
  if (Array.isArray(nivel1)) return nivel1 as T[];

  if (nivel1 && typeof nivel1 === 'object') {
    const nivel2 = (nivel1 as { data?: unknown }).data;
    if (Array.isArray(nivel2)) return nivel2 as T[];
  }

  return [];
}
