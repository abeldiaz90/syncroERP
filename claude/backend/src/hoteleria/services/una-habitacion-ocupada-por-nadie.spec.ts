import { ConflictException, BadRequestException } from '@nestjs/common';

import { HousekeepingService } from './housekeeping.service';
import { Habitacion, EstadoHabitacion } from '../entities/habitacion.entity';
import { Reservacion, EstadoReservacion } from '../entities/reservacion.entity';

/**
 * ============================================================================
 * Una habitación ocupada por nadie
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * MEDIDO el 15-oct-2026 en el hotel de demostración, abriendo las tres
 * pantallas seguidas:
 *
 *   rack    · la 101, OCUPADA
 *   panel   · 0 huéspedes en casa, 0 folios abiertos, 0 reservaciones activas
 *   folios  · «No hay huéspedes con check-in pendiente de salida»
 *
 * Una habitación ocupada por nadie. No se puede vender, y tampoco se puede
 * liberar: `OCUPADA` no tiene transición manual —a propósito, y es una buena
 * regla— y la única salida es el check-out, que necesita un huésped al que
 * hacérselo. No lo hay.
 *
 * Es la regla que protege el caso normal dejando el caso anómalo sin salida.
 * Y nada lo decía: las tres pantallas enseñaban su número y ninguna
 * confrontaba uno con otro, así que el rack mentía en silencio y la
 * habitación quedaba fuera de venta sin que nadie supiera por qué.
 *
 * QUÉ CUIDA ESTA PRUEBA
 *
 * Que la salida exista EXACTAMENTE cuando el check-out es imposible, y no un
 * caso más:
 *
 *   · con un huésped alojado contesta que no, y dice que el camino es el
 *     check-out —si esto se rompiera, se podría sacar a alguien de su
 *     habitación sin cerrar ni contabilizar su folio—;
 *   · deja la habitación en LIMPIEZA, nunca en DISPONIBLE;
 *   · exige un motivo escrito;
 *   · y no toca una habitación que no esté ocupada.
 * ============================================================================
 */

function servicioCon(
  habitacion: Partial<Habitacion>,
  reservaDentro: Partial<Reservacion> | null,
) {
  const guardadas: any[] = [];
  const buscadas: any[] = [];
  const repos = new Map<any, any>();
  repos.set(Habitacion, {
    createQueryBuilder: () => ({
      setLock: () => ({
        where: () => ({ getOne: async () => habitacion as Habitacion }),
      }),
    }),
    save: async (h: any) => {
      guardadas.push({ ...h });
      return h;
    },
  });
  repos.set(Reservacion, {
    findOne: async (opciones: any) => {
      buscadas.push(opciones?.where);
      return reservaDentro as Reservacion | null;
    },
  });
  const manager = {
    getRepository: (entidad: any) => {
      const r = repos.get(entidad);
      if (!r) throw new Error(`Repositorio no esperado: ${entidad?.name}`);
      return r;
    },
  };
  const dataSource = { transaction: async (cb: any) => cb(manager) };
  const servicio = new HousekeepingService(
    {} as any,
    repos.get(Habitacion),
    dataSource as any,
  );
  return { servicio, guardadas, buscadas };
}

const LA_101 = {
  id: 'hab-101',
  numero: '101',
  empresaId: 'e1',
  estado: EstadoHabitacion.OCUPADA,
};

const MOTIVO = 'Reservación borrada en pruebas; no hay huésped dentro.';

describe('Housekeeping · una habitación ocupada por nadie', () => {
  it('la regla de fondo sigue siendo que OCUPADA no tiene salida manual', () => {
    /*
     * La prueba de la prueba. Si alguien «arreglara» el caso abriendo
     * `OCUPADA` en la tabla de transiciones, lo de abajo seguiría verde y el
     * agujero sería mucho mayor que el defecto que cerramos.
     */
    const servicio = new HousekeepingService({} as any, {} as any, {} as any);
    expect(servicio.transicionesValidas('OCUPADA')).toEqual([]);
  });

  it('sin huésped dentro, libera y la deja en LIMPIEZA, nunca disponible', async () => {
    const { servicio, guardadas, buscadas } = servicioCon({ ...LA_101 }, null);
    const r = await servicio.liberarHabitacionSinHuesped(
      'hab-101',
      MOTIVO,
      'e1',
    );
    expect(r.ok).toBe(true);
    expect(r.habitacion).toBe('101');
    expect(r.estado).toBe(EstadoHabitacion.LIMPIEZA);
    expect(guardadas).toHaveLength(1);
    expect(guardadas[0].estado).toBe(EstadoHabitacion.LIMPIEZA);
    /* Lo que se preguntó es justo lo que define el caso. */
    expect(buscadas[0]).toMatchObject({
      habitacionId: 'hab-101',
      estado: EstadoReservacion.CHECK_IN,
      empresaId: 'e1',
    });
  });

  it('con un huésped alojado contesta que no, y nombra el check-out', async () => {
    const { servicio, guardadas } = servicioCon(
      { ...LA_101 },
      { id: 'r1', habitacionId: 'hab-101', estado: EstadoReservacion.CHECK_IN },
    );
    await expect(
      servicio.liberarHabitacionSinHuesped('hab-101', MOTIVO, 'e1'),
    ).rejects.toThrow(ConflictException);
    await expect(
      servicio.liberarHabitacionSinHuesped('hab-101', MOTIVO, 'e1'),
    ).rejects.toThrow(/check-out/);
    expect(guardadas).toHaveLength(0);
  });

  it('una habitación que no está ocupada no se toca', async () => {
    const { servicio, guardadas } = servicioCon(
      { ...LA_101, estado: EstadoHabitacion.DISPONIBLE },
      null,
    );
    await expect(
      servicio.liberarHabitacionSinHuesped('hab-101', MOTIVO, 'e1'),
    ).rejects.toThrow(ConflictException);
    expect(guardadas).toHaveLength(0);
  });

  it('sin motivo escrito no procede, y ni siquiera va a la base', async () => {
    const { servicio, guardadas, buscadas } = servicioCon({ ...LA_101 }, null);
    await expect(
      servicio.liberarHabitacionSinHuesped('hab-101', '   ', 'e1'),
    ).rejects.toThrow(BadRequestException);
    await expect(
      servicio.liberarHabitacionSinHuesped('hab-101', 'porque sí', 'e1'),
    ).rejects.toThrow(BadRequestException);
    expect(guardadas).toHaveLength(0);
    expect(buscadas).toHaveLength(0);
  });
});
