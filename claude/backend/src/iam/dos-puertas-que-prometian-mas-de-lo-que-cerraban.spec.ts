import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Repository } from 'typeorm';

import { JwtStrategy } from './strategies/jwt.strategy';
import { Usuario } from './entities/usuario.entity';
import { IdentidadEmpresaService } from './services/identidad-empresa.service';

/**
 * ============================================================================
 * DOS PUERTAS QUE PROMETÍAN MÁS DE LO QUE CERRABAN
 * ----------------------------------------------------------------------------
 * Las dos salieron del barrido de aislamiento multiempresa del 6-oct-2026, y
 * son la misma forma: un control que el código DESCRIBE con palabras correctas
 * y que, leído de verdad, no hace eso.
 *
 * ── 1. SUSPENDER UNA IDENTIDAD ABRÍA UNA PUERTA ────────────────────────────
 *
 * `IdentidadEmpresaService.suspender` se documenta así:
 *
 *     «Borrar la fila devolvería la empresa al emisor del entorno —el realm
 *      compartido—, que es una puerta ABIERTA, no cerrada. Suspender la deja
 *      sin emisor aceptado, que es lo que se quiere cuando un cliente se va o
 *      hay una sospecha.»
 *
 * Pero `deEmpresa` resolvía así:
 *
 *     fila && fila.estado === 'ACTIVA' ? desdeFila(fila) : desdeEntorno()
 *
 * SUSPENDIDA no es ACTIVA, así que caía a `desdeEntorno()` — **el realm
 * compartido**. Suspender no dejaba a la empresa sin emisor aceptado: le
 * cambiaba cuál. Y el realm compartido es precisamente donde tienen cuenta las
 * personas de una empresa que migró desde ahí a realm propio, que es el caso
 * que se suspende.
 *
 * ── 2. CERRAR SESIÓN NO CERRABA NADA CON KEYCLOAK ──────────────────────────
 *
 * `logout()` sube `tokenVersion`, y la estrategia compara ese contador **sólo
 * en modo local**. En modo `keycloak` —el obligatorio de esta instalación—
 * `validarKeycloak` nunca lo miraba, porque el token lo firma el directorio y
 * no lleva ese campo.
 *
 * El botón escribía en la base, no revocaba nada, y la pantalla contestaba
 * «Sesión cerrada correctamente». Desactivar al usuario SÍ surtía efecto
 * inmediato —la rama relee la fila y mira `activo`—, así que la vía de
 * emergencia existía; la normal, no.
 * ============================================================================
 */

const ENTORNO = {
  AUTH_MODE: 'keycloak',
  KEYCLOAK_ISSUER_URL: 'https://key-access.sumamexico.com/realms/suma',
  KEYCLOAK_CLIENT_ID: 'syncro-erp',
};
const EMISOR_ENTORNO = ENTORNO.KEYCLOAK_ISSUER_URL;
const EMISOR_A = 'https://key-access.sumamexico.com/realms/cliente-a';

const config = () =>
  ({
    get: (c: string, pd?: string) =>
      (ENTORNO as Record<string, string>)[c] ?? pd,
    getOrThrow: (c: string) => (ENTORNO as Record<string, string>)[c],
  }) as unknown as ConfigService;

/** Identidades de mentira. `origen` es lo que decide el acceso. */
const identidades = (origen: 'empresa' | 'entorno' | 'suspendida') =>
  ({
    emisoresAceptados: async () =>
      new Map<string, string>([
        [EMISOR_ENTORNO, 'entorno'],
        ...(origen === 'empresa'
          ? ([[EMISOR_A, 'empresa-a']] as Array<[string, string]>)
          : []),
      ]),
    emisorAceptado: async (e: string) =>
      e.replace(/\/$/, '') === EMISOR_ENTORNO ||
      (origen === 'empresa' && e.replace(/\/$/, '') === EMISOR_A),
    deEmpresa: async () => ({
      origen,
      emisor: origen === 'entorno' ? EMISOR_ENTORNO : EMISOR_A,
      realm: origen === 'entorno' ? 'suma' : 'cliente-a',
      clientIdPublico:
        origen === 'entorno' ? ENTORNO.KEYCLOAK_CLIENT_ID : 'erp-cliente-a',
      clientIdProvisionador: null,
      secretoProvisionador: null,
      dominiosPermitidos: [],
    }),
  }) as unknown as IdentidadEmpresaService;

const usuarioDe = (extra: Record<string, unknown> = {}) => ({
  id: 'u1',
  email: 'persona@sumamexico.com',
  empresaId: 'empresa-a',
  rol: 'ADMIN',
  nombreCompleto: 'Persona',
  activo: true,
  emailVerificado: true,
  keycloakSubject: 'sub-1',
  sesionesValidasDesde: null as Date | null,
  empresa: { activo: true },
  ...extra,
});

const repo = (usuario: unknown) =>
  ({
    findOne: async () => usuario,
    save: async (u: unknown) => u,
    createQueryBuilder: () => ({
      leftJoinAndSelect() {
        return this;
      },
      where() {
        return this;
      },
      getOne: async () => usuario,
    }),
  }) as unknown as Repository<Usuario>;

const estrategia = (
  origen: 'empresa' | 'entorno' | 'suspendida',
  usuario: unknown,
) => new JwtStrategy(config(), repo(usuario), identidades(origen));

/** Un token del realm compartido, que es el que la suspensión dejaba pasar. */
const tokenDelEntorno = (extra: Record<string, unknown> = {}) => ({
  sub: 'sub-1',
  email: 'persona@sumamexico.com',
  email_verified: true,
  iss: EMISOR_ENTORNO,
  azp: ENTORNO.KEYCLOAK_CLIENT_ID,
  ...extra,
});

const falla = async (f: () => Promise<unknown>, texto: RegExp) => {
  let mensaje = '(no lanzó)';
  try {
    await f();
  } catch (e) {
    mensaje = e instanceof Error ? e.message : String(e);
  }
  expect(mensaje).toMatch(texto);
};

describe('una identidad suspendida no acepta a nadie', () => {
  it('ni siquiera por el realm compartido, que es por donde se colaba', async () => {
    /*
     * ÉSTE ES EL DEFECTO, escrito como no puede volver. Antes `deEmpresa`
     * devolvía `origen: 'entorno'` para una fila SUSPENDIDA y este token
     * entraba: el usuario existe, está activo, su empresa está activa, y el
     * emisor del entorno es aceptado. Todo en verde, con el cliente suspendido.
     */
    const s = estrategia('suspendida', usuarioDe());

    await falla(
      () =>
        (s as unknown as {
          validarKeycloak: (p: unknown) => Promise<unknown>;
        }).validarKeycloak(tokenDelEntorno()),
      /suspendido/i,
    );
  });

  it('y tampoco por el suyo propio', async () => {
    const s = estrategia('suspendida', usuarioDe());

    await falla(
      () =>
        (s as unknown as {
          validarKeycloak: (p: unknown) => Promise<unknown>;
        }).validarKeycloak(tokenDelEntorno({ iss: EMISOR_A })),
      /suspendido|no proviene de un directorio reconocido/i,
    );
  });

  it('una empresa SIN identidad propia sigue entrando por el compartido', async () => {
    /*
     * La otra mitad, y la que importa para no romper nada: la instalación de
     * hoy son empresas sin realm propio. El arreglo no puede dejarlas fuera.
     */
    const s = estrategia('entorno', usuarioDe({ empresaId: 'empresa-sin-realm' }));

    const r = (await (s as unknown as {
      validarKeycloak: (p: unknown) => Promise<{ empresaId: string }>;
    }).validarKeycloak(tokenDelEntorno())) as { empresaId: string };

    expect(r.empresaId).toBe('empresa-sin-realm');
  });
});

describe('el resolvedor de identidad dice la verdad de los tres estados', () => {
  /*
   * Estructural sobre `deEmpresa`, porque es donde vive la decisión y porque el
   * mutante evidente —volver al ternario de antes— tiene que ponerse rojo.
   */
  const servicio = readFileSync(
    join(__dirname, 'services', 'identidad-empresa.service.ts'),
    'utf8',
  );

  it('SUSPENDIDA se resuelve como suspendida, no como entorno', () => {
    expect(servicio).toMatch(
      /if \(fila && fila\.estado === 'SUSPENDIDA'\) \{\s*\n\s*valor = \{ \.\.\.this\.desdeFila\(fila\), origen: 'suspendida' \};/,
    );
  });

  it('y el tipo admite ese tercer valor, que es lo que lo hace comprobable', () => {
    expect(servicio).toMatch(/origen: 'empresa' \| 'entorno' \| 'suspendida';/);
  });

  it('APROVISIONANDO sigue cayendo al entorno, a propósito', () => {
    /*
     * Es el camino por el que una empresa llega a tener realm propio. Cerrarlo
     * ahí dejaría a la empresa fuera a mitad del alta, y su realm propio todavía
     * no está en `emisoresAceptados()` porque ésa sólo lista las ACTIVAS.
     *
     * Queda escrito para que no se "uniforme" con SUSPENDIDA de un plumazo.
     */
    expect(servicio).toMatch(
      /fila && fila\.estado === 'ACTIVA' \? this\.desdeFila\(fila\) : this\.desdeEntorno\(\)/,
    );
  });

  it('y los emisores aceptados siguen siendo sólo los de las identidades ACTIVAS', () => {
    expect(servicio).toMatch(/find\(\{ where: \{ estado: 'ACTIVA' \} \}\)/);
  });
});

describe('cerrar sesión revoca también cuando la identidad la lleva Keycloak', () => {
  it('un token emitido antes del cierre de sesión ya no vale', async () => {
    const corte = new Date('2026-10-06T12:00:00Z');
    const s = estrategia('entorno', usuarioDe({ sesionesValidasDesde: corte }));

    await falla(
      () =>
        (s as unknown as {
          validarKeycloak: (p: unknown) => Promise<unknown>;
        }).validarKeycloak(
          tokenDelEntorno({ iat: Math.floor(corte.getTime() / 1000) - 60 }),
        ),
      /sesión se cerró/i,
    );
  });

  it('uno emitido después sí vale: no se echa fuera a quien volvió a entrar', async () => {
    const corte = new Date('2026-10-06T12:00:00Z');
    const s = estrategia('entorno', usuarioDe({ sesionesValidasDesde: corte }));

    const r = (await (s as unknown as {
      validarKeycloak: (p: unknown) => Promise<{ id: string }>;
    }).validarKeycloak(
      tokenDelEntorno({ iat: Math.floor(corte.getTime() / 1000) + 60 }),
    )) as { id: string };

    expect(r.id).toBe('u1');
  });

  it('un token SIN `iat` no se cuela por no traerlo', async () => {
    /*
     * La rendija más fácil de dejar: `if (iat && iat < corte)` deja pasar al que
     * no trae `iat`. Se trata la ausencia como «no se puede comprobar», y lo que
     * no se puede comprobar no pasa.
     */
    const s = estrategia(
      'entorno',
      usuarioDe({ sesionesValidasDesde: new Date('2026-10-06T12:00:00Z') }),
    );

    await falla(
      () =>
        (s as unknown as {
          validarKeycloak: (p: unknown) => Promise<unknown>;
        }).validarKeycloak(tokenDelEntorno()),
      /sesión se cerró/i,
    );
  });

  it('quien nunca cerró sesión no queda afectado', async () => {
    /*
     * Nulo es el estado de todo el mundo al aplicar la migración. Si esto se
     * leyera como «cerrada», el despliegue echaría fuera a la instalación
     * entera de golpe.
     */
    const s = estrategia('entorno', usuarioDe({ sesionesValidasDesde: null }));

    const r = (await (s as unknown as {
      validarKeycloak: (p: unknown) => Promise<{ id: string }>;
    }).validarKeycloak(tokenDelEntorno())) as { id: string };

    expect(r.id).toBe('u1');
  });
});

describe('y el logout escribe las dos marcas', () => {
  /*
   * ESTRUCTURAL CON MOTIVO. El servicio de autenticación arrastra repositorio,
   * Keycloak, correo y permisos; montarlo entero mediría el armado del doble.
   * Lo que no puede faltar es que `logout` escriba la marca que la estrategia
   * lee: sin eso, el arreglo de arriba es un control que nadie dispara.
   */
  const auth = readFileSync(
    join(__dirname, 'services', 'auth.service.ts'),
    'utf8',
  );
  const cuerpo = auth.slice(auth.indexOf('async logout('));

  it('sigue subiendo el contador, que es lo que entiende el modo local', () => {
    expect(cuerpo.slice(0, 1500)).toMatch(/'tokenVersion',\s*\n\s*1,/);
  });

  it('y ahora también la fecha, que es lo único que entiende el modo Keycloak', () => {
    expect(cuerpo.slice(0, 2000)).toMatch(/sesionesValidasDesde: corte/);
  });

  it('con el corte un segundo por delante, por el redondeo del `iat`', () => {
    /*
     * El `iat` va en SEGUNDOS y se redondea hacia abajo: un token emitido en el
     * mismo segundo en que se cierra sesión tendría `iat` igual o menor al corte
     * y se colaría. Redondear hacia arriba cierra esa rendija a costa de
     * invalidar, como mucho, un token recién emitido.
     */
    expect(cuerpo.slice(0, 2000)).toMatch(
      /Math\.ceil\(Date\.now\(\) \/ 1000\) \* 1000 \+ 1000/,
    );
  });

  it('la columna existe en la entidad y tiene migración', () => {
    const entidad = readFileSync(
      join(__dirname, 'entities', 'usuario.entity.ts'),
      'utf8',
    );
    expect(entidad).toMatch(
      /@Column\(\{ type: 'timestamptz', nullable: true \}\)\s*\n\s*sesionesValidasDesde!: Date \| null;/,
    );

    const migracion = readFileSync(
      join(
        __dirname,
        '..',
        'database',
        'migrations',
        'postgres',
        '1790840000000-CerrarSesionTambienConKeycloak.ts',
      ),
      'utf8',
    );
    /* Nullable y con IF NOT EXISTS: aplicarla no echa fuera a nadie. */
    expect(migracion).toMatch(/ADD COLUMN IF NOT EXISTS sesionesvalidasdesde timestamptz NULL/);
    expect(migracion).toMatch(/DROP COLUMN IF EXISTS sesionesvalidasdesde/);
  });
});
