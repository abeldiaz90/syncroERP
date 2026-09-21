import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { JwtStrategy } from './jwt.strategy';
import { Usuario } from '../entities/usuario.entity';
import { IdentidadEmpresaService } from '../services/identidad-empresa.service';

/**
 * ============================================================================
 * Varios directorios, y cada empresa por el suyo
 * ----------------------------------------------------------------------------
 * Esta es la etapa que puede dejar a todo el mundo fuera, así que lo que se
 * prueba aquí no es que funcione el camino bueno —eso se ve al entrar— sino los
 * rechazos:
 *
 *  · Un emisor desconocido no se acepta, y además NO se le piden llaves. Si se
 *    le pidieran, un token con `iss` inventado nos haría llamar al servidor que
 *    el atacante elija, desde dentro de la red.
 *  · Un token de otro realm de SUMA no sirve para entrar a la empresa de
 *    alguien más. Que el emisor sea de SUMA dice que es legítimo, no que sea el
 *    de esta persona.
 * ============================================================================
 */

const ENTORNO = {
  AUTH_MODE: 'keycloak',
  KEYCLOAK_ISSUER_URL: 'https://key-access.sumamexico.com/realms/suma',
  KEYCLOAK_CLIENT_ID: 'syncro-erp',
};

const EMISOR_ENTORNO = ENTORNO.KEYCLOAK_ISSUER_URL;
const EMISOR_A = 'https://key-access.sumamexico.com/realms/cliente-a';

const config = (valores: Record<string, string | undefined>) =>
  ({
    get: (c: string, pd?: string) => valores[c] ?? pd,
    getOrThrow: (c: string) => {
      if (!valores[c]) throw new Error(`falta ${c}`);
      return valores[c];
    },
  }) as unknown as ConfigService;

/** Identidades de mentira: la del entorno y, si se pide, una empresa con realm propio. */
const identidades = (conRealmPropio: boolean) =>
  ({
    emisoresAceptados: async () => {
      const m = new Map<string, string>([[EMISOR_ENTORNO, 'entorno']]);
      if (conRealmPropio) m.set(EMISOR_A, 'empresa-a');
      return m;
    },
    emisorAceptado: async (e: string) =>
      (await (identidades(conRealmPropio) as any).emisoresAceptados()).has(
        e.replace(/\/$/, ''),
      ),
    deEmpresa: async (empresaId: string) =>
      conRealmPropio && empresaId === 'empresa-a'
        ? {
            origen: 'empresa',
            emisor: EMISOR_A,
            realm: 'cliente-a',
            clientIdPublico: 'erp-cliente-a',
            clientIdProvisionador: null,
            secretoProvisionador: null,
            dominiosPermitidos: [],
          }
        : {
            origen: 'entorno',
            emisor: EMISOR_ENTORNO,
            realm: 'suma',
            clientIdPublico: ENTORNO.KEYCLOAK_CLIENT_ID,
            clientIdProvisionador: null,
            secretoProvisionador: null,
            dominiosPermitidos: [],
          },
  }) as unknown as IdentidadEmpresaService;

const usuarioDe = (empresaId: string) => ({
  id: 'u1',
  email: 'persona@sumamexico.com',
  empresaId,
  rol: 'ADMIN',
  nombreCompleto: 'Persona',
  activo: true,
  emailVerificado: true,
  keycloakSubject: 'sub-1',
  empresa: { activo: true },
});

const repo = (usuario: any) =>
  ({
    findOne: async () => usuario,
    save: async (u: any) => u,
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

const token = (payload: object, header: object = { alg: 'RS256', kid: 'k1' }) => {
  const b = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b(header)}.${b(payload)}.firma`;
};

const estrategia = (conRealmPropio: boolean, usuario: any) =>
  new JwtStrategy(config(ENTORNO), repo(usuario), identidades(conRealmPropio));

const falla = async (f: () => Promise<unknown>, textoEsperado: string) => {
  let mensaje = '(no lanzó)';
  try {
    await f();
  } catch (e: any) {
    mensaje = e?.message ?? String(e);
  }
  expect(mensaje).toContain(textoEsperado);
};

describe('JwtStrategy: de qué directorios se aceptan tokens', () => {
  it('no le pide llaves a un emisor desconocido', async () => {
    const s = estrategia(true, usuarioDe('empresa-a'));
    await falla(
      () =>
        (s as any).llaveDelEmisor(
          token({ iss: 'https://keycloak-de-alguien-mas.com/realms/suma' }),
        ),
      'no proviene de un directorio reconocido',
    );
    // Lo que de verdad importa: no se creó cliente de llaves, o sea no hubo
    // ninguna petición hacia ese servidor.
    expect((s as any).clientesJwks.size).toBe(0);
  });

  it('un token sin emisor se rechaza antes de cualquier otra cosa', async () => {
    const s = estrategia(true, usuarioDe('empresa-a'));
    await falla(
      () => (s as any).llaveDelEmisor(token({ sub: 'x' })),
      'no dice quién lo emitió',
    );
    expect((s as any).clientesJwks.size).toBe(0);
  });

  it('un token ilegible se rechaza sin caerse', async () => {
    const s = estrategia(true, usuarioDe('empresa-a'));
    await falla(() => (s as any).llaveDelEmisor('esto-no-es-un-jwt'), 'no dice quién');
  });

  it('el emisor del entorno sigue valiendo: nadie que hoy entre queda fuera', async () => {
    const s = estrategia(true, usuarioDe('empresa-sin-realm'));
    const r: any = await (s as any).validarKeycloak({
      sub: 'sub-1',
      email: 'persona@sumamexico.com',
      email_verified: true,
      iss: EMISOR_ENTORNO,
      azp: ENTORNO.KEYCLOAK_CLIENT_ID,
    });
    expect(r.empresaId).toBe('empresa-sin-realm');
  });

  it('acepta el realm propio de una empresa, con SU cliente', async () => {
    const s = estrategia(true, usuarioDe('empresa-a'));
    const r: any = await (s as any).validarKeycloak({
      sub: 'sub-1',
      email: 'persona@sumamexico.com',
      email_verified: true,
      iss: EMISOR_A,
      azp: 'erp-cliente-a',
    });
    expect(r.empresaId).toBe('empresa-a');
  });

  it('el cliente del entorno NO vale en el realm de una empresa', async () => {
    // Si valiera, cualquier aplicación del realm del cliente podría pedir un
    // token y usarlo contra el ERP.
    const s = estrategia(true, usuarioDe('empresa-a'));
    await falla(
      () =>
        (s as any).validarKeycloak({
          sub: 'sub-1',
          email: 'persona@sumamexico.com',
          email_verified: true,
          iss: EMISOR_A,
          azp: ENTORNO.KEYCLOAK_CLIENT_ID,
        }),
      'no fue emitido para Syncro ERP',
    );
  });

  it('un emisor no registrado no pasa ni con firma válida', async () => {
    const s = estrategia(true, usuarioDe('empresa-a'));
    await falla(
      () =>
        (s as any).validarKeycloak({
          sub: 'sub-1',
          email: 'persona@sumamexico.com',
          email_verified: true,
          iss: 'https://keycloak-de-alguien-mas.com/realms/suma',
          azp: ENTORNO.KEYCLOAK_CLIENT_ID,
        }),
      'no proviene de un directorio reconocido',
    );
  });

  it('el realm de una empresa no entra a la cartera de otra', async () => {
    // El caso serio: el administrador del cliente A crea una cuenta con el
    // correo de alguien que en el ERP pertenece a otra empresa.
    const s = estrategia(true, usuarioDe('empresa-sin-realm'));
    await falla(
      () =>
        (s as any).validarKeycloak({
          sub: 'sub-1',
          email: 'persona@sumamexico.com',
          email_verified: true,
          iss: EMISOR_A,
          azp: 'erp-cliente-a',
        }),
      'no corresponde al directorio de tu empresa',
    );
  });

  it('quien ya tiene realm propio deja de entrar por el compartido', async () => {
    // Al revés del anterior: la identidad se mudó, el acceso viejo se cierra.
    const s = estrategia(true, usuarioDe('empresa-a'));
    await falla(
      () =>
        (s as any).validarKeycloak({
          sub: 'sub-1',
          email: 'persona@sumamexico.com',
          email_verified: true,
          iss: EMISOR_ENTORNO,
          azp: ENTORNO.KEYCLOAK_CLIENT_ID,
        }),
      'no corresponde al directorio de tu empresa',
    );
  });
});
