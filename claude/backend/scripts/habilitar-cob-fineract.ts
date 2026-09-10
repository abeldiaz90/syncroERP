/**
 * ============================================================================
 * SyncroERP · Encender el cierre de día de Fineract
 * ----------------------------------------------------------------------------
 * El diagnóstico mostró que el planificador SÍ corre y que los trabajos viejos
 * de mora —«Update Loan Arrears Ageing»— vienen funcionando. Lo que nunca ha
 * corrido es el COB: «Loan COB» e «Increase COB Date by 1 day» están inactivos
 * y Fineract no reporta fecha de negocio.
 *
 * Esa es la cadena completa: sin fecha de negocio habilitada no hay COB; sin
 * COB los préstamos nunca se cierran, su `lastClosedBusinessDate` queda en
 * nulo, y la clasificación de morosidad no tiene sobre qué trabajar. Por eso un
 * crédito puede mostrar importe vencido —que sale del subsistema viejo, que sí
 * corre— y cero días de atraso —que sale del COB, que no—.
 *
 * ESTO CAMBIA LA CONFIGURACIÓN DE UN CORE BANKING. Por omisión sólo dice qué
 * haría. Con `--aplicar` lo hace, paso por paso, verificando entre uno y otro.
 *
 *   npm.cmd run fineract:habilitar-cob              muestra el plan
 *   npm.cmd run fineract:habilitar-cob -- --aplicar lo ejecuta
 *   npm.cmd run fineract:habilitar-cob -- --aplicar --correr-cob  además lo corre una vez
 *   npm.cmd run fineract:habilitar-cob -- --aplicar --alcanzar    y pone al día lo rezagado
 * ============================================================================
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { FineractHttpService } from '../src/integracion/adaptadores/fineract/fineract-http.service';
import { diaCalendario } from '../src/common/utils/fecha-calendario.util';

const ok = (m: string) => console.log(`  \x1b[32mOK\x1b[0m    ${m}`);
const paso = (m: string) => console.log(`  \x1b[36mHARÍA\x1b[0m ${m}`);
const mal = (m: string) => console.log(`  \x1b[31mFALLA\x1b[0m ${m}`);
const nota = (m: string) => console.log(`        \x1b[90m${m}\x1b[0m`);
const titulo = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`);

const NOMBRES_COB = ['Loan COB', 'Increase COB Date by 1 day'];

/*
 * El trabajo que adelanta la FECHA DE NEGOCIO no se busca por nombre exacto
 * porque cambia entre versiones. Importa mas de lo que parece: al habilitar la
 * fecha de negocio, Fineract deja de leer el reloj del sistema y pasa a usar
 * ese valor. Si nadie lo adelanta, manana el core sigue creyendo que es hoy y
 * todo lo que se capture sin fecha explicita nace con la fecha congelada.
 */
const PATRON_ADELANTA_FECHA = /increase.*business.*date/i;

async function main() {
  const aplicar = process.argv.includes('--aplicar');
  const correrCob = process.argv.includes('--correr-cob');
  const alcanzar = process.argv.includes('--alcanzar');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const http = app.get(FineractHttpService);
  const hoy = diaCalendario(new Date());
  const formato = { locale: 'es', dateFormat: 'yyyy-MM-dd' };

  if (!aplicar) {
    nota('Modo plan: no se cambia nada en Fineract.');
  }

  // ── 1. La fecha de negocio ───────────────────────────────────────────────
  titulo('1 · Habilitar la fecha de negocio');
  const configs = await http.get<{
    globalConfiguration?: { id?: number; name?: string; enabled?: boolean }[];
  }>('/v1/configurations', { timeoutMs: 30000 });

  /*
   * El nombre de la configuración cambia entre versiones —guion, guion bajo,
   * prefijos— así que se BUSCA en vez de darlo por sabido. La primera versión
   * lo asumía y se rindió con un «no existe» que era falso: existía con otro
   * nombre.
   */
  const todas = configs.globalConfiguration ?? [];
  const candidatas = todas.filter((c) => /business.?date/i.test(String(c.name ?? '')));
  const cfgFecha = candidatas.find((c) => /enable/i.test(String(c.name ?? ''))) ?? candidatas[0];

  if (!cfgFecha?.id) {
    mal('Esta instancia no expone ninguna configuración de fecha de negocio.');
    nota(`${todas.length} configuración(es) revisadas. Las que mencionan COB o cierre:`);
    for (const c of todas.filter((x) => /cob|closure|close/i.test(String(x.name ?? '')))) {
      nota(`· ${c.name} → ${c.enabled ? 'habilitada' : 'deshabilitada'}`);
    }
    nota('Si ninguna corresponde, esta versión de Fineract no expone el COB por API.');
    await app.close();
    process.exit(1);
  }
  nota(`configuración encontrada: ${cfgFecha.name}`);

  if (cfgFecha.enabled) {
    ok('Ya está habilitada.');
  } else if (!aplicar) {
    paso(`habilitar la configuración ${cfgFecha.id} (enable_business_date)`);
  } else {
    await http.put(`/v1/configurations/${cfgFecha.id}`, { enabled: true });
    ok('Habilitada.');
  }

  // ── 2. Fijar la fecha ────────────────────────────────────────────────────
  titulo('2 · Fijar la fecha de negocio y la del COB');
  const fechas = await http
    .get<{ type?: string; date?: unknown }[]>('/v1/businessdate', { timeoutMs: 30000 })
    .catch(() => [] as { type?: string; date?: unknown }[]);

  const tiene = (tipo: string) => (fechas ?? []).some((f) => f.type === tipo);

  /*
   * COB_DATE va un dia ATRAS de BUSINESS_DATE: el cierre procesa el dia que ya
   * termino. Ponerlas iguales hace que el COB intente cerrar un dia todavia
   * abierto, y Fineract lo rechaza.
   */
  const ayer = diaCalendario(new Date(Date.now() - 86400000));
  const objetivo: Record<string, string> = { BUSINESS_DATE: hoy, COB_DATE: ayer };

  for (const tipo of ['BUSINESS_DATE', 'COB_DATE']) {
    const valor = objetivo[tipo];
    if (tiene(tipo)) {
      const actual = (fechas ?? []).find((f) => f.type === tipo)?.date;
      ok(`${tipo} ya configurada (${JSON.stringify(actual)}).`);
      continue;
    }
    if (!aplicar) {
      paso(`fijar ${tipo} en ${valor}`);
      continue;
    }
    try {
      await http.post('/v1/businessdate', { type: tipo, date: valor, ...formato });
      ok(`${tipo} fijada en ${valor}.`);
    } catch (e) {
      mal(`No se pudo fijar ${tipo}: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`);
    }
  }

  // ── 3. Activar los trabajos ──────────────────────────────────────────────
  titulo('3 · Activar los trabajos del cierre de día');
  const trabajos = await http.get<
    { jobId?: number; displayName?: string; active?: boolean; cronExpression?: string }[]
  >('/v1/jobs', { timeoutMs: 30000 });

  for (const nombre of NOMBRES_COB) {
    const t = (trabajos ?? []).find((x) => x.displayName === nombre);
    if (!t?.jobId) {
      mal(`No existe el trabajo «${nombre}» en esta instancia.`);
      continue;
    }
    if (t.active) {
      ok(`«${nombre}» ya está activo.`);
      continue;
    }
    if (!aplicar) {
      paso(`activar «${nombre}» (job ${t.jobId}, cron ${t.cronExpression ?? '—'})`);
      continue;
    }
    try {
      await http.put(`/v1/jobs/${t.jobId}`, { active: true });
      ok(`«${nombre}» activado.`);
    } catch (e) {
      mal(`No se pudo activar «${nombre}»: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`);
    }
  }

  const adelanta = (trabajos ?? []).find((x) =>
    PATRON_ADELANTA_FECHA.test(String(x.displayName ?? '')),
  );
  if (!adelanta?.jobId) {
    mal('No hay trabajo que adelante la fecha de negocio en esta instancia.');
    nota('Habria que moverla a mano cada dia, o el core se queda congelado.');
  } else if (adelanta.active) {
    ok(`«${adelanta.displayName}» ya esta activo.`);
  } else if (!aplicar) {
    paso(
      `activar «${adelanta.displayName}» (job ${adelanta.jobId}, cron ${adelanta.cronExpression ?? '—'})`,
    );
    nota('Sin este trabajo la fecha de negocio se congela en el dia que se fije.');
  } else {
    try {
      await http.put(`/v1/jobs/${adelanta.jobId}`, { active: true });
      ok(`«${adelanta.displayName}» activado.`);
    } catch (e) {
      mal(
        `No se pudo activar «${adelanta.displayName}»: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`,
      );
    }
  }

  // ── 4. Correr el COB una vez ─────────────────────────────────────────────
  titulo('4 · Poner la cartera al día');
  const loanCob = (trabajos ?? []).find((x) => x.displayName === 'Loan COB');
  if (!correrCob) {
    nota('No se ejecuta el cierre. Con --correr-cob se lanza una vez.');
    nota('Ojo: el COB avanza día por día. Si la fecha de negocio queda hoy y');
    nota('hay préstamos de agosto, hará falta correrlo varias veces o dejar');
    nota('que el trabajo programado se ponga al día solo.');
  } else if (!aplicar) {
    paso(`ejecutar «Loan COB» (job ${loanCob?.jobId ?? '?'})`);
  } else if (!loanCob?.jobId) {
    mal('No hay trabajo «Loan COB» que ejecutar.');
  } else {
    try {
      await http.post(`/v1/jobs/${loanCob.jobId}?command=executeJob`, {});
      ok('Cierre de día lanzado. Tarda; revisa el resultado con fineract:cob.');
    } catch (e) {
      mal(`No se pudo ejecutar: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`);
    }
  }

  /*
   * Correr el cierre una vez sólo cierra UN dia. Los prestamos de agosto
   * necesitan que Fineract los alcance; para eso existe el endpoint de
   * catch-up, que los pone al dia sin esperar a que el cron avance uno por uno.
   */
  if (!alcanzar) {
    nota('Con --alcanzar se pide a Fineract que ponga al dia de una vez los');
    nota('prestamos rezagados, en vez de cerrar dia por dia.');
  } else if (!aplicar) {
    paso('lanzar el alcance del COB (POST /v1/loans/catch-up)');
  } else {
    try {
      const corriendo = await http
        .get<{ catchUpRunning?: boolean }>('/v1/loans/is-catch-up-running', { timeoutMs: 30000 })
        .catch(() => ({ catchUpRunning: false }));
      if (corriendo?.catchUpRunning) {
        ok('El alcance ya estaba corriendo; no se relanza.');
      } else {
        await http.post('/v1/loans/catch-up', {});
        ok('Alcance lanzado. Tarda varios minutos; revisa con fineract:cob.');
      }
    } catch (e) {
      mal(`No se pudo lanzar el alcance: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`);
    }
  }

  titulo('Después de esto');
  nota('Corre fineract:cob para ver si los días de atraso ya aparecen, y');
  nota('luego venta:verificar para comparar la mora de los dos sistemas.');
  console.log('');
  await app.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
