/**
 * ============================================================================
 * SyncroERP · Cuántos créditos traen la fecha corrida
 * ----------------------------------------------------------------------------
 * Hasta el arreglo de `fecha-calendario.util.ts`, el ERP parseaba `yyyy-mm-dd`
 * como medianoche UTC y luego lo leía con los captadores locales. En México eso
 * devuelve el día ANTERIOR, así que cada crédito quedó fechado un día antes de
 * lo que se pretendía y la política de día hábil evaluó el día de la semana
 * equivocado.
 *
 * Este script NO cambia nada. Sólo dice, crédito por crédito, qué fecha tiene
 * guardada y qué fecha tendría hoy el mismo cálculo. La decisión de tocar un
 * contrato firmado no es de un script.
 *
 *   npm.cmd run creditos:auditar-fechas
 *   npm.cmd run creditos:auditar-fechas -- --todos       lista todos, no una muestra
 *   npm.cmd run creditos:auditar-fechas -- --csv desfases.csv
 * ============================================================================
 */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { writeFileSync } from 'fs';
import { AppModule } from '../src/app.module';
import { CreditosService } from '../src/credito/services/creditos.service';
import { PoliticaVencimientoService } from '../src/credito/services/politica-vencimiento.service';
import { diaCalendario } from '../src/common/utils/fecha-calendario.util';

const arg = (n: string, d = '') => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const ok = (m: string) => console.log(`  \x1b[32mOK\x1b[0m    ${m}`);
const aviso = (m: string) => console.log(`  \x1b[33mAVISO\x1b[0m ${m}`);
const nota = (m: string) => console.log(`        \x1b[90m${m}\x1b[0m`);
const titulo = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`);

interface FilaCredito {
  id: string;
  folio: string;
  empresaid: string;
  cliente: string;
  tipocredito: string;
  numerocuotas: number;
  capitalfinanciado: string;
  tasainteresmensual: string;
  sininteres: boolean;
  fechainicio: string;
  fechacreacion: string;
  estado: string;
}

async function main() {
  const todos = process.argv.includes('--todos');
  const csv = arg('csv');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  const ds = app.get(DataSource);
  const creditos = app.get(CreditosService);
  const vencimientos = app.get(PoliticaVencimientoService);

  const filas = await ds.query<FilaCredito[]>(
    `SELECT c.id, c.folio, c.empresaid, cl.nombre AS cliente, c.tipocredito,
            c.numerocuotas, c.capitalfinanciado, c.tasainteresmensual,
            c.sininteres, c.fechainicio, c.fechacreacion, c.estado
       FROM creditos_clientes c
       INNER JOIN clientes cl ON cl.id = c.clienteid
      ORDER BY c.fechacreacion`,
  );

  titulo(`Créditos revisados: ${filas.length}`);
  if (filas.length === 0) {
    ok('No hay créditos.');
    await app.close();
    return;
  }

  const ajustadores = new Map<string, Awaited<ReturnType<typeof vencimientos.ajustadorDe>>>();
  const desfasados: Array<{
    folio: string;
    cliente: string;
    estado: string;
    tipo: string;
    inicio: string;
    creado: string;
    cuota: number;
    guardada: string;
    recalculada: string;
    dias: number;
  }> = [];
  let iguales = 0;
  let inicioCorrido = 0;

  for (const c of filas) {
    if (!ajustadores.has(c.empresaid)) {
      ajustadores.set(c.empresaid, await vencimientos.ajustadorDe(c.empresaid));
    }
    const ajustar = ajustadores.get(c.empresaid)!;

    const cuotas = await ds.query<{ numerocuota: number; fechavencimiento: string }[]>(
      `SELECT numerocuota, fechavencimiento FROM amortizacion_cuotas
        WHERE creditoid = $1 ORDER BY numerocuota`,
      [c.id],
    );
    if (cuotas.length === 0) continue;

    // El mismo cálculo de hoy, partiendo de la fecha de inicio GUARDADA. Si la
    // tabla difiere, la diferencia es del motor, no de los datos de entrada.
    const tabla = creditos.calcularAmortizacion(
      {
        capital: Number(c.capitalfinanciado),
        numeroCuotas: Number(c.numerocuotas) || 1,
        tasaInteresMensual: Number(c.tasainteresmensual),
        sinInteres: c.sininteres,
        fechaInicio: diaCalendario(c.fechainicio),
        tipoCredito: c.tipocredito as never,
      },
      ajustar,
    );

    // La fecha de inicio contra el día en que se capturó: si va un día atrás,
    // el crédito nació fechado ayer.
    const diaInicio = diaCalendario(c.fechainicio);
    const diaCreacion = diaCalendario(c.fechacreacion);
    if (diaInicio < diaCreacion) inicioCorrido += 1;

    let coincide = true;
    for (const cuota of cuotas) {
      const esperada = tabla.find((t) => t.numeroCuota === cuota.numerocuota);
      if (!esperada) continue;
      const guardada = diaCalendario(cuota.fechavencimiento);
      const recalculada = diaCalendario(esperada.fechaVencimiento);
      if (guardada === recalculada) continue;

      coincide = false;
      desfasados.push({
        folio: c.folio,
        cliente: c.cliente,
        estado: c.estado,
        tipo: c.tipocredito,
        inicio: diaInicio,
        creado: diaCreacion,
        cuota: cuota.numerocuota,
        guardada,
        recalculada,
        dias: Math.round(
          (new Date(`${recalculada}T12:00:00`).getTime() -
            new Date(`${guardada}T12:00:00`).getTime()) /
            86_400_000,
        ),
      });
    }
    if (coincide) iguales += 1;
  }

  const foliosAfectados = new Set(desfasados.map((d) => d.folio));

  titulo('Resumen');
  ok(`${iguales} crédito(s) con la tabla idéntica a la que se calcularía hoy.`);
  if (foliosAfectados.size > 0) {
    aviso(
      `${foliosAfectados.size} crédito(s) con al menos una cuota desfasada (${desfasados.length} cuota(s) en total).`,
    );
  }
  if (inicioCorrido > 0) {
    aviso(
      `${inicioCorrido} crédito(s) con fecha de inicio anterior al día en que se capturaron.`,
    );
    nota('Es la huella del parseo en UTC: la venta de hoy quedó fechada ayer.');
  }
  if (foliosAfectados.size === 0 && inicioCorrido === 0) {
    ok('Nada que revisar: ningún crédito quedó con la fecha corrida.');
  }

  if (desfasados.length > 0) {
    titulo(todos ? 'Detalle' : 'Detalle (primeras 20 cuotas)');
    const cab = ['FOLIO', 'ESTADO', 'CUOTA', 'GUARDADA', 'HOY SERÍA', 'DÍAS', 'CLIENTE'];
    const muestra = todos ? desfasados : desfasados.slice(0, 20);
    const rows = muestra.map((d) => [
      d.folio,
      d.estado,
      String(d.cuota),
      d.guardada,
      d.recalculada,
      (d.dias > 0 ? '+' : '') + String(d.dias),
      d.cliente.slice(0, 28),
    ]);
    const anchos = cab.map((c, i) => Math.max(c.length, ...rows.map((r) => r[i].length)));
    const linea = (f: string[]) => '  ' + f.map((c, i) => c.padEnd(anchos[i])).join('  ');
    console.log(linea(cab));
    console.log('  ' + anchos.map((a) => '─'.repeat(a)).join('  '));
    for (const r of rows) console.log(linea(r));
    if (!todos && desfasados.length > 20) {
      nota(`… y ${desfasados.length - 20} más. Corre con --todos para verlas.`);
    }
  }

  if (csv) {
    const cabecera = 'folio,cliente,estado,tipo,fechaInicio,fechaCaptura,cuota,guardada,recalculada,dias\n';
    const cuerpo = desfasados
      .map((d) =>
        [d.folio, `"${d.cliente.replace(/"/g, '""')}"`, d.estado, d.tipo, d.inicio,
         d.creado, d.cuota, d.guardada, d.recalculada, d.dias].join(','),
      )
      .join('\n');
    writeFileSync(csv, cabecera + cuerpo + '\n', 'utf8');
    ok(`Detalle completo en ${csv}`);
  }

  titulo('Qué hacer con esto');
  nota('Nada, automáticamente. Son fechas que el cliente ya vio y, en los créditos');
  nota('replicados, fechas que el registro externo también tiene. Reescribirlas');
  nota('cambia un contrato; recalcular sólo el ERP los pondría a discrepar.');
  nota('Lo razonable es decidir por crédito: los liquidados no importan, los');
  nota('activos se pueden dejar como están —el cliente paga lo que firmó— y sólo');
  nota('vale la pena mover los que aún no han vencido su primera cuota.');
  console.log('');
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
