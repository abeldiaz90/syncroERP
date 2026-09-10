/**
 * ============================================================================
 * SyncroERP · Diagnóstico de un pago de cobranza
 * ----------------------------------------------------------------------------
 * Llama a CobranzaService.registrarPago directamente y muestra el error TAL
 * COMO lo devuelve Postgres.
 *
 * Existe porque la API responde «No se pudo completar la operación en la base
 * de datos», que protege al usuario de ver tripas pero deja a quien depura sin
 * nada. El detalle está en el log del servidor; esto lo trae aquí.
 *
 *   npm.cmd run cobranza:diagnosticar                   simula, no cobra
 *   npm.cmd run cobranza:diagnosticar -- --aplicar      registra el pago
 *   npm.cmd run cobranza:diagnosticar -- --aplicar --folio CRD-2026-0009 --monto 7.37
 * ============================================================================
 */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { CobranzaService } from '../src/credito/services/cobranza.service';
import { MetodoPagoCobranza } from '../src/credito/dto/registrar-pago-cobranza.dto';

const arg = (n: string, d = '') => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const ok = (m: string) => console.log(`  \x1b[32mOK\x1b[0m    ${m}`);
const mal = (m: string) => console.log(`  \x1b[31mFALLA\x1b[0m ${m}`);
const info = (m: string) => console.log(`        \x1b[90m${m}\x1b[0m`);
const titulo = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`);

async function main() {
  const aplicar = process.argv.includes('--aplicar');
  const folio = arg('folio');
  const monto = Number(arg('monto', '0'));

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  const ds = app.get(DataSource);
  const cobranza = app.get(CobranzaService);

  const [empresa] = await ds.query<{ id: string; nombre: string }[]>(
    `SELECT id, nombrecomercial AS nombre FROM empresas WHERE activo = true ORDER BY fechacreacion LIMIT 1`,
  );
  const empresaId = empresa.id;

  const [credito] = await ds.query<
    { id: string; folio: string; saldopendiente: string; nombre: string }[]
  >(
    `SELECT c.id, c.folio, c.saldopendiente, cl.nombre
       FROM creditos_clientes c
       INNER JOIN clientes cl ON cl.id = c.clienteid
      WHERE c.empresaid = $1 AND c.estado = 'ACTIVO' ${folio ? 'AND c.folio = $2' : ''}
      ORDER BY c.fechacreacion DESC LIMIT 1`,
    folio ? [empresaId, folio] : [empresaId],
  );
  if (!credito) {
    console.error('No hay créditos activos que cobrar.');
    await app.close();
    process.exit(1);
  }

  const [cuenta] = await ds.query<{ id: string; nombre: string; tipo: string }[]>(
    `SELECT id, nombre, tipo FROM cuentas_bancarias
      WHERE empresaid = $1 AND activo = true ORDER BY espordefecto DESC, nombre LIMIT 1`,
    [empresaId],
  );
  if (!cuenta) {
    console.error('No hay cuentas de caja, banco o TPV activas: el pago no tiene dónde entrar.');
    await app.close();
    process.exit(1);
  }

  const [cuota] = await ds.query<
    { id: string; numerocuota: number; montocuota: string; montopagado: string }[]
  >(
    `SELECT id, numerocuota, montocuota, montopagado FROM amortizacion_cuotas
      WHERE creditoid = $1 AND estado <> 'PAGADA' ORDER BY numerocuota LIMIT 1`,
    [credito.id],
  );

  const aCobrar = monto > 0
    ? monto
    : cuota
      ? Math.round((Number(cuota.montocuota) - Number(cuota.montopagado)) * 100) / 100
      : Number(credito.saldopendiente);

  console.log(`\nEmpresa  ${empresa.nombre}`);
  console.log(`Crédito  ${credito.folio} · ${credito.nombre}`);
  info(`saldo pendiente ${credito.saldopendiente}`);
  info(`cuenta receptora ${cuenta.nombre} (${cuenta.tipo})`);
  if (cuota) info(`primera cuota abierta: #${cuota.numerocuota} por ${cuota.montocuota}`);
  info(`a cobrar ${aCobrar.toFixed(2)}`);

  if (!aplicar) {
    titulo('Modo simulación');
    info('No se cobró nada. Para intentarlo de verdad:');
    console.log('\n  npm.cmd run cobranza:diagnosticar -- --aplicar\n');
    await app.close();
    return;
  }

  titulo('Registrando el pago');
  try {
    const resultado = await cobranza.registrarPago(
      {
        creditoId: credito.id,
        cuotaId: cuota?.id,
        montoPagado: aCobrar,
        metodoPago: MetodoPagoCobranza.EFECTIVO,
        cuentaBancariaId: cuenta.id,
        referencia: 'Diagnóstico de cobranza',
        fechaPago: new Date().toISOString().slice(0, 10),
        claveIdempotencia: `diagnostico-cobranza-${Date.now()}`,
      },
      empresaId,
    );
    const r = resultado as {
      credito?: { saldoPendiente?: number };
      capitalAplicado?: number;
      interesAplicado?: number;
    };
    ok('El pago se registró.');
    info(`capital ${r.capitalAplicado ?? '?'} · interés ${r.interesAplicado ?? '?'}`);
    info(`saldo del crédito: ${r.credito?.saldoPendiente ?? '?'}`);
  } catch (e) {
    // Aquí está el punto del script: el error sin maquillar.
    mal(e instanceof Error ? e.message : String(e));
    const crudo = e as {
      code?: string;
      detail?: string;
      table?: string;
      column?: string;
      constraint?: string;
      query?: string;
      driverError?: Record<string, unknown>;
    };
    const driver = (crudo.driverError ?? crudo) as Record<string, unknown>;
    titulo('Detalle de Postgres');
    for (const campo of ['code', 'severity', 'detail', 'hint', 'table', 'column', 'constraint', 'where', 'routine']) {
      const valor = driver[campo];
      if (valor) console.log(`  ${campo.padEnd(12)} ${String(valor)}`);
    }
    if (crudo.query) {
      titulo('Consulta');
      console.log(`  ${String(crudo.query).slice(0, 400)}`);
    }
    if (e instanceof Error && e.stack) {
      titulo('Dónde ocurrió');
      console.log(
        e.stack
          .split('\n')
          .filter((l) => l.includes('/src/') || l.includes('\\src\\'))
          .slice(0, 6)
          .join('\n'),
      );
    }
    console.log('');
    await app.close();
    process.exit(1);
  }

  console.log('');
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
