/**
 * ============================================================================
 * SyncroERP · Reversas contra el registro externo
 * ----------------------------------------------------------------------------
 * Deshacer es donde una integración se rompe en silencio. Hasta hoy el ERP
 * cancelaba un crédito o le bajaba el saldo por una devolución en su propia
 * base, y allá el préstamo seguía vivo por el importe completo: los eventos
 * existían en el catálogo pero NADIE los emitía y el despachador los rechazaba
 * con un «resuélvelo a mano».
 *
 * Esta prueba crea dos créditos de verdad, los replica, y comprueba en Fineract
 * que la reversa llegó:
 *
 *   A · devolución parcial  → el saldo del préstamo baja por el mismo importe
 *   B · cancelación         → el préstamo deja de estar vivo
 *
 * Deja rastro a propósito: son operaciones reales en los dos sistemas y no se
 * pueden deshacer con un ROLLBACK, porque la mitad ocurre fuera de la base.
 *
 *   npm.cmd run credito:probar-reversas
 * ============================================================================
 */

/*
 * ============================================================================
 * ADVERTENCIA · ESTA PRUEBA DEJA LOS DOS SISTEMAS DESCUADRADOS
 * ----------------------------------------------------------------------------
 * Publica la devolución y la cancelación al registro externo SIN aplicar el
 * hecho en el ERP. Comprueba que el mensaje sale, se traduce y llega —que es
 * lo que se quería probar— y a cambio deja el crédito en 1000 ACTIVO aquí y en
 * 750 o «retirado» allá.
 *
 * Se descubrió al correr la conciliación por primera vez: sus diez primeras
 * discrepancias eran todas de este script, no del producto. Una prueba que
 * ensucia un sistema de registro no es gratis — el descuadre que deja es
 * indistinguible de uno real hasta que alguien lo investiga.
 *
 * Antes de volver a correrlo: apunta qué créditos toca, y después de correrlo
 * resuelve las discrepancias que genere con una nota que diga que salieron de
 * aquí. Lo correcto sería ejercitar el flujo real del ERP —anulación de venta,
 * devolución de mercancía—, que sí aplica el hecho de los dos lados; queda
 * pendiente porque el ERP todavía no expone la reversa de un pago.
 * ============================================================================
 */

import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { CreditosService } from '../src/credito/services/creditos.service';
import { ProductosCreditoService } from '../src/credito/services/productos-credito.service';
import { CarteraPublicadorService } from '../src/integracion/services/cartera-publicador.service';
import { IntegracionDespachadorService } from '../src/integracion/services/integracion-despachador.service';
import { IntegracionVinculosService } from '../src/integracion/services/integracion-vinculos.service';
import { TipoVinculo } from '../src/integracion/integracion.constants';
import { FineractHttpService } from '../src/integracion/adaptadores/fineract/fineract-http.service';
import { diaCalendario } from '../src/common/utils/fecha-calendario.util';

let pasan = 0;
let fallan = 0;
const ok = (m: string) => { pasan += 1; console.log(`  \x1b[32mPASA\x1b[0m  ${m}`); };
const mal = (m: string) => { fallan += 1; console.log(`  \x1b[31mFALLA\x1b[0m ${m}`); };
const nota = (m: string) => console.log(`        \x1b[90m${m}\x1b[0m`);
const titulo = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`);

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const ds = app.get(DataSource);
  const creditos = app.get(CreditosService);
  const catalogo = app.get(ProductosCreditoService);
  const cartera = app.get(CarteraPublicadorService);
  const despachador = app.get(IntegracionDespachadorService);
  const vinculos = app.get(IntegracionVinculosService);
  const http = app.get(FineractHttpService);

  const [empresa] = await ds.query<{ id: string; nombre: string }[]>(
    `SELECT id, nombrecomercial AS nombre FROM empresas WHERE activo = true ORDER BY fechacreacion LIMIT 1`,
  );
  const empresaId = empresa.id;

  if (!(await cartera.activoPara(empresaId))) {
    console.error('La empresa no tiene la cartera integrada: no hay reversa que probar.');
    await app.close();
    return;
  }

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
  nota(`producto ${producto.codigo}`);
  nota('Esta prueba crea créditos reales y los deja cancelados o ajustados.');

  const hoy = diaCalendario(new Date());
  const base = {
    empresaId,
    clienteId: cliente.id,
    montoVenta: 1000,
    enganche: 0,
    numeroCuotas: 1,
    tasaInteresMensual: 0,
    sinInteres: true,
    fechaInicio: hoy,
    productoCreditoId: producto.id,
    notas: 'Prueba de reversas contra el registro externo.',
  };

  /** Crea el crédito y espera a que el despachador lo replique. */
  const crearYReplicar = async (etiqueta: string) => {
    const credito = (await creditos.crearCredito({ ...base })) as {
      id: string; folio: string;
    };
    await despachador.despacharLote(20);
    const idExterno = await vinculos.idExterno(
      empresaId,
      TipoVinculo.CREDITO,
      credito.id,
    );
    if (idExterno) ok(`${etiqueta}: ${credito.folio} replicado como préstamo ${idExterno}.`);
    else mal(`${etiqueta}: ${credito.folio} no llegó al registro externo.`);
    return { ...credito, idExterno };
  };

  const saldoDe = async (prestamoId: string) => {
    const r = await http.get<{
      status?: { active?: boolean; code?: string };
      summary?: { totalOutstanding?: number };
    }>(`/v1/loans/${prestamoId}`);
    return {
      saldo: Number(r.summary?.totalOutstanding ?? 0),
      activo: r.status?.active === true,
      codigo: String(r.status?.code ?? ''),
    };
  };

  try {
    // ── A · Devolución parcial ─────────────────────────────────────────────
    titulo('A · Una devolución baja el saldo del préstamo');
    const a = await crearYReplicar('A');
    if (a.idExterno) {
      const antes = await saldoDe(a.idExterno);
      nota(`saldo antes: ${antes.saldo}`);

      await cartera.ajusteDevolucion(empresaId, {
        creditoId: a.id,
        devolucionId: `prueba-${Date.now()}`,
        monto: 250,
        folio: 'DEV-PRUEBA',
      });
      const lote = await despachador.despacharLote(20);
      nota(`despachados ${lote.procesados} · fallidos ${lote.fallidos}`);
      await dormir(1500);

      const despues = await saldoDe(a.idExterno);
      nota(`saldo después: ${despues.saldo}`);
      const bajo = Math.round((antes.saldo - despues.saldo) * 100) / 100;
      if (Math.abs(bajo - 250) < 0.01) {
        ok(`El saldo bajó exactamente los 250 devueltos.`);
      } else {
        mal(`El saldo bajó ${bajo}, se esperaban 250.`);
        nota('Si Fineract rechazó el movimiento, el evento quedó en el outbox:');
        nota('npm.cmd run outbox:estado');
      }
    }

    // ── B · Cancelación ────────────────────────────────────────────────────
    titulo('B · Anular la venta cancela el préstamo');
    const b = await crearYReplicar('B');
    if (b.idExterno) {
      const antes = await saldoDe(b.idExterno);
      nota(`estado antes: ${antes.codigo} · activo ${antes.activo}`);

      await cartera.creditoCancelado(empresaId, {
        creditoId: b.id,
        motivo: 'Prueba de anulación de venta',
      });
      const lote = await despachador.despacharLote(20);
      nota(`despachados ${lote.procesados} · fallidos ${lote.fallidos}`);
      await dormir(1500);

      const despues = await saldoDe(b.idExterno);
      nota(`estado después: ${despues.codigo} · activo ${despues.activo}`);
      /*
       * Se exige CANCELADO, no «no activo». La primera versión de esta prueba
       * comprobaba `!activo` y dio verde con el préstamo a medio deshacer:
       * Fineract lo había regresado a «aprobado» y el retiro había fallado.
       * Ni vivo ni cancelado, y el ERP dándolo por cancelado.
       */
      const cancelado =
        despues.codigo.includes('withdrawn') ||
        despues.codigo.includes('rejected');
      if (cancelado) {
        ok(`El préstamo quedó cancelado (${despues.codigo}).`);
      } else if (!despues.activo) {
        mal(`El préstamo dejó de estar activo pero NO quedó cancelado: ${despues.codigo}.`);
        nota('Está a medio deshacer. Revisa el outbox: npm.cmd run outbox:estado');
      } else {
        mal('El préstamo sigue activo pese a la cancelación.');
        nota('Revisa el outbox: npm.cmd run outbox:estado');
      }
    }

    // ── C · El evento sin productor ────────────────────────────────────────
    titulo('C · Reversa de pago');
    nota('El ERP todavía no permite deshacer un pago de cobranza, así que este');
    nota('camino queda con traducción escrita y sin quien lo dispare. Cuando');
    nota('exista esa operación, sólo hay que llamar a cartera.pagoRevertido.');
  } finally {
    titulo(`Resultado: ${pasan} pasan · ${fallan} fallan`);
    if (fallan > 0) process.exitCode = 1;
    console.log('');
    await app.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
