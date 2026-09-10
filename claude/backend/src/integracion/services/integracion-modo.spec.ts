import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { IntegracionModoService } from './integracion-modo.service';
import { ConfiguracionIntegracionEmpresa } from '../entities/configuracion-integracion-empresa.entity';
import { ModoCartera, ModoContabilidad } from '../integracion.constants';

const servicio = (cartera?: string, contabilidad?: string) =>
  new IntegracionModoService(
    {
      get: (c: string) =>
        c === 'CARTERA_MODO'
          ? cartera
          : c === 'CONTABILIDAD_EXTERNA_MODO'
            ? contabilidad
            : undefined,
    } as unknown as ConfigService,
    {} as unknown as Repository<ConfiguracionIntegracionEmpresa>,
  );

describe('IntegracionModoService', () => {
  it('sin configuración, todo queda apagado', () => {
    const s = servicio();
    expect(s.combinar(ModoCartera.AUTORIDAD)).toBe(ModoCartera.APAGADO);
    expect(s.combinarContabilidad(ModoContabilidad.ESPEJO)).toBe(
      ModoContabilidad.APAGADO,
    );
  });

  it('los dos ejes son independientes', () => {
    // Contabilidad encendida, cartera no: una empresa puede espejar sus
    // pólizas sin mover su cartera al externo.
    const soloContabilidad = servicio(undefined, 'ESPEJO');
    expect(soloContabilidad.combinar(ModoCartera.AUTORIDAD)).toBe(
      ModoCartera.APAGADO,
    );
    expect(soloContabilidad.combinarContabilidad(ModoContabilidad.ESPEJO)).toBe(
      ModoContabilidad.ESPEJO,
    );

    // Y al revés.
    const soloCartera = servicio('SOMBRA', undefined);
    expect(soloCartera.combinar(ModoCartera.SOMBRA)).toBe(ModoCartera.SOMBRA);
    expect(soloCartera.combinarContabilidad(ModoContabilidad.ESPEJO)).toBe(
      ModoContabilidad.APAGADO,
    );
  });

  it('una empresa sin fila de configuración no opera con el módulo', () => {
    // Es la regla que protege a los inquilinos que nunca contrataron Fineract.
    const s = servicio('AUTORIDAD', 'ESPEJO');
    expect(s.combinar(null)).toBe(ModoCartera.APAGADO);
    expect(s.combinarContabilidad(null)).toBe(ModoContabilidad.APAGADO);
  });

  it('una empresa sin espejo no lo hereda del techo global', () => {
    const s = servicio('SOMBRA', 'ESPEJO');
    expect(s.combinarContabilidad(ModoContabilidad.APAGADO)).toBe(
      ModoContabilidad.APAGADO,
    );
    expect(s.combinarContabilidad(null)).toBe(ModoContabilidad.APAGADO);
  });

  it('una empresa no puede exceder el techo global', () => {
    const s = servicio('SOMBRA');
    expect(s.combinar(ModoCartera.AUTORIDAD)).toBe(ModoCartera.SOMBRA);
    expect(s.combinar(ModoCartera.APAGADO)).toBe(ModoCartera.APAGADO);
    // Sin decisión explícita, apagada. El techo global nunca enciende a nadie.
    expect(s.combinar(null)).toBe(ModoCartera.APAGADO);
    expect(s.combinar(undefined)).toBe(ModoCartera.APAGADO);
  });

  it('un modo global desconocido no enciende nada', () => {
    expect(servicio('lo-que-sea').modoContabilidadGlobal === ModoContabilidad.APAGADO && servicio('lo-que-sea').modoGlobal).toBe(ModoCartera.APAGADO);
  });

  it('una empresa puede quedarse por debajo del techo', () => {
    expect(servicio('AUTORIDAD').combinar(ModoCartera.SOMBRA)).toBe(
      ModoCartera.SOMBRA,
    );
  });
});
