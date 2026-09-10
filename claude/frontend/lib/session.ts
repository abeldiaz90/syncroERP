/**
 * ============================================================================
 * SyncroERP · Sesión y coincidencia de rutas
 * ----------------------------------------------------------------------------
 * Dos cosas que estaban mal y aquí se corrigen:
 *
 * 1. El JWT se decodificaba con `atob()` directo. Eso falla con acentos
 *    (base64url + UTF-8) y revienta el layout con nombres como "José Muñoz".
 *
 * 2. Los permisos se comparaban con `startsWith()` a secas. Eso hace que
 *    `/dashboard/venta` conceda acceso a `/dashboard/ventas`, y que
 *    `r.startsWith(pathname)` conceda el padre completo por tener un hijo.
 *    Aquí la comparación es por SEGMENTOS de ruta.
 * ============================================================================
 */

export interface Sesion {
  id: string;
  email: string;
  rol: string;
  empresaId: string;
  nombreCompleto: string;
  expiraEn: number | null;
}

/* ── Decodificación segura de JWT ────────────────────────────────────────── */

function base64UrlADecodificado(seg: string): string {
  const b64 = seg.replace(/-/g, '+').replace(/_/g, '/');
  const relleno = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const binario = atob(relleno);
  // Reconstruir UTF-8 correctamente (acentos, ñ, emojis)
  const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

export function leerSesion(jwt: string): Sesion | null {
  if (!jwt || jwt.split('.').length !== 3) return null;
  try {
    const p = JSON.parse(base64UrlADecodificado(jwt.split('.')[1]));
    let local: Partial<Sesion> = {};
    if (typeof window !== 'undefined') {
      const crudo = localStorage.getItem('syncro_user');
      /*
       * En OIDC el token lo emite Keycloak y NO trae el rol del ERP: ése vive
       * en `syncro_user`. Si falta, la sesión está a medias y antes se resolvía
       * con el valor por omisión —«empleado»—, que es la peor de las opciones:
       * el usuario entra, el menú aparece vacío y parece que le quitaron los
       * permisos. Se devuelve null para que el layout lo mande a iniciar
       * sesión, que es lo que realmente hace falta.
       */
      if (!crudo) return null;
      try {
        local = JSON.parse(crudo);
      } catch {
        return null;
      }
      if (!local?.rol) return null;
    }
    return {
      // En OIDC `sub` identifica a Keycloak; la identidad ERP enlazada vive
      // en syncro_user y conserva empresa/rol internos.
      id: local.id ?? p.sub ?? p.id ?? '',
      email: local.email ?? p.email ?? '',
      rol: local.rol ?? p.rol ?? 'empleado',
      empresaId: local.empresaId ?? p.empresaId ?? '',
      nombreCompleto:
        local.nombreCompleto ??
        p.nombreCompleto ??
        p.name ??
        p.nombre ??
        p.email ??
        '',
      expiraEn: typeof p.exp === 'number' ? p.exp * 1000 : null,
    };
  } catch {
    return null;
  }
}

export function sesionVigente(s: Sesion | null): boolean {
  if (!s) return false;
  if (s.expiraEn === null) return true;
  // 30 s de margen para no quedarse a medio camino en una petición
  return s.expiraEn - 30_000 > Date.now();
}

export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (!partes.length) return 'U';
  return partes.map((p) => p[0]).join('').toUpperCase();
}

/* ── Coincidencia de rutas por segmentos ─────────────────────────────────── */

/**
 * ¿`ruta` está cubierta por `permiso`?
 * Cubre la ruta exacta y sus descendientes, NUNCA por coincidencia parcial
 * de texto.
 *
 *   cubre('/dashboard/ventas', '/dashboard/ventas/pos')  → true
 *   cubre('/dashboard/venta',  '/dashboard/ventas')      → false  ← el bug viejo
 */
export function cubre(permiso: string, ruta: string): boolean {
  if (permiso === '*') return true;
  const p = permiso.replace(/\/+$/, '');
  const r = ruta.replace(/\/+$/, '');
  return r === p || r.startsWith(p + '/');
}

/** ¿El usuario puede entrar a `ruta` con esta lista de permisos? */
export function puedeEntrar(permisos: string[] | null, ruta: string): boolean {
  if (permisos === null) return true;          // aún cargando: no bloquear
  if (permisos.includes('*')) return true;     // administrador
  return permisos.some((p) => cubre(p, ruta));
}

/**
 * ¿Debe mostrarse el enlace `href` en el menú?
 * Se muestra si el permiso cubre el enlace **o** si el permiso es un
 * descendiente del enlace (permiso a `/finanzas/polizas/nueva` implica que la
 * sección "Finanzas" debe ser visible), pero siempre comparando segmentos.
 */
export function puedeVerEnlace(permisos: string[] | null, href: string): boolean {
  if (permisos === null) return false;         // aún cargando: no parpadear
  if (permisos.includes('*')) return true;
  return permisos.some((p) => cubre(p, href) || cubre(href, p));
}
