import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { IntegracionModoService } from './integracion-modo.service';
import { ConfiguracionIntegracionEmpresa } from '../entities/configuracion-integracion-empresa.entity';
import { ModoCartera, ModoContabilidad } from '../integracion.constants';

const servicio = (
  cartera?: string,
  contabilidad?: string,
  fila?: Partial<ConfiguracionIntegracionEmpresa> | null,
) =>
  new IntegracionModoService(
    {
      get: (c: string) =>
        c === 'CARTERA_MODO'
          ? cartera
          : c === 'CONTABILIDAD_EXTERNA_MODO'
            ? contabilidad
            : undefined,
    } as unknown as ConfigService,
    {
      findOne: async () => fila ?? null,
    } as unknown as Repository<ConfiguracionIntegracionEmpresa>,
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

  /*
   * `usaRegistroExterno` es el predicado del que ahora cuelga lo que la
   * interfaz enseña: el enlace al core, la pestaña de correspondencia de roles
   * y el aprovisionamiento de operadores. Si contesta que sí a quien no
   * contrató, se le propone mapear roles contra un registro que no tiene; si
   * contesta que no a quien sí contrató, se le esconde un módulo que paga.
   */
  describe('usaRegistroExterno', () => {
    it('no, cuando la empresa no tiene fila de configuración', async () => {
      // El caso normal: la gran mayoría de empresas solo usan el ERP.
      const s = servicio('AUTORIDAD', 'ESPEJO', null);
      await expect(s.usaRegistroExterno('e1')).resolves.toBe(false);
    });

    it('no, cuando la empresa tiene fila pero los dos ejes apagados', async () => {
      const s = servicio('AUTORIDAD', 'ESPEJO', {
        modo: ModoCartera.APAGADO,
        modoContabilidad: ModoContabilidad.APAGADO,
      });
      await expect(s.usaRegistroExterno('e1')).resolves.toBe(false);
    });

    it('sí, con solo la cartera encendida', async () => {
      const s = servicio('SOMBRA', undefined, {
        modo: ModoCartera.SOMBRA,
        modoContabilidad: ModoContabilidad.APAGADO,
      });
      await expect(s.usaRegistroExterno('e1')).resolves.toBe(true);
    });

    it('sí, con solo la contabilidad espejada', async () => {
      // Hay empresas que espejan pólizas sin mover cartera: también son
      // clientes del core y su correspondencia de roles aplica.
      const s = servicio(undefined, 'ESPEJO', {
        modo: ModoCartera.APAGADO,
        modoContabilidad: ModoContabilidad.ESPEJO,
      });
      await expect(s.usaRegistroExterno('e1')).resolves.toBe(true);
    });

    it('no, si la empresa lo pidió pero el techo global está apagado', async () => {
      // Protege contra encender a un inquilino por su propia fila cuando el
      // despliegue entero tiene el módulo abajo.
      const s = servicio(undefined, undefined, {
        modo: ModoCartera.AUTORIDAD,
        modoContabilidad: ModoContabilidad.ESPEJO,
      });
      await expect(s.usaRegistroExterno('e1')).resolves.toBe(false);
    });
  });
});

/**
 * ============================================================================
 * El candado de los cambios de modo
 * ----------------------------------------------------------------------------
 * Durante un tiempo sólo se comprobaba al SUBIR a AUTORIDAD. Bajar a APAGADO
 * no exigía nada, y era la dirección peligrosa: los eventos sin entregar
 * quedaban huérfanos —el despachador ignora a las empresas apagadas— y las
 * discrepancias abiertas se volvían irreconciliables, porque al apagar ya no
 * hay contra qué compararlas. En los dos casos sin un solo error visible.
 * ============================================================================
 */
describe('establecerModoCartera', () => {
  const conRepo = (modoActual: ModoCartera) => {
    const fila = { empresaId: 'e1', modo: modoActual, parametrosProveedor: {} };
    const guardadas: unknown[] = [];
    const servicio = new IntegracionModoService(
      { get: () => 'AUTORIDAD' } as unknown as ConfigService,
      {
        findOne: async () => fila,
        create: (x: unknown) => x,
        save: async (x: unknown) => {
          guardadas.push(x);
          return x;
        },
      } as unknown as Repository<ConfiguracionIntegracionEmpresa>,
    );
    return { servicio, fila, guardadas };
  };

  const sondas = (discrepancias: number, eventos: number) => ({
    discrepanciasAbiertas: async () => discrepancias,
    eventosSinResolver: async () => eventos,
  });

  it('no deja subir a AUTORIDAD con discrepancias abiertas', async () => {
    const { servicio, guardadas } = conRepo(ModoCartera.SOMBRA);
    const r = await servicio.establecerModoCartera(
      'e1',
      ModoCartera.AUTORIDAD,
      sondas(3, 0),
    );

    expect(r.aplicado).toBe(false);
    expect(r.motivo).toMatch(/3 discrepancia/);
    expect(guardadas).toHaveLength(0);
  });

  it('no deja apagar dejando eventos sin entregar', async () => {
    const { servicio, guardadas } = conRepo(ModoCartera.AUTORIDAD);
    const r = await servicio.establecerModoCartera(
      'e1',
      ModoCartera.APAGADO,
      sondas(0, 7),
    );

    expect(r.aplicado).toBe(false);
    expect(r.motivo).toMatch(/7 evento/);
    // Lo que importa: el modo NO cambió. Un rechazo que igual guarda es peor
    // que no tener candado, porque hace creer que hubo candado.
    expect(guardadas).toHaveLength(0);
  });

  it('no deja apagar con discrepancias sin resolver', async () => {
    const { servicio } = conRepo(ModoCartera.SOMBRA);
    const r = await servicio.establecerModoCartera(
      'e1',
      ModoCartera.APAGADO,
      sondas(2, 0),
    );

    expect(r.aplicado).toBe(false);
    expect(r.motivo).toMatch(/2 discrepancia/);
  });

  it('deja apagar cuando no queda nada pendiente', async () => {
    const { servicio, fila } = conRepo(ModoCartera.SOMBRA);
    const r = await servicio.establecerModoCartera(
      'e1',
      ModoCartera.APAGADO,
      sondas(0, 0),
    );

    expect(r.aplicado).toBe(true);
    expect(fila.modo).toBe(ModoCartera.APAGADO);
  });

  it('apagar algo ya apagado no comprueba nada ni falla', async () => {
    const { servicio } = conRepo(ModoCartera.APAGADO);
    const sondaQueExplota = {
      discrepanciasAbiertas: jest.fn(),
      eventosSinResolver: jest.fn(),
    };

    const r = await servicio.establecerModoCartera('e1', ModoCartera.APAGADO, {
      discrepanciasAbiertas: sondaQueExplota.discrepanciasAbiertas as never,
      eventosSinResolver: sondaQueExplota.eventosSinResolver as never,
    });

    /*
     * Una regla que rechaza operaciones que no cambian nada acaba enseñando a
     * la gente a ignorar el mensaje.
     */
    expect(r.aplicado).toBe(true);
    expect(sondaQueExplota.eventosSinResolver).not.toHaveBeenCalled();
  });

  it('bajar de AUTORIDAD a SOMBRA no exige outbox vacío', async () => {
    // Sigue replicando: lo que está en vuelo se va a despachar igual.
    const { servicio, fila } = conRepo(ModoCartera.AUTORIDAD);
    const r = await servicio.establecerModoCartera(
      'e1',
      ModoCartera.SOMBRA,
      sondas(0, 12),
    );

    expect(r.aplicado).toBe(true);
    expect(fila.modo).toBe(ModoCartera.SOMBRA);
  });
});
