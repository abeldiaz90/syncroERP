import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Activa el SLA por nivel, no por ciclo completo. Sólo el primer nivel
 * pendiente es atendible; los posteriores empiezan su reloj al liberarse.
 */
export class SlaSecuencialAprobacionesV1461785780000000
  implements MigrationInterface
{
  name = 'SlaSecuencialAprobacionesV1461785780000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      IF OBJECT_ID('aprobaciones_documentos','U') IS NOT NULL
         AND COL_LENGTH('aprobaciones_documentos','fechaVencimiento') IS NOT NULL
      BEGIN
        ;WITH pendientes AS (
          SELECT id,
                 ROW_NUMBER() OVER (
                   PARTITION BY empresaId,proceso,documentoId,ciclo
                   ORDER BY nivel
                 ) posicion
            FROM aprobaciones_documentos
           WHERE proceso IN ('CREDITO_CLIENTE','HOTEL_CONVENIO')
             AND estado='PENDIENTE'
        )
        UPDATE aprobacion
           SET fechaVencimiento =
                 CASE WHEN pendientes.posicion=1
                      THEN DATEADD(HOUR,COALESCE(NULLIF(aprobacion.tiempoLimiteHoras,0),24),SYSUTCDATETIME())
                      ELSE NULL END
          FROM aprobaciones_documentos aprobacion
          INNER JOIN pendientes ON pendientes.id=aprobacion.id;
      END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      IF OBJECT_ID('aprobaciones_documentos','U') IS NOT NULL
         AND COL_LENGTH('aprobaciones_documentos','fechaVencimiento') IS NOT NULL
      BEGIN
        UPDATE aprobaciones_documentos
           SET fechaVencimiento=DATEADD(
                 HOUR,
                 COALESCE(NULLIF(tiempoLimiteHoras,0),24),
                 COALESCE(fechaCreacion,SYSUTCDATETIME())
               )
         WHERE proceso IN ('CREDITO_CLIENTE','HOTEL_CONVENIO')
           AND estado='PENDIENTE'
           AND fechaVencimiento IS NULL;
      END
    `);
  }
}
