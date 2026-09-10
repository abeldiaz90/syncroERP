/**
 * ============================================================================
 * SyncroERP · Qué devuelve de verdad la API de Fineract
 * ----------------------------------------------------------------------------
 * Antes de construir una pantalla de cartera vencida en el portal hay que saber
 * qué campos trae cada endpoint EN ESTA VERSIÓN. La documentación de Fineract
 * describe varias versiones a la vez y los nombres cambian; adivinar produce
 * pantallas que se ven bien y muestran ceros.
 *
 * No cambia nada. Sólo lee y describe.
 *
 *   npm.cmd run fineract:inspeccionar
 * ============================================================================
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { FineractHttpService } from '../src/integracion/adaptadores/fineract/fineract-http.service';

const titulo = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`);
const ok = (m: string) => console.log(`  \x1b[32mOK\x1b[0m    ${m}`);
const mal = (m: string) => console.log(`  \x1b[31mNO\x1b[0m    ${m}`);
const nota = (m: string) => console.log(`        \x1b[90m${m}\x1b[0m`);

const claves = (o: unknown): string =>
  o && typeof o === 'object' ? Object.keys(o as object).join(', ') : String(o);

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const http = app.get(FineractHttpService);

  const probar = async (que: string, ruta: string) => {
    try {
      const r = await http.get<unknown>(ruta, { timeoutMs: 30000 });
      return { que, ruta, r };
    } catch (e) {
      mal(`${que} · ${ruta}`);
      nota(e instanceof Error ? e.message.slice(0, 180) : String(e));
      return null;
    }
  };

  // ── Lista de préstamos ───────────────────────────────────────────────────
  titulo('GET /v1/loans — ¿trae mora en el listado?');
  const lista = await probar('lista de préstamos', '/v1/loans?limit=5&offset=0');
  if (lista) {
    const d = lista.r as { totalFilteredRecords?: number; pageItems?: unknown[] };
    ok(`${d.totalFilteredRecords ?? '?'} préstamo(s) en total`);
    const uno = d.pageItems?.[0] as Record<string, unknown> | undefined;
    if (uno) {
      nota(`campos: ${claves(uno)}`);
      nota(`summary: ${claves(uno.summary)}`);
      nota(`delinquent: ${claves(uno.delinquent)}`);
      nota(`status: ${claves(uno.status)}`);
    } else {
      nota('sin préstamos que describir');
    }
  }

  // ── Detalle de un préstamo ───────────────────────────────────────────────
  titulo('GET /v1/loans/{id} — el detalle');
  const detalle = await probar('detalle', '/v1/loans/24');
  if (detalle) {
    const d = detalle.r as Record<string, unknown>;
    nota(`summary: ${claves(d.summary)}`);
    nota(`delinquent: ${claves(d.delinquent)}`);
    nota(`delinquencyRange: ${claves(d.delinquencyRange)}`);
  }

  // ── Morosidad ────────────────────────────────────────────────────────────
  titulo('Morosidad · buckets y rangos');
  const rangos = await probar('rangos', '/v1/delinquency/ranges');
  if (rangos) ok(`rangos configurados: ${(rangos.r as unknown[])?.length ?? 0}`);
  const buckets = await probar('buckets', '/v1/delinquency/buckets');
  if (buckets) ok(`buckets configurados: ${(buckets.r as unknown[])?.length ?? 0}`);

  // ── Reportes ─────────────────────────────────────────────────────────────
  titulo('Reportes disponibles (los que podrían servir para antigüedad)');
  const reportes = await probar('catálogo de reportes', '/v1/reports');
  if (reportes) {
    const lista = (reportes.r as { reportName?: string; reportCategory?: string }[]) ?? [];
    ok(`${lista.length} reporte(s)`);
    const interesantes = lista.filter((r) =>
      /aging|arrear|delinq|overdue|par\b|portfolio/i.test(String(r.reportName ?? '')),
    );
    if (interesantes.length) {
      for (const r of interesantes) nota(`· ${r.reportName} (${r.reportCategory})`);
    } else {
      nota('ninguno con nombre de antigüedad/mora; se listan los de préstamos:');
      for (const r of lista.filter((r) => /loan/i.test(String(r.reportCategory ?? ''))).slice(0, 15)) {
        nota(`· ${r.reportName}`);
      }
    }
  }

  console.log('');
  await app.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
