import { CotizacionesService } from './cotizaciones.service';

/**
 * Cerrar las propuestas perdedoras, sin matar las que siguen en juego.
 *
 * La primera version de esta limpieza borraba trabajo vivo: asumia que si una
 * requisicion ya tenia una cotizacion APROBADA, ninguna hermana pendiente
 * podia ganar. Es falso. Llega una propuesta posterior mas barata, el comprador
 * la somete —la pantalla se lo ofrece— y eso es una RE-ADJUDICACION.
 *
 * Paso el 22-sep: una de $102.66 contra $110.20 ya adjudicados, con motivo
 * escrito, llego a la bandeja de Gerencia y el arranque siguiente se la comio
 * en silencio. Y habria pasado en CADA reinicio.
 */
describe('cerrar las propuestas perdedoras sin matar las vivas', () => {
  const ADJUDICADA_EN = new Date('2026-09-22T01:28:00Z');

  function servicio(hermanas: unknown[]) {
    const actualizadas: string[][] = [];
    const qb = () => {
      const b: Record<string, unknown> = {};
      for (const m of ['update', 'set', 'where']) {
        b[m] = jest.fn((...args: unknown[]) => {
          const p = args[1] as { ids?: string[] } | undefined;
          if (p?.ids) actualizadas.push(p.ids);
          return b;
        });
      }
      b.execute = jest.fn(async () => ({}));
      return b;
    };
    const cotizacionRepo = {
      findOne: jest.fn(async () => ({ id: 'ganadora', requisicionId: 'req-1' })),
      find: jest.fn(async () => hermanas),
      createQueryBuilder: jest.fn(qb),
    };
    const aprobacionRepo = { createQueryBuilder: jest.fn(qb) };
    const Servicio = CotizacionesService as unknown as new (
      ...a: unknown[]
    ) => CotizacionesService;
    const svc = new Servicio(
      cotizacionRepo,
      {}, {}, {}, {},
      aprobacionRepo,
      {}, {}, {},
    );
    const descartar = (adjudicadaEn: Date | null) =>
      (svc as unknown as {
        descartarHermanasEnJuego: (
          a: string, b: string, c: string | null, d: Date | null,
        ) => Promise<number>;
      }).descartarHermanasEnJuego('ganadora', 'emp', 'quien', adjudicadaEn);
    return { descartar, actualizadas };
  }

  const hermana = (id: string, pedidaEn: string | null) => ({
    id,
    fechaSolicitudAprobacion: pedidaEn ? new Date(pedidaEn) : null,
  });

  it('cierra la que ya esperaba cuando se adjudico', async () => {
    const s = servicio([hermana('vieja', '2026-09-21T10:00:00Z')]);

    expect(await s.descartar(ADJUDICADA_EN)).toBe(1);
    expect(s.actualizadas.flat()).toContain('vieja');
  });

  /* El fallo que motivo la prueba. */
  it('NO toca la sometida despues de la adjudicacion', async () => {
    const s = servicio([hermana('nueva', '2026-09-22T02:00:00Z')]);

    expect(await s.descartar(ADJUDICADA_EN)).toBe(0);
    expect(s.actualizadas.flat()).not.toContain('nueva');
  });

  it('distingue una de otra en la misma requisicion', async () => {
    const s = servicio([
      hermana('vieja', '2026-09-21T10:00:00Z'),
      hermana('nueva', '2026-09-22T02:00:00Z'),
    ]);

    expect(await s.descartar(ADJUDICADA_EN)).toBe(1);
    const tocadas = s.actualizadas.flat();
    expect(tocadas).toContain('vieja');
    expect(tocadas).not.toContain('nueva');
  });

  /*
   * Al adjudicar no hay fecha que comparar: lo que este pendiente en ese
   * instante queda superado por definicion.
   */
  it('sin fecha de corte descarta lo pendiente en ese momento', async () => {
    const s = servicio([hermana('cualquiera', '2026-09-21T10:00:00Z')]);

    expect(await s.descartar(null)).toBe(1);
  });

  it('nunca se descarta a si misma', async () => {
    const s = servicio([hermana('ganadora', '2026-09-21T10:00:00Z')]);

    expect(await s.descartar(ADJUDICADA_EN)).toBe(0);
  });
});
