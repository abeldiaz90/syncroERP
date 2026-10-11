import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ============================================================================
 * El presupuesto contra el que se mide
 * ----------------------------------------------------------------------------
 * Un reporte por centro, solo, describe: dice que la sucursal norte gastó
 * 412,000 y no dice si eso está bien. La pregunta que se hace de verdad
 * —«¿vamos bien?»— necesita dos cifras, y ésta es la segunda.
 *
 * Dos tablas: el presupuesto —que tiene estado, porque uno que cualquiera puede
 * editar después de aprobado no mide a nadie— y sus líneas, una por cuenta,
 * centro y mes.
 *
 * REVERSIBLE Y SIN TOCAR NADA EXISTENTE
 *
 * No altera ninguna tabla previa. `down` las borra, que es lo que significa
 * revertir: se pierde lo capturado y no se corrompe nada más.
 * ============================================================================
 */
export class ElPresupuestoContraElQueSeMide1790890000000
  implements MigrationInterface
{
  name = 'ElPresupuestoContraElQueSeMide1790890000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS presupuestos (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        empresaid uuid NOT NULL,
        ejercicio int NOT NULL,
        nombre varchar(120) NOT NULL,
        estado varchar(20) NOT NULL DEFAULT 'BORRADOR',
        aprobadoporid uuid NULL,
        fechaaprobacion TIMESTAMPTZ NULL,
        notas varchar(300) NULL,
        fechacreacion TIMESTAMP NOT NULL DEFAULT now(),
        fechaactualizacion TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_presupuestos" PRIMARY KEY (id)
      )
    `);
    /*
     * Hay VARIOS presupuestos por ejercicio a propósito —el original de
     * diciembre y el revisado de junio—, así que la unicidad incluye el
     * nombre. Lo que no puede haber son dos con el mismo nombre en el mismo
     * año: nadie sabría contra cuál se está midiendo.
     */
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UX_presupuestos_empresa_ejercicio_nombre"
         ON presupuestos (empresaid, ejercicio, nombre)`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IX_presupuestos_empresa_ejercicio"
         ON presupuestos (empresaid, ejercicio)`,
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS presupuesto_lineas (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        presupuestoid uuid NOT NULL,
        cuentacontableid uuid NOT NULL,
        centrocostoid uuid NULL,
        mes int NOT NULL,
        importe numeric(18,2) NOT NULL DEFAULT 0,
        CONSTRAINT "PK_presupuesto_lineas" PRIMARY KEY (id),
        CONSTRAINT "CK_presupuesto_linea_mes" CHECK (mes BETWEEN 1 AND 12),
        CONSTRAINT "FK_presupuesto_linea_presupuesto"
          FOREIGN KEY (presupuestoid) REFERENCES presupuestos(id) ON DELETE CASCADE,
        CONSTRAINT "FK_presupuesto_linea_centro"
          FOREIGN KEY (centrocostoid) REFERENCES centros_costo(id) ON DELETE RESTRICT
      )
    `);
    /*
     * Una celda por cuenta, centro y mes. Sin esto, capturar dos veces el mismo
     * renglón duplicaría el presupuesto en silencio y la desviación saldría a
     * la mitad — un error que nadie encuentra mirando el reporte, porque el
     * número resultante es perfectamente creíble.
     *
     * Con `COALESCE` sobre el centro porque en PostgreSQL dos NULL no son
     * iguales, así que un índice único corriente dejaría meter N veces la misma
     * cuenta sin centro.
     */
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UX_presupuesto_linea"
         ON presupuesto_lineas (
           presupuestoid,
           cuentacontableid,
           COALESCE(centrocostoid, '00000000-0000-0000-0000-000000000000'::uuid),
           mes
         )`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IX_presupuesto_lineas_presupuesto"
         ON presupuesto_lineas (presupuestoid)`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS presupuesto_lineas`);
    await q.query(`DROP TABLE IF EXISTS presupuestos`);
  }
}
