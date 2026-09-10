import { resolverVeredicto, PasoEjecutado } from './motor-validacion.service';
import {
  EstadoEjecucion,
  PoliticaPaso,
  ResultadoPaso,
  TipoPasoValidacion,
} from '../validacion.constants';

const paso = (p: Partial<PasoEjecutado>): PasoEjecutado => ({
  orden: 1,
  tipo: TipoPasoValidacion.IDENTIDAD_INE,
  etiqueta: 'Identidad',
  politica: PoliticaPaso.BLOQUEANTE,
  resultado: ResultadoPaso.APROBADO,
  puntaje: 90,
  puntosAportados: 40,
  proveedor: 'x',
  detalle: null,
  evidencia: null,
  ...p,
});

const flujo = { puntajeMinimo: 60, topeAutomatico: 100_000 };

describe('resolverVeredicto', () => {
  it('aprueba cuando todo pasa y el monto cabe en el tope', () => {
    const r = resolverVeredicto(
      [paso({}), paso({ orden: 2, etiqueta: 'Buró', puntosAportados: 30 })],
      flujo,
      50_000,
    );
    expect(r.estado).toBe(EstadoEjecucion.APROBADA);
    expect(r.limiteSugerido).toBe(50_000);
  });

  it('un paso bloqueante rechazado corta y no lo compensa el puntaje', () => {
    const r = resolverVeredicto(
      [
        paso({ resultado: ResultadoPaso.RECHAZADO, puntosAportados: 0 }),
        paso({ orden: 2, etiqueta: 'Buró', puntosAportados: 100 }),
      ],
      flujo,
      10_000,
    );
    expect(r.estado).toBe(EstadoEjecucion.RECHAZADA);
    expect(r.limiteSugerido).toBe(0);
    expect(r.puntaje).toBe(0);
  });

  it('un bloqueante sin proveedor va a revisión, no a rechazo', () => {
    // No es lo mismo que el buró diga que no, a que el buró no conteste.
    const r = resolverVeredicto(
      [paso({ resultado: ResultadoPaso.NO_DISPONIBLE, puntosAportados: 0 })],
      flujo,
      10_000,
    );
    expect(r.estado).toBe(EstadoEjecucion.REVISION_MANUAL);
  });

  it('un paso que deriva manda a revisión aunque el puntaje alcance', () => {
    const r = resolverVeredicto(
      [
        paso({ puntosAportados: 70 }),
        paso({
          orden: 2,
          etiqueta: 'Revisión',
          tipo: TipoPasoValidacion.REVISION_MANUAL,
          politica: PoliticaPaso.DERIVA_A_REVISION,
          resultado: ResultadoPaso.INDETERMINADO,
          puntosAportados: 0,
        }),
      ],
      flujo,
      10_000,
    );
    expect(r.estado).toBe(EstadoEjecucion.REVISION_MANUAL);
    expect(r.puntaje).toBe(70);
  });

  it('un paso informativo que falla no detiene nada', () => {
    const r = resolverVeredicto(
      [
        paso({ puntosAportados: 70 }),
        paso({
          orden: 2,
          etiqueta: 'Listas',
          politica: PoliticaPaso.INFORMATIVO,
          resultado: ResultadoPaso.NO_DISPONIBLE,
          puntosAportados: 0,
        }),
      ],
      flujo,
      10_000,
    );
    expect(r.estado).toBe(EstadoEjecucion.APROBADA);
  });

  it('rechaza por puntaje bajo aunque ningún paso haya cortado', () => {
    const r = resolverVeredicto([paso({ puntosAportados: 20 })], flujo, 10_000);
    expect(r.estado).toBe(EstadoEjecucion.RECHAZADA);
  });

  it('tope automático en cero manda todo a autorización humana', () => {
    const r = resolverVeredicto(
      [paso({ puntosAportados: 90 })],
      { puntajeMinimo: 60, topeAutomatico: 0 },
      1,
    );
    expect(r.estado).toBe(EstadoEjecucion.REVISION_MANUAL);
    expect(r.limiteSugerido).toBe(0);
  });

  it('lo que excede el tope va a revisión con el tope como sugerencia', () => {
    const r = resolverVeredicto([paso({ puntosAportados: 90 })], flujo, 500_000);
    expect(r.estado).toBe(EstadoEjecucion.REVISION_MANUAL);
    expect(r.limiteSugerido).toBe(100_000);
  });

  it('el puntaje se topa en 100 y no baja de 0', () => {
    const alto = resolverVeredicto(
      [paso({ puntosAportados: 80 }), paso({ orden: 2, puntosAportados: 80 })],
      flujo,
      10_000,
    );
    expect(alto.puntaje).toBe(100);

    const bajo = resolverVeredicto(
      [paso({ puntosAportados: -50 })],
      { puntajeMinimo: 0, topeAutomatico: 100 },
      50,
    );
    expect(bajo.puntaje).toBe(0);
  });

  it('un paso OMITIDO no cuenta como falla', () => {
    const r = resolverVeredicto(
      [
        paso({ puntosAportados: 70 }),
        paso({
          orden: 2,
          etiqueta: 'Círculo',
          politica: PoliticaPaso.BLOQUEANTE,
          resultado: ResultadoPaso.OMITIDO,
          puntosAportados: 0,
        }),
      ],
      flujo,
      10_000,
    );
    expect(r.estado).toBe(EstadoEjecucion.APROBADA);
  });

  it('un ERROR del proveedor en un paso bloqueante no aprueba por accidente', () => {
    const r = resolverVeredicto(
      [paso({ resultado: ResultadoPaso.ERROR, puntosAportados: 0 })],
      flujo,
      10_000,
    );
    expect(r.estado).toBe(EstadoEjecucion.REVISION_MANUAL);
  });
});
