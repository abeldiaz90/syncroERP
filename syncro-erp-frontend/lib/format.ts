/**
 * ============================================================================
 * SyncroERP · Formato de datos
 * ----------------------------------------------------------------------------
 * Estaba repetido en decenas de páginas, cada una con su propia variante de
 * `Intl.NumberFormat`. Resultado: la misma cifra se veía "$1,234" en una
 * pantalla y "$1,234.00" en la de al lado. Aquí una sola definición.
 * ============================================================================
 */

const LOCAL = 'es-MX';
const MONEDA = 'MXN';

const fmtDinero = new Intl.NumberFormat(LOCAL, {
  style: 'currency', currency: MONEDA,
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

const fmtDineroCorto = new Intl.NumberFormat(LOCAL, {
  style: 'currency', currency: MONEDA,
  minimumFractionDigits: 0, maximumFractionDigits: 0,
});

const fmtNumero = new Intl.NumberFormat(LOCAL, { maximumFractionDigits: 2 });

const fmtFecha = new Intl.DateTimeFormat(LOCAL, {
  day: '2-digit', month: 'short', year: 'numeric',
});

const fmtFechaHora = new Intl.DateTimeFormat(LOCAL, {
  day: '2-digit', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit',
});

function aNumero(v: unknown): number {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Importe con centavos: para tablas, totales y documentos. */
export const dinero = (v: unknown) => fmtDinero.format(aNumero(v));

/** Importe redondeado: sólo para indicadores grandes donde estorban los centavos. */
export const dineroCorto = (v: unknown) => fmtDineroCorto.format(aNumero(v));

export const numero = (v: unknown) => fmtNumero.format(aNumero(v));

export const porcentaje = (v: unknown, decimales = 1) =>
  `${aNumero(v).toFixed(decimales)}%`;

export function fecha(v: string | Date | null | undefined): string {
  if (!v) return '—';
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : fmtFecha.format(d);
}

export function fechaHora(v: string | Date | null | undefined): string {
  if (!v) return '—';
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : fmtFechaHora.format(d);
}

/** Fecha en formato ISO corto para inputs date (YYYY-MM-DD). */
export function isoCorto(v: string | Date = new Date()): string {
  const d = v instanceof Date ? v : new Date(v);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
}

/** "hace 3 días" — para bitácoras y actividad reciente. */
export function haceCuanto(v: string | Date): string {
  const d = v instanceof Date ? v : new Date(v);
  const seg = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seg < 60) return 'hace un momento';
  const escalas: Array<[number, Intl.RelativeTimeFormatUnit]> = [
    [60, 'minute'], [3600, 'hour'], [86400, 'day'], [604800, 'week'],
    [2592000, 'month'], [31536000, 'year'],
  ];
  const rtf = new Intl.RelativeTimeFormat(LOCAL, { numeric: 'auto' });
  let anterior = 1;
  for (const [limite, unidad] of escalas) {
    if (seg < limite * (unidad === 'minute' ? 60 : 1) || limite === 31536000) {
      const divisor = unidad === 'minute' ? 60 : anterior;
      return rtf.format(-Math.floor(seg / divisor), unidad);
    }
    anterior = limite;
  }
  return fecha(d);
}
