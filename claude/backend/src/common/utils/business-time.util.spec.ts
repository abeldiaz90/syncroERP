import { fechaCalendarioNegocio, rangoDiaNegocio } from './business-time.util';

describe('business-time.util', () => {
  const zona = 'America/Mexico_City';

  it('mantiene el día de negocio de México cuando UTC ya cambió de fecha', () => {
    expect(fechaCalendarioNegocio(new Date('2026-08-02T03:30:00.000Z'), zona))
      .toBe('2026-08-01');
  });

  it('construye un rango exclusivo de 24 horas para una fecha sin cambio estacional', () => {
    const rango = rangoDiaNegocio('2026-08-01', zona);
    expect(rango.inicio.toISOString()).toBe('2026-08-01T06:00:00.000Z');
    expect(rango.finExclusivo.toISOString()).toBe('2026-08-02T06:00:00.000Z');
  });
});
