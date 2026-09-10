/**
 * ============================================================================
 * SyncroERP · Vaciar inquilinos de Fineract antes de reciclarlos
 * ----------------------------------------------------------------------------
 * La reserva de inquilinos entrega un `tenant` ya creado a la empresa nueva, y
 * eso es lo que evita reiniciar el core en cada alta. Pero un inquilino que ya
 * se usó NO está vacío: conserva los clientes y los créditos de quien lo tuvo
 * antes. Reciclarlo sin vaciarlo le entrega a la empresa nueva la cartera de
 * otra —que es exactamente lo que la separación de empresas debe impedir— y
 * además arruina la conciliación: compara contra créditos que el ERP nunca
 * creó.
 *
 * ESTE SCRIPT BORRA EN FINERACT. Por eso exige confirmación explícita y nombra
 * uno por uno los inquilinos, en lugar de recorrer los que encuentre.
 *
 * Fineract no deja borrar un crédito desembolsado ni un cliente con créditos,
 * así que hay que deshacer en el orden inverso al que se construyó:
 *
 *   deshacer desembolso → deshacer aprobación → borrar crédito → borrar cliente
 *
 * Cada paso se intenta y se tolera su fallo: un crédito que nunca se desembolsó
 * responde error al deshacer el desembolso, y eso no es un problema.
 *
 *   npm.cmd run fineract:limpiar-inquilinos -- t001 t002 t003 --confirmar
 * ============================================================================
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { FineractHttpService } from '../src/integracion/adaptadores/fineract/fineract-http.service';

const ok = (m: string) => console.log(`  \x1b[32mOK\x1b[0m    ${m}`);
const aviso = (m: string) => console.log(`  \x1b[33mAVISO\x1b[0m ${m}`);
const mal = (m: string) => console.log(`  \x1b[31mALTO\x1b[0m  ${m}`);
const nota = (m: string) => console.log(`        \x1b[90m${m}\x1b[0m`);
const titulo = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`);

const CONFIRMACION = '--confirmar';

async function main() {
  const args = process.argv.slice(2);
  const inquilinos = args.filter((a) => !a.startsWith('--'));
  const confirmado = args.includes(CONFIRMACION);

  if (!inquilinos.length) {
    mal('Hay que nombrar los inquilinos a vaciar. Ejemplo: -- t001 t002 --confirmar');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const http = app.get(FineractHttpService);

  /*
   * El servicio habla con el inquilino configurado en el entorno. Aquí se le
   * pasa el inquilino EN CADA llamada, en lugar de confiar en la
   * configuración: confiar en ella sería borrar en el inquilino equivocado si
   * alguien cambió el .env entre una corrida y otra.
   */

  type Cliente = { id?: number; displayName?: string };
  type Credito = { id?: number; accountNo?: string; status?: { id?: number; value?: string } };

  const intentar = async (
    descripcion: string,
    accion: () => Promise<unknown>,
  ): Promise<boolean> => {
    try {
      await accion();
      return true;
    } catch (e) {
      nota(`${descripcion} → ${e instanceof Error ? e.message.slice(0, 140) : String(e)}`);
      return false;
    }
  };

  for (const tenant of inquilinos) {
    titulo(`Inquilino ${tenant}`);

    let clientes: Cliente[] = [];
    try {
      const pagina = await http.get<{ pageItems?: Cliente[] }>(
        '/v1/clients?limit=1000&offset=0',
        { tenant, timeoutMs: 60000 },
      );
      clientes = pagina?.pageItems ?? [];
    } catch (e) {
      mal(`No se pudo listar clientes: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`);
      nota('Si el inquilino no existe en el core, registrar su identificador en la');
      nota('reserva produce un alta que se ve correcta y una empresa que no opera.');
      continue;
    }

    let creditos: Credito[] = [];
    try {
      const pagina = await http.get<{ pageItems?: Credito[] }>(
        '/v1/loans?limit=1000&offset=0',
        { tenant, timeoutMs: 60000 },
      );
      creditos = pagina?.pageItems ?? [];
    } catch (e) {
      nota(`No se pudo listar créditos: ${e instanceof Error ? e.message.slice(0, 140) : String(e)}`);
    }

    if (!clientes.length && !creditos.length) {
      ok('Ya está vacío.');
      continue;
    }

    nota(`${clientes.length} cliente(s) y ${creditos.length} crédito(s).`);

    if (!confirmado) {
      aviso(`Nada se borró. Para borrar de verdad, repite con ${CONFIRMACION}.`);
      for (const c of creditos.slice(0, 10)) {
        nota(`· crédito ${c.accountNo ?? c.id} · ${c.status?.value ?? '—'}`);
      }
      for (const c of clientes.slice(0, 10)) {
        nota(`· cliente ${c.id} · ${c.displayName ?? '—'}`);
      }
      continue;
    }

    // ── Créditos, de adentro hacia afuera ──────────────────────────────────
    let creditosBorrados = 0;
    for (const credito of creditos) {
      if (!credito.id) continue;
      await intentar(`deshacer desembolso ${credito.id}`, () =>
        http.post(`/v1/loans/${credito.id}?command=undodisbursal`, {}, { tenant }),
      );
      await intentar(`deshacer aprobación ${credito.id}`, () =>
        http.post(`/v1/loans/${credito.id}?command=undoapproval`, {}, { tenant }),
      );
      const borrado = await intentar(`borrar crédito ${credito.id}`, () =>
        http.delete(`/v1/loans/${credito.id}`, { tenant }),
      );
      if (borrado) creditosBorrados += 1;
    }
    if (creditosBorrados === creditos.length) {
      ok(`${creditosBorrados} crédito(s) borrados.`);
    } else {
      aviso(`${creditosBorrados} de ${creditos.length} crédito(s) borrados.`);
      nota('Un crédito que no se pudo borrar deja a su cliente sin borrar también.');
    }

    // ── Clientes ───────────────────────────────────────────────────────────
    let clientesBorrados = 0;
    for (const cliente of clientes) {
      if (!cliente.id) continue;
      const borrado = await intentar(`borrar cliente ${cliente.id}`, () =>
        http.delete(`/v1/clients/${cliente.id}`, { tenant }),
      );
      if (borrado) clientesBorrados += 1;
    }
    if (clientesBorrados === clientes.length) {
      ok(`${clientesBorrados} cliente(s) borrados.`);
    } else {
      aviso(`${clientesBorrados} de ${clientes.length} cliente(s) borrados.`);
    }
  }

  titulo('Después de esto');
  nota('Volver a correr sin --confirmar: debe decir «Ya está vacío» en todos.');
  nota('Lo que NO se toca: productos de crédito, rangos y buckets de morosidad,');
  nota('ni el inquilino mismo. Crearlos de nuevo exigiría reiniciar el core.');
  console.log('');
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
