/**
 * ============================================================================
 * SyncroERP · Fechas que se imprimen
 * ----------------------------------------------------------------------------
 * POR QUÉ EXISTE ESTE ARCHIVO
 *
 * El ticket de una venta a crédito imprimía «Invalid Date» donde va la fecha
 * límite de pago. El comprobante que se le entrega al cliente.
 *
 * La causa es de una línea: cada pantalla se escribía su propio formateador
 * como `new Date(s + 'T00:00:00')`, que sirve para las fechas sin hora que
 * manda el backend (`2026-10-25`) y se rompe con cualquier marca de tiempo
 * completa, porque produce `2026-10-25T13:53:59.167ZT00:00:00`. Hay dieciséis
 * copias de esa línea en el frontend; basta pasarle una fecha con hora a
 * cualquiera para imprimir «Invalid Date» delante de un cliente.
 *
 * Aquí hay una sola función, que acepta las dos formas y que NUNCA imprime
 * «Invalid Date»: si la fecha no se entiende, sale una raya. Un comprobante
 * puede admitir que no sabe una fecha; no puede enseñar un error de
 * JavaScript.
 *
 * Nota sobre el huso: una fecha sin hora se interpreta a mediodía UTC, no a
 * medianoche. Con medianoche, cualquier huso al oeste de Greenwich —el de
 * México— resta horas y el 25 se imprime como 24.
 * ============================================================================
 */

export function aFecha(valor: string | Date | null | undefined): Date | null {
  if (!valor) return null;
  const d =
    valor instanceof Date
      ? valor
      : /^\d{4}-\d{2}-\d{2}$/.test(valor)
        ? new Date(`${valor}T12:00:00Z`)
        : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `25 sept 2026`, o `—` si la fecha no se entiende. */
export function fechaCorta(valor: string | Date | null | undefined): string {
  const d = aFecha(valor);
  if (!d) return '—';
  return d.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** `25/09/2026`, o `—`. */
export function fechaNumerica(valor: string | Date | null | undefined): string {
  const d = aFecha(valor);
  if (!d) return '—';
  return d.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** `25 de septiembre de 2026`, o `—`. */
export function fechaLarga(valor: string | Date | null | undefined): string {
  const d = aFecha(valor);
  if (!d) return '—';
  return d.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

/*
 * ============================================================================
 * Rangos que se calculan al abrir la pantalla, no al cargar el módulo
 * ----------------------------------------------------------------------------
 * Medido el 1-oct-2026 abriendo el Libro Diario: el filtro decía 01/09–30/09 y
 * la pantalla anunciaba «3 pólizas · Debe = Haber · ✅ Cuadrado» sin la póliza
 * de ese mismo día. Nada falló, nada avisó. Un libro contable completo,
 * cuadrado, y sin los movimientos de hoy.
 *
 * La causa estaba escrita así, FUERA del componente:
 *
 *     const HOY   = new Date();
 *     const DESDE = new Date(HOY.getFullYear(), HOY.getMonth(), 1)
 *                     .toISOString().split('T')[0];
 *
 * Dos defectos distintos en tres líneas:
 *
 *   1. A nivel de módulo, `new Date()` se evalúa UNA VEZ: cuando el navegador
 *      carga ese trozo de JavaScript. No cuando se abre la pantalla. En
 *      desarrollo basta un chunk de ayer para que el mes se quede congelado;
 *      en producción Next prerenderiza y el valor queda horneado EN EL BUILD,
 *      así que un ERP desplegado en septiembre abre el libro en septiembre
 *      hasta el siguiente despliegue. Era lo que estaba pasando.
 *
 *   2. `toISOString()` convierte a UTC antes de recortar. `new Date(2026, 9, 1)`
 *      es medianoche LOCAL; en cualquier huso al este de Greenwich eso ya es el
 *      día anterior en UTC y el rango arranca un día antes. En México no muerde
 *      —por eso sobrevivió— pero `BUSINESS_TIMEZONE` es configurable, y un
 *      defecto que sólo se comporta bien en un huso es un defecto que espera.
 *
 * De ahí las dos reglas de este bloque: las fechas se arman con las partes
 * locales del reloj —nunca con `toISOString()`— y el cálculo vive DENTRO del
 * componente, así que cada vez que alguien abre la pantalla se vuelve a
 * preguntar qué día es.
 * ============================================================================
 */

/** `2026-10-01` a partir de las partes LOCALES del reloj, sin pasar por UTC. */
export function diaISO(fecha: Date = new Date()): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

/** Hoy, en el reloj de quien mira la pantalla. */
export function hoyISO(): string {
  return diaISO();
}

/**
 * El primer y el último día del mes en curso.
 *
 * Se llama DENTRO del componente —en un `useState(() => mesEnCurso())` o en un
 * `useMemo`— para que el mes se resuelva al abrir la pantalla. Llamarla a nivel
 * de módulo devuelve lo correcto una vez y lo congela.
 */
export function mesEnCurso(hoy: Date = new Date()): {
  desde: string;
  hasta: string;
} {
  /* Día 0 del mes siguiente es el último del actual, y respeta los bisiestos. */
  return {
    desde: diaISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1)),
    hasta: diaISO(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)),
  };
}

/** Del primer día del mes a HOY, para los reportes que no miran al futuro. */
export function mesHastaHoy(hoy: Date = new Date()): {
  desde: string;
  hasta: string;
} {
  return {
    desde: diaISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1)),
    hasta: diaISO(hoy),
  };
}
