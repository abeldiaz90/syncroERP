/**
 * ============================================================================
 * SyncroERP · Por qué la mora de Fineract está congelada
 * ----------------------------------------------------------------------------
 * La pantalla de cartera vencida del portal encontró un crédito con saldo
 * vencido y CERO días de atraso. Las dos cifras salen de sitios distintos:
 * `totalOverdue` se calcula al consultar, pero `pastDueDays` y la clasificación
 * en rangos de morosidad las escribe el cierre de día —el COB, «close of
 * business»— que Fineract corre como trabajo programado.
 *
 * Si el COB no corre, la clasificación de mora queda congelada: los rangos y
 * buckets configurados no se aplican a nada, y comparar la mora del ERP contra
 * la de Fineract da diferencias que no son de criterio sino de proceso.
 *
 * Esto sólo MIRA. No enciende nada ni mueve la fecha de negocio: avanzar el
 * cierre de día de un core banking es una operación con consecuencias
 * contables y no la toma un script por su cuenta.
 *
 *   npm.cmd run fineract:cob
 * ============================================================================
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { FineractHttpService } from '../src/integracion/adaptadores/fineract/fineract-http.service';
import { diaCalendario } from '../src/common/utils/fecha-calendario.util';

const ok = (m: string) => console.log(`  \x1b[32mOK\x1b[0m    ${m}`);
const aviso = (m: string) => console.log(`  \x1b[33mAVISO\x1b[0m ${m}`);
const mal = (m: string) => console.log(`  \x1b[31mALTO\x1b[0m  ${m}`);
const nota = (m: string) => console.log(`        \x1b[90m${m}\x1b[0m`);
const titulo = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`);

const fecha = (v: unknown): string => {
  if (Array.isArray(v)) {
    const [a, m, d] = v as unknown[];
    return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return v ? String(v) : '—';
};

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const http = app.get(FineractHttpService);

  const leer = async <T>(ruta: string): Promise<T | null> => {
    try {
      return await http.get<T>(ruta, { timeoutMs: 30000 });
    } catch (e) {
      nota(`${ruta} → ${e instanceof Error ? e.message.slice(0, 140) : String(e)}`);
      return null;
    }
  };

  // ── 1. El planificador ───────────────────────────────────────────────────
  titulo('1 · El planificador de trabajos');
  const planificador = await leer<{ active?: boolean }>('/v1/scheduler');
  if (planificador === null) {
    mal('No se pudo consultar el planificador.');
  } else if (planificador.active) {
    ok('Encendido.');
  } else {
    mal('APAGADO. Ningún trabajo programado corre, incluido el cierre de día.');
    nota('Se enciende con: POST /v1/scheduler?command=start');
  }

  // ── 2. La fecha de negocio ───────────────────────────────────────────────
  titulo('2 · La fecha de negocio');
  const fechas = await leer<{ type?: string; date?: unknown }[]>('/v1/businessdate');
  if (!fechas?.length) {
    aviso('Fineract no reporta fechas de negocio configuradas.');
    nota('Sin fecha de negocio, el cierre de día no tiene desde dónde avanzar.');
  } else {
    /*
     * COB_DATE va un dia ATRAS de BUSINESS_DATE a proposito: el cierre procesa
     * el dia que ya termino. La primera version marcaba eso como atraso y
     * gritaba por lo unico que estaba bien.
     */
    const hoy = diaCalendario(new Date());
    const ayer = diaCalendario(new Date(Date.now() - 86400000));
    for (const f of fechas) {
      const valor = fecha(f.date);
      const esperado = f.type === 'COB_DATE' ? ayer : hoy;
      const atrasada = valor < esperado;
      (atrasada ? aviso : ok)(
        `${f.type}: ${valor}${atrasada ? `  (se esperaba ${esperado})` : ''}`,
      );
    }
  }

  /*
   * ── 2b. El alcance del COB ──────────────────────────────────────────────
   * Activar «Loan COB» no cierra nada de forma retroactiva: cada prestamo se
   * cierra desde SU ultima fecha cerrada, y los que nunca se cerraron quedan
   * rezagados. Fineract expone eso: cual es el prestamo mas atrasado y si el
   * proceso de alcance esta corriendo. Sin estas dos respuestas no se puede
   * distinguir «el alcance sigue trabajando» de «el alcance no hizo nada».
   */
  titulo('2b · El alcance del cierre');
  const corriendo = await leer<{ catchUpRunning?: boolean }>('/v1/loans/is-catch-up-running');
  if (corriendo === null) {
    aviso('Esta version no expone el estado del alcance.');
  } else if (corriendo.catchUpRunning) {
    aviso('El alcance ESTA corriendo ahora. Espera y vuelve a consultar.');
  } else {
    ok('El alcance no esta corriendo.');
  }

  const rezagado = await leer<{ cobProcessedDate?: unknown; loanId?: unknown }>(
    '/v1/loans/oldest-cob-processed-loan',
  );
  if (rezagado === null) {
    aviso('Esta version no expone el prestamo mas rezagado del COB.');
  } else if (!rezagado.cobProcessedDate) {
    mal('Ningun prestamo tiene fecha de cierre: el COB no ha procesado nada.');
    nota('Con los trabajos ya activos, el cierre programado corre a medianoche;');
    nota('para no esperar, se lanza a mano con --aplicar --correr-cob.');
  } else {
    ok(`Prestamo mas rezagado: ${String(rezagado.loanId ?? '—')} cerrado al ${fecha(rezagado.cobProcessedDate)}.`);
  }

  // ── 3. Los trabajos que importan ─────────────────────────────────────────
  titulo('3 · Trabajos relacionados con mora');
  const trabajos = await leer<
    {
      jobId?: number;
      displayName?: string;
      active?: boolean;
      nextRunTime?: unknown;
      lastRunHistory?: { status?: string; jobRunStartTime?: unknown; jobRunErrorMessage?: string };
    }[]
  >('/v1/jobs');

  if (!trabajos?.length) {
    mal('No se pudo listar los trabajos programados.');
  } else {
    const relevantes = trabajos.filter((t) =>
      /cob|close of business|delinquen|arrear|overdue|npa|accrual/i.test(String(t.displayName ?? '')),
    );
    nota(`${trabajos.length} trabajo(s) en total; ${relevantes.length} tocan la mora.`);

    for (const t of relevantes) {
      const h = t.lastRunHistory;
      const estado = h?.status ?? 'nunca ha corrido';
      const cuando = h?.jobRunStartTime ? fecha(h.jobRunStartTime) : '—';
      const linea = `${t.displayName} · ${t.active ? 'activo' : 'INACTIVO'} · última: ${estado} (${cuando})`;

      if (!t.active) mal(linea);
      else if (String(estado).toLowerCase().includes('error')) mal(linea);
      else if (estado === 'nunca ha corrido') aviso(linea);
      else ok(linea);

      if (h?.jobRunErrorMessage) nota(String(h.jobRunErrorMessage).slice(0, 200));
    }

    if (relevantes.length === 0) {
      aviso('Ninguno de los trabajos listados menciona cierre de día ni morosidad.');
      nota('Primeros trabajos disponibles, por si el nombre es otro:');
      for (const t of trabajos.slice(0, 12)) nota(`· ${t.displayName}`);
    }
  }

  // ── 4. Lo que se ve en la cartera ────────────────────────────────────────
  titulo('4 · Qué dice la cartera ahora mismo');
  const lista = await leer<{
    pageItems?: {
      accountNo?: string;
      clientName?: string;
      inArrears?: boolean;
      summary?: { totalOverdue?: number };
      delinquent?: { pastDueDays?: number; delinquentDays?: number };
      lastClosedBusinessDate?: unknown;
    }[];
  }>('/v1/loans?limit=500&offset=0');

  const prestamos = lista?.pageItems ?? [];
  const conVencido = prestamos.filter(
    (p) => p.inArrears === true || Number(p.summary?.totalOverdue ?? 0) > 0,
  );
  const sinDias = conVencido.filter(
    (p) => Number(p.delinquent?.pastDueDays ?? 0) === 0 && Number(p.delinquent?.delinquentDays ?? 0) === 0,
  );

  nota(`${prestamos.length} préstamo(s) revisados · ${conVencido.length} con saldo vencido`);
  if (conVencido.length === 0) {
    ok('No hay cartera vencida; no hay nada que clasificar todavía.');
  } else if (sinDias.length === 0) {
    ok('Todos los vencidos tienen días de atraso: la clasificación está al día.');
  } else {
    mal(`${sinDias.length} de ${conVencido.length} tienen importe vencido y CERO días de atraso.`);
    for (const p of sinDias.slice(0, 5)) {
      nota(
        `· ${p.accountNo} · ${p.clientName} · vencido ${Number(p.summary?.totalOverdue ?? 0).toFixed(2)} · último cierre ${fecha(p.lastClosedBusinessDate)}`,
      );
    }
    nota('Es la huella de un cierre de día que no ha corrido desde que vencieron.');
  }

  titulo('Qué hacer con esto');
  nota('Si el planificador está apagado, encenderlo es el primer paso; el cierre');
  nota('de día se ejecuta después y recalcula la antigüedad de toda la cartera.');
  nota('No lo hace este script: avanzar el cierre de un core banking tiene');
  nota('consecuencias contables y debe decidirlo una persona.');
  console.log('');
  await app.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
