/**
 * ============================================================================
 * SyncroERP · Reencola los eventos fallidos y los despacha
 * ----------------------------------------------------------------------------
 * Un evento en FALLIDO ya no se reintenta solo: agotó su retroceso o el
 * despachador lo consideró definitivo. Eso está bien —reintentar para siempre
 * contra un error que no se va a arreglar solo es ruido— pero deja un paso
 * manual cuando la causa sí se corrigió: Fineract estaba caído, el timeout era
 * corto, faltaba mapear una cuenta.
 *
 *   npm.cmd run outbox:reintentar              muestra qué hay fallido
 *   npm.cmd run outbox:reintentar -- --aplicar reencola y despacha
 *
 * No inventa nada: usa el mismo reencolado que expone la API.
 * ============================================================================
 */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { FineractHttpService } from '../src/integracion/adaptadores/fineract/fineract-http.service';
import { IntegracionOutboxService } from '../src/integracion/services/integracion-outbox.service';
import { IntegracionDespachadorService } from '../src/integracion/services/integracion-despachador.service';
import { EventoIntegracion } from '../src/integracion/entities/evento-integracion.entity';
import { EstadoEventoIntegracion } from '../src/integracion/integracion.constants';
import { In } from 'typeorm';

const ok = (m: string) => console.log(`  \x1b[32mOK\x1b[0m    ${m}`);
const mal = (m: string) => console.log(`  \x1b[31mFALLA\x1b[0m ${m}`);
const info = (m: string) => console.log(`        \x1b[90m${m}\x1b[0m`);
const titulo = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`);

async function main() {
  const aplicar = process.argv.includes('--aplicar');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  const ds = app.get(DataSource);
  const http = app.get(FineractHttpService);
  const outbox = app.get(IntegracionOutboxService);
  const despachador = app.get(IntegracionDespachadorService);
  const eventos = ds.getRepository(EventoIntegracion);

  // También los REINTENTABLE: tras varios fallos su próximo intento queda a una
  // hora, así que en la práctica están parados aunque la causa ya se arreglara.
  const fallidos = await eventos.find({
    where: {
      estado: In([
        EstadoEventoIntegracion.FALLIDO,
        EstadoEventoIntegracion.REINTENTABLE,
      ]),
    },
    order: { fechaCreacion: 'ASC' },
  });

  titulo(`Eventos detenidos: ${fallidos.length}`);
  if (fallidos.length === 0) {
    ok('No hay nada que reintentar.');
    console.log('');
    await app.close();
    return;
  }

  for (const e of fallidos) {
    console.log(`  ${e.estado.padEnd(14)} ${e.tipo.padEnd(20)} ${e.claveIdempotencia}`);
    info(e.ultimoError ?? 'sin error registrado');
  }

  if (!aplicar) {
    titulo('Modo simulación');
    info('Antes de reencolar, arregla la causa: un reintento contra el mismo');
    info('problema sólo vuelve a fallar. Cuando esté resuelta:');
    console.log('\n  npm.cmd run outbox:reintentar -- --aplicar\n');
    await app.close();
    return;
  }

  // Reencolar contra un Fineract que todavía arranca quema el intento y deja el
  // evento con un retroceso más largo. Antes se preguntaba si está en pie.
  titulo('Comprobando que Fineract responde');
  try {
    await http.get('/v1/offices/1');
    ok('Fineract responde.');
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    mal(`Fineract no está listo: ${mensaje}`);
    info('No reencolo: gastaría el intento y alargaría el retroceso.');
    info('«ECONNREFUSED» = todavía no arranca (bootRun tarda 1-3 minutos).');
    info('«ECONNABORTED» o «ECONNRESET» = arrancando o saturado; espera y repite.');
    console.log('');
    await app.close();
    process.exit(1);
  }

  titulo('Reencolando');
  let reencolados = 0;
  for (const e of fallidos) {
    if (await outbox.reencolar(e.id, e.empresaId)) {
      reencolados += 1;
      ok(`${e.tipo} · ${e.claveIdempotencia}`);
    } else {
      mal(`No se pudo reencolar ${e.claveIdempotencia}`);
    }
  }

  titulo('Despachando');
  const lote = await despachador.despacharLote(Math.max(reencolados, 10));
  console.log(`  procesados ${lote.procesados} · fallidos ${lote.fallidos}`);

  const quedan = await eventos.count({
    where: {
      estado: In([
        EstadoEventoIntegracion.FALLIDO,
        EstadoEventoIntegracion.REINTENTABLE,
      ]),
    },
  });
  if (quedan === 0) {
    ok('El outbox quedó limpio.');
  } else {
    mal(`Siguen ${quedan} evento(s) detenido(s).`);
    info('Corre esto sin --aplicar para ver el motivo de cada uno.');
  }

  console.log('');
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
