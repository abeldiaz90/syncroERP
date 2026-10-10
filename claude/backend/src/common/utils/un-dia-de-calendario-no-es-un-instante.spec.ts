/**
 * ============================================================================
 * Un día de calendario escrito por una persona no es un instante UTC
 * ----------------------------------------------------------------------------
 * `new Date('2026-10-05')` es medianoche UTC: las 18:00 del día ANTERIOR en la
 * zona de negocio. Guardado en una columna `date`, queda el 4 de octubre. La
 * fecha se corre un día, siempre, y hacia atrás.
 *
 * Lo pagamos en la devolución a proveedor —la devolución y su póliza quedaban
 * fechadas el día anterior, y en un cambio de mes caían en el período
 * equivocado— y en el listado de movimientos de tesorería, que perdía el primer
 * día del rango por un extremo y el último por el otro.
 * ============================================================================
 */
import { diaDeCalendarioAFecha } from './business-time.util';

const comoDia = (f: Date | null) =>
  f === null
    ? null
    : `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;

describe('diaDeCalendarioAFecha', () => {
  it('el día que capturó la persona es el día que se guarda', () => {
    expect(comoDia(diaDeCalendarioAFecha('2026-10-05'))).toBe('2026-10-05');
  });

  it('a medianoche LOCAL, no a medianoche UTC', () => {
    const f = diaDeCalendarioAFecha('2026-10-05')!;
    expect(f.getHours()).toBe(0);
    expect(f.getMinutes()).toBe(0);
    /*
     * La comprobación que de verdad importa: `new Date('2026-10-05')` y esto no
     * son lo mismo. Si alguien "simplifica" el helper a `new Date(texto)`, la
     * diferencia vuelve y esta línea se pone roja.
     */
    expect(f.getTime()).not.toBe(new Date('2026-10-05').getTime());
  });

  it('aguanta que venga con hora detrás', () => {
    expect(comoDia(diaDeCalendarioAFecha('2026-10-05T14:30:00'))).toBe('2026-10-05');
  });

  it('vacío o inválido devuelve null, para que quien llama decida', () => {
    expect(diaDeCalendarioAFecha('')).toBeNull();
    expect(diaDeCalendarioAFecha(undefined)).toBeNull();
    expect(diaDeCalendarioAFecha(null)).toBeNull();
    expect(diaDeCalendarioAFecha('no es una fecha')).toBeNull();
    /*
     * Éste es el que reventaba: el DTO declara la fecha opcional y convierte la
     * cadena vacía en `undefined`, así que la petición llegaba al servicio y
     * ahí se hacía `new Date(undefined)` → Invalid Date → error de base de
     * datos en la cara de quien devolvía mercancía.
     */
    expect(diaDeCalendarioAFecha(new Date('vaya'))).toBeNull();
  });

  it('el último día de un mes es el último día de ese mes', () => {
    expect(comoDia(diaDeCalendarioAFecha('2026-02-28'))).toBe('2026-02-28');
    expect(comoDia(diaDeCalendarioAFecha('2026-12-31'))).toBe('2026-12-31');
    expect(comoDia(diaDeCalendarioAFecha('2026-01-01'))).toBe('2026-01-01');
  });
});
