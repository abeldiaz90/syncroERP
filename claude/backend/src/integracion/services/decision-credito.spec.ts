import {
  VeredictoCredito,
  decidir,
  EntradaDecision,
} from './decision-credito.service';
import { ResultadoIdentidad } from '../ports/validacion-identidad.port';

const base = (parcial: Partial<EntradaDecision> = {}): EntradaDecision => ({
  limiteSolicitado: 50_000,
  topeAutomatico: 100_000,
  identidad: {
    resultado: ResultadoIdentidad.VERIFICADA,
    puntaje: 95,
    proveedor: 'prueba',
    motivos: [],
    verificadaEn: new Date(),
  },
  buro: {
    disponible: true,
    puntaje: 750,
    deudaTotal: 10_000,
    peorAtrasoDias: 0,
    proveedor: 'prueba',
    consultadoEn: new Date(),
    motivos: [],
  },
  historial: {
    
    saldoTotal: 5_000,
    saldoVencido: 0,
    creditosActivos: 2,
    diasAtrasoMaximo: 0,
  },
  ...parcial,
});

describe('decidir', () => {
  it('aprueba a un cliente verificado, con buen buró y sin atrasos', () => {
    const r = decidir(base());
    expect(r.veredicto).toBe(VeredictoCredito.APROBADO);
    expect(r.limiteSugerido).toBe(50_000);
  });

  it('nunca aprueba sin validación de identidad, aunque todo lo demás sea bueno', () => {
    const r = decidir(
      base({
        identidad: {
          resultado: ResultadoIdentidad.NO_INICIADA,
          puntaje: 0,
          proveedor: 'ninguno',
          motivos: [],
        },
      }),
    );
    expect(r.veredicto).toBe(VeredictoCredito.REVISION_MANUAL);
    expect(r.limiteSugerido).toBe(0);
  });

  it('rechaza cuando la identidad fue rechazada', () => {
    const r = decidir(
      base({
        identidad: {
          resultado: ResultadoIdentidad.RECHAZADA,
          puntaje: 10,
          proveedor: 'prueba',
          motivos: ['El documento no coincide.'],
        },
      }),
    );
    expect(r.veredicto).toBe(VeredictoCredito.RECHAZADO);
  });

  it('rechaza en firme con 90 días o más de atraso interno', () => {
    const r = decidir(
      base({
        historial: {
          
          saldoTotal: 20_000,
          saldoVencido: 20_000,
          creditosActivos: 1,
          diasAtrasoMaximo: 120,
        },
      }),
    );
    expect(r.veredicto).toBe(VeredictoCredito.RECHAZADO);
    expect(r.limiteSugerido).toBe(0);
  });

  it('manda a revisión lo que excede el tope automático, sin rechazarlo', () => {
    const r = decidir(base({ limiteSolicitado: 500_000, topeAutomatico: 100_000 }));
    expect(r.veredicto).toBe(VeredictoCredito.REVISION_MANUAL);
    expect(r.limiteSugerido).toBe(100_000);
  });

  it('ajusta el límite a la baja cuando el puntaje es intermedio', () => {
    const r = decidir(
      base({
        buro: {
          disponible: true,
          puntaje: 520,
          deudaTotal: null,
          peorAtrasoDias: 100,
          proveedor: 'prueba',
          consultadoEn: new Date(),
          motivos: [],
        },
        historial: null,
      }),
    );
    expect(r.veredicto).toBe(VeredictoCredito.APROBADO_CON_AJUSTE);
    expect(r.limiteSugerido).toBeLessThan(50_000);
    expect(r.limiteSugerido).toBeGreaterThan(0);
  });

  it('un tope automático en cero no aprueba nada por accidente', () => {
    const r = decidir(base({ topeAutomatico: 0 }));
    expect(r.veredicto).toBe(VeredictoCredito.REVISION_MANUAL);
    expect(r.limiteSugerido).toBe(0);
  });
});
