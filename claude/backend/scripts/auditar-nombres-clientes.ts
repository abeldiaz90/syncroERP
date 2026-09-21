/**
 * ============================================================================
 * SyncroERP · ¿Qué nombres quedaron desfasados entre el ERP y el core?
 * ----------------------------------------------------------------------------
 * Hasta el 18 de septiembre de 2026 el ERP replicaba el ALTA de un cliente pero
 * no sus correcciones. Renombrar a alguien lo dejaba distinto en cada sistema,
 * para siempre y sin aviso. Eso ya está corregido, pero no hacia atrás: todo
 * nombre que se haya corregido antes sigue viejo del otro lado.
 *
 * Esto recorre los clientes vinculados, compara el nombre de los dos lados y
 * dice cuáles no coinciden. Con `--aplicar` publica la corrección de esos
 * —sólo de ésos— por el outbox normal. No crea nada: un cliente sin vínculo ni
 * siquiera entra en la lista.
 *
 *   npm.cmd run clientes:auditar-nombres
 *   npm.cmd run clientes:auditar-nombres -- --aplicar
 * ============================================================================
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { FineractHttpService } from '../src/integracion/adaptadores/fineract/fineract-http.service';
import { CarteraPublicadorService } from '../src/integracion/services/cartera-publicador.service';

const titulo = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`);
const nota = (m: string) => console.log(`      \x1b[90m${m}\x1b[0m`);

/** Compara ignorando acentos, mayúsculas y espacios de más. */
const normalizar = (v: string) =>
  v.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();

async function main() {
  const aplicar = process.argv.includes('--aplicar');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  try {
    const ds = app.get(DataSource);
    const http = app.get(FineractHttpService);
    const publicador = app.get(CarteraPublicadorService);

    const vinculados: any[] = await ds.query(
      `SELECT v.entidadid AS clienteid, v.idexterno, v.empresaid,
              c.nombre, c.razonsocial
         FROM integracion_vinculos v
         JOIN clientes c ON c.id = v.entidadid
        WHERE v.tipo = 'CLIENTE' AND v.idexterno IS NOT NULL
        ORDER BY c.nombre`,
    );

    titulo(`Revisando ${vinculados.length} cliente(s) vinculado(s)`);

    const desfasados: { clienteid: string; empresaid: string; erp: string; core: string; ficha: string }[] = [];
    let iguales = 0;
    let inaccesibles = 0;

    for (const v of vinculados) {
      const esperado = String(v.razonsocial || v.nombre || '').trim();
      const ficha = await http
        .get<any>(`/v1/clients/${encodeURIComponent(v.idexterno)}`)
        .catch(() => null);

      if (!ficha) {
        inaccesibles += 1;
        console.log(`  \x1b[31m?\x1b[0m  ${esperado}`);
        nota(`la ficha ${v.idexterno} del core no respondió o ya no existe`);
        continue;
      }

      const actual = String(ficha.displayName ?? '').trim();
      if (normalizar(actual) === normalizar(esperado)) {
        iguales += 1;
        continue;
      }

      desfasados.push({
        clienteid: v.clienteid,
        empresaid: v.empresaid,
        erp: esperado,
        core: actual,
        ficha: String(v.idexterno),
      });
      console.log(`  \x1b[33m≠\x1b[0m  ficha [${v.idexterno}]`);
      nota(`ERP   «${esperado}»`);
      nota(`core  «${actual}»`);
    }

    titulo('Resumen');
    console.log(`  ${iguales} coinciden · ${desfasados.length} desfasados · ${inaccesibles} sin respuesta`);

    if (!desfasados.length) {
      nota('Nada que corregir.');
      return;
    }

    if (!aplicar) {
      nota('Esto sólo miró. Para publicar las correcciones:');
      nota('  npm.cmd run clientes:auditar-nombres -- --aplicar');
      return;
    }

    titulo('Publicando correcciones');
    for (const d of desfasados) {
      await publicador.clienteActualizado(d.empresaid, d.clienteid, String(Date.now()));
      console.log(`  → ${d.erp} (ficha ${d.ficha})`);
    }
    nota('Quedaron en el outbox. El despachador las envía en su siguiente pasada;');
    nota('para no esperar:  npm.cmd run outbox:estado');
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(`\n✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
