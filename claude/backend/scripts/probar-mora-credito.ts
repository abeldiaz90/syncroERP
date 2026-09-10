/**
 * ============================================================================
 * SyncroERP · Mora y cartera vencida
 * ----------------------------------------------------------------------------
 * Ninguna cuota ha vencido todavía —la primera es de octubre— así que todo el
 * comportamiento de mora está escrito y sin ejercitar: marcar la cuota vencida,
 * pasar el crédito a VENCIDO, que aparezca en el reporte de antigüedad en el
 * tramo correcto, y que la política de crédito bloquee al cliente.
 *
 * Se fuerza con un crédito de fecha retroactiva. Todo corre dentro de una
 * transacción que SIEMPRE se deshace: al terminar no queda ni el crédito ni la
 * mora ni el bloqueo.
 *
 * Por eso mismo esta prueba no compara contra Fineract: un crédito que se
 * deshace no llega a replicarse. La concordancia de la mora entre los dos
 * sistemas queda pendiente hasta que una cuota real venza en octubre.
 *
 *   npm.cmd run credito:probar-mora
 * ============================================================================
 */
import { NestFactory } from '@nestjs/core';
import { DataSource, EntityManager } from 'typeorm';
import { AppModule } from '../src/app.module';
import { CreditosService } from '../src/credito/services/creditos.service';
import { CobranzaService } from '../src/credito/services/cobranza.service';
import { ProductosCreditoService } from '../src/credito/services/productos-credito.service';
import { PoliticaCreditoService } from '../src/common/services/politica-credito.service';
import { diaCalendario } from '../src/common/utils/fecha-calendario.util';

let pasan = 0;
let fallan = 0;
const ok = (m: string) => { pasan += 1; console.log(`  \x1b[32mPASA\x1b[0m  ${m}`); };
const mal = (m: string) => { fallan += 1; console.log(`  \x1b[31mFALLA\x1b[0m ${m}`); };
const nota = (m: string) => console.log(`        \x1b[90m${m}\x1b[0m`);
const titulo = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`);

const DESHACER = 'deshacer-siempre';

/** Hace `dias` días, como día de calendario local. */
const haceDias = (dias: number) => {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return diaCalendario(d);
};

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const ds = app.get(DataSource);
  const creditos = app.get(CreditosService);
  const cobranza = app.get(CobranzaService);
  const catalogo = app.get(ProductosCreditoService);
  const politica = app.get(PoliticaCreditoService);

  const [empresa] = await ds.query<{ id: string; nombre: string }[]>(
    `SELECT id, nombrecomercial AS nombre FROM empresas WHERE activo = true ORDER BY fechacreacion LIMIT 1`,
  );
  const empresaId = empresa.id;

  const [cliente] = await ds.query<{ id: string; nombre: string }[]>(
    `SELECT id, nombre FROM clientes
      WHERE empresaid = $1 AND activo = true AND estadocredito = 'AUTORIZADO' AND limitecredito > 0
      ORDER BY limitecredito DESC LIMIT 1`,
    [empresaId],
  );

  const producto = (await catalogo.listar(empresaId, { soloVendibles: true }))
    .find((p) => p.cuotasMaximas === 1);
  if (!producto) {
    console.error('Hace falta un producto vendible de un solo pago.');
    await app.close();
    process.exit(1);
  }

  console.log(`\nEmpresa  ${empresa.nombre}`);
  console.log(`Cliente  ${cliente.nombre}`);
  nota(`producto ${producto.codigo} · vence a ${producto.cadaCuantos} ${producto.unidadPlazo.toLowerCase()}`);
  nota('Todo se deshace al final: no queda mora ni bloqueo.');

  // Retroactivo lo bastante para que la única cuota lleve ~45 días vencida.
  const diasAtras = producto.cadaCuantos + 45;
  const inicio = haceDias(diasAtras);

  try {
    await ds.transaction(async (em: EntityManager) => {
      titulo('1 · Un crédito con la cuota ya vencida');
      const credito = (await creditos.crearCredito(
        {
          empresaId,
          clienteId: cliente.id,
          montoVenta: 2000,
          enganche: 0,
          numeroCuotas: 1,
          tasaInteresMensual: 0,
          sinInteres: true,
          fechaInicio: inicio,
          productoCreditoId: producto.id,
          notas: 'Prueba de mora. Se deshace.',
        },
        em,
      )) as { id: string; folio: string; estado: string };
      nota(`${credito.folio} con inicio ${inicio}`);

      const [cuota] = await em.query<
        { id: string; fechavencimiento: string; estado: string }[]
      >(
        `SELECT id, fechavencimiento, estado FROM amortizacion_cuotas
          WHERE creditoid = $1 ORDER BY numerocuota`,
        [credito.id],
      );
      const diasVencida = Math.floor(
        (Date.now() - new Date(`${diaCalendario(cuota.fechavencimiento)}T12:00:00`).getTime()) /
          86_400_000,
      );
      if (diasVencida > 0) {
        ok(`La cuota venció el ${diaCalendario(cuota.fechavencimiento)}: ${diasVencida} días de atraso.`);
      } else {
        mal(`La cuota no quedó vencida (${diaCalendario(cuota.fechavencimiento)}).`);
      }
      nota(`estado inicial de la cuota: ${cuota.estado}`);

      // ── 2 · El proceso que marca la mora ───────────────────────────────
      titulo('2 · El proceso diario marca lo vencido');
      const resultado = await cobranza.actualizarVencidos(empresaId, em);
      nota(`cuotas actualizadas: ${resultado.actualizadas}`);

      const [despues] = await em.query<{ estado: string }[]>(
        `SELECT estado FROM amortizacion_cuotas WHERE id = $1`,
        [cuota.id],
      );
      if (despues.estado === 'VENCIDA') {
        ok('La cuota quedó marcada VENCIDA.');
      } else {
        mal(`La cuota quedó en ${despues.estado}, se esperaba VENCIDA.`);
      }

      const [credDespues] = await em.query<{ estado: string }[]>(
        `SELECT estado FROM creditos_clientes WHERE id = $1`,
        [credito.id],
      );
      if (credDespues.estado === 'VENCIDO') {
        ok('El crédito pasó a VENCIDO.');
      } else {
        mal(`El crédito quedó en ${credDespues.estado}, se esperaba VENCIDO.`);
      }

      // ── 3 · El cliente deja de poder comprar a crédito ─────────────────
      titulo('3 · La política bloquea al cliente moroso');
      const resumen = await politica.obtenerResumen(empresaId, cliente.id, {
        manager: em,
      });
      nota(`vencido ${resumen.vencido} · disponible ${resumen.disponible}`);
      if (Number(resumen.vencido) >= 2000) {
        ok('La línea reconoce el saldo vencido.');
      } else {
        mal(`El resumen reporta ${resumen.vencido} de vencido; se esperaban al menos 2000.`);
      }
      if (!resumen.puedeOperar) {
        ok(`El cliente queda bloqueado: ${resumen.razonBloqueo ?? 'sin motivo declarado'}`);
      } else {
        mal('El cliente sigue pudiendo operar a crédito con cartera vencida.');
      }

      await debeRechazar('Vender otra vez a un cliente con mora', () =>
        creditos.crearCredito(
          {
            empresaId,
            clienteId: cliente.id,
            montoVenta: 500,
            enganche: 0,
            numeroCuotas: 1,
            tasaInteresMensual: 0,
            sinInteres: true,
            fechaInicio: diaCalendario(new Date()),
            productoCreditoId: producto.id,
          },
          em,
        ));

      // ── 4 · El reporte de antigüedad ───────────────────────────────────
      titulo('4 · Aparece en el tramo correcto de la antigüedad');
      // El método devuelve el aging directamente, no envuelto en `{ aging }`.
      const aging = (await creditos.obtenerCarteraVencida(empresaId)) as Record<
        string,
        unknown[]
      >;
      const tramo = diasVencida <= 30 ? 'd30' : diasVencida <= 60 ? 'd60' : diasVencida <= 90 ? 'd90' : 'd90mas';
      nota(
        Object.entries(aging)
          .map(([k, v]) => `${k}:${(v as unknown[]).length}`)
          .join(' · '),
      );
      nota(`con ${diasVencida} días de atraso, el tramo esperado es ${tramo}`);
      nota('El reporte lee fuera de la transacción, así que no ve este crédito;');
      nota('lo que se comprueba es que la consulta corre y clasifica.');
      if (aging[tramo]) {
        ok(`El reporte devuelve el tramo ${tramo}.`);
      } else {
        mal(`El reporte no tiene tramo ${tramo}.`);
      }

      throw new Error(DESHACER);
    });
  } catch (e) {
    if (!(e instanceof Error) || e.message !== DESHACER) {
      console.error(e);
      fallan += 1;
    }
  }

  titulo('Verificación de la limpieza');
  const [{ n }] = await ds.query<{ n: string }[]>(
    `SELECT COUNT(*) AS n FROM creditos_clientes WHERE empresaid = $1 AND montoventa = 2000 AND notas LIKE '%Prueba de mora%'`,
    [empresaId],
  );
  if (Number(n) === 0) {
    ok('La transacción se deshizo: no quedó mora inventada en la cartera.');
  } else {
    mal(`Quedaron ${n} crédito(s) de prueba. Revísalo a mano.`);
  }

  titulo(`Resultado: ${pasan} pasan · ${fallan} fallan`);
  if (fallan > 0) process.exitCode = 1;
  console.log('');
  await app.close();
}

async function debeRechazar(que: string, accion: () => Promise<unknown>) {
  try {
    await accion();
    mal(`${que} — se permitió, y no debía.`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === DESHACER) throw e;
    ok(`${que} — rechazado: ${msg}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
