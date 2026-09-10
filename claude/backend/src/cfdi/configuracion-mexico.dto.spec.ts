import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ConfiguracionMexicoDto } from './configuracion-mexico.dto';

const base = {
  razonSocial: 'Empresa de prueba',
  regimenFiscal: '601',
  codigoPostal: '97000',
  giro: 'Servicios',
  perfilImpuestos: 'GENERAL',
  confirmaRevisionConContador: true,
};

describe('ConfiguracionMexicoDto', () => {
  it.each([
    ['FISICA', 'ABCD900101AA1'],
    ['MORAL', 'ABC900101AA1'],
  ])('acepta RFC de persona %s', async (tipoPersona, rfc) => {
    const dto = plainToInstance(ConfiguracionMexicoDto, {
      ...base,
      tipoPersona,
      rfc,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rechaza un RFC truncado', async () => {
    const dto = plainToInstance(ConfiguracionMexicoDto, {
      ...base,
      tipoPersona: 'FISICA',
      rfc: 'ABCD900101AA',
    });
    expect((await validate(dto)).some((error) => error.property === 'rfc')).toBe(true);
  });
});
