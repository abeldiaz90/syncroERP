import {
  cifrarSecretoCfdi,
  descifrarSecretoCfdi,
  estaCifradoSecretoCfdi,
} from './cfdi-secrets.crypto';

describe('credenciales PAC cifradas', () => {
  const llaveAnterior = process.env.CFDI_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.CFDI_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  });

  afterAll(() => {
    if (llaveAnterior === undefined) delete process.env.CFDI_ENCRYPTION_KEY;
    else process.env.CFDI_ENCRYPTION_KEY = llaveAnterior;
  });

  it('cifra con AES-256-GCM y recupera el valor original', () => {
    const cifrado = cifrarSecretoCfdi('secreto-pac-prueba');
    expect(cifrado).not.toContain('secreto-pac-prueba');
    expect(estaCifradoSecretoCfdi(cifrado)).toBe(true);
    expect(descifrarSecretoCfdi(cifrado)).toBe('secreto-pac-prueba');
  });

  it('rechaza una credencial cifrada alterada', () => {
    const cifrado = cifrarSecretoCfdi('secreto-pac-prueba');
    const alterado = `${cifrado.slice(0, -1)}${cifrado.endsWith('A') ? 'B' : 'A'}`;
    expect(() => descifrarSecretoCfdi(alterado)).toThrow();
  });

  it('mantiene compatibilidad temporal con valores heredados', () => {
    expect(descifrarSecretoCfdi('valor-heredado')).toBe('valor-heredado');
    expect(estaCifradoSecretoCfdi('valor-heredado')).toBe(false);
  });
});
