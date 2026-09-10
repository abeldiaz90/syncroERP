/**
 * ============================================================================
 * SyncroERP · Qué hay en el outbox y qué está esperando
 * ----------------------------------------------------------------------------
 * `outbox:reintentar` sólo mira los eventos FALLIDOS, que son los que ya se
 * rindieron. Eso contesta «¿qué necesita que alguien intervenga?» pero no
 * contesta «¿qué está esperando?», que es la pregunta cuando el registro
 * externo acaba de caerse: un hecho en REINTENTABLE o PENDIENTE no necesita a
 * nadie —el despachador volverá solo— pero saber que está ahí es la diferencia
 * entre confiar en el mecanismo y suponer.
 *
 * No cambia nada. Sólo mira.
 *
 *   npm.cmd run outbox:estado
 *   npm.cmd run outbox:estado -- --todos     incluye los ya enviados
 * ============================================================================
 */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PUERTO_CARTERA_EXTERNA } from '../src/integracion/integracion.constants';
import { PuertoCarteraExterna } from '../src/integracion/ports/cartera-externa.port';

const ok = (m: string) => console.log(`  \x1b[32mOK\x1b[0m    ${m}`);
const aviso = (m: string) => console.log(`  \x1b[33mAVISO\x1b[0m ${m}`);
const mal = (m: string) => console.log(`  \x1b[31mALTO\x1b[0m  ${m}`);
const nota = (m: string) => console.log(`        \x1b[90m${m}\x1b[0m`);
const titulo = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`);

const reloj = (valor: string | null) => {
  if (!valor) return '—';
  const falta = new Date(valor).getTime() - Date.now();
  if (falta <= 0) return 'ya toca';
  const min = Math.round(falta / 60000);
  return min < 60 ? `en ${min} min` : `en ${Math.round(min / 60)} h`;
};

async function main() {
  const todos = process.argv.includes('--todos');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const ds = app.get(DataSource);

  /*
   * Se pregunta con una llamada REAL, no con el cortacircuitos: si nadie ha
   * intentado hablar con el proveedor desde que se cayó, el circuito sigue
   * cerrado y diría que todo está bien. Esta línea existe porque probamos dos
   * veces la caída de Fineract creyendo que estaba apagado cuando no lo estaba,
   * y el reporte no tenía cómo desmentirnos.
   */
  const externo = app.get<PuertoCarteraExterna>(PUERTO_CARTERA_EXTERNA);
  let responde = false;
  let motivo = '';
  try {
    await externo.listarProductosCredito('sonda');
    responde = true;
  } catch (e) {
    motivo = e instanceof Error ? e.message : String(e);
  }

  titulo(`Registro externo · ${externo.proveedor}`);
  if (!externo.configurado()) {
    nota('No hay proveedor configurado: el ERP opera solo.');
  } else if (responde) {
    ok('Responde ahora mismo.');
  } else {
    aviso('NO responde.');
    nota(motivo.slice(0, 200));
  }

  const resumen = await ds.query<{ estado: string; n: string }[]>(
    `SELECT estado, COUNT(*) AS n FROM integracion_eventos GROUP BY estado ORDER BY estado`,
  );

  titulo('Outbox por estado');
  if (resumen.length === 0) {
    nota('El outbox está vacío.');
  }
  for (const r of resumen) {
    const linea = `${String(r.n).padStart(4)}  ${r.estado}`;
    if (r.estado === 'ENVIADO') ok(linea);
    else if (r.estado === 'FALLIDO') mal(linea);
    else aviso(linea);
  }

  const filas = await ds.query<
    {
      tipo: string; claveidempotencia: string; estado: string;
      intentos: number; proximointento: string | null;
      ultimoerror: string | null; fechacreacion: string;
    }[]
  >(
    `SELECT tipo, claveidempotencia, estado, intentos, proximointento,
            ultimoerror, fechacreacion
       FROM integracion_eventos
      ${todos ? '' : "WHERE estado <> 'ENVIADO'"}
      ORDER BY fechacreacion DESC
      LIMIT 40`,
  );

  if (filas.length > 0) {
    titulo(todos ? 'Últimos 40 eventos' : 'Lo que todavía no llega al registro externo');
    for (const f of filas) {
      const marca = f.estado === 'ENVIADO' ? ok : f.estado === 'FALLIDO' ? mal : aviso;
      marca(`${f.estado.padEnd(12)} ${f.tipo.padEnd(20)} ${f.claveidempotencia}`);
      if (f.estado !== 'ENVIADO') {
        nota(`intentos ${f.intentos} · próximo ${reloj(f.proximointento)}`);
        if (f.ultimoerror) nota(String(f.ultimoerror).slice(0, 160));
      }
    }
  }

  // ── Lectura ──────────────────────────────────────────────────────────────
  const cuenta = (e: string) =>
    Number(resumen.find((r) => r.estado === e)?.n ?? 0);
  const esperando = cuenta('PENDIENTE') + cuenta('REINTENTABLE');

  titulo('Lectura');
  if (cuenta('FALLIDO') > 0) {
    mal(`${cuenta('FALLIDO')} evento(s) se rindieron y necesitan que alguien intervenga.`);
    nota('Arregla la causa y luego: npm.cmd run outbox:reintentar -- --aplicar');
  }
  if (esperando > 0) {
    aviso(`${esperando} evento(s) esperando. El despachador los tomará solo.`);
    nota('Es el comportamiento correcto cuando el registro externo está caído:');
    nota('el hecho quedó guardado y la venta no dependió de que respondiera.');
  }
  if (esperando === 0 && cuenta('FALLIDO') === 0) {
    ok('Nada pendiente: todo lo que el ERP publicó llegó al registro externo.');
    if (!responde && externo.configurado()) {
      nota('Y eso con el proveedor caído: lo que se vendió mientras respondía');
      nota('ya había cruzado. Lo que se venda a partir de ahora quedará aquí');
      nota('esperando hasta que vuelva.');
    }
  }
  console.log('');
  await app.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
