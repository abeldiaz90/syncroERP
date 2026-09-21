/**
 * ============================================================================
 * SyncroERP · Lleva al core el expediente de los clientes ya replicados
 * ----------------------------------------------------------------------------
 *   npm.cmd run clientes:expediente            (sólo mira)
 *   npm.cmd run clientes:expediente -- --aplicar
 *
 * Hasta hoy el ERP replicaba nombre, correo y teléfono, y nada más. El RFC, la
 * CURP y el domicilio —que el ERP captura y valida contra el catálogo de
 * códigos postales— se quedaban de este lado. Quien abría la ficha del cliente en el
 * core para ir a cobrar no sabía dónde vive.
 *
 * Eso ya se corrigió hacia adelante: toda alta y toda corrección arrastran el
 * expediente. Este script es para hacia atrás, con los clientes que se
 * replicaron antes del cambio.
 *
 * Sólo toca clientes que YA tienen vínculo. Uno sin vincular no entra en la
 * lista: crear es la única acción sin vuelta atrás y no la toma un script.
 * ============================================================================
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PUERTO_CARTERA_EXTERNA } from '../src/integracion/integracion.constants';
import type { PuertoCarteraExterna } from '../src/integracion/ports/cartera-externa.port';

const ok = (m: string) => console.log(`  \x1b[32m✔\x1b[0m ${m}`);
const aviso = (m: string) => console.log(`  \x1b[33m!\x1b[0m ${m}`);
const info = (m: string) => console.log(`      \x1b[90m${m}\x1b[0m`);
const titulo = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`);

async function main() {
  const aplicar = process.argv.includes('--aplicar');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const ds = app.get(DataSource);
    const externa = app.get<PuertoCarteraExterna>(PUERTO_CARTERA_EXTERNA);

    const vinculados: any[] = await ds.query(
      `SELECT v.entidadid AS clienteid, v.idexterno, v.empresaid,
              c.nombre, c.razonsocial, c.tipopersona, c.rfc, c.curp, c.email, c.telefono,
              c.direccion, c.colonia, c.ciudad, c.estado, c.codigopostal, c.pais
         FROM integracion_vinculos v
         JOIN clientes c ON c.id = v.entidadid
        WHERE v.tipo = 'CLIENTE' AND v.idexterno IS NOT NULL
        ORDER BY c.nombre`,
    );

    titulo(`${vinculados.length} cliente(s) vinculado(s)`);

    let conDatos = 0;
    for (const v of vinculados) {
      const tieneAlgo =
        v.rfc || v.curp || (v.direccion && v.ciudad && v.estado && v.codigopostal);
      if (!tieneAlgo) {
        info(`${v.nombre}: sin RFC, CURP ni domicilio completo en el ERP. Nada que llevar.`);
        continue;
      }
      conDatos += 1;

      if (!aplicar) {
        const piezas = [
          v.rfc ? 'RFC' : null,
          v.curp ? 'CURP' : null,
          v.direccion && v.ciudad ? 'domicilio' : null,
        ].filter(Boolean);
        info(`${v.nombre}: llevaría ${piezas.join(', ')} a la ficha ${v.idexterno}.`);
        continue;
      }

      const r = await externa.sincronizarExpediente({
        empresaId: v.empresaid,
        clienteId: v.clienteid,
        nombre: v.razonsocial || v.nombre,
        esPersonaMoral: v.tipopersona === 'MORAL',
        rfc: v.rfc,
        curp: v.curp,
        email: v.email,
        telefono: v.telefono,
        idExterno: String(v.idexterno),
        domicilio: {
          calle: v.direccion,
          colonia: v.colonia,
          ciudad: v.ciudad,
          estado: v.estado,
          codigoPostal: v.codigopostal,
          pais: v.pais,
        },
      });
      if (r.aplicados.length) ok(`${v.nombre}: ${r.aplicados.join(', ')}`);
      for (const motivo of r.omitidos) aviso(`${v.nombre}: ${motivo}`);
      if (!r.aplicados.length && !r.omitidos.length) info(`${v.nombre}: ya estaba al día.`);
    }

    titulo('Resumen');
    info(`${conDatos} cliente(s) con expediente que llevar.`);
    if (!aplicar) {
      info('Nada se escribió. Para aplicarlo:');
      info('  npm.cmd run clientes:expediente -- --aplicar');
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(`\n✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
