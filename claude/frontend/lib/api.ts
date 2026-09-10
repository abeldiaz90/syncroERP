/**
 * ============================================================================
 * SyncroERP · Cliente HTTP central
 * ----------------------------------------------------------------------------
 * Reemplaza los ~242 `fetch()` sueltos y las 79 copias de `tok()/h()`
 * repartidas por las páginas. Un solo lugar que resuelve:
 *   · Base URL y prefijo /api
 *   · Authorization: Bearer
 *   · 401 → cierre de sesión y redirección a /login (una sola vez)
 *   · 403 → error tipado para mostrar "sin permisos" sin romper la pantalla
 *   · Timeout y cancelación (AbortController)
 *   · Normalización de errores de NestJS (`message` string | string[])
 *   · Tipado genérico de la respuesta
 * ============================================================================
 */

import { asegurarSesion, renovarSesion, token as sesionToken } from './sesion';

const API_CONFIGURADA = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '');
/** En producción nunca se degrada silenciosamente a localhost. */
export const API_URL = API_CONFIGURADA || (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:4000/api');

const TIMEOUT_MS = 30_000;

/* ── Errores tipados ─────────────────────────────────────────────────────── */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public detalles?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get esNoAutorizado() { return this.status === 401; }
  get esSinPermisos()  { return this.status === 403; }
  get esNoEncontrado() { return this.status === 404; }
  get esValidacion()   { return this.status === 400 || this.status === 422; }
  get esServidor()     { return this.status >= 500; }
  /** Sin conexión con la API (backend caído, CORS, DNS). */
  get esRed()          { return this.status === 0; }

  /**
   * Texto listo para mostrar. Los errores explican qué pasó y qué hacer;
   * no se disculpan ni son vagos.
   */
  mensajeParaPantalla(): string {
    if (this.esSinPermisos) {
      return 'Tu perfil no incluye esta acción. Pide acceso al administrador.';
    }
    if (this.esRed) {
      return 'No hay conexión con el servidor. Revisa tu red e inténtalo de nuevo.';
    }
    return this.message;
  }
}

/* ── Token ───────────────────────────────────────────────────────────────── */

/**
 * Vive en `sesion.ts`, que además lo renueva antes de que expire. Se reexporta
 * aquí para no tocar los cientos de sitios que ya importan `token` de este
 * módulo.
 */
export { token } from './sesion';

/** Evita 20 redirecciones simultáneas cuando expira el token con varias
 *  peticiones en vuelo. */
let redirigiendo = false;
function sesionExpirada() {
  sesionToken.clear();
  if (typeof window === 'undefined' || redirigiendo) return;
  redirigiendo = true;
  const destino = window.location.pathname + window.location.search;
  window.location.href = `/login?next=${encodeURIComponent(destino)}`;
}

/* ── Núcleo ──────────────────────────────────────────────────────────────── */

interface Opciones extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Query string en objeto: { estado: 'ACTIVO', page: 2 } */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** No redirigir a /login ante un 401 (útil en la pantalla de login). */
  sinRedireccion?: boolean;
  timeoutMs?: number;
}

function construirUrl(path: string, query?: Opciones['query']): string {
  const base = path.startsWith('http') ? path : `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return base;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') qs.append(k, String(v));
  }
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}

function mensajeDeError(status: number, cuerpo: unknown): string {
  if (cuerpo && typeof cuerpo === 'object') {
    const m = (cuerpo as { message?: unknown }).message;
    if (Array.isArray(m)) return m.join(' · ');
    if (typeof m === 'string') return m;
  }
  const genericos: Record<number, string> = {
    400: 'Los datos enviados no son válidos.',
    401: 'Tu sesión expiró. Inicia sesión de nuevo.',
    403: 'No tienes permisos para realizar esta acción.',
    404: 'No se encontró el recurso solicitado.',
    409: 'El registro ya existe o está en uso.',
    422: 'Los datos enviados no son válidos.',
    429: 'Demasiadas peticiones. Espera unos segundos.',
    500: 'Error interno del servidor.',
    503: 'El servicio no está disponible en este momento.',
  };
  return genericos[status] ?? `Error inesperado (${status}).`;
}

async function request<T>(
  metodo: string,
  path: string,
  opts: Opciones = {},
  yaRenovado = false,
): Promise<T> {
  const { body, query, sinRedireccion, timeoutMs = TIMEOUT_MS, headers, ...resto } = opts;

  // Si el token está por vencer se renueva ANTES de salir. Evita el 401 en
  // lugar de reaccionar a él, que es lo que tumbaba la venta a medio cobrar.
  await asegurarSesion();

  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), timeoutMs);

  const esFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const jwt = sesionToken.get();

  const cabeceras: Record<string, string> = {
    Accept: 'application/json',
    ...(esFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    ...(headers as Record<string, string>),
  };

  let respuesta: Response;
  try {
    respuesta = await fetch(construirUrl(path, query), {
      ...resto,
      method: metodo,
      headers: cabeceras,
      signal: controlador.signal,
      body: esFormData ? (body as FormData) : body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    clearTimeout(temporizador);
    const abortado = e instanceof DOMException && e.name === 'AbortError';
    throw new ApiError(
      0,
      abortado
        ? 'La petición tardó demasiado. Revisa tu conexión.'
        : 'No se pudo conectar con el servidor. Verifica que la API esté activa.',
    );
  }
  clearTimeout(temporizador);

  if (respuesta.status === 204) return undefined as T;

  const tipo = respuesta.headers.get('content-type') ?? '';
  const cuerpo = tipo.includes('application/json')
    ? await respuesta.json().catch(() => null)
    : await respuesta.text().catch(() => null);

  if (!respuesta.ok) {
    if (respuesta.status === 401 && !sinRedireccion) {
      // Segunda oportunidad: el reloj del equipo pudo ir adelantado, o el token
      // se invalidó del lado de Keycloak. Se renueva y se repite UNA vez; si
      // tampoco, entonces sí es sesión terminada.
      if (!yaRenovado && (await renovarSesion())) {
        return request<T>(metodo, path, opts, true);
      }
      sesionExpirada();
    }
    throw new ApiError(respuesta.status, mensajeDeError(respuesta.status, cuerpo), cuerpo);
  }

  return cuerpo as T;
}

/* ── API pública ─────────────────────────────────────────────────────────── */

export const api = {
  get:   <T>(path: string, opts?: Opciones) => request<T>('GET', path, opts),
  post:  <T>(path: string, body?: unknown, opts?: Opciones) => request<T>('POST', path, { ...opts, body }),
  put:   <T>(path: string, body?: unknown, opts?: Opciones) => request<T>('PUT', path, { ...opts, body }),
  patch: <T>(path: string, body?: unknown, opts?: Opciones) => request<T>('PATCH', path, { ...opts, body }),
  delete:<T>(path: string, opts?: Opciones) => request<T>('DELETE', path, opts),

  /** Descarga un binario (Excel, PDF) y dispara el guardado en el navegador. */
  async descargar(path: string, nombreArchivo: string, opts?: Opciones) {
    await asegurarSesion();
    const jwt = sesionToken.get();
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), opts?.timeoutMs ?? TIMEOUT_MS);
    let r: Response;
    try {
      r = await fetch(construirUrl(path, opts?.query), {
        headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
        signal: controlador.signal,
      });
    } catch (e) {
      clearTimeout(temporizador);
      const abortado = e instanceof DOMException && e.name === 'AbortError';
      throw new ApiError(0, abortado ? 'La descarga tardó demasiado.' : 'No se pudo conectar con el servidor.');
    }
    clearTimeout(temporizador);
    if (!r.ok) {
      if (r.status === 401 && !opts?.sinRedireccion) sesionExpirada();
      const tipo = r.headers.get('content-type') ?? '';
      const cuerpo = tipo.includes('application/json')
        ? await r.json().catch(() => null)
        : await r.text().catch(() => null);
      throw new ApiError(r.status, mensajeDeError(r.status, cuerpo), cuerpo);
    }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    a.click();
    URL.revokeObjectURL(url);
  },
};

/* ── Utilidad: nunca revientes la pantalla por un endpoint opcional ──────── */

/**
 * Ejecuta la promesa y devuelve `respaldo` si falla.
 * Úsalo para KPIs o widgets secundarios: que un endpoint caído no deje la
 * pantalla en blanco.
 */
export async function intentar<T>(p: Promise<T>, respaldo: T): Promise<T> {
  try { return await p; } catch { return respaldo; }
}
