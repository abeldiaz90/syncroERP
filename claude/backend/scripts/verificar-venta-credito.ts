/**
 * ============================================================================
 * SyncroERP · Verifica las ventas a crédito de punta a punta
 * ----------------------------------------------------------------------------
 * Recorre un crédito desde el ERP hasta Fineract y compara lo que hay de los
 * dos lados.
 *
 *   npm.cmd run venta:verificar                  el crédito más reciente
 *   npm.cmd run venta:verificar -- --todos       todos los créditos
 *   npm.cmd run venta:verificar -- --folio CRD-2026-0001
 *   npm.cmd run venta:verificar -- --despachar   fuerza el despacho antes
 *
 * LA COMPROBACIÓN QUE IMPORTA es la tabla de amortización: si Fineract no
 * calcula exactamente las mismas cuotas que el ERP, el producto está mal
 * configurado y todo lo demás va a mentir con cara de estar bien.
 *
 * Con --todos, al final se imprime a qué producto de Fineract fue a dar cada
 * tipo de crédito. Esa tabla es la que demuestra que la correspondencia entre
 * los dos catálogos es la que creemos que es, y no la que suponemos.
 * ============================================================================
 */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { FineractHttpService } from '../src/integracion/adaptadores/fineract/fineract-http.service';
import { IntegracionDespachadorService } from '../src/integracion/services/integracion-despachador.service';
import { IntegracionVinculosService } from '../src/integracion/services/integracion-vinculos.service';
import { EventoIntegracion } from '../src/integracion/entities/evento-integracion.entity';
import { TipoVinculo } from '../src/integracion/integracion.constants';

const arg = (n: string, d = '') => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const ok = (m: string) => console.log(`  \x1b[32mOK\x1b[0m    ${m}`);
const mal = (m: string) => console.log(`  \x1b[31mFALLA\x1b[0m ${m}`);
const info = (m: string) => console.log(`        \x1b[90m${m}\x1b[0m`);
const titulo = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`);
const dinero = (n: number) => n.toFixed(2).padStart(12);
const dia = (f: string | Date) =>
  (f instanceof Date ? f : new Date(f)).toISOString().slice(0, 10);
/** Fineract entrega las fechas como [aaaa, mm, dd], con el mes en base 1. */
const diaFineract = (f?: number[]) =>
  f && f.length >= 3
    ? `${f[0]}-${String(f[1]).padStart(2, '0')}-${String(f[2]).padStart(2, '0')}`
    : '    —     ';

interface Credito {
  id: string; folio: string; clienteid: string; ventaid: string | null;
  capitalfinanciado: string; montototal: string; saldopendiente: string;
  numerocuotas: number; tasainteresmensual: string; sininteres: boolean;
  tipocredito: string; fechainicio: string; estado: string; nombre: string;
}

/** Lo que interesa del préstamo del lado de Fineract. */
interface PrestamoRemoto {
  status?: { value?: string };
  principal?: number;
  loanProductId?: number;
  loanProductName?: string;
  repaymentSchedule?: {
    periods?: {
      period?: number;
      dueDate?: number[];
      principalDue?: number;
      interestDue?: number;
      totalDueForPeriod?: number;
    }[];
  };
}

interface RenglonResumen {
  folio: string;
  tipo: string;
  cuotas: number;
  interes: string;
  producto: string;
  prestamo: string;
  veredicto: string;
}

async function main() {
  const folio = arg('folio');
  const todos = process.argv.includes('--todos');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const ds = app.get(DataSource);
  const http = app.get(FineractHttpService);
  const despachador = app.get(IntegracionDespachadorService);
  const vinculos = app.get(IntegracionVinculosService);
  const eventos = ds.getRepository(EventoIntegracion);

  const [empresa] = await ds.query<{ id: string; nombre: string }[]>(
    `SELECT id, nombrecomercial AS nombre FROM empresas WHERE activo = true ORDER BY fechacreacion LIMIT 1`,
  );
  const empresaId = empresa.id;

  const creditos = await ds.query<Credito[]>(
    `SELECT c.id, c.folio, c.clienteid, c.ventaid, c.capitalfinanciado, c.montototal,
            c.saldopendiente, c.numerocuotas, c.tasainteresmensual, c.sininteres,
            c.tipocredito, c.fechainicio, c.estado, cl.nombre
       FROM creditos_clientes c
       INNER JOIN clientes cl ON cl.id = c.clienteid
      WHERE c.empresaid = $1 ${folio ? 'AND c.folio = $2' : ''}
      ORDER BY c.fechacreacion ${todos ? 'ASC' : 'DESC'} ${todos || folio ? '' : 'LIMIT 1'}`,
    folio ? [empresaId, folio] : [empresaId],
  );

  if (creditos.length === 0) {
    console.error(
      folio
        ? `No encontré el crédito ${folio}.`
        : 'No hay ningún crédito registrado todavía. Haz la venta primero.',
    );
    await app.close();
    process.exit(1);
  }

  console.log(`\nEmpresa  ${empresa.nombre}`);
  if (todos) info(`${creditos.length} crédito(s) por revisar`);

  let fallasTotales = 0;
  const resumen: RenglonResumen[] = [];

  for (const credito of creditos) {
    let fallas = 0;
    const check = (cond: boolean, bien: string, mal_: string) => {
      if (cond) ok(bien);
      else { fallas += 1; mal(mal_); }
    };

    titulo(`Crédito ${credito.folio} · ${credito.nombre}`);
    info(`capital ${credito.capitalfinanciado} · ${credito.numerocuotas} cuota(s) · tasa ${credito.tasainteresmensual}% ${credito.sininteres ? '(sin interés)' : ''}`);
    info(`tipo ${credito.tipocredito} · inicio ${new Date(credito.fechainicio).toDateString().slice(0, 10)} · estado ${credito.estado}`);
    info(`total ${credito.montototal} · saldo ${credito.saldopendiente}`);

    // ── 1. El hecho en el outbox ────────────────────────────────────────────
    titulo('1. El hecho quedó en el outbox');
    const evento = await eventos.findOne({
      where: { empresaId, claveIdempotencia: `credito:${credito.id}` },
    });
    check(!!evento, `${evento?.tipo} · ${evento?.estado}`, 'No se encoló ningún evento para este crédito');
    if (evento?.ultimoError) info(`último error: ${evento.ultimoError}`);

    // ── 2. Despacho ─────────────────────────────────────────────────────────
    if (process.argv.includes('--despachar') || evento?.estado !== 'ENVIADO') {
      titulo('2. Despacho hacia Fineract');
      const lote = await despachador.despacharLote(20);
      console.log(`  procesados ${lote.procesados} · fallidos ${lote.fallidos}`);
      const post = await eventos.findOne({ where: { id: evento?.id ?? '' } });
      if (post?.ultimoError) info(post.ultimoError);
    }

    const prestamoId = await vinculos.idExterno(empresaId, TipoVinculo.CREDITO, credito.id);
    titulo('3. El préstamo en Fineract');
    check(!!prestamoId, `préstamo ${prestamoId}`, 'El crédito NO llegó a Fineract');
    if (!prestamoId) {
      fallasTotales += fallas;
      resumen.push({
        folio: credito.folio,
        tipo: credito.tipocredito,
        cuotas: credito.numerocuotas,
        interes: credito.sininteres ? 'no' : `${Number(credito.tasainteresmensual)}%`,
        producto: '—',
        prestamo: '—',
        veredicto: 'no llegó',
      });
      continue;
    }

    let remoto: PrestamoRemoto;
    try {
      remoto = await http.get<PrestamoRemoto>(
        `/v1/loans/${prestamoId}?associations=repaymentSchedule`,
      );
    } catch (e) {
      // Que Fineract no conteste no es una falla de este crédito: es que no hay
      // con qué comparar. Se dice en una línea y se para, en vez de repetir el
      // mismo error siete veces o soltar un volcado de pila.
      mal(`No se pudo consultar Fineract: ${e instanceof Error ? e.message : String(e)}`);
      info('Sin Fineract no hay contra qué comparar. Revisa que esté arriba:');
      info('  D:\\fineract\\fineract-r3\\INICIAR_FINERACT_LOCAL.bat /reiniciar');
      info('«ECONNREFUSED» = nadie escucha en el 8443, normalmente porque todavía');
      info('está arrancando; «ECONNABORTED» = contesta pero tarda demasiado.');
      console.log('');
      await app.close();
      process.exit(1);
    }


    const producto = `${remoto.loanProductId ?? '?'} · ${remoto.loanProductName ?? '?'}`;
    info(`estado en Fineract: ${remoto.status?.value ?? '?'} · principal ${remoto.principal ?? '?'}`);
    // Qué producto financiero acabó usando este crédito. Es el dato que
    // demuestra la correspondencia entre los dos catálogos.
    info(`producto de Fineract: ${producto}`);
    check(
      Math.abs(Number(remoto.principal ?? 0) - Number(credito.capitalfinanciado)) < 0.01,
      'El capital coincide en los dos sistemas',
      `Capital distinto: ERP ${credito.capitalfinanciado} vs Fineract ${remoto.principal}`,
    );

    const cuotasErp = await ds.query<
      { numerocuota: number; fechavencimiento: string; montocapital: string; montointeres: string; montocuota: string }[]
    >(
      `SELECT numerocuota, fechavencimiento, montocapital, montointeres, montocuota
         FROM amortizacion_cuotas WHERE creditoid = $1 ORDER BY numerocuota`,
      [credito.id],
    );
    const periodos = (remoto.repaymentSchedule?.periods ?? []).filter((p) => (p.period ?? 0) > 0);

    titulo('4. Tabla de amortización, cuota por cuota');
    console.log('       #  vence ERP   vence Fnr     capital ERP    capital Fnr     interés ERP    interés Fnr       cuota ERP      cuota Fnr');
    check(
      cuotasErp.length === periodos.length,
      `Mismo número de cuotas (${cuotasErp.length})`,
      `Número de cuotas distinto: ERP ${cuotasErp.length} vs Fineract ${periodos.length}`,
    );

    let descuadres = 0;
    let descuadresFecha = 0;
    for (const c of cuotasErp) {
      const p = periodos.find((x) => x.period === c.numerocuota);
      const capE = Number(c.montocapital), capF = Number(p?.principalDue ?? 0);
      const intE = Number(c.montointeres), intF = Number(p?.interestDue ?? 0);
      const totE = Number(c.montocuota), totF = Number(p?.totalDueForPeriod ?? 0);
      // El vencimiento es lo ÚNICO que distingue un crédito a 30 días de uno a
      // 90 cuando ambos usan el mismo producto de Fineract. Si sólo se comparan
      // importes, los tres salen idénticos y la prueba no prueba nada.
      const venceE = dia(c.fechavencimiento);
      const venceF = diaFineract(p?.dueDate);
      const mismaFecha = venceE === venceF;
      if (!mismaFecha) descuadresFecha += 1;
      const cuadra =
        Math.abs(capE - capF) < 0.01 && Math.abs(intE - intF) < 0.01 && Math.abs(totE - totF) < 0.01 && mismaFecha;
      if (!cuadra) descuadres += 1;
      console.log(
        `  ${cuadra ? '\x1b[32m ok\x1b[0m' : '\x1b[31m  x\x1b[0m'} ${String(c.numerocuota).padStart(3)}  ${venceE}  ${mismaFecha ? venceF : `\x1b[31m${venceF}\x1b[0m`}  ${dinero(capE)} ${dinero(capF)} ${dinero(intE)} ${dinero(intF)} ${dinero(totE)} ${dinero(totF)}`,
      );
    }
    check(
      descuadres === 0,
      'La amortización coincide peso por peso y fecha por fecha',
      `${descuadres} cuota(s) no coinciden: el producto de Fineract está mal configurado`,
    );
    if (descuadresFecha > 0) {
      info('Los importes pueden cuadrar y el vencimiento no: eso significa que el');
      info('producto externo impone su propio plazo e ignora el que mandó el ERP.');
    }

    // ── 5. Espejo contable ──────────────────────────────────────────────────
    titulo('5. Espejo contable de la venta');
    const polizas = await ds.query<{ id: string; folio: string; concepto: string }[]>(
      `SELECT p.id, p.folio, p.concepto FROM polizas p
        WHERE p.empresaid = $1 AND (p.origenid = $2 OR p.origenid = $3)
        ORDER BY p.fechacreacion DESC`,
      [empresaId, credito.id, credito.ventaid ?? credito.id],
    );
    if (polizas.length === 0) {
      info('No encontré pólizas ligadas a esta venta; puede que el asiento siga pendiente.');
    } else {
      for (const pz of polizas) {
        const vin = await vinculos.buscar(empresaId, TipoVinculo.POLIZA, pz.id);
        const estado = vin?.idExterno ? `espejada (${vin.idExterno})` : vin?.estadoRemoto ?? 'sin espejar';
        console.log(`  ${pz.folio.padEnd(16)} ${estado.padEnd(22)} ${pz.concepto.slice(0, 50)}`);
      }
    }

    fallasTotales += fallas;
    resumen.push({
      folio: credito.folio,
      tipo: credito.tipocredito,
      cuotas: credito.numerocuotas,
      interes: credito.sininteres ? 'no' : `${Number(credito.tasainteresmensual)}%`,
      producto,
      prestamo: String(prestamoId),
      veredicto: fallas === 0 ? 'cuadra' : `${fallas} falla(s)`,
    });
  }

  // ── Correspondencia entre catálogos ───────────────────────────────────────
  if (resumen.length > 1) {
    titulo('Correspondencia de productos ERP → Fineract');
    console.log(
      `  ${'crédito'.padEnd(17)}${'tipo en el ERP'.padEnd(16)}${'cuotas'.padEnd(8)}${'interés'.padEnd(9)}${'préstamo'.padEnd(10)}${'producto en Fineract'.padEnd(42)}veredicto`,
    );
    for (const r of resumen) {
      const color = r.veredicto === 'cuadra' ? '\x1b[32m' : '\x1b[31m';
      console.log(
        `  ${r.folio.padEnd(17)}${r.tipo.padEnd(16)}${String(r.cuotas).padEnd(8)}${r.interes.padEnd(9)}${r.prestamo.padEnd(10)}${r.producto.slice(0, 40).padEnd(42)}${color}${r.veredicto}\x1b[0m`,
      );
    }
    const productos = new Set(resumen.map((r) => r.producto).filter((p) => p !== '—'));
    info(`${productos.size} producto(s) de Fineract ejercitados: ${[...productos].join(' | ')}`);
  }

  console.log(
    fallasTotales === 0
      ? `\n\x1b[32m${resumen.length} crédito(s) viajaron completos y cuadran en los dos sistemas.\x1b[0m\n`
      : `\n\x1b[31m${fallasTotales} comprobación(es) fallaron.\x1b[0m\n`,
  );
  await app.close();
  process.exit(fallasTotales ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
