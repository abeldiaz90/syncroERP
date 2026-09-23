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
    /*
     * Cuando el servidor adjunta el detalle de por qué se niega, se enseña.
     *
     * La póliza de nómina contestaba «No se puede contabilizar porque faltan
     * cuentas contables» —y traía la lista de cuáles—. La lista se quedaba en
     * el cuerpo de la respuesta y quien tenía dieciséis cuentas mapeadas se
     * quedaba adivinando cuál era. Un «no se puede» sin el «qué falta» obliga
     * a alguien a abrir el código para operar el sistema.
     */
    const lista = this.detalleEnLista();
    return lista.length ? `${this.message} Falta: ${lista.join(', ')}.` : this.message;
  }

  /**
   * El detalle estructurado que el servidor adjuntó, aplanado a una lista de
   * textos. Devuelve vacío cuando no hay nada que enseñar.
   */
  detalleEnLista(): string[] {
    const cuerpo = this.detalles as { detalle?: Record<string, unknown> } | undefined;
    const detalle = cuerpo?.detalle;
    if (!detalle || typeof detalle !== 'object') return [];
    const textos: string[] = [];
    for (const valor of Object.values(detalle)) {
      if (Array.isArray(valor)) {
        textos.push(...valor.filter((v): v is string => typeof v === 'string'));
      } else if (typeof valor === 'string') {
        textos.push(valor);
      }
    }
    return textos;
  }
}

/* ── Lo que un rol no puede ver no es una avería ──────────────────────────── */

/**
 * Envuelve una petición que PUEDE estar vedada para el rol de quien mira.
 *
 * El patrón apareció tres veces en el mismo módulo y siempre igual: una
 * pantalla carga varias cosas con `Promise.all`, una de ellas devuelve 403
 * porque ese rol no debe verla —y eso está bien, es la regla funcionando— y
 * el rechazo se lleva por delante todo lo demás. La pantalla sale en blanco
 * con «No tienes permisos suficientes para esta acción», como si nada
 * sirviera.
 *
 * Pasó en la configuración patronal (RRHH no lee el catálogo de cuentas) y
 * dos veces en el centro de nómina (Gerencia no ve la prenómina; Finanzas no
 * ve la preparación de la empresa). En los tres casos el rol sí podía hacer
 * justo aquello a lo que venía, y la pantalla no se lo dejó ver.
 *
 * Con esto, un 403 se convierte en un dato —`vedado: true`— que la pantalla
 * puede contar bien: «esto no es de tu rol» en vez de «algo falló». Cualquier
 * otro error sigue subiendo, porque un 500 sí es una avería.
 */
export async function conPermiso<T>(
  peticion: Promise<T>,
): Promise<{ valor: T | null; vedado: boolean }> {
  try {
    return { valor: await peticion, vedado: false };
  } catch (error) {
    if (error instanceof ApiError && error.esSinPermisos) {
      return { valor: null, vedado: true };
    }
    throw error;
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

/**
 * Rutas a las que no tiene sentido «volver» después de entrar.
 *
 * Si el 401 llega mientras el usuario ya está en la pantalla de acceso —pasa:
 * la pantalla consulta la sesión al montar— el destino capturado sería
 * `/login`, y el sistema mandaba a la gente de vuelta al formulario de acceso
 * justo después de haber entrado. Se veía como si la contraseña no hubiera
 * funcionado.
 */
const RUTAS_DE_ACCESO = ['/login', '/logout', '/auth'];

function destinoDeRegreso(): string | null {
  const ruta = window.location.pathname;
  if (RUTAS_DE_ACCESO.some((acceso) => ruta === acceso || ruta.startsWith(`${acceso}/`))) {
    return null;
  }
  /*
   * Se conserva la query pero se descarta un `next` heredado: encadenarlos
   * produce `/login?next=/login?next=…` y basta un rebote para que la URL
   * crezca sin fin.
   */
  const parametros = new URLSearchParams(window.location.search);
  parametros.delete('next');
  const cola = parametros.toString();
  return cola ? `${ruta}?${cola}` : ruta;
}

function sesionExpirada() {
  sesionToken.clear();
  if (typeof window === 'undefined' || redirigiendo) return;
  redirigiendo = true;
  const destino = destinoDeRegreso();
  window.location.href = destino
    ? `/login?next=${encodeURIComponent(destino)}`
    : '/login';
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
