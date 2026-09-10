const DEFAULT_TIME_ZONE = process.env.BUSINESS_TIMEZONE?.trim() || 'America/Mexico_City';

function partesEnZona(fecha: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(fecha);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

function offsetZonaMs(instante: Date, timeZone: string): number {
  const p = partesEnZona(instante, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - instante.getTime();
}

/** Convierte una fecha/hora de pared de la zona de negocio a un instante UTC. */
export function fechaLocalNegocioAUtc(local: string, timeZone = DEFAULT_TIME_ZONE): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(local);
  if (!m) throw new Error(`Fecha local inválida: ${local}`);
  const baseUtc = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], +(m[7] ?? 0)));
  let resultado = new Date(baseUtc.getTime() - offsetZonaMs(baseUtc, timeZone));
  // Segunda pasada para cambios de horario cercanos al instante convertido.
  resultado = new Date(baseUtc.getTime() - offsetZonaMs(resultado, timeZone));
  return resultado;
}

export function fechaCalendarioNegocio(instante = new Date(), timeZone = DEFAULT_TIME_ZONE): string {
  const p = partesEnZona(instante, timeZone);
  return `${p.year.toString().padStart(4, '0')}-${p.month.toString().padStart(2, '0')}-${p.day.toString().padStart(2, '0')}`;
}

function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + dias));
  return x.toISOString().slice(0, 10);
}

export function rangoDiaNegocio(fecha?: string, timeZone = DEFAULT_TIME_ZONE) {
  const dia = fecha || fechaCalendarioNegocio(new Date(), timeZone);
  const inicio = fechaLocalNegocioAUtc(`${dia}T00:00:00`, timeZone);
  const finExclusivo = fechaLocalNegocioAUtc(`${sumarDias(dia, 1)}T00:00:00`, timeZone);
  return { dia, inicio, finExclusivo, zonaHoraria: timeZone };
}

export function rangoUltimosDiasNegocio(dias: number, timeZone = DEFAULT_TIME_ZONE) {
  const hoy = fechaCalendarioNegocio(new Date(), timeZone);
  const inicioDia = sumarDias(hoy, -(Math.max(1, dias) - 1));
  return {
    inicio: fechaLocalNegocioAUtc(`${inicioDia}T00:00:00`, timeZone),
    finExclusivo: fechaLocalNegocioAUtc(`${sumarDias(hoy, 1)}T00:00:00`, timeZone),
    zonaHoraria: timeZone,
  };
}
