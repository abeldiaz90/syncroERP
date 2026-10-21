import { ConflictException } from '@nestjs/common';

import { AltaEmpresasService } from './services/alta-empresas.service';
import { EstadoOrigenCore, OrigenCore } from './entities/origen-core.entity';
import { EstadoTenantReserva } from './entities/tenant-reserva.entity';

/**
 * ============================================================================
 * El inquilino de un cliente no entra a la reserva de SUMA
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * MEDIDO el 21-oct-2026 en vivo. Acabada de probar el alta on-premise de
 * «Financiera Onpremise Prueba», su inquilino `onpremise-prueba` quedó anotado
 * en el registro del core —que es lo que tiene que pasar— y la pantalla de la
 * reserva lo leyó así:
 *
 *     onpremise-prueba · sin anotar        [ Anotar 1 en la reserva ]
 *
 * Ese botón existe para ahorrar trabajo: anota de un golpe los inquilinos que
 * el core ya tiene y la reserva todavía no. Y ahí habría anotado como
 * DISPONIBLE un inquilino cuya base vive en el servidor de un cliente.
 *
 * Lo que venía después no se habría notado en ninguna pantalla: la siguiente
 * empresa que se diera de alta con el core habría tomado ese inquilino de la
 * reserva y habría empezado a leer y escribir en la base de Financiera
 * Onpremise Prueba. Dos clientes, una base, y las dos pantallas en verde.
 *
 * POR QUÉ
 *
 * El inventario cruzaba dos listas —lo que el core conoce y lo que la reserva
 * tiene anotado— y la diferencia la llamaba «sin anotar». Desde que una empresa
 * puede traer su propia base, esa diferencia tiene dos significados muy
 * distintos: «falta anotarlo» y «no es nuestro». Faltaba el tercer estado.
 *
 * DOS SITIOS, Y LOS DOS HACEN FALTA
 *
 * No basta con dejar de ofrecerlo en la pantalla: `registrarEnReserva` es una
 * ruta que se puede llamar sola, y la regla que protege una base ajena no
 * puede depender de por dónde entró la petición. Se niega donde se ESCRIBE, y
 * la pantalla además no lo ofrece.
 * ============================================================================
 */

type FilaOrigen = {
  empresaId: string;
  origen: OrigenCore;
  estado: EstadoOrigenCore;
  inquilino: string | null;
};

type FilaReserva = {
  identificador: string;
  proveedor: string;
  estado: EstadoTenantReserva;
  empresaId?: string | null;
};

function armar(enElCore: string[], anotados: FilaReserva[], origenes: FilaOrigen[]) {
  const guardados: FilaReserva[] = [];

  const repoReserva = {
    count: jest.fn(async () => 0),
    find: jest.fn(async () => anotados),
    findOne: jest.fn(async ({ where }: { where: { identificador: string } }) =>
      anotados.find((a) => a.identificador === where.identificador) ?? null,
    ),
    create: jest.fn((datos: FilaReserva) => ({ ...datos })),
    save: jest.fn(async (fila: FilaReserva) => {
      guardados.push(fila);
      return fila;
    }),
  };

  const repoOrigenes = {
    find: jest.fn(async ({ where }: { where?: { origen?: OrigenCore } } = {}) =>
      where?.origen ? origenes.filter((o) => o.origen === where.origen) : origenes,
    ),
    findOne: jest.fn(async () => null),
  };

  const servicio = new AltaEmpresasService(
    {} as never,
    { registrar: jest.fn() } as never,
    { find: jest.fn(async () => []), findOne: jest.fn(async () => null) } as never,
    { find: jest.fn(async () => []), findOne: jest.fn(async () => null) } as never,
    repoReserva as never,
    { find: jest.fn(async () => []) } as never,
    { find: jest.fn(async () => []), createQueryBuilder: jest.fn() } as never,
    {} as never,
    { tenants: jest.fn(async () => enElCore) } as never,
    repoOrigenes as never,
  );

  return { servicio, guardados, repoReserva };
}

const DEL_CLIENTE: FilaOrigen = {
  empresaId: 'e-onpremise',
  origen: OrigenCore.CLIENTE,
  estado: EstadoOrigenCore.ESPERANDO_REINICIO,
  inquilino: 'onpremise-prueba',
};

describe('el inquilino de un cliente no entra a la reserva de SUMA', () => {
  describe('el inventario dice de quién es', () => {
    it('lo marca como base del cliente, con su empresa, y no lo ofrece', async () => {
      const { servicio } = armar(
        ['default', 'onpremise-prueba'],
        [{ identificador: 'default', proveedor: 'fineract', estado: EstadoTenantReserva.ASIGNADO, empresaId: 'e-vieja' }],
        [DEL_CLIENTE],
      );

      const reserva = await servicio.estadoReserva();

      expect(reserva.inventarioDelCore).toEqual([
        { identificador: 'default', estado: EstadoTenantReserva.ASIGNADO, empresaId: 'e-vieja' },
        { identificador: 'onpremise-prueba', estado: 'BASE_DEL_CLIENTE', empresaId: 'e-onpremise' },
      ]);
      expect(reserva.sinRegistrar).toEqual([]);
    });

    it('y el que de verdad falta por anotar sigue ofreciéndose', async () => {
      /*
       * La mitad que más importa: el botón existe porque ahorra teclear, y un
       * arreglo que lo apagara del todo cambiaría un defecto por otro.
       */
      const { servicio } = armar(['default', 'suma-07', 'onpremise-prueba'], [], [DEL_CLIENTE]);

      const reserva = await servicio.estadoReserva();

      expect(reserva.sinRegistrar).toEqual(['default', 'suma-07']);
    });
  });

  describe('y la ruta que escribe lo niega, que es lo que de verdad protege', () => {
    it('se niega a anotarlo, con palabras que dicen el daño', async () => {
      const { servicio, guardados } = armar(['onpremise-prueba'], [], [DEL_CLIENTE]);

      await expect(servicio.registrarEnReserva(['onpremise-prueba'])).rejects.toThrow(
        ConflictException,
      );
      await expect(servicio.registrarEnReserva(['onpremise-prueba'])).rejects.toThrow(
        /vive en la base de un cliente/i,
      );
      expect(guardados).toEqual([]);
    });

    it('mezclado con uno bueno, no se anota NINGUNO', async () => {
      /*
       * Si la negativa fuera por renglón, la llamada dejaría la mitad hecha y
       * quien opera leería «1 anotado» sin ver que el otro se rechazó.
       */
      const { servicio, guardados } = armar(['suma-07', 'onpremise-prueba'], [], [DEL_CLIENTE]);

      await expect(
        servicio.registrarEnReserva(['suma-07', 'onpremise-prueba']),
      ).rejects.toThrow(/vive en la base de un cliente/i);
      expect(guardados).toEqual([]);
    });

    it('lo reconoce aunque venga con mayúsculas y espacios', async () => {
      /*
       * El core compara en crudo y la reserva guarda en minúsculas. Si la
       * comparación no normalizara, « Onpremise-Prueba » pasaría la puerta y
       * entraría en la reserva como un inquilino distinto del mismo.
       */
      const { servicio, guardados } = armar(['onpremise-prueba'], [], [DEL_CLIENTE]);

      await expect(
        servicio.registrarEnReserva(['  Onpremise-Prueba  ']),
      ).rejects.toThrow(/vive en la base de un cliente/i);
      expect(guardados).toEqual([]);
    });

    it('y el inquilino de la nube de SUMA se anota como siempre', async () => {
      const { servicio, guardados } = armar(['suma-07'], [], [DEL_CLIENTE]);

      const r = await servicio.registrarEnReserva(['suma-07']);

      expect(r).toEqual({ nuevos: ['suma-07'], yaEstaban: [], usados: [] });
      expect(guardados).toEqual([
        { proveedor: 'fineract', identificador: 'suma-07', estado: EstadoTenantReserva.DISPONIBLE },
      ]);
    });
  });

  it('LA PRUEBA DE LA PRUEBA: sin el renglón de origen, el mismo inquilino se anota', async () => {
    /*
     * Lo que separa el arreglo del defecto es UN renglón en
     * `integracion_origen_core`. Si la regla mirara otra cosa —el nombre, un
     * prefijo, una lista— estas pruebas pasarían por una razón que no es la
     * que las sostiene.
     *
     * Aquí se le da exactamente el mismo identificador SIN ese renglón: tiene
     * que anotarse sin pelear. Esa es la diferencia, y es la que hay que
     * romper para que esta familia se ponga roja.
     */
    const { servicio, guardados } = armar(['onpremise-prueba'], [], []);

    const reserva = await servicio.estadoReserva();
    expect(reserva.sinRegistrar).toEqual(['onpremise-prueba']);

    await expect(servicio.registrarEnReserva(['onpremise-prueba'])).resolves.toMatchObject({
      nuevos: ['onpremise-prueba'],
    });
    expect(guardados).toHaveLength(1);
  });
});
