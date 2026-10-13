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
/**
 * Marca de «alguien está renovando ahora mismo», compartida entre pestañas.
 *
 * ── EL CANDADO ERA POR PESTAÑA ────────────────────────────────────────
 * El encabezado de este archivo nombra el riesgo —«con rotación de refresh
 * tokens, dos renovaciones en paralelo se anulan entre sí»— y pone un candado
 * para evitarlo. Pero `enVuelo` es una variable de módulo: junta las veinte
 * peticiones de UNA pestaña y no sabe nada de las demás.
 *
 * Con el ERP abierto en tres pestañas —lo normal: el área de trabajo, la caja
 * y un reporte— hay tres temporizadores apuntando al mismo minuto. La primera
 * renovación rota el token; las otras dos llegan con uno ya gastado, Keycloak
 * las rechaza, y según la configuración del realm eso puede tumbar la sesión
 * entera. El candado que el archivo creía tener no cubría el caso para el que
 * se escribió.
 *
 * localStorage no da exclusión real, pero sí basta para que las otras esperen
 * al resultado de la primera en vez de competir con ella.
 */
const CLAVE_RENOVANDO = 'syncro_renovando';
/** Cuánto se respeta la marca ajena antes de darla por abandonada. */
const VENTANA_RENOVACION_MS = 10_000;

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
      CLAVE_RENOVANDO,
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
  /**
   * Cuánto dura el token de RENOVACIÓN. Keycloak lo manda en cada respuesta y
   * refleja el *SSO Session Idle* del realm. Ver `guardarSesion`.
   */
  refresh_expires_in?: number;
}

/**
 * ============================================================================
 * LA SESIÓN NO MUERE CUANDO VENCE EL TOKEN DE ACCESO
 * ----------------------------------------------------------------------------
 * CÓMO SALIÓ
 *
 * 13-oct. El ERP dejaba a la persona en /login a los ~15 minutos de no tocarlo,
 * con toda esta maquinaria puesta y funcionando. Se había dado por hecho que
 * era cosa de la automatización —una pestaña en segundo plano con el
 * temporizador estrangulado—, hasta que el portal de Fineract, en una pestaña
 * igual de inactiva, aguantó la noche entera. Esa asimetría era el dato.
 *
 * Keycloak manda DOS plazos en cada respuesta:
 *
 *     expires_in          cuándo deja de servir el token de acceso    (60 min)
 *     refresh_expires_in  cuándo deja de poderse renovar — el idle    (~15 min)
 *
 * Aquí sólo se leía el primero. Con un acceso de sesenta minutos el
 * temporizador se programaba para el minuto 59, y la sesión moría en el 15 por
 * el otro lado: Keycloak cierra la sesión por inactividad, y a partir de ahí el
 * token de acceso —criptográficamente válido todavía— lo rechaza el servidor
 * con «emitido antes del cierre de sesión». El temporizador no llegaba a correr
 * ni una vez.
 *
 * O sea: se renovaba contra el plazo que no mandaba. El archivo entero está
 * escrito para que no pase justo esto —«una venta a la mitad con el cliente
 * enfrente»— y lo seguía permitiendo por mirar el reloj equivocado.
 *
 * QUÉ SE GUARDA AHORA
 *
 * El plazo EFECTIVO: el menor de los dos. Renovar antes de que venza el de
 * renovación reinicia la ventana de inactividad, así que la sesión se sostiene
 * mientras la aplicación esté abierta, que es lo que esta pieza prometía.
 *
 * No cambia la decisión de cuánto dura una sesión: ésa es del realm —*SSO
 * Session Idle* y *SSO Session Max*—. Lo que cambia es que trabajar con el ERP
 * abierto ya no la deja morir sola.
 * ============================================================================
 */
export function guardarSesion(tokens: TokensKeycloak) {
  token.set(tokens.access_token);
  try {
    if (tokens.refresh_token) {
      localStorage.setItem(CLAVE_REFRESH, tokens.refresh_token);
    }
    // Si Keycloak no dice cuánto dura, se asume corto y se renueva pronto:
    // equivocarse por abajo cuesta una renovación de más; por arriba, la sesión.
    const acceso = Number(tokens.expires_in ?? 60);
    /*
     * El de renovación sólo acorta, nunca alarga: si no viene, o viene basura,
     * se queda el del acceso y estamos como antes —que era lo correcto para el
     * token de acceso, sólo que incompleto—.
     */
    const renovacion = Number(tokens.refresh_expires_in);
    const segundos =
      Number.isFinite(renovacion) && renovacion > 0
        ? Math.min(acceso, renovacion)
        : acceso;
    localStorage.setItem(CLAVE_EXPIRA, String(Date.now() + segundos * 1000));
  } catch {
    /* sin almacenamiento no hay renovación programada, sólo la sesión actual */
  }
  programarRenovacion();
}

/**
 * Cuándo caduca el token de RENOVACIÓN, leído del propio token.
 *
 * ── POR QUÉ NO BASTA CON `refresh_expires_in` ──────────────────────────────
 * MEDIDO EL 13-OCT-2026, contra el sistema corriendo. Tras desplegar el
 * arreglo que guarda el menor de los dos plazos, el navegador seguía diciendo
 * que a la sesión le quedaban 43 minutos mientras el token de renovación
 * caducaba en 13. El arreglo estaba servido —el bundle ya traía el campo— pero
 * la fecha la había escrito el código viejo al iniciar sesión, y nadie la
 * volvía a mirar.
 *
 * O sea: un arreglo que sólo entra en vigor en el siguiente inicio de sesión
 * deja a todo el que ya estaba dentro con la avería puesta. Y no hacía falta
 * preguntarle a nadie: el token de renovación es un JWT y lleva su propia
 * fecha. Es la fuente autorizada, está en la mano, y leerla no cuesta una
 * petición.
 *
 * Así que el plazo se corrige en cada lectura. Además de curar las fechas
 * viejas, cubre el caso de un Keycloak que no mande `refresh_expires_in`.
 *
 * Devuelve 0 cuando no hay token, no es un JWT —puede ser opaco— o no trae
 * `exp`. Cero significa «no se sabe», y quien llama ya sabe qué hacer con eso.
 */
function venceElRefresh(): number {
  const bruto = leer(CLAVE_REFRESH);
  if (!bruto) return 0;
  try {
    const cuerpo = bruto.split('.')[1];
    if (!cuerpo) return 0;
    const json = atob(cuerpo.replace(/-/g, '+').replace(/_/g, '/'));
    const exp = Number((JSON.parse(json) as { exp?: unknown }).exp);
    return Number.isFinite(exp) && exp > 0 ? exp * 1000 : 0;
  } catch {
    /* No es un JWT, o viene mal. No se sabe, y no se inventa. */
    return 0;
  }
}

/**
 * El plazo EFECTIVO de la sesión: lo que ocurra antes, que deje de servir el
 * token de acceso o que ya no se pueda renovar.
 *
 * El del refresh sólo acorta, nunca alarga: si no se puede leer, se queda la
 * fecha guardada, que es lo que había siempre.
 */
function venceEn(): number {
  const valor = Number(leer(CLAVE_EXPIRA));
  const guardado = Number.isFinite(valor) && valor > 0 ? valor : 0;
  const refresh = venceElRefresh();
  if (!guardado) return refresh;
  if (!refresh) return guardado;
  return Math.min(guardado, refresh);
}

/**
 * ¿Falta poco para que el token deje de servir?
 *
 * ── NO SABER CUÁNDO VENCE NO ES «TODAVÍA SIRVE» ────────────────────────
 * MEDIDO EL 7-OCT-2026: la sesión del ERP se cayó sola dos veces en una
 * mañana, y el almacén del navegador explicaba por qué: estaban el token de
 * acceso y el de renovación, y `syncro_expira` valía `null`.
 *
 * Con la fecha ausente, esto contestaba `false` —«no está por vencer»— y
 * `programarRenovacion` se iba sin programar nada. O sea: había con qué
 * renovar, nadie lo intentó ni una vez, y la sesión murió al vencer el
 * acceso. En una pantalla de consulta es una molestia; en el punto de venta es
 * una venta a la mitad con el cliente enfrente, que es la frase con la que
 * empieza este archivo.
 *
 * Una fecha que falta es una pregunta sin respuesta, y la respuesta segura es
 * renovar: equivocarse por abajo cuesta una renovación de más; por arriba, la
 * sesión. Es el mismo criterio que ya aplica `guardarSesion` cuando Keycloak
 * no dice `expires_in`; aquí no se había aplicado.
 */
export function porVencer(): boolean {
  const vence = venceEn();
  if (!vence) return Boolean(leer(CLAVE_REFRESH));
  return Date.now() >= vence - MARGEN_MS;
}

/* ── Renovación ──────────────────────────────────────────────────────────── */

let enVuelo: Promise<boolean> | null = null;
let temporizador: ReturnType<typeof setTimeout> | null = null;
/** Cuándo falló la última renovación, para no insistir en cada petición. */
let ultimoFallo = 0;
const ESPERA_TRAS_FALLO_MS = 30_000;

/** ¿Otra pestaña dejó su marca hace poco? */
function otraPestanaRenueva(): boolean {
  const marca = Number(leer(CLAVE_RENOVANDO));
  if (!Number.isFinite(marca) || marca <= 0) return false;
  /*
   * Una marca del futuro o muy vieja es basura —reloj cambiado, pestaña que
   * se cerró a mitad— y no debe bloquear la renovación para siempre.
   */
  const edad = Date.now() - marca;
  return edad >= 0 && edad < VENTANA_RENOVACION_MS;
}

function marcarRenovando() {
  try {
    localStorage.setItem(CLAVE_RENOVANDO, String(Date.now()));
  } catch {
    /* sin almacén no hay candado compartido; queda el de la pestaña */
  }
}

function soltarMarca() {
  try {
    localStorage.removeItem(CLAVE_RENOVANDO);
  } catch {
    /* nada que soltar */
  }
}

/**
 * Espera a que la pestaña que tiene la marca termine. Se mira el token de
 * renovación y no la fecha: con rotación, lo que cambia es el token, y si el
 * realm no rota, la fecha nueva llega igual por `guardarSesion`.
 */
async function esperarRenovacionAjena(refreshViejo: string): Promise<boolean> {
  const limite = Date.now() + VENTANA_RENOVACION_MS;
  while (Date.now() < limite) {
    await new Promise((listo) => setTimeout(listo, 250));
    if (!otraPestanaRenueva()) break;
    if (leer(CLAVE_REFRESH) !== refreshViejo) return true;
  }
  /*
   * O terminó bien —y el token ya es otro— o la otra pestaña se fue sin
   * soltar la marca. En el segundo caso no se insiste aquí: la siguiente
   * petición lo intentará con la marca ya caducada, que es el camino normal.
   */
  return leer(CLAVE_REFRESH) !== refreshViejo;
}

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

  /*
   * Y un freno. Sin fecha de vencimiento, `porVencer` contesta que sí en cada
   * petición: si la renovación está fallando —Keycloak caído, refresh ya
   * rotado— cada pantalla dispararía la suya contra el mismo muro. El candado
   * de arriba sólo junta las simultáneas, no las seguidas.
   */
  if (Date.now() - ultimoFallo < ESPERA_TRAS_FALLO_MS) {
    return Promise.resolve(false);
  }

  /*
   * Si otra pestaña ya está renovando, esta espera su resultado. Competir
   * significaría mandar un refresh token que la otra acaba de rotar.
   */
  if (otraPestanaRenueva()) {
    enVuelo = esperarRenovacionAjena(refresh).finally(() => {
      enVuelo = null;
    });
    return enVuelo;
  }
  marcarRenovando();

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
      if (!respuesta.ok) {
        ultimoFallo = Date.now();
        return false;
      }
      const tokens = (await respuesta.json()) as TokensKeycloak;
      if (!tokens.access_token) {
        ultimoFallo = Date.now();
        return false;
      }
      ultimoFallo = 0;
      guardarSesion(tokens);
      return true;
    } catch {
      // Sin red no se puede renovar, pero tampoco hay que cerrar la sesión:
      // el token actual puede seguir sirviendo cuando la red vuelva.
      ultimoFallo = Date.now();
      return false;
    } finally {
      soltarMarca();
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
  if (!leer(CLAVE_REFRESH)) return;
  const vence = venceEn();

  // Nunca menos de cinco segundos: si el token ya venció, se renueva enseguida
  // pero sin encadenar temporizadores instantáneos.
  //
  // Y sin fecha también se programa, por lo mismo que `porVencer`: lo que
  // hacía antes era irse sin programar nada, y entonces el único camino que
  // quedaba era el de las peticiones —que tampoco renovaba, porque preguntaba
  // a `porVencer`—. Dos puertas cerradas por el mismo dato que falta.
  const espera = vence
    ? Math.max(vence - Date.now() - MARGEN_MS, 5_000)
    : 5_000;
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
