import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { IdentidadEmpresaService } from './identidad-empresa.service';
import { SecretosService } from '../../common/services/secretos.service';
import { EmpresaIdentidad } from '../entities/empresa-identidad.entity';

/**
 * ============================================================================
 * De quién se aceptan tokens
 * ----------------------------------------------------------------------------
 * Estas pruebas cubren la regla de la que cuelga la seguridad del alta
 * automática: un emisor que no esté registrado y ACTIVO no se acepta. Si eso se
 * rompiera, cualquiera podría levantar su propio Keycloak, firmar un token con
 * el correo de un empleado y entrar — y el ERP le daría la empresa de esa
 * persona.
 *
 * Y la regla de precedencia: la fila de la empresa manda sobre el entorno. Al
 * revés sería una trampa, porque encender una variable global cambiaría la
 * identidad de empresas que ya tienen la suya.
 * ============================================================================
 */

const LLAVE = 'llave-de-pruebas-suficientemente-larga';

const config = (valores: Record<string, string | undefined>) =>
  ({ get: (c: string) => valores[c] }) as unknown as ConfigService;

const repo = (filas: Partial<EmpresaIdentidad>[]) =>
  ({
    findOne: async ({ where }: any) =>
      filas.find((f) => f.empresaId === where.empresaId) ?? null,
    find: async ({ where }: any) =>
      filas.filter((f) => !where?.estado || f.estado === where.estado),
  }) as unknown as Repository<EmpresaIdentidad>;

const secretos = () => new SecretosService(config({ SECRETOS_LLAVE: LLAVE }));

const ENTORNO = {
  KEYCLOAK_ISSUER_URL: 'https://key-access.sumamexico.com/realms/suma',
  KEYCLOAK_CLIENT_ID: 'syncro-erp',
  DIRECTORIO_CLIENT_ID: 'suma-provisioner',
  DIRECTORIO_CLIENT_SECRET: 'secreto-del-entorno',
  DIRECTORIO_DOMINIOS_PERMITIDOS: 'sumamexico.com',
};

describe('SecretosService', () => {
  it('lo que cifra, lo descifra', () => {
    const s = secretos();
    const sobre = s.cifrar('un-secreto-cualquiera')!;
    expect(sobre.startsWith('v1:')).toBe(true);
    // El secreto no aparece en el sobre.
    expect(sobre).not.toContain('un-secreto-cualquiera');
    expect(s.descifrar(sobre)).toBe('un-secreto-cualquiera');
  });

  it('dos cifrados del mismo texto son distintos', () => {
    // Si fueran iguales, la base revelaría qué empresas comparten secreto.
    const s = secretos();
    expect(s.cifrar('igual')).not.toBe(s.cifrar('igual'));
  });

  it('detecta que alguien editó el valor a mano', () => {
    const s = secretos();
    const sobre = s.cifrar('original')!;
    const partes = sobre.split(':');
    partes[3] = Buffer.from('otra cosa').toString('base64');
    expect(s.descifrar(partes.join(':'))).toBeNull();
  });

  it('con otra llave no descifra', () => {
    const sobre = secretos().cifrar('original')!;
    const otra = new SecretosService(config({ SECRETOS_LLAVE: 'otra-llave-distinta-y-larga' }));
    expect(otra.descifrar(sobre)).toBeNull();
  });

  it('sin llave no cifra, y lo dice', () => {
    const s = new SecretosService(config({}));
    expect(s.configurado).toBe(false);
    expect(s.cifrar('algo')).toBeNull();
    expect(s.motivoNoConfigurado).toContain('SECRETOS_LLAVE');
  });
});

describe('IdentidadEmpresaService', () => {
  it('sin fila, usa el entorno', async () => {
    const s = new IdentidadEmpresaService(repo([]), config(ENTORNO), secretos());
    const i = await s.deEmpresa('e1');
    expect(i.origen).toBe('entorno');
    expect(i.emisor).toBe(ENTORNO.KEYCLOAK_ISSUER_URL);
    expect(i.realm).toBe('suma');
    expect(i.dominiosPermitidos).toEqual(['sumamexico.com']);
  });

  it('con fila ACTIVA, manda la fila', async () => {
    const sec = secretos();
    const s = new IdentidadEmpresaService(
      repo([
        {
          empresaId: 'e1',
          emisor: 'https://key-access.sumamexico.com/realms/cliente-uno',
          realm: 'cliente-uno',
          clientIdPublico: 'erp-cliente-uno',
          clientIdProvisionador: 'prov-cliente-uno',
          secretoProvisionador: sec.cifrar('secreto-de-cliente-uno'),
          dominiosPermitidos: 'clienteuno.mx, otro.mx',
          estado: 'ACTIVA',
        },
      ]),
      config(ENTORNO),
      sec,
    );
    const i = await s.deEmpresa('e1');
    expect(i.origen).toBe('empresa');
    expect(i.realm).toBe('cliente-uno');
    expect(i.secretoProvisionador).toBe('secreto-de-cliente-uno');
    expect(i.dominiosPermitidos).toEqual(['clienteuno.mx', 'otro.mx']);
  });

  it('una fila APROVISIONANDO todavía no cuenta', async () => {
    // Un realm a medio armar puede no tener aún su política de contraseñas.
    const s = new IdentidadEmpresaService(
      repo([
        {
          empresaId: 'e1',
          emisor: 'https://key-access.sumamexico.com/realms/a-medias',
          realm: 'a-medias',
          clientIdPublico: 'x',
          estado: 'APROVISIONANDO',
        },
      ]),
      config(ENTORNO),
      secretos(),
    );
    expect((await s.deEmpresa('e1')).origen).toBe('entorno');
  });

  describe('emisores aceptados', () => {
    const conFilas = () =>
      new IdentidadEmpresaService(
        repo([
          {
            empresaId: 'e1',
            emisor: 'https://key-access.sumamexico.com/realms/cliente-uno',
            realm: 'cliente-uno',
            clientIdPublico: 'x',
            estado: 'ACTIVA',
          },
          {
            empresaId: 'e2',
            emisor: 'https://key-access.sumamexico.com/realms/cliente-dos',
            realm: 'cliente-dos',
            clientIdPublico: 'y',
            estado: 'APROVISIONANDO',
          },
        ]),
        config(ENTORNO),
        secretos(),
      );

    it('acepta el del entorno y los ACTIVOS', async () => {
      const s = conFilas();
      await expect(s.emisorAceptado(ENTORNO.KEYCLOAK_ISSUER_URL)).resolves.toBe(true);
      await expect(
        s.emisorAceptado('https://key-access.sumamexico.com/realms/cliente-uno'),
      ).resolves.toBe(true);
    });

    it('NO acepta uno que está aprovisionando', async () => {
      await expect(
        conFilas().emisorAceptado('https://key-access.sumamexico.com/realms/cliente-dos'),
      ).resolves.toBe(false);
    });

    it('NO acepta un emisor desconocido', async () => {
      // El caso que importa: un Keycloak ajeno firmando tokens.
      await expect(
        conFilas().emisorAceptado('https://keycloak-de-alguien-mas.com/realms/suma'),
      ).resolves.toBe(false);
      await expect(conFilas().emisorAceptado('')).resolves.toBe(false);
    });

    it('la barra final no cambia la respuesta', async () => {
      await expect(
        conFilas().emisorAceptado('https://key-access.sumamexico.com/realms/cliente-uno/'),
      ).resolves.toBe(true);
    });
  });

  it('si la tabla no existe, no se cae: usa el entorno', async () => {
    // Migración sin aplicar. Antes de esta tabla el sistema funcionaba así.
    const roto = {
      findOne: async () => {
        throw new Error('relation "empresa_identidad" does not exist');
      },
      find: async () => {
        throw new Error('relation "empresa_identidad" does not exist');
      },
    } as unknown as Repository<EmpresaIdentidad>;
    const s = new IdentidadEmpresaService(roto, config(ENTORNO), secretos());
    expect((await s.deEmpresa('e1')).origen).toBe('entorno');
    await expect(s.emisorAceptado(ENTORNO.KEYCLOAK_ISSUER_URL)).resolves.toBe(true);
  });

  it('el resumen no revela el secreto', async () => {
    const sec = secretos();
    const s = new IdentidadEmpresaService(
      repo([
        {
          empresaId: 'e1',
          emisor: 'https://key-access.sumamexico.com/realms/cliente-uno',
          realm: 'cliente-uno',
          clientIdPublico: 'x',
          clientIdProvisionador: 'p',
          secretoProvisionador: sec.cifrar('no-debe-salir'),
          estado: 'ACTIVA',
        },
      ]),
      config(ENTORNO),
      sec,
    );
    const r = await s.resumen('e1');
    expect(r.tieneSecretoProvisionador).toBe(true);
    expect(JSON.stringify(r)).not.toContain('no-debe-salir');
  });
});
