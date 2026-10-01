import { BadRequestException } from '@nestjs/common';
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

/**
 * ============================================================================
 * Un rango de fechas válido, o un error que se entiende
 * ----------------------------------------------------------------------------
 * Varios reportes hacían `Between(new Date(desde), new Date(hasta))` con lo que
 * viniera en la consulta. Sin parámetros, `new Date(undefined)` es una fecha
 * inválida, la base la rechaza y el usuario recibe un 500 «No se pudo completar
 * la operación en la base de datos» — que no dice nada y parece una caída del
 * sistema. Se detectó llamando a `/tesoreria/flujo-efectivo` y a
 * `/recetas/costos/teorico-vs-real` sin parámetros: los dos reventaban.
 *
 * Aquí se valida antes de tocar la base: si falta o no se entiende la fecha, se
 * dice cuál y con qué formato; y se exige que el rango vaya hacia adelante,
 * porque un rango invertido no falla, simplemente devuelve vacío y el usuario
 * concluye que no hubo movimientos.
 *
 * ── Y EL ÚLTIMO DÍA, QUE SE PERDÍA ──────────────────────────────────────────
 *
 * `new Date('2026-09-27')` es 2026-09-27 a las 00:00. Un `Between(desde, hasta)`
 * contra una columna con HORA deja fuera todo el día 27: lo que pasó a las
 * 13:30 es posterior a la medianoche del 27.
 *
 * Medido el 27-sep-2026 en Control de costos de A&B. Se consumieron dos
 * recetas a las 13:30 y el reporte —cuyo «Hasta» por omisión es HOY— decía
 * «Sin consumo de recetas en el periodo». Con `hasta=2026-09-28` aparecían.
 * En alimentos y bebidas, el consumo de hoy es justo lo que se mira.
 *
 * Por eso se devuelve también `hastaFinDelDia`: las 23:59:59.999 de ese mismo
 * día. Quien compare contra una columna con hora usa ésa. `hasta` se conserva
 * para quien trate el valor como un día de calendario —la ocupación hotelera
 * cuenta noches, y ahí medianoche es lo correcto—.
 * ============================================================================
 */
export function exigirRangoDeFechas(
  desde: unknown,
  hasta: unknown,
): { desde: Date; hasta: Date; hastaFinDelDia: Date } {
  const leer = (valor: unknown, nombre: string): Date => {
    const texto = String(valor ?? '').trim();
    if (!texto) {
      throw new BadRequestException(
        `Falta la fecha "${nombre}". Se espera AAAA-MM-DD.`,
      );
    }
    /*
     * `new Date('2026-09-27')` se interpreta como UTC —medianoche del 27 en
     * Greenwich—, que en México es el 26 a las 18:00. Sumarle las 23:59 de
     * «fin del día» daba el 26 a las 23:59: el rango seguía cortando el día
     * entero, sólo que por otro lado.
     *
     * Una fecha sin hora es un día del CALENDARIO de quien la escribe. Se
     * fuerza a medianoche local añadiendo la hora, que es lo que hace el
     * mismo navegador con un `<input type="date">`.
     */
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(texto)
      ? new Date(`${texto}T00:00:00`)
      : new Date(texto);
    if (Number.isNaN(fecha.getTime())) {
      throw new BadRequestException(
        `La fecha "${nombre}" no se entiende: "${texto}". Se espera AAAA-MM-DD.`,
      );
    }
    return fecha;
  };

  const d = leer(desde, 'desde');
  const h = leer(hasta, 'hasta');
  if (d.getTime() > h.getTime()) {
    throw new BadRequestException(
      'El rango está invertido: "desde" es posterior a "hasta".',
    );
  }
  const finDelDia = new Date(h);
  finDelDia.setHours(23, 59, 59, 999);
  return { desde: d, hasta: h, hastaFinDelDia: finDelDia };
}

/**
 * ============================================================================
 * La fecha contable de un hecho es el día en que ocurrió, no el instante UTC
 * ----------------------------------------------------------------------------
 * Medido en vivo el 1-oct-2026, recorriendo el ciclo de compras con Abel:
 *
 *   Recepción de mercancía     30 de septiembre, 18:13 (hora de México)
 *   Póliza EG-2026-00001        1 de octubre
 *
 * El mismo hecho, dos fechas, dos meses. El almacén recibió en septiembre y la
 * contabilidad asentó el costo y el pasivo en octubre.
 *
 * La causa: quien encola el asiento pone `fecha: new Date()`, el proceso del
 * servidor corre en UTC y la columna `fecha` de la póliza es de tipo `date`,
 * que TypeORM escribe con los captadores locales del proceso. En UTC-6 eso
 * significa que **todo lo que pasa después de las 18:00 se contabiliza al día
 * siguiente**: seis horas de cada día mal fechadas, y el último día del mes,
 * seis horas de operación que se van al mes que viene y descuadran el cierre
 * contra el inventario.
 *
 * No es un redondeo: es la diferencia entre que un cierre cuadre y que no.
 *
 * `fechaCalendarioNegocio` ya resolvía el «qué día es hoy» en la zona de la
 * empresa, pero devuelve texto y los generadores necesitan un `Date`. Esto es
 * el par que faltaba: el día de negocio, a medianoche local, listo para que
 * TypeORM lo escriba como el día que fue.
 * ============================================================================
 */
export function fechaContableNegocio(
  instante = new Date(),
  timeZone = DEFAULT_TIME_ZONE,
): Date {
  const [anio, mes, dia] = fechaCalendarioNegocio(instante, timeZone)
    .split('-')
    .map(Number);
  return new Date(anio, mes - 1, dia);
}
