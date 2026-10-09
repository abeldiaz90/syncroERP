/**
 * ============================================================================
 * Los roles del ERP, declarados en el realm
 * ----------------------------------------------------------------------------
 * EL PASO 1 DE LA PROPUESTA
 *
 * Crea en Keycloak un rol de realm por cada plantilla del ERP, con el prefijo
 * `erp:` —`erp:empleado`, `erp:contador`, `erp:tesoreria`…—. A partir de ahí,
 * el rol de una persona se administra en un solo sitio: el ERP ya lee el del
 * token (ver `iam/utils/rol-del-token.ts`).
 *
 * EL PREFIJO NO ES DECORACIÓN
 *
 * El mismo realm autentica al ERP y al portal del core. Sin prefijo, un rol
 * llamado `contador` significaría dos cosas según quién lo lea, y eso no se
 * descubre hasta que alguien tiene las dos.
 *
 * POR QUÉ NO CREA NADA SI NO SE LO PIDEN
 *
 *     npm run keycloak:roles            · dice qué hay y qué falta. No toca nada.
 *     npm run keycloak:roles -- --crear · crea los que falten.
 *
 * Mirar antes de escribir, sobre el directorio que autentica a todo el mundo,
 * no es prudencia excesiva: es que el primer informe suele cambiar el plan.
 *
 * NO BORRA NUNCA
 *
 * Ni siquiera un `erp:` que ya no corresponda a ninguna plantilla. Un rol de
 * realm puede estar asignado a cien personas, y borrarlo se las quita a todas
 * en silencio. Si sobra, se dice y se deja: quitarlo es una decisión con
 * nombre y apellido.
 *
 * QUÉ HACE FALTA PARA QUE FUNCIONE
 *
 * La misma cuenta de servicio que ya usa el ERP
 * (`DIRECTORIO_CLIENT_ID` / `DIRECTORIO_CLIENT_SECRET`), pero con el rol
 * `manage-realm` de `realm-management` además de los que ya tiene. Si no lo
 * tiene, este guion lo dice **antes** de intentar nada, con el nombre exacto
 * del rol que falta: la alternativa es un 403 a mitad de camino con la mitad de
 * los roles creados.
 * ============================================================================
 */
import { config as cargarEnv } from 'dotenv';
import axios from 'axios';

/*
 * El entorno no se carga solo. Lo carga el ConfigModule de Nest cuando arranca
 * el servidor; un guion suelto lee `process.env` a secas y lo encuentra vacío.
 * La primera corrida en la máquina de SUMA dijo «falta configuración» teniendo
 * las tres variables puestas a un palmo: la pieza buena existía y el camino
 * real no la usaba.
 *
 * Y se leen los DOS archivos, en este orden. La instalación de SUMA tiene
 * `.env.local` y no `.env`, así que un `cargarEnv()` a secas —que busca `.env`
 * y nada más— habría seguido sin encontrar nada y habría dado el mismo mensaje
 * equivocado. `dotenv` no pisa lo que ya está puesto, así que el primero manda
 * y el segundo rellena lo que falte.
 */
cargarEnv({ path: '.env.local' });
cargarEnv();
import { PLANTILLAS_PERMISOS } from '../src/iam/data/plantillas-permisos';

/**
 * El prefijo que distingue los roles de este ERP de los del core.
 *
 * Vive aquí, en el guion, y no en el código del ERP, porque el ERP **todavía no
 * lee roles del token**: eso es el paso 2, que está escrito y guardado sin
 * aplicar (ver la propuesta, y la corrección del 10 de octubre que explica por
 * qué no se hizo antes de producción). El día que se retome, esta constante se
 * muda allá y el guion la importa.
 *
 * Declarar los roles en el realm antes de que nadie los lea no es prematuro: es
 * lo único de todo el plan que no cambia el comportamiento de nada. El realm
 * queda listo, y el ERP sigue leyendo el rol de la ficha como hasta hoy.
 */
export const PREFIJO_ROL_ERP = 'erp:';

interface RolDeRealm {
  id?: string;
  name?: string;
  description?: string;
}

const CREAR = process.argv.includes('--crear');

/** El emisor es `https://host/realms/X`; la administración, `/admin/realms/X`. */
function baseAdmin(issuer: string): string | null {
  const m = issuer.match(/^(https?:\/\/[^/]+)(?:\/.*)?\/realms\/([^/]+)$/);
  return m ? `${m[1]}/admin/realms/${m[2]}` : null;
}

function descripcionDe(rol: string): string {
  return `SyncroERP · rol ${rol}. Lo lee el ERP del token; la matriz de permisos vive en el ERP.`;
}

/** Los permisos de la cuenta de servicio vienen DENTRO de su propio token. */
function permisosDelToken(accessToken: string): string[] {
  try {
    const cuerpo = JSON.parse(
      Buffer.from(accessToken.split('.')[1], 'base64').toString('utf8'),
    ) as { resource_access?: Record<string, { roles?: string[] }> };
    return cuerpo.resource_access?.['realm-management']?.roles ?? [];
  } catch {
    return [];
  }
}

interface AjustesDeRealm {
  realm?: string;
  displayName?: string;
  internationalizationEnabled?: boolean;
  defaultLocale?: string;
  supportedLocales?: string[];
  ssoSessionIdleTimeout?: number;
  ssoSessionMaxLifespan?: number;
  accessTokenLifespan?: number;
  loginTheme?: string;
}

const enMinutos = (segundos: number | undefined) =>
  segundos === undefined ? '(sin declarar)' : `${Math.round(segundos / 60)} min`;

/**
 * Lo que el realm dice de sí mismo, para las dos decisiones que llevaban
 * semanas pendientes: cuánto dura la sesión y en qué idioma se ve la pantalla
 * de acceso.
 *
 * **No cambia nada.** Esas dos tocan a todo el mundo a la vez —acortar
 * `ssoSessionMaxLifespan` echa fuera a quien esté trabajando— y son del tipo de
 * ajuste que se hace mirando, no a ciegas desde un guion. Aquí sólo se leen y
 * se dice qué significan, que es lo que faltaba para poder decidir.
 *
 * Si la cuenta de servicio no puede leerlos, se dice y se sigue: el trabajo de
 * los roles no depende de esto.
 */
async function informarDelRealm(
  base: string,
  cabeceras: Record<string, string>,
): Promise<void> {
  let ajustes: AjustesDeRealm;
  try {
    const { data } = await axios.get<AjustesDeRealm>(base, {
      headers: cabeceras,
      timeout: 15_000,
    });
    ajustes = data ?? {};
  } catch {
    console.log(
      '\n  (No se pudieron leer los ajustes del realm: la cuenta de servicio\n' +
        '   necesitaría «view-realm». No hace falta para los roles.)',
    );
    return;
  }

  console.log('\n  ── Cómo está el realm ───────────────────────────────────');
  console.log(`  Token de acceso:      ${enMinutos(ajustes.accessTokenLifespan)}`);
  console.log(`  SSO Session Idle:     ${enMinutos(ajustes.ssoSessionIdleTimeout)}`);
  console.log(`  SSO Session Max:      ${enMinutos(ajustes.ssoSessionMaxLifespan)}`);
  console.log(
    `  Idiomas:              ${
      ajustes.internationalizationEnabled
        ? `activados · por omisión «${ajustes.defaultLocale ?? '?'}» · disponibles: ${(ajustes.supportedLocales ?? []).join(', ') || '(ninguno)'}`
        : 'desactivados — la pantalla de acceso sale en inglés'
    }`,
  );

  /*
   * Y qué significa cada cifra, porque un número sin su consecuencia no es un
   * dato: es un número.
   */
  const idle = ajustes.ssoSessionIdleTimeout;
  const max = ajustes.ssoSessionMaxLifespan;
  if (idle !== undefined && idle < 30 * 60) {
    console.log(
      `  · Con ${enMinutos(idle)} de inactividad la sesión muere. Para un cajero\n` +
        '    que atiende y espera, eso es volver a entrar varias veces al día.',
    );
  }
  if (max !== undefined && max <= 10 * 60 * 60) {
    console.log(
      `  · SSO Session Max de ${enMinutos(max)}: a quien empiece a las 8 lo echa\n` +
        '    antes de acabar la jornada, esté trabajando o no.',
    );
  }
  if (!ajustes.internationalizationEnabled) {
    console.log(
      '  · Sin idiomas activados no se puede poner la pantalla de acceso en\n' +
        '    español. Es lo primero que ve cualquiera.',
    );
  }
  console.log('  Nada de esto se cambia desde aquí: sólo se informa.');
}

async function main(): Promise<void> {
  const issuer = (process.env.KEYCLOAK_ISSUER_URL ?? '').replace(/\/$/, '');
  const clientId = process.env.DIRECTORIO_CLIENT_ID ?? '';
  const clientSecret = process.env.DIRECTORIO_CLIENT_SECRET ?? '';

  console.log('── Roles del ERP en el realm ─────────────────────────────');

  if (!issuer || !clientId || !clientSecret) {
    console.error(
      '  Falta configuración. Hacen falta KEYCLOAK_ISSUER_URL, DIRECTORIO_CLIENT_ID\n' +
        '  y DIRECTORIO_CLIENT_SECRET, las mismas que ya usa el ERP para el directorio.',
    );
    process.exitCode = 1;
    return;
  }

  const base = baseAdmin(issuer);
  if (!base) {
    console.error(
      `  KEYCLOAK_ISSUER_URL no tiene forma de emisor de realm: ${issuer}\n` +
        '  Se espera algo como https://host/realms/suma',
    );
    process.exitCode = 1;
    return;
  }
  console.log(`  Realm: ${base}`);

  /* ── La sesión de la cuenta de servicio ─────────────────────────────── */
  let token: string;
  try {
    const { data } = await axios.post<{ access_token: string }>(
      `${issuer}/protocol/openid-connect/token`,
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10_000,
      },
    );
    token = data.access_token;
  } catch (e) {
    console.error(
      `  El directorio no aceptó la cuenta de servicio: ${(e as Error).message}`,
    );
    process.exitCode = 1;
    return;
  }

  /*
   * Lo que puede hacer, dicho antes de chocar. Es el mismo criterio que ya
   * sigue el diagnóstico del ERP: los permisos se leen del propio token, que
   * es exactamente lo que Keycloak mirará cuando llegue la petición.
   */
  const permisos = permisosDelToken(token);
  const puedeCrear =
    permisos.includes('manage-realm') || permisos.includes('realm-admin');
  console.log(`  Permisos de la cuenta: ${permisos.join(', ') || '(ninguno)'}`);

  if (CREAR && !puedeCrear) {
    console.error(
      '\n  La cuenta de servicio no tiene «manage-realm», así que no puede crear roles.\n' +
        '  En Keycloak: Clients → ' +
        clientId +
        ' → Service account roles → Assign role →\n' +
        '  filtrar por «realm-management» → manage-realm.\n\n' +
        '  No se intenta nada: a mitad de camino quedarían unos roles creados y otros no.',
    );
    process.exitCode = 1;
    return;
  }

  const cabeceras = { Authorization: `Bearer ${token}` };

  /* ── Cómo está el realm, que es lo que nadie había mirado ───────────── */
  await informarDelRealm(base, cabeceras);

  /* ── Lo que ya hay ──────────────────────────────────────────────────── */
  let existentes: RolDeRealm[];
  try {
    const { data } = await axios.get<RolDeRealm[]>(`${base}/roles`, {
      headers: cabeceras,
      timeout: 15_000,
      params: { max: 2000 },
    });
    existentes = Array.isArray(data) ? data : [];
  } catch (e) {
    console.error(`  No se pudieron leer los roles del realm: ${(e as Error).message}`);
    process.exitCode = 1;
    return;
  }

  const nombres = new Set(existentes.map((r) => String(r.name ?? '')));
  const esperados = PLANTILLAS_PERMISOS.map((p) => `${PREFIJO_ROL_ERP}${p.rol}`);
  /*
   * El administrador no tiene plantilla —no la necesita, atraviesa los
   * controles— pero sí es un rol del sistema, y el ERP lo acepta del token
   * SÓLO si la ficha ya lo decía. Se declara para que exista donde se
   * administra todo lo demás.
   */
  esperados.push(`${PREFIJO_ROL_ERP}administrador`);

  const faltan = esperados.filter((r) => !nombres.has(r));
  const sobran = [...nombres].filter(
    (n) => n.startsWith(PREFIJO_ROL_ERP) && !esperados.includes(n),
  );

  console.log(`\n  Declarados en el ERP: ${esperados.length}`);
  console.log(`  Ya existen en el realm: ${esperados.length - faltan.length}`);
  console.log(`  Faltan: ${faltan.length}`);
  for (const r of faltan) console.log(`   · ${r}`);

  if (sobran.length) {
    console.log(
      `\n  Con prefijo «${PREFIJO_ROL_ERP}» y sin plantilla en el ERP: ${sobran.length}`,
    );
    for (const r of sobran) console.log(`   · ${r}`);
    console.log(
      '  No se borran. Un rol de realm puede estar asignado a mucha gente, y\n' +
        '  borrarlo se lo quita a todos en silencio. Si sobran, quítalos a mano.',
    );
  }

  if (!faltan.length) {
    console.log('\n  No hay nada que crear.');
    return;
  }

  if (!CREAR) {
    console.log(
      '\n  Esto es sólo el informe: no se ha tocado nada.\n' +
        '  Para crearlos:  npm run keycloak:roles -- --crear',
    );
    return;
  }

  /* ── Crear los que faltan ───────────────────────────────────────────── */
  console.log('\n  Creando…');
  let creados = 0;
  const fallos: string[] = [];
  for (const nombre of faltan) {
    try {
      await axios.post(
        `${base}/roles`,
        { name: nombre, description: descripcionDe(nombre.slice(PREFIJO_ROL_ERP.length)) },
        { headers: cabeceras, timeout: 15_000 },
      );
      creados++;
      console.log(`   · ${nombre} ✓`);
    } catch (e) {
      /*
       * 409 es «ya existía»: puede pasar si alguien lo creó entre la lectura y
       * esta escritura. No es un fallo, es la carrera benigna.
       */
      const status = (e as { response?: { status?: number } }).response?.status;
      if (status === 409) {
        console.log(`   · ${nombre} (ya existía)`);
        continue;
      }
      fallos.push(`${nombre}: ${(e as Error).message}`);
      console.log(`   · ${nombre} MAL`);
    }
  }

  console.log('──────────────────────────────────────────────────────────');
  if (fallos.length) {
    console.error(`  ${creados} creados, ${fallos.length} sin crear:`);
    for (const f of fallos) console.error(`   · ${f}`);
    process.exitCode = 1;
    return;
  }
  console.log(`  ${creados} roles creados.`);
  console.log(
    '\n  Lo que sigue: asignarle a cada persona su rol en Keycloak (Users →\n' +
      '  Role mapping). El ERP ya lo lee del token, y mientras una persona no\n' +
      '  tenga ninguno, sigue valiendo el de su ficha, igual que hasta hoy.',
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
