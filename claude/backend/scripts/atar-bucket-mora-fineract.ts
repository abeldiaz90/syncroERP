/**
 * ============================================================================
 * SyncroERP · Atar la escala de mora a los productos que no la tienen
 * ----------------------------------------------------------------------------
 * El diagnóstico de morosidad mostró que la instancia SÍ tiene rangos y un
 * bucket bien armado —«Escala de mora SUMA», con seis tramos— pero nueve
 * productos no lo tienen atado, entre ellos los cinco que el ERP creó. Un
 * producto sin bucket produce créditos que reportan importe vencido correcto y
 * CERO días de atraso, para siempre, aunque el cierre de día corra todas las
 * noches. No es un error que salga en ningún log: es un silencio.
 *
 * El adaptador ya manda `delinquencyBucketId` al crear productos nuevos. Este
 * script es para los que ya existen.
 *
 * ESTO CAMBIA PRODUCTOS DE UN CORE BANKING. Por omisión sólo dice qué haría.
 *
 *   npm.cmd run fineract:bucket-mora                          muestra el plan
 *   npm.cmd run fineract:bucket-mora -- --aplicar              lo ata
 *   npm.cmd run fineract:bucket-mora -- --aplicar --clasificar y reclasifica
 * ============================================================================
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { FineractHttpService } from '../src/integracion/adaptadores/fineract/fineract-http.service';
import { FineractConfig } from '../src/integracion/adaptadores/fineract/fineract.config';

const ok = (m: string) => console.log(`  \x1b[32mOK\x1b[0m    ${m}`);
const paso = (m: string) => console.log(`  \x1b[36mHARÍA\x1b[0m ${m}`);
const mal = (m: string) => console.log(`  \x1b[31mFALLA\x1b[0m ${m}`);
const nota = (m: string) => console.log(`        \x1b[90m${m}\x1b[0m`);
const titulo = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`);

async function main() {
  const aplicar = process.argv.includes('--aplicar');
  const clasificar = process.argv.includes('--clasificar');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const http = app.get(FineractHttpService);
  const cfg = app.get(FineractConfig);

  if (!aplicar) nota('Modo plan: no se cambia nada en Fineract.');

  // ── 1. Qué bucket se va a usar ───────────────────────────────────────────
  titulo('1 · La escala de mora');
  const buckets = await http.get<Array<{ id?: number; name?: string; ranges?: unknown[] }>>(
    '/v1/delinquency/buckets',
    { timeoutMs: 30000 },
  );
  const buscado = cfg.bucketMoraNombre.trim().toLowerCase();
  const bucket = (buckets ?? []).find(
    (b) => String(b.name ?? '').trim().toLowerCase() === buscado,
  );

  if (!bucket?.id) {
    mal(`No existe el bucket «${cfg.bucketMoraNombre}» en esta instancia.`);
    nota('Buckets disponibles:');
    for (const b of buckets ?? []) nota(`· ${b.id} «${b.name}»`);
    nota('Se elige con FINERACT_BUCKET_MORA en el .env, por nombre.');
    await app.close();
    process.exit(1);
  }
  ok(`«${bucket.name}» (id ${bucket.id}) con ${(bucket.ranges ?? []).length} tramo(s).`);

  // ── 2. Qué productos le faltan ───────────────────────────────────────────
  titulo('2 · Productos sin escala de mora');
  const productos = await http.get<Array<{ id?: number; name?: string }>>(
    '/v1/loanproducts',
    { timeoutMs: 30000 },
  );

  let faltantes = 0;
  let atados = 0;

  for (const p of productos ?? []) {
    const detalle = await http
      .get<{ delinquencyBucket?: { id?: number; name?: string } }>(`/v1/loanproducts/${p.id}`, {
        timeoutMs: 30000,
      })
      .catch(() => null);

    const actual = detalle?.delinquencyBucket;
    if (actual?.id) continue;

    faltantes += 1;
    if (!aplicar) {
      paso(`atar «${bucket.name}» al producto ${p.id} · ${p.name}`);
      continue;
    }

    try {
      /*
       * Se manda SÓLO el bucket. Reenviar el producto completo sería reescribir
       * plazos y tasas que nadie pidió cambiar, y cualquier omisión al copiarlos
       * quedaría como un cambio silencioso en un producto vivo.
       */
      await http.put(
        `/v1/loanproducts/${p.id}`,
        {
          delinquencyBucketId: bucket.id,
          locale: cfg.localePorDefecto,
          dateFormat: cfg.formatoFecha,
        },
        { timeoutMs: 60000 },
      );
      atados += 1;
      ok(`producto ${p.id} · ${p.name} → «${bucket.name}»`);
    } catch (e) {
      mal(
        `producto ${p.id} · ${p.name}: ${e instanceof Error ? e.message.slice(0, 220) : String(e)}`,
      );
    }
  }

  if (!faltantes) ok('Todos los productos ya tienen escala de mora.');
  else if (aplicar) nota(`${atados} de ${faltantes} producto(s) atados.`);

  // ── 3. Reclasificar ──────────────────────────────────────────────────────
  titulo('3 · Reclasificar la cartera');
  const trabajos = await http.get<
    Array<{ jobId?: number; displayName?: string; active?: boolean }>
  >('/v1/jobs', { timeoutMs: 30000 });
  const job = (trabajos ?? []).find((t) => /delinquen/i.test(String(t.displayName ?? '')));

  if (!job?.jobId) {
    mal('No existe el trabajo de clasificación de morosidad.');
  } else if (!clasificar) {
    nota(`Con --clasificar se lanza «${job.displayName}» una vez.`);
    nota('Sin eso, la reclasificación llega con la corrida programada.');
  } else if (!aplicar) {
    paso(`ejecutar «${job.displayName}» (job ${job.jobId})`);
  } else {
    try {
      await http.post(`/v1/jobs/${job.jobId}?command=executeJob`, {}, { timeoutMs: 60000 });
      ok('Clasificación lanzada. Tarda; revisa con fineract:morosidad.');
    } catch (e) {
      mal(`No se pudo ejecutar: ${e instanceof Error ? e.message.slice(0, 220) : String(e)}`);
    }
  }

  titulo('Después de esto');
  nota('Corre fineract:morosidad: los productos deben salir CON bucket y el');
  nota('préstamo vencido con delinquencyRange poblado.');
  console.log('');
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
