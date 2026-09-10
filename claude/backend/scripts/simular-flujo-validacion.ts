/**
 * ============================================================================
 * SyncroERP · Siembra un flujo de validación y lo somete a escenarios
 * ----------------------------------------------------------------------------
 * Responde a la pregunta que el administrador se hace antes de activar nada:
 * «si armo el flujo así, ¿qué le pasa a un cliente con buró bajo?».
 *
 *   npm.cmd run flujo:simular              siembra el flujo y corre escenarios
 *   npm.cmd run flujo:simular -- --limpiar borra lo que sembró
 *
 * Las corridas quedan marcadas como simulación: no otorgan nada.
 * ============================================================================
 */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { FlujosValidacionService } from '../src/integracion/validacion/services/flujos-validacion.service';
import { MotorValidacionService } from '../src/integracion/validacion/services/motor-validacion.service';
import { FlujoValidacion } from '../src/integracion/validacion/entities/flujo-validacion.entity';
import { EjecucionValidacion } from '../src/integracion/validacion/entities/ejecucion-validacion.entity';
import {
  ResultadoPaso,
  TipoPasoValidacion,
} from '../src/integracion/validacion/validacion.constants';

const NOMBRE = 'Originación de crédito (sembrado por script)';

const color: Record<string, string> = {
  APROBADA: '\x1b[32m',
  APROBADA_CON_AJUSTE: '\x1b[32m',
  RECHAZADA: '\x1b[31m',
  REVISION_MANUAL: '\x1b[33m',
};

async function main() {
  const limpiar = process.argv.includes('--limpiar');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  const flujos = app.get(FlujosValidacionService);
  const motor = app.get(MotorValidacionService);
  const dataSource = app.get(DataSource);
  const repoFlujo = dataSource.getRepository(FlujoValidacion);
  const repoEjec = dataSource.getRepository(EjecucionValidacion);

  const [empresa] = await dataSource.query<{ id: string; nombre: string }[]>(
    `SELECT id, nombrecomercial AS nombre FROM empresas WHERE activo = true ORDER BY fechacreacion LIMIT 1`,
  );
  const empresaId = empresa.id;

  if (limpiar) {
    const sembrados = await repoFlujo.find({ where: { empresaId, nombre: NOMBRE } });
    for (const f of sembrados) {
      const n = await repoEjec.delete({ flujoId: f.id });
      await repoFlujo.delete({ id: f.id });
      console.log(`Borrado el flujo ${f.nombre} v${f.version} y ${n.affected ?? 0} corrida(s).`);
    }
    await app.close();
    process.exit(0);
  }

  const [cliente] = await dataSource.query<{ id: string; nombre: string }[]>(
    `SELECT id, nombre FROM clientes WHERE empresaid = $1 AND activo = true ORDER BY fechacreacion LIMIT 1`,
    [empresaId],
  );
  if (!cliente) {
    console.error('No hay clientes activos con los que simular.');
    await app.close();
    process.exit(1);
  }

  console.log(`\nEmpresa: ${empresa.nombre}`);
  console.log(`Cliente de prueba: ${cliente.nombre}\n`);

  // ── Siembra ───────────────────────────────────────────────────────────────
  let flujo = (await repoFlujo.find({ where: { empresaId, nombre: NOMBRE } }))
    .sort((a, b) => b.version - a.version)[0];

  if (!flujo) {
    flujo = await flujos.crear(empresaId, {
      nombre: NOMBRE,
      descripcion: 'Flujo de ejemplo para ver cómo se comporta la política.',
      // Un tope distinto de cero para que se pueda ver una aprobación
      // automática; en producción arranca en cero a propósito.
      topeAutomatico: 150_000,
      puntajeMinimo: 60,
      pasos: flujos.plantillaSugerida(),
    });
    console.log(`Flujo sembrado: "${flujo.nombre}" v${flujo.version}`);
  } else {
    console.log(`Flujo existente: "${flujo.nombre}" v${flujo.version}`);
  }

  if (!flujo.activo) {
    flujo = await flujos.activar(flujo.id, empresaId);
    console.log('Activado.\n');
  } else {
    console.log('Ya estaba activo.\n');
  }

  console.log('Pasos:');
  for (const p of flujo.pasos) {
    console.log(
      `  ${p.orden}. ${p.etiqueta.padEnd(34)} ${p.politica.padEnd(20)} peso ${String(p.peso).padStart(3)}${p.umbralMinimo !== null ? '  umbral ' + p.umbralMinimo : ''}`,
    );
  }

  // ── Escenarios ────────────────────────────────────────────────────────────
  const escenarios: {
    titulo: string;
    monto: number;
    forzado?: Partial<Record<TipoPasoValidacion, ResultadoPaso>>;
  }[] = [
    {
      titulo: 'Hoy, sin proveedores conectados (situación real)',
      monto: 50_000,
    },
    {
      titulo: 'Cliente impecable: todo aprueba',
      monto: 50_000,
      forzado: {
        [TipoPasoValidacion.IDENTIDAD_INE]: ResultadoPaso.APROBADO,
        [TipoPasoValidacion.LISTA_BLOQUEO]: ResultadoPaso.APROBADO,
        [TipoPasoValidacion.HISTORIAL_INTERNO]: ResultadoPaso.APROBADO,
        [TipoPasoValidacion.BURO_CREDITO]: ResultadoPaso.APROBADO,
        [TipoPasoValidacion.POLITICA_INTERNA]: ResultadoPaso.APROBADO,
      },
    },
    {
      titulo: 'La identidad no coincide con el INE',
      monto: 50_000,
      forzado: {
        [TipoPasoValidacion.IDENTIDAD_INE]: ResultadoPaso.RECHAZADO,
        [TipoPasoValidacion.BURO_CREDITO]: ResultadoPaso.APROBADO,
      },
    },
    {
      titulo: 'Identidad bien, pero buró por debajo del umbral',
      monto: 50_000,
      forzado: {
        [TipoPasoValidacion.IDENTIDAD_INE]: ResultadoPaso.APROBADO,
        [TipoPasoValidacion.LISTA_BLOQUEO]: ResultadoPaso.APROBADO,
        [TipoPasoValidacion.HISTORIAL_INTERNO]: ResultadoPaso.APROBADO,
        [TipoPasoValidacion.BURO_CREDITO]: ResultadoPaso.RECHAZADO,
        [TipoPasoValidacion.POLITICA_INTERNA]: ResultadoPaso.APROBADO,
      },
    },
    {
      titulo: 'Todo bien, pero pide más que el tope automático',
      monto: 400_000,
      forzado: {
        [TipoPasoValidacion.IDENTIDAD_INE]: ResultadoPaso.APROBADO,
        [TipoPasoValidacion.LISTA_BLOQUEO]: ResultadoPaso.APROBADO,
        [TipoPasoValidacion.HISTORIAL_INTERNO]: ResultadoPaso.APROBADO,
        [TipoPasoValidacion.BURO_CREDITO]: ResultadoPaso.APROBADO,
        [TipoPasoValidacion.POLITICA_INTERNA]: ResultadoPaso.APROBADO,
      },
    },
    {
      titulo: 'El buró no contesta (caído), lo demás bien',
      monto: 50_000,
      forzado: {
        [TipoPasoValidacion.IDENTIDAD_INE]: ResultadoPaso.APROBADO,
        [TipoPasoValidacion.LISTA_BLOQUEO]: ResultadoPaso.APROBADO,
        [TipoPasoValidacion.HISTORIAL_INTERNO]: ResultadoPaso.APROBADO,
        [TipoPasoValidacion.BURO_CREDITO]: ResultadoPaso.NO_DISPONIBLE,
        [TipoPasoValidacion.POLITICA_INTERNA]: ResultadoPaso.APROBADO,
      },
    },
  ];

  for (const esc of escenarios) {
    const r = await motor.ejecutar({
      empresaId,
      clienteId: cliente.id,
      limiteSolicitado: esc.monto,
      simulacion: true,
      simulado: esc.forzado,
    });

    const c = color[r.veredicto.estado] ?? '';
    console.log(`\n\x1b[1m${esc.titulo}\x1b[0m  (solicita ${esc.monto.toLocaleString('es-MX')})`);
    console.log(
      `  ${c}${r.veredicto.estado}\x1b[0m · puntaje ${r.veredicto.puntaje} · sugerido ${Number(r.veredicto.limiteSugerido).toLocaleString('es-MX')}`,
    );
    for (const p of r.pasos) {
      const marca =
        p.resultado === 'APROBADO' ? '\x1b[32m+\x1b[0m'
        : p.resultado === 'RECHAZADO' ? '\x1b[31mx\x1b[0m'
        : '\x1b[33m?\x1b[0m';
      console.log(`    ${marca} ${p.etiqueta.padEnd(32)} ${p.resultado}`);
    }
    if (r.pasos.length < flujo.pasos.length) {
      console.log(
        `    \x1b[90m(se detuvo en el paso ${r.pasos.length}; no se gastaron las consultas siguientes)\x1b[0m`,
      );
    }
  }

  console.log(
    '\nLas corridas quedaron guardadas como expedientes de simulación. No otorgan nada.',
  );
  console.log('Para borrar lo sembrado:  npm.cmd run flujo:simular -- --limpiar\n');

  await app.close();
  process.exit(0);
}

main().catch((e) => {
  console.error('\nSe cayó:', e);
  process.exit(1);
});
