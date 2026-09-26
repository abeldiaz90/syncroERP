import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ============================================================================
 * Volver a unir cada operación con su póliza
 * ----------------------------------------------------------------------------
 * LO QUE PASÓ
 *
 * Trece de los quince generadores del motor contable estaban declarados
 * `Promise<void>` y descartaban el id de la póliza que `crearPoliza` sí
 * devolvía. El servicio que escribe la bitácora hacía
 * `fila.polizaId = idDevuelto ?? fila.polizaId`, así que la columna se quedaba
 * en null: la operación decía «contabilizada» sin poder decir dónde.
 *
 * El defecto está corregido hacia adelante. Esta migración repara lo ya
 * escrito, y no es sólo cuestión de auditoría: el control
 * `OPERACIONES_SIN_CONTABILIZAR` del cierre mensual cuenta
 * `estadoContable <> 'GENERADO' OR polizaId IS NULL`, de modo que **cada fila
 * sin enlazar bloquea el cierre del mes** aunque su póliza exista. Medido el
 * 25-sep-2026: 9 cobros y 6 pagos a proveedor bloqueaban septiembre, con sus
 * 10 y 6 pólizas correspondientes ya en el mayor.
 *
 * ----------------------------------------------------------------------------
 * POR QUÉ ES SEGURO
 *
 * El enlace se reconstruye por `polizas.origenId`, que el motor escribe en el
 * mismo acto en que crea la póliza. No se adivina por importe ni por fecha
 * —que es donde estas reparaciones se equivocan— sino por el identificador del
 * documento que la originó.
 *
 * Y sólo se escribe donde hoy no hay nada: `WHERE polizaId IS NULL`. Una fila
 * ya enlazada no se toca, aunque el enlace pareciera distinto. Si una
 * operación tuviera dos pólizas del mismo origen —una venta tiene ingreso y
 * costo— se toma la más antigua por fecha de creación, que es la principal;
 * las tablas que repara aquí generan una sola.
 *
 * No borra, no reescribe y no tiene efecto la segunda vez que corre.
 * ============================================================================
 */
export class EnlazarPolizasHistoricas1790350000000 implements MigrationInterface {
  name = 'EnlazarPolizasHistoricas1790350000000';

  /** tabla de la operación → `origenTipo` con el que el motor marcó su póliza. */
  private static readonly ENLACES: ReadonlyArray<[string, string]> = [
    ['pagos_cobranza', 'COBRANZA'],
    ['pagos_proveedor', 'PAGO_PROVEEDOR'],
  ];

  private async existe(q: QueryRunner, tabla: string): Promise<boolean> {
    const r = await q.query(
      `SELECT 1 FROM information_schema.tables
        WHERE table_schema = current_schema() AND table_name = $1`,
      [tabla],
    );
    return r?.length > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.existe(queryRunner, 'polizas'))) return;

    for (const [tabla, origenTipo] of EnlazarPolizasHistoricas1790350000000.ENLACES) {
      if (!(await this.existe(queryRunner, tabla))) continue;

      await queryRunner.query(
        `
        UPDATE "${tabla}" AS op
           SET polizaId = elegida.id
          FROM (
            SELECT DISTINCT ON (p.origenId, p.empresaId)
                   p.id, p.origenId, p.empresaId
              FROM polizas p
             WHERE p.origenTipo = $1
               AND p.origenId IS NOT NULL
             ORDER BY p.origenId, p.empresaId, p.fechaCreacion ASC
          ) AS elegida
         WHERE op.polizaId IS NULL
           AND op.id = elegida.origenId
           AND op.empresaId = elegida.empresaId
        `,
        [origenTipo],
      );
    }
  }

  /**
   * No se deshace.
   *
   * Vaciar la columna devolvería la base al estado en que el cierre mensual no
   * podía completarse, y el dato repuesto es exactamente el que el motor
   * debería haber escrito. Revertir una reparación correcta no es una marcha
   * atrás: es volver a romperlo.
   */
  public async down(): Promise<void> {
    return;
  }
}
