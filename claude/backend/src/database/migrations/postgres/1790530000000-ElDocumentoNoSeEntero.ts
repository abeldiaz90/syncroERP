import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ============================================================================
 * El documento no se enteró
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ, medido el 28-sep-2026 contra la instalación
 *
 * El cobro de City Ledger de $1,200 tenía `estadoContable: 'PENDIENTE'` y
 * `polizaId: null`. Su asiento estaba **GENERADO**, con su póliza. La
 * contabilidad se hizo; el cobro no se enteró nunca.
 *
 * El motivo está explicado en `AsientosPendientesService`: cada módulo escribía
 * el resultado en su documento sólo en el intento EN LÍNEA que sigue a la
 * operación. Si ese intento fallaba, el asiento se generaba después —por el
 * cron o por el botón— y ya no había nadie que volviera a tocar el documento.
 *
 * Eso ya está arreglado para lo que venga. Esta migración arregla lo que quedó,
 * que en esta instalación bloqueaba el diagnóstico de integridad entero con un
 * hallazgo de severidad CRÍTICA que nadie podía resolver.
 *
 * QUÉ HACE, EXACTAMENTE
 *
 * Copia al documento un hecho que YA ES CIERTO: que su asiento está en GENERADO
 * y con qué póliza. No genera pólizas, no toca importes, no decide nada. Si no
 * hay asiento generado, no toca la fila.
 *
 * `to_regclass` para saltar las tablas que esta instalación todavía no tenga:
 * las migraciones crean el esquema por etapas y una tabla ausente no es un
 * fallo de ésta.
 * ============================================================================
 */
const DOCUMENTOS: ReadonlyArray<{
  tabla: string;
  asiento: string;
  estado: string;
  poliza: string;
}> = [
  { tabla: 'hoteleria_city_ledger_cobros', asiento: 'asientopendienteid', estado: 'estadocontable', poliza: 'polizaid' },
  { tabla: 'folios', asiento: 'asientopendienteid', estado: 'estadocontable', poliza: 'polizaid' },
  { tabla: 'pagos_proveedor', asiento: 'asientopendienteid', estado: 'estadocontable', poliza: 'polizaid' },
  { tabla: 'pagos_cobranza', asiento: 'asientopendienteid', estado: 'estadocontable', poliza: 'polizaid' },
  { tabla: 'importaciones_inventario', asiento: 'asiento_pendiente_id', estado: 'estado_contable', poliza: 'poliza_id' },
];

export class ElDocumentoNoSeEntero1790530000000 implements MigrationInterface {
  name = 'ElDocumentoNoSeEntero1790530000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const doc of DOCUMENTOS) {
      const [existe] = await queryRunner.query(
        `SELECT to_regclass($1) AS tabla`,
        [doc.tabla],
      );
      if (!existe?.tabla) continue;

      const filas: Array<{ id: string }> = await queryRunner.query(`
        UPDATE ${doc.tabla} d
           SET ${doc.estado} = 'GENERADO',
               ${doc.poliza} = COALESCE(a.polizaid, d.${doc.poliza})
          FROM asientos_pendientes a
         WHERE a.id = d.${doc.asiento}
           AND a.estado = 'GENERADO'
           AND d.${doc.estado} <> 'GENERADO'
        RETURNING d.id
      `);
      if (filas?.length) {
        console.log(
          `[ElDocumentoNoSeEntero] ${doc.tabla}: ${filas.length} documento(s) se enteraron de su póliza.`,
        );
      }
    }
  }

  public async down(): Promise<void> {
    /*
     * No se deshace. Lo que escribió es un hecho que ya era cierto —el asiento
     * está generado y la póliza existe—, así que volver a poner PENDIENTE sería
     * reintroducir la mentira a propósito.
     */
  }
}
