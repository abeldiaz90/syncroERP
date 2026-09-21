/**
 * ============================================================================
 * SyncroERP · Probar el paso a AUTORIDAD
 * ----------------------------------------------------------------------------
 * AUTORIDAD significa que el registro externo manda sobre la cartera. Es el
 * cambio más grande de toda la integración —mueve el sistema de registro— y por
 * eso está gobernado por una regla: no se sube con discrepancias abiertas.
 *
 * Esta prueba comprueba las DOS mitades de esa regla, que es lo que la hace una
 * prueba y no una demostración:
 *
 *  · Que NIEGA cuando hay discrepancias (la empresa que arrastra las pruebas
 *    viejas). Una regla que nunca se ha visto rechazar algo no se ha probado.
 *  · Que PERMITE cuando no las hay (la empresa nueva, de datos limpios).
 *
 * Y comprueba el aislamiento entre empresas: subir el modo de una no debe
 * mover el de la otra, ni tocar su catálogo.
 *
 * Deja todo como estaba: al final devuelve la empresa de prueba a SOMBRA.
 *
 *   npm.cmd run autoridad:probar
 * ============================================================================
 */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Empresa } from '../src/iam/entities/empresa.entity';
import { CarteraConciliacionService } from '../src/integracion/services/cartera-conciliacion.service';
import { IntegracionModoService } from '../src/integracion/services/integracion-modo.service';
import { ProductosCreditoService } from '../src/credito/services/productos-credito.service';
import { IntegracionOutboxService } from '../src/integracion/services/integracion-outbox.service';
import {
  EstadoEventoIntegracion,
  ModoCartera,
} from '../src/integracion/integracion.constants';

const ok = (m: string) => console.log(`  \x1b[32mOK\x1b[0m    ${m}`);
const mal = (m: string) => console.log(`  \x1b[31mFALLA\x1b[0m ${m}`);
const nota = (m: string) => console.log(`        \x1b[90m${m}\x1b[0m`);
const titulo = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`);

const NOMBRE_PRUEBA = 'PRUEBA AUTORIDAD SA DE CV';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const ds = app.get(DataSource);
  const modos = app.get(IntegracionModoService);
  const conciliacion = app.get(CarteraConciliacionService);
  const outbox = app.get(IntegracionOutboxService);
  const productos = app.get(ProductosCreditoService);

  const contar = async (id: string) => (await conciliacion.abiertas(id)).length;

  /*
   * Las dos sondas que pide el servicio. La de eventos sin resolver se lee del
   * outbox: es la que impide apagar una empresa dejando eventos que nadie va a
   * despachar nunca.
   */
  const sondas = {
    discrepanciasAbiertas: contar,
    eventosSinResolver: async (id: string) => {
      const resumen = await outbox.resumen(id);
      return (
        (resumen[EstadoEventoIntegracion.PENDIENTE] ?? 0) +
        (resumen[EstadoEventoIntegracion.REINTENTABLE] ?? 0) +
        (resumen[EstadoEventoIntegracion.FALLIDO] ?? 0)
      );
    },
  };

  const limpia = await ds.getRepository(Empresa).findOne({
    where: { nombreComercial: NOMBRE_PRUEBA },
  });
  if (!limpia) {
    mal('No existe la empresa de prueba. Corre antes: npm.cmd run empresa:prueba -- --aplicar');
    await app.close();
    process.exit(1);
  }

  const activas = await modos.empresasActivas();
  const sucia = activas.find((c) => c.empresaId !== limpia.id);

  let fallos = 0;

  // ── 1. Debe NEGAR donde hay discrepancias ────────────────────────────────
  titulo('1 · Con discrepancias abiertas, debe negarse');
  if (!sucia) {
    nota('No hay otra empresa con integración encendida; no se puede probar la negativa.');
  } else {
    const abiertas = await contar(sucia.empresaId);
    nota(`Empresa ${sucia.empresaId} · ${abiertas} discrepancia(s) abierta(s).`);
    if (abiertas === 0) {
      nota('No tiene discrepancias, así que esta mitad no prueba nada hoy.');
    } else {
      const r = await modos.establecerModoCartera(
        sucia.empresaId,
        ModoCartera.AUTORIDAD,
        sondas,
);
      if (r.aplicado) {
        mal('¡SUBIÓ A AUTORIDAD CON DISCREPANCIAS ABIERTAS! El candado no sirve.');
        fallos += 1;
        // Se devuelve de inmediato: dejarla en AUTORIDAD sería peor que el fallo.
        await modos.establecerModoCartera(sucia.empresaId, ModoCartera.SOMBRA,
        sondas,
);
      } else {
        ok(`Negado, como debe: ${r.motivo}`);
      }
      const modoAhora = await modos.modoDe(sucia.empresaId);
      if (modoAhora === ModoCartera.AUTORIDAD) {
        mal(`Quedó en ${modoAhora} pese a la negativa.`);
        fallos += 1;
      } else {
        ok(`Sigue en ${modoAhora}.`);
      }
    }
  }

  // ── 2. Debe PERMITIR donde no las hay ────────────────────────────────────
  titulo('2 · Sin discrepancias, debe permitirse');
  const r1 = await conciliacion.conciliarEmpresa(limpia.id);
  nota(`Conciliación de la empresa limpia: ${r1.revisados} comprobación(es), ${r1.discrepancias} diferencia(s).`);

  const abiertasLimpia = await contar(limpia.id);
  if (abiertasLimpia > 0) {
    mal(`La empresa nueva ya tiene ${abiertasLimpia} discrepancia(s); no debería.`);
    fallos += 1;
  } else {
    ok('Sin discrepancias.');
    const r = await modos.establecerModoCartera(limpia.id, ModoCartera.AUTORIDAD,
        sondas,
);
    if (!r.aplicado) {
      mal(`No dejó subir pese a estar limpia: ${r.motivo}`);
      fallos += 1;
    } else {
      const modoAhora = await modos.modoDe(limpia.id);
      /*
       * El modo efectivo puede quedar por debajo de AUTORIDAD si el techo
       * global (CARTERA_MODO) está más abajo. Eso NO es un fallo: es la
       * protección contra encender a todos los inquilinos por accidente.
       */
      if (modoAhora === ModoCartera.AUTORIDAD) {
        ok('Subió a AUTORIDAD.');
      } else {
        ok(`Guardado, pero el modo efectivo es ${modoAhora}: el techo global (${modos.modoGlobal}) manda.`);
      }
    }
  }

  // ── 3. Aislamiento entre empresas ────────────────────────────────────────
  titulo('3 · Las dos empresas no se cruzan');
  if (sucia) {
    const modoSucia = await modos.modoDe(sucia.empresaId);
    if (modoSucia === ModoCartera.AUTORIDAD) {
      mal('Subir el modo de una empresa movió el de la otra.');
      fallos += 1;
    } else {
      ok(`La otra empresa sigue en ${modoSucia}.`);
    }
  }

  const catalogoLimpia = await productos.listar(limpia.id);
  ok(`La empresa de prueba tiene ${catalogoLimpia.length} producto(s) propios.`);
  if (sucia) {
    const catalogoSucia = await productos.listar(sucia.empresaId);
    const cruzados = catalogoLimpia.filter((p) => catalogoSucia.some((q) => q.id === p.id));
    if (cruzados.length) {
      mal(`${cruzados.length} producto(s) aparecen en las dos empresas.`);
      fallos += 1;
    } else {
      ok('Ningún producto se comparte entre las dos empresas.');
    }
  }

  // ── 4. Dejar todo como estaba ────────────────────────────────────────────
  titulo('4 · Restaurar');
  await modos.establecerModoCartera(limpia.id, ModoCartera.SOMBRA,
        sondas,
);
  ok(`Empresa de prueba devuelta a ${await modos.modoDe(limpia.id)}.`);

  titulo(fallos ? `${fallos} comprobación(es) fallaron` : 'Todo correcto');
  console.log('');
  await app.close();
  if (fallos) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
