import { API_URL } from './api';
import { guardarSesion, token } from './sesion';

const ISSUER = (
  process.env.NEXT_PUBLIC_KEYCLOAK_ISSUER_URL ??
  'https://key-access.sumamexico.com/realms/suma'
).replace(/\/$/, '');
const CLIENT_ID = process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? 'syncro-erp';

const CLAVE_VERIFICADOR = 'syncro_oidc_verifier';
const CLAVE_ESTADO = 'syncro_oidc_state';
const CLAVE_NONCE = 'syncro_oidc_nonce';
const CLAVE_DESTINO = 'syncro_oidc_next';
const CLAVE_ID_TOKEN = 'syncro_id_token';

function base64Url(bytes: Uint8Array): string {
  let binario = '';
  bytes.forEach((byte) => (binario += String.fromCharCode(byte)));
  return btoa(binario)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function aleatorio(bytes = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function retoPkce(verificador: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verificador),
  );
  return base64Url(new Uint8Array(digest));
}

function redirectUri(): string {
  return (
    process.env.NEXT_PUBLIC_KEYCLOAK_REDIRECT_URI ??
    `${window.location.origin}/auth/callback`
  );
}

function postLogoutUri(): string {
  return (
    process.env.NEXT_PUBLIC_KEYCLOAK_POST_LOGOUT_URI ??
    `${window.location.origin}/login`
  );
}

function decodificarPayload(jwt: string): Record<string, unknown> {
  const segmento = jwt.split('.')[1] ?? '';
  const normal = segmento.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(
    atob(normal + '='.repeat((4 - (normal.length % 4)) % 4)),
    (c) => c.charCodeAt(0),
  );
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function iniciarSesionKeycloak(destino = '/dashboard') {
  const verificador = aleatorio(48);
  const estado = aleatorio();
  const nonce = aleatorio();
  sessionStorage.setItem(CLAVE_VERIFICADOR, verificador);
  sessionStorage.setItem(CLAVE_ESTADO, estado);
  sessionStorage.setItem(CLAVE_NONCE, nonce);
  sessionStorage.setItem(
    CLAVE_DESTINO,
    destino.startsWith('/') && !destino.startsWith('//') ? destino : '/dashboard',
  );

  const parametros = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'code',
    response_mode: 'query',
    scope: 'openid profile email',
    state: estado,
    nonce,
    code_challenge: await retoPkce(verificador),
    code_challenge_method: 'S256',
  });
  window.location.assign(
    `${ISSUER}/protocol/openid-connect/auth?${parametros.toString()}`,
  );
}

export async function completarSesionKeycloak(query: URLSearchParams) {
  const error = query.get('error');
  if (error) {
    throw new Error(query.get('error_description') ?? error);
  }
  const code = query.get('code');
  const estado = query.get('state');
  const esperado = sessionStorage.getItem(CLAVE_ESTADO);
  const verificador = sessionStorage.getItem(CLAVE_VERIFICADOR);
  const nonce = sessionStorage.getItem(CLAVE_NONCE);
  if (!code || !estado || estado !== esperado || !verificador || !nonce) {
    throw new Error('La respuesta de identidad no corresponde a esta sesión.');
  }

  const respuesta = await fetch(`${ISSUER}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      redirect_uri: redirectUri(),
      code_verifier: verificador,
    }),
  });
  const tokens = (await respuesta.json()) as {
    access_token?: string;
    id_token?: string;
    // Keycloak siempre lo manda en este flujo; antes se descartaba y por eso
    // no había forma de renovar la sesión.
    refresh_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!respuesta.ok || !tokens.access_token || !tokens.id_token) {
    throw new Error(tokens.error_description ?? 'Keycloak no emitió la sesión.');
  }
  if (decodificarPayload(tokens.id_token).nonce !== nonce) {
    throw new Error('La respuesta de Keycloak tiene un nonce inválido.');
  }

  guardarSesion({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_in: tokens.expires_in,
  });
  sessionStorage.setItem(CLAVE_ID_TOKEN, tokens.id_token);
  /*
   * El token ya quedó guardado arriba, así que a partir de aquí CUALQUIER
   * salida sin `syncro_user` deja media sesión en el navegador: token válido y
   * ninguna identidad del ERP. Y media sesión no falla de forma visible —el rol
   * cae a «empleado» por omisión y el menú se vacía—, así que un administrador
   * aparece de pronto sin permisos y parece que alguien le quitó el rol.
   *
   * Pasó de verdad: bastó iniciar sesión mientras el backend del ERP estaba
   * reiniciándose. El `catch` cubre la caída de red, que antes escapaba sin
   * limpiar nada porque sólo se contemplaba la respuesta con error.
   */
  let sesion: Response;
  try {
    sesion = await fetch(`${API_URL}/auth/sesion`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
  } catch {
    token.clear();
    throw new Error(
      'No se pudo contactar a Syncro ERP para leer tu identidad. Verifica que el servicio esté arriba y vuelve a entrar.',
    );
  }
  const datos = await sesion.json().catch(() => ({}));
  if (!sesion.ok) {
    token.clear();
    throw new Error(
      typeof datos?.message === 'string'
        ? datos.message
        : 'Tu identidad SUMA no tiene acceso a Syncro ERP.',
    );
  }
  if (!datos?.usuario?.rol) {
    // Sin rol no hay sesión utilizable. Mejor no entrar que entrar degradado.
    token.clear();
    throw new Error('Syncro ERP no devolvió tu rol. Vuelve a iniciar sesión.');
  }
  localStorage.setItem('syncro_user', JSON.stringify(datos.usuario ?? {}));
  localStorage.setItem('syncro_permisos', JSON.stringify(datos.permisos ?? {}));

  const destino = sessionStorage.getItem(CLAVE_DESTINO) ?? '/dashboard';
  [CLAVE_VERIFICADOR, CLAVE_ESTADO, CLAVE_NONCE, CLAVE_DESTINO].forEach((k) =>
    sessionStorage.removeItem(k),
  );
  return destino;
}

export function cerrarSesionKeycloak() {
  const idToken = sessionStorage.getItem(CLAVE_ID_TOKEN);
  token.clear();
  sessionStorage.removeItem(CLAVE_ID_TOKEN);
  const parametros = new URLSearchParams({
    client_id: CLIENT_ID,
    post_logout_redirect_uri: postLogoutUri(),
  });
  if (idToken) parametros.set('id_token_hint', idToken);
  window.location.assign(
    `${ISSUER}/protocol/openid-connect/logout?${parametros.toString()}`,
  );
}
