/**
 * ============================================================================
 * SyncroERP · ¿Qué expone Fineract para la cobranza del día?
 * ----------------------------------------------------------------------------
 * El ERP tiene una pantalla de «Registrar cobranza» que arma la lista de lo que
 * toca cobrar hoy. El portal sabe cobrar UN crédito —la ficha del préstamo tiene
 * su operación de pago— pero no tiene esa lista.
 *
 * Antes de construirla hay que saber con qué. Fineract tiene una «hoja de
 * cobranza» (collection sheet) pensada exactamente para esto, pero su forma
 * cambia entre versiones y no está claro si esta instancia la expone. Este
 * script PREGUNTA y no asume: prueba las rutas candidatas y enseña qué contesta
 * cada una, con las llaves de la respuesta, sin interpretarlas.
 *
 * No cambia nada en Fineract: sólo lee.
 *
 *   npm.cmd run fineract:hoja-cobranza
 * ============================================================================
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { FineractHttpService } from '../src/integracion/adaptadores/fineract/fineract-http.service';
import { FineractConfig } from '../src/integracion/adaptadores/fineract/fineract.config';
import { diaCalendario } from '../src/common/utils/fecha-calendario.util';

const ok = (m: string) => console.log(`  \x1b[32mOK\x1b[0m    ${m}`);
const mal = (m: string) => console.log(`  \x1b[31mNO\x1b[0m    ${m}`);
const nota = (m: string) => console.log(`        \x1b[90m${m}\x1b[0m`);
const titulo = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`);

/** Llaves de un objeto, o la forma del arreglo. Sin volcar el contenido. */
const forma = (v: unknown): string => {
  if (Array.isArray(v)) {
    return `arreglo de ${v.length}${v.length ? ` · primer elemento: ${forma(v[0])}` : ''}`;
  }
  if (v && typeof v === 'object') {
    const llaves = Object.keys(v as Record<string, unknown>);
    return `{ ${llaves.slice(0, 18).join(', ')}${llaves.length > 18 ? ', …' : ''} }`;
  }
  return JSON.stringify(v);
};

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const http = app.get(FineractHttpService);
  const cfg = app.get(FineractConfig);
  const hoy = diaCalendario(new Date());

  const probarGet = async (ruta: string) => {
    try {
      const r = await http.get<unknown>(ruta, { timeoutMs: 45000 });
      ok(`GET ${ruta}`);
      nota(forma(r));
      return r;
    } catch (e) {
      mal(`GET ${ruta} → ${e instanceof Error ? e.message.slice(0, 140) : String(e)}`);
      return null;
    }
  };

  const probarPost = async (ruta: string, cuerpo: unknown) => {
    try {
      const r = await http.post<unknown>(ruta, cuerpo, { timeoutMs: 45000 });
      ok(`POST ${ruta}`);
      nota(`enviado: ${JSON.stringify(cuerpo)}`);
      nota(forma(r));
      return r;
    } catch (e) {
      mal(`POST ${ruta} → ${e instanceof Error ? e.message.slice(0, 220) : String(e)}`);
      return null;
    }
  };

  titulo('1 · La hoja de cobranza');
  await probarGet('/v1/collectionsheet/template');
  await probarPost('/v1/collectionsheet', {
    officeId: cfg.oficinaPorDefecto,
    transactionDate: hoy,
    dateFormat: cfg.formatoFecha,
    locale: cfg.localePorDefecto,
  });

  titulo('2 · Lo que trae el listado de préstamos');
  /*
   * Si la hoja de cobranza no existe, la alternativa es armar la lista con el
   * listado de préstamos. Interesa saber si cada renglón ya trae la próxima
   * cuota o si habría que pedir el detalle de cada crédito.
   */
  const lista = await http
    .get<{ pageItems?: Record<string, unknown>[] }>('/v1/loans?limit=3&offset=0', {
      timeoutMs: 45000,
    })
    .catch(() => null);
  const primero = lista?.pageItems?.[0];
  if (!primero) {
    mal('El listado no devolvió préstamos.');
  } else {
    nota(`llaves del renglón: ${forma(primero)}`);
    for (const llave of ['summary', 'delinquencyRange', 'timeline']) {
      if (llave in primero) nota(`${llave}: ${forma(primero[llave])}`);
    }
    nota(`¿trae calendario de pagos?: ${'repaymentSchedule' in primero ? 'SÍ' : 'no'}`);
  }

  titulo('3 · Consultas guardadas y reportes');
  const reportes = await http
    .get<Array<{ reportName?: string; reportType?: string; reportCategory?: string }>>(
      '/v1/reports',
      { timeoutMs: 45000 },
    )
    .catch(() => null);
  if (!reportes?.length) {
    mal('No se pudo listar reportes.');
  } else {
    const cobranza = reportes.filter((r) =>
      /collection|due|arrear|aging|expected|repayment/i.test(String(r.reportName ?? '')),
    );
    ok(`${reportes.length} reporte(s); ${cobranza.length} podrían servir para cobranza:`);
    for (const r of cobranza.slice(0, 15)) {
      nota(`· ${r.reportName} (${r.reportType}, ${r.reportCategory})`);
    }
  }

  /*
   * ── 4. El reporte que sí sirve ──────────────────────────────────────────
   * La hoja de cobranza contestó vacío —esta instalacion la tiene pensada para
   * grupos con calendario de reuniones, no para credito individual— y el
   * listado de prestamos no trae el calendario de pagos. Lo que si existe es
   * «Expected Payments By Date - Basic», que es exactamente la pregunta «que
   * toca cobrar entre estas dos fechas».
   *
   * Sus parametros se LEEN del propio reporte en vez de suponerlos: los
   * nombres cambian entre instalaciones y una corrida con un parametro
   * inventado falla con un mensaje que no dice cual falto.
   */
  titulo('4 · El reporte de pagos esperados');
  const objetivo = (reportes ?? []).find(
    (r) => String(r.reportName ?? '') === 'Expected Payments By Date - Basic',
  ) as { id?: number; reportName?: string } | undefined;

  if (!objetivo?.id) {
    mal('No aparece «Expected Payments By Date - Basic» con id consultable.');
  } else {
    const detalle = await http
      .get<{
        reportParameters?: Array<{
          parameterName?: string;
          reportParameterName?: string;
          parameterId?: number;
        }>;
      }>(`/v1/reports/${objetivo.id}`, { timeoutMs: 45000 })
      .catch(() => null);

    const params = detalle?.reportParameters ?? [];
    if (!params.length) {
      nota('El reporte no declara parametros.');
    } else {
      ok(`${params.length} parametro(s):`);
      // Crudo: el nombre que se declara y el que la consulta espera no son el
      // mismo, y esa diferencia fue justo lo que hizo fallar la corrida.
      for (const p of params) nota(`· ${JSON.stringify(p)}`);
    }

    /*
     * Fineract nombra los parametros de la consulta como `R_` + el nombre
     * INTERNO del parametro, que no es el nombre con el que se declara: el
     * reporte declara «OfficeIdSelectOne» y la consulta pide «officeId». Se usa
     * `reportParameterName` cuando viene, y si no, se deriva quitando el sufijo
     * «Select…» y bajando la primera letra.
     */
    const claveDe = (p: { parameterName?: string; reportParameterName?: string }): string => {
      const alias = String(p.reportParameterName ?? '').trim();
      if (alias) return alias;
      const base = String(p.parameterName ?? '').replace(/Select.*$/i, '');
      return base ? base.charAt(0).toLowerCase() + base.slice(1) : '';
    };

    /*
     * -1 es el comodin de «todos» en los reportes de Fineract. Se manda para
     * cada parametro declarado, salvo las fechas, que van al dia de hoy.
     */
    /*
     * `loanOfficerId` CONTIENE la palabra «office». La primera version probaba
     * con una expresion regular laxa y le puso al promotor el id de la
     * sucursal: el reporte corrio, devolvio cero renglones y parecia que no
     * habia nada que cobrar. Por eso ahora la correspondencia es exacta.
     */
    const valorDe = (clave: string, desde: string, hasta: string): string => {
      if (clave === 'startDate') return desde;
      if (clave === 'endDate') return hasta;
      if (clave === 'officeId') return String(cfg.oficinaPorDefecto);
      return '-1'; // comodin de «todos» en los reportes de Fineract
    };

    const correr = async (desde: string, hasta: string, etiqueta: string) => {
      const query = new URLSearchParams({
        genericResultSet: 'true',
        dateFormat: cfg.formatoFecha,
        locale: cfg.localePorDefecto,
      });
      for (const p of params) {
        const clave = claveDe(p);
        if (clave) query.set(`R_${clave}`, valorDe(clave, desde, hasta));
      }
      nota(`${etiqueta}: ${query.toString()}`);
      const ruta = `/v1/runreports/${encodeURIComponent(objetivo.reportName ?? '')}?${query.toString()}`;
      const corrida = await probarGet(ruta);
      const cs = corrida as {
        columnHeaders?: Array<{ columnName?: string }>;
        data?: Array<{ row?: unknown[] }>;
      } | null;
      if (cs?.columnHeaders) {
        nota(`columnas: ${cs.columnHeaders.map((c) => c.columnName).join(', ')}`);
        nota(`renglones: ${cs.data?.length ?? 0}`);
        for (const r of (cs.data ?? []).slice(0, 5)) {
          nota(`  · ${JSON.stringify(r.row ?? r).slice(0, 300)}`);
        }
      }
    };

    await correr(hoy, hoy, 'hoy');
    /*
     * Una ventana amplia para comprobar que el reporte SI devuelve renglones y
     * que el comodin del promotor funciona. Cero renglones hoy no prueba nada:
     * puede ser que no venza nada hoy o que la consulta este mal armada.
     */
    await correr('2026-08-01', '2026-12-31', 'ventana amplia');
  }

  console.log('');
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
