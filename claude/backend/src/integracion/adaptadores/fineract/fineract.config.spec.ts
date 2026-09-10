import { ConfigService } from '@nestjs/config';
import { FineractConfig } from './fineract.config';

const configDe = (valores: Record<string, string>) =>
  new FineractConfig({
    get: (clave: string) => valores[clave],
  } as unknown as ConfigService);

describe('FineractConfig', () => {
  it('queda inerte cuando no hay URL', () => {
    expect(configDe({}).habilitado).toBe(false);
  });

  it('exige credenciales además de URL', () => {
    expect(configDe({ FINERACT_URL: 'http://x' }).habilitado).toBe(false);
    expect(
      configDe({
        FINERACT_URL: 'http://x',
        FINERACT_BASIC_USER: 'u',
        FINERACT_BASIC_PASSWORD: 'p',
      }).habilitado,
    ).toBe(true);
  });

  it('acepta OAuth como credencial', () => {
    const cfg = configDe({
      FINERACT_URL: 'http://x/',
      FINERACT_KEYCLOAK_ISSUER_URL: 'https://kc/realms/suma/',
      FINERACT_CLIENT_ID: 'id',
      FINERACT_CLIENT_SECRET: 'secreto',
    });
    expect(cfg.tieneOAuth).toBe(true);
    expect(cfg.habilitado).toBe(true);
    // La barra final se recorta: la ruta se concatena tal cual.
    expect(cfg.url).toBe('http://x');
    expect(cfg.issuerUrl).toBe('https://kc/realms/suma');
  });
});
