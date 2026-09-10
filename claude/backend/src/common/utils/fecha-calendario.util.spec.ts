import {
  diaCalendario,
  fechaCalendario,
} from './fecha-calendario.util';

/**
 * Estas pruebas sólo dicen algo en una zona al oeste de UTC, que es donde opera
 * el ERP. Se fija la zona explícitamente para que no dependan de la máquina que
 * las corra: en UTC pasarían siempre, incluso con el error puesto.
 */
describe('fechaCalendario: el día que entra es el día que sale', () => {
  const zonaOriginal = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'America/Mexico_City';
  });
  afterAll(() => {
    process.env.TZ = zonaOriginal;
  });

  it('no corre la fecha un día al parsear yyyy-mm-dd', () => {
    // `new Date('2026-09-08').getDate()` devuelve 7 en México. Ése era el error.
    expect(diaCalendario('2026-09-08')).toBe('2026-09-08');
  });

  it('conserva el día de la semana, que es lo que mira la política de día hábil', () => {
    // 2026-11-07 es sábado. Con el parseo en UTC se leía como viernes y la
    // cuota no se recorría, o se recorría desde el día equivocado.
    expect(fechaCalendario('2026-11-07').getDay()).toBe(6);
  });

  it('suma meses sobre el día correcto', () => {
    const d = fechaCalendario('2026-09-08');
    d.setMonth(d.getMonth() + 1);
    expect(diaCalendario(d)).toBe('2026-10-08');
  });

  it('respeta un instante cuando la cadena trae hora', () => {
    // Con hora explícita el valor sí es un instante y no se toca.
    expect(fechaCalendario('2026-01-01T12:00:00.000Z').toISOString()).toBe(
      '2026-01-01T12:00:00.000Z',
    );
  });

  it('ida y vuelta para todos los días de un mes', () => {
    for (let dia = 1; dia <= 31; dia++) {
      const texto = `2026-10-${String(dia).padStart(2, '0')}`;
      expect(diaCalendario(texto)).toBe(texto);
    }
  });
});
