/**
 * ============================================================================
 * SyncroERP · Sesión de identidad
 * ----------------------------------------------------------------------------
 * Guarda los tokens de Keycloak y los renueva ANTES de que expiren.
 *
 * Antes de esto la aplicación pedía el token de acceso y tiraba el de
 * renovación, así que no había con qué renovar: cuando el acceso vencía —a los
 * pocos minutos— la sesión se caía y el usuario aparecía en /login. En una
 * pantalla de consulta es una molestia; en el punto de venta es una venta a la
 * mitad con el cliente enfrente.
 *
 * Tres piezas:
 *   1. Un temporizador que renueva un minuto antes del vencimiento.
 *   2. Una renovación bajo demanda antes de cada petición, por si el equipo
 *      estuvo suspendido y el temporizador no corrió.
 *   3. Un candado para que veinte peticiones simultáneas no disparen veinte
 *      renovaciones —con rotación de refresh tokens, eso invalida la sesión.
 *
 * Sobre dónde viven los tokens: el de acceso ya estaba en localStorage, así que
 * poner ahí el de renovación no cambia el modelo de amenaza —quien pueda leer
 * uno ya tiene la sesión—. Lo correcto a futuro es una cookie de sesión
 * administrada por el backend; queda anotado, no resuelto.
 * ============================================================================
 */

const CLAVE_TOKEN = 'syncro_token';
const CLAVE_REFRESH = 'syncro_refresh';
const CLAVE_EXPIRA = 'syncro_expira';

/** Se renueva con un minuto de sobra: una venta no debe correr contra el reloj. */
const MARGEN_MS = 60_000;

const ISSUER = (
  process.env.NEXT_PUBLIC_KEYCLOAK_ISSUER_URL ??
  'https://key-access.sumamexico.com/realms/suma'
).replace(/\/$/, '');
const CLIENT_ID = process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? 'syncro-erp';

const hayVentana = () => typeof window !== 'undefined';

function leer(clave: string): string {
  if (!hayVentana()) return '';
  try {
    return localStorage.getItem(clave) ?? '';
  } catch {
    return '';
  }
}

/* ── Token de acceso ─────────────────────────────────────────────────────── */

export const token = {
  get(): string {
    return leer(CLAVE_TOKEN);
  },
  set(valor: string) {
    try {
      localStorage.setItem(CLAVE_TOKEN, valor);
    } catch {
      /* modo privado o almacenamiento bloqueado: la sesión vive en memoria */
    }
  },
  clear() {
    detenerRenovacion();
    [
      CLAVE_TOKEN,
      CLAVE_REFRESH,
      CLAVE_EXPIRA,
      'syncro_user',
      'syncro_permisos',
    ].forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {
        /* nada que limpiar */
      }
    });
  },
};

/* ── Sesión completa ─────────────────────────────────────────────────────── */

export interface TokensKeycloak {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

export function guardarSesion(tokens: TokensKeycloak) {
  token.set(tokens.access_token);
  try {
    if (tokens.refresh_token) {
      localStorage.setItem(CLAVE_REFRESH, tokens.refresh_token);
    }
    // Si Keycloak no dice cuánto dura, se asume corto y se renueva pronto:
    // equivocarse por abajo cuesta una renovación de más; por arriba, la sesión.
    const segundos = Number(tokens.expires_in ?? 60);
    localStorage.setItem(CLAVE_EXPIRA, String(Date.now() + segundos * 1000));
  } catch {
    /* sin almacenamiento no hay renovación programada, sólo la sesión actual */
  }
  programarRenovacion();
}

function venceEn(): number {
  const valor = Number(leer(CLAVE_EXPIRA));
  return Number.isFinite(valor) && valor > 0 ? valor : 0;
}

/** ¿Falta poco para que el token deje de servir? */
export function porVencer(): boolean {
  const vence = venceEn();
  if (!vence) return false;
  return Date.now() >= vence - MARGEN_MS;
}

/* ── Renovación ──────────────────────────────────────────────────────────── */

let enVuelo: Promise<boolean> | null = null;
let temporizador: ReturnType<typeof setTimeout> | null = null;

/**
 * Pide un token nuevo con el de renovación. Devuelve false si ya no se puede,
 * que es la señal para mandar a la persona a identificarse otra vez.
 *
 * Varias llamadas simultáneas comparten la misma petición: con rotación de
 * refresh tokens, dos renovaciones en paralelo se anulan entre sí.
 */
export function renovarSesion(): Promise<boolean> {
  if (enVuelo) return enVuelo;

  const refresh = leer(CLAVE_REFRESH);
  if (!refresh) return Promise.resolve(false);

  enVuelo = (async () => {
    try {
      const respuesta = await fetch(
        `${ISSUER}/protocol/openid-connect/token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: CLIENT_ID,
            refresh_token: refresh,
          }),
        },
      );
      if (!respuesta.ok) return false;
      const tokens = (await respuesta.json()) as TokensKeycloak;
      if (!tokens.access_token) return false;
      guardarSesion(tokens);
      return true;
    } catch {
      // Sin red no se puede renovar, pero tampoco hay que cerrar la sesión:
      // el token actual puede seguir sirviendo cuando la red vuelva.
      return false;
    } finally {
      enVuelo = null;
    }
  })();

  return enVuelo;
}

/**
 * Se llama antes de cada petición. Si el token todavía sirve, no cuesta nada;
 * si está por vencer, la petición espera a la renovación en vez de salir con
 * un token muerto y provocar un 401.
 */
export async function asegurarSesion(): Promise<void> {
  if (!hayVentana() || !token.get() || !porVencer()) return;
  await renovarSesion();
}

/* ── Temporizador ────────────────────────────────────────────────────────── */

export function programarRenovacion() {
  if (!hayVentana()) return;
  detenerRenovacion();
  const vence = venceEn();
  if (!vence || !leer(CLAVE_REFRESH)) return;

  // Nunca menos de cinco segundos: si el token ya venció, se renueva enseguida
  // pero sin encadenar temporizadores instantáneos.
  const espera = Math.max(vence - Date.now() - MARGEN_MS, 5_000);
  temporizador = setTimeout(() => {
    void renovarSesion();
  }, espera);
}

export function detenerRenovacion() {
  if (temporizador) {
    clearTimeout(temporizador);
    temporizador = null;
  }
}

/**
 * Arranca el ciclo de vida de la sesión. Además del temporizador:
 *
 *  · `visibilitychange` y `focus`: los temporizadores no corren cuando el
 *    equipo está suspendido o la pestaña dormida. Al volver, el token puede
 *    llevar horas vencido; se renueva en ese momento.
 *  · `storage`: si otra pestaña renovó, esta reprograma con la fecha nueva en
 *    lugar de renovar por su cuenta.
 */
export function iniciarSesionVigilada(): () => void {
  if (!hayVentana()) return () => undefined;

  const alVolver = () => {
    if (document.visibilityState === 'visible') void asegurarSesion();
  };
  const alCambiarAlmacen = (e: StorageEvent) => {
    if (e.key === CLAVE_EXPIRA) programarRenovacion();
  };

  document.addEventListener('visibilitychange', alVolver);
  window.addEventListener('focus', alVolver);
  window.addEventListener('storage', alCambiarAlmacen);
  programarRenovacion();
  void asegurarSesion();

  return () => {
    document.removeEventListener('visibilitychange', alVolver);
    window.removeEventListener('focus', alVolver);
    window.removeEventListener('storage', alCambiarAlmacen);
    detenerRenovacion();
  };
}
