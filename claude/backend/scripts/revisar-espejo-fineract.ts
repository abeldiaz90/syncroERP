/**
 * ============================================================================
 * SyncroERP · ¿Cuadra el ERP con el mayor externo?
 * ----------------------------------------------------------------------------
 * SÓLO LEE. No despacha, no reencola, no corrige: enseña.
 *
 * Tres preguntas, que son las tres formas de que los dos libros difieran:
 *
 *  1. ¿Hay eventos sin entregar? (FALLIDO, REINTENTABLE, PENDIENTE)
 *  2. ¿Hay pólizas VIGENTES sin un solo evento de espejo? Ésa es la peor:
 *     no falló nada, simplemente nadie intentó, y no aparece en ninguna
 *     bandeja.
 *  3. ¿Qué cuentas usadas por esas pólizas no están mapeadas al mayor externo?
 *
 *   npx ts-node -T scripts/revisar-espejo-fineract.ts
 * ============================================================================
 */
import { config as cargarEnv } from 'dotenv';
import { DataSource } from 'typeorm';

/* Las credenciales las lee el proceso, no viajan por ningún otro sitio. */
cargarEnv({ path: '.env.local' });
cargarEnv();

const t = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`);

/**
 * Una consulta que falla NO se lleva a las demás, y dice por qué falló.
 * Un informe que se corta en la primera pregunta deja las otras dos sin
 * contestar, y son justo las que no salen en ninguna pantalla.
 */
async function mostrar(ds: DataSource, titulo: string, sql: string) {
  t(titulo);
  try {
    const filas = await ds.query(sql);
    if (!filas.length) console.log('        (nada)');
    else console.table(filas);
  } catch (e: any) {
    console.log(`        \x1b[31mNo se pudo consultar: ${e?.message ?? e}\x1b[0m`);
  }
}

async function main() {
  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USERNAME ?? process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME ?? process.env.DB_DATABASE,
  });
  await ds.initialize();

  await mostrar(ds, 'MODO DE CONTABILIDAD POR EMPRESA',
      `SELECT e.nombrecomercial, c.modocontabilidad, c.activo
         FROM integracion_configuracion_empresa c
         JOIN empresas e ON e.id = c.empresaid
        ORDER BY e.nombrecomercial`);

  await mostrar(ds, 'BANDEJA DE SALIDA · por tipo y estado',
      `SELECT tipo, estado, COUNT(*)::int AS total
         FROM integracion_eventos GROUP BY tipo, estado ORDER BY tipo, estado`);

  await mostrar(ds, 'LO QUE NO HA LLEGADO (FALLIDO · REINTENTABLE · PENDIENTE)',
      `SELECT tipo, estado, intentos, entidadid,
              LEFT(COALESCE(ultimoerror,''), 120) AS error,
              fechacreacion
         FROM integracion_eventos
        WHERE estado IN ('FALLIDO','REINTENTABLE','PENDIENTE')
        ORDER BY fechacreacion DESC LIMIT 40`);

  await mostrar(ds, 'PÓLIZAS VIGENTES SIN NINGÚN EVENTO DE ESPEJO',
      `SELECT p.folio, p.fecha, p.concepto, p.estatus
         FROM polizas p
        WHERE p.estatus = 'VIGENTE'
          AND NOT EXISTS (
            SELECT 1 FROM integracion_eventos ev
             WHERE ev.entidadid = p.id)
        ORDER BY p.fecha DESC LIMIT 40`);

  await mostrar(ds, 'PÓLIZAS ENVIADAS · últimas 15',
      `SELECT p.folio, p.fecha, ev.estado, ev.fechaenvio
         FROM polizas p
         JOIN integracion_eventos ev ON ev.entidadid = p.id
        ORDER BY p.fecha DESC LIMIT 15`);

  await mostrar(ds, 'EVENTOS DESCARTADOS · alguien decidió que no iban',
      `SELECT ev.tipo, ev.entidadid, p.folio, p.fecha, p.estatus,
              LEFT(COALESCE(ev.ultimoerror,''), 160) AS error, ev.fechaactualizacion
         FROM integracion_eventos ev
         LEFT JOIN polizas p ON p.id = ev.entidadid
        WHERE ev.estado = 'DESCARTADO'
        ORDER BY ev.fechaactualizacion DESC LIMIT 20`);

  await mostrar(ds, 'CUENTAS USADAS EN PÓLIZAS VIGENTES Y NO MAPEADAS AL MAYOR EXTERNO',
      `SELECT DISTINCT cc.codigo, cc.nombre
         FROM partidas_poliza d
         JOIN polizas p ON p.id = d.polizaid AND p.estatus = 'VIGENTE'
         JOIN cuentas_contables cc ON cc.id = d.cuentacontableid
        WHERE NOT EXISTS (
          SELECT 1 FROM integracion_mapeo_cuentas m
           WHERE m.cuentacontableid = cc.id AND m.activo = true)
        ORDER BY cc.codigo`);

  await ds.destroy();
}
main().catch((e) => { console.error(e?.message ?? e); process.exit(1); });
