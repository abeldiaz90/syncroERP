/**
 * ============================================================================
 * SyncroERP · Qué ha llegado del registro externo
 * ----------------------------------------------------------------------------
 * Lee el buzón de entrada. Sirve para comprobar que el hook entrega y, después,
 * para revisar lo que quedó PENDIENTE: cobros hechos en el core que el ERP no
 * tiene, créditos dados de alta allá, castigos.
 *
 * No resuelve nada ni cambia estados: sólo enseña. Cerrar un aviso es una
 * decisión con consecuencias contables y se hace por la API, con sesión y con
 * nombre de quien lo cerró.
 *
 *   npm.cmd run avisos:buzon                 los últimos 20
 *   npm.cmd run avisos:buzon -- --todos      sin filtrar por estado
 *   npm.cmd run avisos:buzon -- --cuerpo     además vuelca el cuerpo crudo
 * ============================================================================
 */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AvisoIntegracion } from '../src/integracion/entities/aviso-integracion.entity';

const nota = (m: string) => console.log(`        \x1b[90m${m}\x1b[0m`);
const titulo = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`);

const COLOR: Record<string, string> = {
  PENDIENTE: '\x1b[33m',
  PROCESADO: '\x1b[32m',
  IGNORADO: '\x1b[90m',
  FALLIDO: '\x1b[31m',
  DESCARTADO: '\x1b[90m',
};

async function main() {
  const todos = process.argv.includes('--todos');
  const verCuerpo = process.argv.includes('--cuerpo');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const ds = app.get(DataSource);
  const repo = ds.getRepository(AvisoIntegracion);

  titulo('Resumen del buzón');
  const resumen = await repo
    .createQueryBuilder('a')
    .select('a.estado', 'estado')
    .addSelect('COUNT(*)', 'total')
    .groupBy('a.estado')
    .getRawMany<{ estado: string; total: string }>();

  if (!resumen.length) {
    nota('Vacío. Ningún aviso ha llegado todavía.');
    nota('Si ya diste de alta el hook, haz una operación en el core y vuelve.');
  } else {
    for (const r of resumen) {
      console.log(`  ${COLOR[r.estado] ?? ''}${r.estado.padEnd(11)}\x1b[0m ${r.total}`);
    }
  }

  titulo(todos ? 'Últimos avisos' : 'Últimos avisos que piden algo');
  const avisos = await repo.find({
    where: todos ? {} : [{ estado: 'PENDIENTE' as never }, { estado: 'FALLIDO' as never }],
    order: { recibidoEn: 'DESC' },
    take: 20,
  });

  if (!avisos.length) {
    nota(todos ? 'No hay avisos.' : 'Nada pendiente. Todo lo recibido era eco del propio ERP.');
  }

  for (const a of avisos) {
    const cuando = a.recibidoEn?.toISOString().replace('T', ' ').slice(0, 19) ?? '—';
    console.log(
      `\n  ${COLOR[a.estado] ?? ''}${a.estado}\x1b[0m · ${a.entidad}/${a.accion} · recurso ${a.idExterno ?? '—'} · ${cuando}`,
    );
    nota(`empresa: ${a.empresaId ?? 'sin resolver'} · entidad ERP: ${a.entidadId ?? '—'}`);
    if (a.diagnostico) nota(a.diagnostico);
    if (a.error) nota(`error: ${a.error}`);
    if (verCuerpo) {
      nota(`cuerpo: ${JSON.stringify(a.cuerpo ?? a.cuerpoTexto ?? null).slice(0, 900)}`);
    }
  }

  if (!verCuerpo && avisos.length) {
    console.log('');
    nota('Con --cuerpo se vuelca lo que mandó el core, tal como llegó.');
  }

  console.log('');
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
