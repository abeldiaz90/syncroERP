/**
 * ============================================================================
 * Fechas de calendario
 * ----------------------------------------------------------------------------
 * Una fecha de vencimiento no es un instante: es un día del calendario. El 8 de
 * octubre es el 8 de octubre para el cliente que firma, para el cajero que
 * cobra y para el contador que provisiona, sin importar la hora ni la zona.
 *
 * JavaScript no distingue las dos cosas y ahí está la trampa:
 *
 *   new Date('2026-10-08')       →  medianoche UTC
 *   ...getDate() en UTC-6        →  7
 *
 * Es decir: parsear una fecha ISO y luego leerla con los captadores locales
 * devuelve el DÍA ANTERIOR en todo México. Y como TypeORM escribe las columnas
 * `date` con esos mismos captadores locales, el error no se nota: el sistema
 * queda internamente consistente un día corrido. Un crédito a 30 días vendido
 * hoy vence a los 29, la política de día hábil evalúa el día de la semana
 * equivocado, y todo cuadra contra sí mismo.
 *
 * Estas dos funciones son el par: se parsea a medianoche LOCAL y se rinde con
 * los captadores locales. Así el día que entra es el día que sale.
 * ============================================================================
 */

/** Parsea `yyyy-mm-dd` a medianoche local. Otros valores se dejan como estén. */
export function fechaCalendario(valor?: Date | string | null): Date {
  if (!valor) return new Date();
  if (valor instanceof Date) return new Date(valor);

  const texto = String(valor).trim();
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (soloFecha) {
    const [, a, m, d] = soloFecha;
    return new Date(Number(a), Number(m) - 1, Number(d));
  }
  // Con hora explícita el valor SÍ es un instante y se respeta tal cual.
  return new Date(texto);
}

/** Rinde `yyyy-mm-dd` con los captadores locales, que es como se guardó. */
export function diaCalendario(valor?: Date | string | null): string {
  const d = fechaCalendario(valor);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}
