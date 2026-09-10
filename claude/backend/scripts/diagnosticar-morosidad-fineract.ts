/**
 * ============================================================================
 * SyncroERP · Por qué Fineract no reporta días de atraso
 * ----------------------------------------------------------------------------
 * El cierre de día ya corre: «Loan COB» terminó con éxito y el préstamo vencido
 * quedó con `lastClosedBusinessDate`. Aun así `delinquent.pastDueDays` sigue en
 * cero mientras `summary.totalOverdue` reporta 6,313.82.
 *
 * Las causas posibles no se pueden distinguir desde afuera, así que este script
 * no arregla nada: PREGUNTA. En Fineract la clasificación de morosidad no se
 * calcula sola —necesita un «bucket» de morosidad con rangos, atado al producto
 * de crédito—. Un producto sin bucket produce exactamente lo que estamos
 * viendo: importe vencido correcto y cero días de atraso, para siempre, aunque
 * el COB corra todas las noches.
 *
 * Se imprime el bloque `delinquent` tal como lo manda Fineract, sin
 * interpretarlo, porque ya me equivoqué una vez leyendo esos campos.
 *
 *   npm.cmd run fineract:morosidad
 * ============================================================================
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { FineractHttpService } from '../src/integracion/adaptadores/fineract/fineract-http.service';

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

interface Cuota {
  period?: number;
  dueDate?: unknown;
  complete?: boolean;
  totalOutstandingForPeriod?: number;
  totalDueForPeriod?: number;
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const http = app.get(FineractHttpService);

  const leer = async <T>(ruta: string): Promise<T | null> => {
    try {
      return await http.get<T>(ruta, { timeoutMs: 45000 });
    } catch (e) {
      nota(`${ruta} → ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`);
      return null;
    }
  };

  // ── 1. Qué rangos y buckets de morosidad existen ─────────────────────────
  titulo('1 · Configuración de morosidad de la instancia');
  const rangos = await leer<{ id?: number; classification?: string; minimumAgeDays?: number; maximumAgeDays?: number }[]>(
    '/v1/delinquency/ranges',
  );
  const buckets = await leer<{ id?: number; name?: string; ranges?: { id?: number; classification?: string }[] }[]>(
    '/v1/delinquency/buckets',
  );

  if (!rangos?.length) {
    mal('No hay NINGÚN rango de morosidad definido.');
    nota('Sin rangos no puede haber bucket, y sin bucket no hay días de atraso.');
  } else {
    ok(`${rangos.length} rango(s):`);
    for (const r of rangos) {
      nota(`· ${r.id} ${r.classification} · ${r.minimumAgeDays ?? '—'} a ${r.maximumAgeDays ?? '∞'} días`);
    }
  }

  if (!buckets?.length) {
    mal('No hay NINGÚN bucket de morosidad definido.');
  } else {
    ok(`${buckets.length} bucket(s):`);
    for (const b of buckets) {
      nota(`· ${b.id} «${b.name}» → ${(b.ranges ?? []).map((r) => r.classification).join(', ') || 'sin rangos'}`);
    }
  }

  // ── 2. Qué producto tiene bucket y cuál no ───────────────────────────────
  titulo('2 · Productos de crédito y su bucket');
  const productos = await leer<{ id?: number; name?: string; shortName?: string }[]>('/v1/loanproducts');
  if (!productos?.length) {
    mal('No se pudo listar los productos de crédito.');
  } else {
    let sinBucket = 0;
    for (const p of productos) {
      const detalle = await leer<{ delinquencyBucket?: { id?: number; name?: string } }>(
        `/v1/loanproducts/${p.id}`,
      );
      const bucket = detalle?.delinquencyBucket;
      if (bucket?.id) {
        ok(`${p.id} · ${p.name} → bucket ${bucket.id} «${bucket.name}»`);
      } else {
        sinBucket += 1;
        mal(`${p.id} · ${p.name} → SIN bucket de morosidad`);
      }
    }
    if (sinBucket) {
      nota(`${sinBucket} producto(s) sin bucket. Sus créditos nunca van a reportar`);
      nota('días de atraso, por muchas veces que corra el cierre de día.');
    }
  }

  // ── 3. El préstamo vencido, campo por campo ──────────────────────────────
  titulo('3 · El préstamo vencido en crudo');
  const lista = await leer<{
    pageItems?: {
      id?: number;
      accountNo?: string;
      clientName?: string;
      loanProductId?: number;
      loanProductName?: string;
      summary?: { totalOverdue?: number };
    }[];
  }>('/v1/loans?limit=500&offset=0');

  const vencidos = (lista?.pageItems ?? []).filter((p) => Number(p.summary?.totalOverdue ?? 0) > 0);
  if (!vencidos.length) {
    aviso('Ningún préstamo con importe vencido en este momento.');
  }

  for (const p of vencidos.slice(0, 3)) {
    const detalle = await leer<{
      lastClosedBusinessDate?: unknown;
      inArrears?: boolean;
      delinquent?: Record<string, unknown>;
      delinquencyRange?: unknown;
      summary?: Record<string, unknown>;
      repaymentSchedule?: { periods?: Cuota[] };
    }>(`/v1/loans/${p.id}?associations=repaymentSchedule`);

    console.log('');
    nota(`Préstamo ${p.accountNo} · ${p.clientName} · producto ${p.loanProductId} ${p.loanProductName}`);
    nota(`último cierre: ${fecha(detalle?.lastClosedBusinessDate)} · inArrears: ${String(detalle?.inArrears)}`);
    nota(`summary.totalOverdue: ${String(detalle?.summary?.totalOverdue ?? '—')}`);
    nota(`overdueSinceDate: ${fecha((detalle?.summary as Record<string, unknown>)?.overdueSinceDate)}`);

    // El bloque tal como llega. Ya me equivoqué una vez interpretándolo.
    nota(`delinquent: ${JSON.stringify(detalle?.delinquent ?? null)}`);
    nota(`delinquencyRange: ${JSON.stringify(detalle?.delinquencyRange ?? null)}`);

    const cuotas = (detalle?.repaymentSchedule?.periods ?? []).filter(
      (c) => c.period && !c.complete && Number(c.totalOutstandingForPeriod ?? 0) > 0,
    );
    if (!cuotas.length) {
      aviso('  No hay cuotas abiertas con saldo. El vencido no viene del calendario.');
    } else {
      nota(`cuotas abiertas con saldo (${cuotas.length}):`);
      for (const c of cuotas.slice(0, 6)) {
        nota(`  · cuota ${c.period} vence ${fecha(c.dueDate)} · saldo ${c.totalOutstandingForPeriod}`);
      }
    }
  }

  // ── 4. El trabajo que clasifica ──────────────────────────────────────────
  titulo('4 · El trabajo de clasificación');
  const trabajos = await leer<
    {
      jobId?: number;
      displayName?: string;
      active?: boolean;
      lastRunHistory?: { status?: string; jobRunStartTime?: unknown; jobRunErrorMessage?: string };
    }[]
  >('/v1/jobs');
  const clasifica = (trabajos ?? []).find((t) =>
    /delinquen/i.test(String(t.displayName ?? '')),
  );
  if (!clasifica) {
    mal('No existe trabajo de clasificación de morosidad.');
  } else {
    const h = clasifica.lastRunHistory;
    nota(`«${clasifica.displayName}» job ${clasifica.jobId} · ${clasifica.active ? 'activo' : 'INACTIVO'}`);
    nota(`última corrida: ${h?.status ?? 'nunca'} (${fecha(h?.jobRunStartTime)})`);
    if (h?.jobRunErrorMessage) nota(String(h.jobRunErrorMessage).slice(0, 300));
    nota('Este trabajo sólo tiene efecto sobre productos que SÍ tienen bucket.');
  }

  titulo('Cómo se lee esto');
  nota('Si los productos salen SIN bucket, el arreglo no es correr más veces el');
  nota('cierre: es crear los rangos y el bucket y atarlos al producto. Eso');
  nota('cambia la configuración de un core banking y lo decide una persona.');
  console.log('');
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
