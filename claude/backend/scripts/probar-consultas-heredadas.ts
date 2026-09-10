/**
 * ============================================================================
 * SyncroERP · Los caminos que nadie ha recorrido desde la migración
 * ----------------------------------------------------------------------------
 * SQL Server acepta `bit = 0`; Postgres responde «operator does not exist:
 * boolean = integer» y tumba la consulta. Eso es lo que tuvo la cobranza rota
 * durante meses: compilaba, arrancaba, y sólo fallaba cuando alguien pasaba por
 * ahí la primera vez.
 *
 * Se corrigieron cuatro lugares. Uno —tesorería— ya se caminó al cobrar. Los
 * otros tres siguen sin ejercitarse:
 *
 *   · conciliación financiera · el auxiliar de tesorería a una fecha de corte
 *   · CRM                     · actividades pendientes
 *   · nómina                  · incidencias aprobadas de un periodo
 *
 * Esta prueba los ejecuta. No busca que devuelvan datos —una empresa nueva no
 * tiene incidencias ni actividades— sino que la consulta CORRA. Cero filas es
 * un resultado válido; un error de tipos no.
 *
 * Llama a métodos privados a propósito: son consultas internas sin entrada
 * pública barata, y lo que se prueba es exactamente ese SQL.
 *
 *   npm.cmd run db:probar-consultas
 * ============================================================================
 */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { ConciliacionFinancieraService } from '../src/finanzas/services/conciliacion-financiera.service';
import { CrmService } from '../src/crm/services/crm.service';
import { NominaCalculoService } from '../src/rrhh/services/nomina-calculo.service';
import { PoliticaCreditoService } from '../src/common/services/politica-credito.service';
import { CobranzaService } from '../src/credito/services/cobranza.service';
import { PolizasService } from '../src/finanzas/services/polizas.service';
import { DashboardEjecutivoService } from '../src/ventas/services/dashboard-ejecutivo.service';
import { diaCalendario } from '../src/common/utils/fecha-calendario.util';

let pasan = 0;
let fallan = 0;
const ok = (m: string) => { pasan += 1; console.log(`  \x1b[32mPASA\x1b[0m  ${m}`); };
const mal = (m: string) => { fallan += 1; console.log(`  \x1b[31mFALLA\x1b[0m ${m}`); };
const nota = (m: string) => console.log(`        \x1b[90m${m}\x1b[0m`);
const titulo = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`);

/**
 * Corre la consulta y sólo reprueba si truena por el motor.
 *
 * Un `ConflictException` de negocio —«hay incidencias pendientes»— significa
 * que la consulta corrió y devolvió algo: es un éxito para lo que se está
 * midiendo. Lo que no se tolera es un error de Postgres.
 */
async function debeCorrer(que: string, accion: () => Promise<unknown>) {
  try {
    const r = await accion();
    const n = Array.isArray(r) ? `${r.length} fila(s)` : 'sin error';
    ok(`${que} — ${n}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const esDelMotor =
      /operator does not exist|column .* does not exist|syntax error|relation .* does not exist|invalid input syntax/i.test(msg);
    if (esDelMotor) {
      mal(`${que} — ${msg.split('\n')[0]}`);
    } else {
      ok(`${que} — la consulta corrió; se detuvo por regla de negocio: ${msg.split('\n')[0]}`);
    }
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const ds = app.get(DataSource);

  const [empresa] = await ds.query<{ id: string; nombre: string }[]>(
    `SELECT id, nombrecomercial AS nombre FROM empresas WHERE activo = true ORDER BY fechacreacion LIMIT 1`,
  );
  const empresaId = empresa.id;
  const hoy = diaCalendario(new Date());

  console.log(`\nEmpresa  ${empresa.nombre}`);
  nota('Se mide que la consulta corra, no que devuelva datos.');

  // ── Conciliación financiera ──────────────────────────────────────────────
  titulo('Conciliación financiera · auxiliar de tesorería');
  const conciliacion = app.get(ConciliacionFinancieraService) as unknown as {
    auxiliarTesoreria(empresaId: string, fechaCorte: string): Promise<unknown[]>;
    saldosMayor(empresaId: string, fechaCorte: string): Promise<unknown>;
    auxiliarClientes(empresaId: string, fechaCorte: string): Promise<unknown[]>;
    auxiliarProveedores(empresaId: string, fechaCorte: string): Promise<unknown[]>;
    auxiliarInventario(empresaId: string, fechaCorte: string): Promise<unknown[]>;
  };
  await debeCorrer('auxiliar de tesorería', () =>
    conciliacion.auxiliarTesoreria(empresaId, hoy));
  // De paso los otros tres auxiliares, que comparten el mismo origen T-SQL.
  await debeCorrer('saldos del mayor', () =>
    conciliacion.saldosMayor(empresaId, hoy) as Promise<unknown>);
  await debeCorrer('auxiliar de clientes', () =>
    conciliacion.auxiliarClientes(empresaId, hoy));
  await debeCorrer('auxiliar de proveedores', () =>
    conciliacion.auxiliarProveedores(empresaId, hoy));
  await debeCorrer('auxiliar de inventario', () =>
    conciliacion.auxiliarInventario(empresaId, hoy));

  // ── CRM ──────────────────────────────────────────────────────────────────
  titulo('CRM · actividades');
  const crm = app.get(CrmService);
  await debeCorrer('actividades pendientes', () =>
    crm.listarActividades(empresaId, { pendientes: true }));
  await debeCorrer('actividades del mes', () =>
    crm.listarActividades(empresaId, {
      desde: `${hoy.slice(0, 8)}01`,
      hasta: hoy,
    }));

  // ── Nómina ───────────────────────────────────────────────────────────────
  titulo('Nómina · incidencias aprobadas del periodo');
  const nomina = app.get(NominaCalculoService) as unknown as {
    obtenerIncidencias(
      manager: unknown,
      periodo: { fechaInicio: string; fechaFin: string },
      empresaId: string,
    ): Promise<unknown[]>;
  };
  const [periodo] = await ds.query<
    { id: string; fechainicio: string; fechafin: string }[]
  >(
    // La tabla lleva el prefijo del módulo: `rrhh_periodos_nomina`. Adivinar
    // el nombre y taparlo con un catch es como se cuelan los errores que esta
    // prueba busca; el catch se quitó a propósito.
    `SELECT id, fechainicio, fechafin FROM rrhh_periodos_nomina
      WHERE empresaid = $1 ORDER BY fechafin DESC LIMIT 1`,
    [empresaId],
  );

  if (!periodo) {
    nota('No hay periodos de nómina capturados; se usa el mes en curso.');
  }
  await debeCorrer('incidencias aprobadas', () =>
    nomina.obtenerIncidencias(
      ds.manager,
      {
        fechaInicio: periodo?.fechainicio ?? `${hoy.slice(0, 8)}01`,
        fechaFin: periodo?.fechafin ?? hoy,
      },
      empresaId,
    ));

  // ── Alias en camelCase ───────────────────────────────────────────────────
  titulo('Alias de columna: camelCase contra Postgres');
  nota('Postgres pliega a minúsculas todo alias sin comillas. Si el código lo');
  nota('lee en camelCase recibe undefined, y eso no truena: devuelve ceros y');
  nota('nulos creíbles. Así estuvo la línea de crédito sin consumirse nunca.');

  const tieneClave = (fila: unknown, clave: string) =>
    !!fila && Object.prototype.hasOwnProperty.call(fila, clave);

  const revisarClaves = async (
    que: string,
    claves: string[],
    accion: () => Promise<unknown>,
  ) => {
    try {
      const r = await accion();
      const fila = Array.isArray(r) ? r[0] : r;
      if (!fila) {
        nota(`${que}: sin filas, no se puede comprobar el alias.`);
        return;
      }
      const faltan = claves.filter((c) => !tieneClave(fila, c));
      if (faltan.length === 0) {
        ok(`${que} — los alias llegan en camelCase.`);
      } else {
        mal(`${que} — faltan ${faltan.join(', ')}. Llegaron: ${Object.keys(fila as object).join(', ')}`);
      }
    } catch (e) {
      mal(`${que} — ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`);
    }
  };

  const politica = app.get(PoliticaCreditoService);
  const [algunCliente] = await ds.query<{ id: string }[]>(
    `SELECT id FROM clientes WHERE empresaid = $1 AND activo = true LIMIT 1`,
    [empresaId],
  );
  if (algunCliente) {
    const resumen = await politica.obtenerResumen(empresaId, algunCliente.id);
    nota(`línea: utilizado ${resumen.utilizado} · disponible ${resumen.disponible} · vencido ${resumen.vencido}`);
    const [{ saldo }] = await ds.query<{ saldo: string }[]>(
      `SELECT COALESCE(SUM(saldopendiente),0) AS saldo FROM creditos_clientes
        WHERE empresaid = $1 AND clienteid = $2 AND estado IN ('ACTIVO','VENCIDO')`,
      [empresaId, algunCliente.id],
    );
    if (Math.abs(Number(resumen.utilizado) - Number(saldo)) < 0.01) {
      ok(`El utilizado de la línea coincide con la cartera real (${saldo}).`);
    } else {
      mal(`La línea dice utilizado ${resumen.utilizado} y la cartera suma ${saldo}.`);
    }
  }

  await revisarClaves('pagos del día', ['creditoId', 'fechaPago', 'montoPagado'], () =>
    app.get(CobranzaService).obtenerPagosDelDia(empresaId));
  await revisarClaves('balanza de comprobación', ['numeroCuenta'], () =>
    app.get(PolizasService).obtenerBalanzaComprobacion(empresaId));
  // El resumen ya traduce a su propio contrato (`traslado`/`acreditable`), así
  // que se comprueba ESE, que es lo que ve la pantalla.
  await revisarClaves('resumen ejecutivo · IVA', ['traslado', 'acreditable', 'aPagar'], async () => {
    const r = (await app.get(DashboardEjecutivoService).obtenerResumen(empresaId)) as {
      iva?: unknown;
    };
    return r.iva ?? r;
  });

  titulo(`Resultado: ${pasan} pasan · ${fallan} fallan`);
  if (fallan > 0) {
    nota('Un error del motor aquí es el mismo que tuvo la cobranza rota meses:');
    nota('compila, arranca, y sólo truena cuando alguien camina ese flujo.');
    process.exitCode = 1;
  }
  console.log('');
  await app.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
