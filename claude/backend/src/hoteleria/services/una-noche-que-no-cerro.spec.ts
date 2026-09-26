import { AuditoriaNocturnaService } from './auditoria-nocturna.service';
import { Hotel } from '../entities/hotel.entity';
import { Reservacion, EstadoReservacion } from '../entities/reservacion.entity';

/**
 * ============================================================================
 * Una noche que no cerró no es una noche cerrada
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * Se corrió la auditoría nocturna del hotel de demostración desde la pantalla.
 * Contestó, en verde y con una palomita: «Auditoría completada». Debajo, cero
 * noches posteadas, cero pesos y la misma fecha operativa de antes.
 *
 * Y estaba bien no haber corrido: la fecha operativa del hotel era el 26 y en
 * el hotel todavía era 25. El cierre de una noche se hace cuando la noche
 * termina; adelantarlo postearía una renta que nadie ha dormido. El servicio
 * se negaba, correctamente, y devolvía sin más.
 *
 * El problema es que esa negativa volvía con la misma forma que un cierre real
 * —los mismos campos, todos en cero— y la pantalla sólo miraba que la llamada
 * hubiera respondido 200. Quien la corrió se fue creyendo que el día estaba
 * cerrado. Es el mismo patrón que ya cerramos en compras y en la caja: el
 * silencio contado como éxito.
 *
 * QUÉ CUIDA ESTA PRUEBA
 *
 * Que la negativa se pueda distinguir de un cierre sin interpretar unos ceros:
 * `ejecutada: false` y un `motivo` que explique qué falta. Y que un cierre de
 * verdad siga diciendo `ejecutada: true`.
 * ============================================================================
 */

function servicioCon(hotel: Partial<Hotel>, reservas: Reservacion[] = []) {
  const guardados: any[] = [];
  const repos = new Map<any, any>();
  repos.set(Hotel, {
    createQueryBuilder: () => ({
      setLock: () => ({
        where: () => ({ getOne: async () => hotel as Hotel }),
      }),
    }),
    save: async (h: any) => {
      guardados.push(h);
      return h;
    },
  });
  repos.set(Reservacion, {
    find: async () => reservas,
    save: async (r: any) => r,
  });
  const manager = {
    getRepository: (entidad: any) => {
      const r = repos.get(entidad);
      if (!r) throw new Error(`Repositorio no esperado: ${entidad?.name}`);
      return r;
    },
    query: async () => [],
  };
  const dataSource = {
    transaction: async (_nivel: any, cb: any) => cb(manager),
  };
  const servicio = new AuditoriaNocturnaService(
    repos.get(Hotel),
    repos.get(Reservacion),
    dataSource as any,
  );
  return { servicio, guardados };
}

const hotelBase = {
  id: 'h1',
  empresaId: 'e1',
  nombre: 'Hotel de prueba',
  zonaHoraria: 'UTC',
  tasaIva: 16,
  tasaImpuestoHospedaje: 3,
  preciosIncluyenImpuestos: false,
};

describe('Auditoría nocturna · una noche que no cerró no es una noche cerrada', () => {
  const hoy = new Date().toISOString().slice(0, 10);
  const manana = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  it('cuando el día operativo aún no termina, dice que NO se ejecutó y por qué', async () => {
    const { servicio, guardados } = servicioCon({
      ...hotelBase,
      fechaOperativa: manana,
    } as any);

    const r = await servicio.ejecutarManual('h1', 'e1');

    expect(r.ejecutada).toBe(false);
    expect(r.motivo).toBeTruthy();
    expect(r.motivo).toContain(manana);
    expect(r.nochesPosteadas).toBe(0);
    /* Y, sobre todo, no tocó nada: ni fecha operativa ni última auditoría. */
    expect(guardados).toEqual([]);
    expect(r.fechaOperativa).toBe(manana);
  });

  it('un cierre de verdad sí dice que se ejecutó y avanza la fecha', async () => {
    const { servicio, guardados } = servicioCon(
      { ...hotelBase, fechaOperativa: hoy } as any,
      [],
    );

    const r = await servicio.ejecutarManual('h1', 'e1');

    expect(r.ejecutada).toBe(true);
    expect(r.motivo).toBeNull();
    expect(guardados).toHaveLength(1);
    expect(guardados[0].fechaOperativa > hoy).toBe(true);
    expect(guardados[0].ultimaAuditoria).toBeInstanceOf(Date);
  });

  it('la reservación hospedada sin noches pendientes no inventa cargos', async () => {
    const reserva = {
      id: 'r1',
      codigo: 'RES-1',
      empresaId: 'e1',
      hotelId: 'h1',
      estado: EstadoReservacion.CHECK_IN,
      fechaEntrada: hoy,
      fechaSalida: manana,
      tarifaNoche: 850,
      nochesPosteadas: 1,
    } as unknown as Reservacion;
    const { servicio } = servicioCon(
      { ...hotelBase, fechaOperativa: hoy } as any,
      [reserva],
    );

    const r = await servicio.ejecutarManual('h1', 'e1');

    expect(r.ejecutada).toBe(true);
    expect(r.nochesPosteadas).toBe(0);
    expect(r.reservacionesProcesadas).toBe(1);
  });
});
