/**
 * ============================================================================
 * SyncroERP · Escenarios de crédito que nunca se habían caminado
 * ----------------------------------------------------------------------------
 * Venta con enganche, cliente que se pasa de su línea, plazo mayor al
 * autorizado, producto suspendido, producto de otra empresa. Todos son caminos
 * que existen en el código desde hace meses y que nadie había recorrido —que es
 * exactamente como cobranza estuvo rota sin que se notara.
 *
 * TODO CORRE DENTRO DE UNA TRANSACCIÓN QUE SIEMPRE SE DESHACE. Se ejercita el
 * camino real —el mismo `crearCredito` que usa el punto de venta, con sus
 * validaciones, su folio y su evento de integración— y al final no queda nada
 * escrito. Por eso puede probar el caso feliz sin ensuciar la cartera.
 *
 *   npm.cmd run credito:probar-escenarios
 * ============================================================================
 */
import { NestFactory } from '@nestjs/core';
import { DataSource, EntityManager } from 'typeorm';
import { AppModule } from '../src/app.module';
import { CreditosService } from '../src/credito/services/creditos.service';
import { ProductosCreditoService } from '../src/credito/services/productos-credito.service';
import { diaCalendario } from '../src/common/utils/fecha-calendario.util';

let pasan = 0;
let fallan = 0;
const ok = (m: string) => { pasan += 1; console.log(`  \x1b[32mPASA\x1b[0m  ${m}`); };
const mal = (m: string) => { fallan += 1; console.log(`  \x1b[31mFALLA\x1b[0m ${m}`); };
const nota = (m: string) => console.log(`        \x1b[90m${m}\x1b[0m`);
const titulo = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`);

const DESHACER = 'deshacer-siempre';

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

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const ds = app.get(DataSource);
  const creditos = app.get(CreditosService);
  const catalogo = app.get(ProductosCreditoService);

  const [empresa] = await ds.query<{ id: string; nombre: string }[]>(
    `SELECT id, nombrecomercial AS nombre FROM empresas WHERE activo = true ORDER BY fechacreacion LIMIT 1`,
  );
  const empresaId = empresa.id;

  const [cliente] = await ds.query<
    { id: string; nombre: string; limitecredito: string; diascredito: number }[]
  >(
    `SELECT id, nombre, limitecredito, diascredito FROM clientes
      WHERE empresaid = $1 AND activo = true AND estadocredito = 'AUTORIZADO'
        AND limitecredito > 0
      ORDER BY limitecredito DESC LIMIT 1`,
    [empresaId],
  );
  if (!cliente) {
    console.error('No hay un cliente con línea autorizada con el que probar.');
    await app.close();
    process.exit(1);
  }

  const [cuenta] = await ds.query<{ id: string; nombre: string }[]>(
    `SELECT id, nombre FROM cuentas_bancarias WHERE empresaid = $1 AND activo = true
      ORDER BY espordefecto DESC LIMIT 1`,
    [empresaId],
  );

  const aPlazos = (await catalogo.listar(empresaId, { soloVendibles: true }))
    .find((p) => p.cuotasMaximas > 1 && !p.sinInteres);
  const unPago = (await catalogo.listar(empresaId, { soloVendibles: true }))
    .find((p) => p.cuotasMaximas === 1);

  if (!aPlazos || !unPago) {
    console.error('Hacen falta un producto a plazos y uno de un solo pago, ambos vendibles.');
    await app.close();
    process.exit(1);
  }

  console.log(`\nEmpresa  ${empresa.nombre}`);
  console.log(`Cliente  ${cliente.nombre}`);
  nota(`línea ${cliente.limitecredito} · plazo máximo ${cliente.diascredito} días`);
  nota(`productos: ${aPlazos.codigo} (a plazos) y ${unPago.codigo} (un pago)`);
  nota('Todo se deshace al final: no queda ningún crédito escrito.');

  const hoy = diaCalendario(new Date());
  const base = {
    empresaId,
    clienteId: cliente.id,
    montoVenta: 5000,
    enganche: 0,
    numeroCuotas: 3,
    tasaInteresMensual: aPlazos.tasaInteresMensual,
    sinInteres: aPlazos.sinInteres,
    fechaInicio: hoy,
    productoCreditoId: aPlazos.id,
  };

  try {
    await ds.transaction(async (em: EntityManager) => {
      // ── 1. Venta con enganche ───────────────────────────────────────────
      titulo('1 · Venta a crédito con enganche');
      if (!cuenta) {
        nota('No hay cuenta de caja activa; se omite este bloque.');
      } else {
        const conEnganche = await creditos.crearCredito(
          {
            ...base,
            enganche: 1500,
            metodoPagoEnganche: 'EFECTIVO',
            cuentaBancariaEngancheId: cuenta.id,
          },
          em,
        );
        const c = conEnganche as { capitalFinanciado: number; montoTotal: number; folio: string };
        if (Math.abs(Number(c.capitalFinanciado) - 3500) < 0.01) {
          ok(`El enganche sale del capital: 5000 − 1500 = ${c.capitalFinanciado}.`);
        } else {
          mal(`Capital financiado ${c.capitalFinanciado}, se esperaba 3500.`);
        }

        const cuotas = await em.query<{ n: string; suma: string }[]>(
          `SELECT COUNT(*) AS n, SUM(montocapital) AS suma FROM amortizacion_cuotas
            WHERE creditoid = (SELECT id FROM creditos_clientes WHERE folio = $1 AND empresaid = $2)`,
          [c.folio, empresaId],
        );
        if (Math.abs(Number(cuotas[0]?.suma) - 3500) < 0.01) {
          ok(`Las ${cuotas[0].n} cuotas amortizan el capital financiado, no el total de la venta.`);
        } else {
          mal(`Las cuotas suman ${cuotas[0]?.suma} de capital, se esperaba 3500.`);
        }

        await debeRechazar('Enganche sin cuenta que lo reciba', () =>
          creditos.crearCredito({ ...base, enganche: 1500 }, em));

        await debeRechazar('Enganche mayor que la venta', () =>
          creditos.crearCredito(
            { ...base, enganche: 9000, metodoPagoEnganche: 'EFECTIVO', cuentaBancariaEngancheId: cuenta.id },
            em,
          ));
      }

      // ── 2. La línea del cliente ─────────────────────────────────────────
      titulo('2 · El cliente no puede pasarse de su línea');
      const excedido = Number(cliente.limitecredito) * 10;
      await debeRechazar(`Vender ${excedido.toLocaleString('es-MX')} con línea de ${Number(cliente.limitecredito).toLocaleString('es-MX')}`, () =>
        creditos.crearCredito(
          { ...base, montoVenta: excedido, productoCreditoId: undefined, tipoCredito: 'MENSUALIDADES' as never },
          em,
        ));

      // ── 3. El plazo autorizado ──────────────────────────────────────────
      titulo('3 · El plazo no puede exceder el autorizado al cliente');
      const cuotasLargas = Math.min(
        aPlazos.cuotasMaximas,
        Math.floor(Number(cliente.diascredito) / 30) + 6,
      );
      if (cuotasLargas > aPlazos.cuotasMaximas) {
        nota('El producto no llega a un plazo mayor al autorizado; no se puede probar aquí.');
      } else {
        await debeRechazar(`${cuotasLargas} cuotas mensuales contra ${cliente.diascredito} días de línea`, () =>
          creditos.crearCredito({ ...base, numeroCuotas: cuotasLargas }, em));
      }

      // ── 4. Producto suspendido ──────────────────────────────────────────
      titulo('4 · Un producto suspendido no se vende');
      await em.query(`UPDATE productos_credito SET estado = 'SUSPENDIDO' WHERE id = $1`, [aPlazos.id]);
      await debeRechazar('Vender con un producto suspendido', () =>
        creditos.crearCredito(base, em));
      await em.query(`UPDATE productos_credito SET estado = 'ACTIVO' WHERE id = $1`, [aPlazos.id]);

      // ── 5. Aislamiento entre empresas ───────────────────────────────────
      titulo('5 · Una empresa no puede vender el producto de otra');
      const [ajeno] = await em.query<{ id: string }[]>(
        `INSERT INTO productos_credito
           (empresaid, codigo, nombre, unidadplazo, cadacuantos, cuotasminimas,
            cuotasmaximas, sininteres, tasainteresmensual, estado, origen)
         VALUES (gen_random_uuid(), 'AJENO-PRUEBA', 'Producto de otra empresa',
                 'MESES', 1, 3, 12, true, 0, 'ACTIVO', 'ERP')
         RETURNING id`,
      );
      await debeRechazar('Vender un producto que pertenece a otra empresa', () =>
        creditos.crearCredito({ ...base, productoCreditoId: ajeno.id }, em));

      // ── 6. El caso feliz sigue funcionando ──────────────────────────────
      titulo('6 · Y el camino normal sigue pasando');
      const normal = (await creditos.crearCredito(base, em)) as {
        folio: string; montoTotal: number; numeroCuotas: number;
      };
      if (normal.folio && Number(normal.montoTotal) > 5000) {
        ok(`${normal.folio} · ${normal.numeroCuotas} cuotas · total ${normal.montoTotal}`);
      } else {
        mal('El crédito normal no salió como se esperaba.');
      }

      // Se deshace todo lo anterior: era una prueba, no una operación.
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
    `SELECT COUNT(*) AS n FROM productos_credito WHERE codigo = 'AJENO-PRUEBA'`,
  );
  const [{ m }] = await ds.query<{ m: string }[]>(
    `SELECT COUNT(*) AS m FROM creditos_clientes WHERE empresaid = $1 AND montoventa = 5000`,
    [empresaId],
  );
  if (Number(n) === 0 && Number(m) === 0) {
    ok('La transacción se deshizo: no quedó ningún crédito ni producto de prueba.');
  } else {
    mal(`Quedaron ${n} producto(s) y ${m} crédito(s) de prueba. Revísalo a mano.`);
  }

  titulo(`Resultado: ${pasan} pasan · ${fallan} fallan`);
  if (fallan > 0) process.exitCode = 1;
  console.log('');
  await app.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
