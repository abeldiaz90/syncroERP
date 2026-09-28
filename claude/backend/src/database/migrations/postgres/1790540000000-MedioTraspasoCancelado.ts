import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ============================================================================
 * Medio traspaso cancelado
 * ----------------------------------------------------------------------------
 * QUÉ PASA
 *
 * Un traspaso entre cuentas escribe dos movimientos de tesorería —la salida y
 * la entrada— y **una sola póliza** con los dos lados. Ninguno de los dos
 * movimientos llevaba `tipoDocumento`, así que `cancelar()` los trataba como
 * movimientos capturados a mano y permitía cancelar **una pierna sola**.
 *
 * Cancelar sólo la salida devuelve el importe a la cuenta de origen y lo deja
 * también en la de destino; cancelar sólo la entrada lo hace desaparecer. En
 * los dos casos la póliza queda intacta, afirmando que el traspaso ocurrió
 * entero.
 *
 * Eso ya está cerrado para los traspasos nuevos, que nacen marcados. Esta
 * migración marca los que ya estaban en la base, que si no seguirían
 * ofreciendo el botón.
 *
 * QUÉ HACE, EXACTAMENTE
 *
 * Copia un hecho que YA ES CIERTO: que el movimiento tiene
 * `origen = 'TRASPASO'`. No toca importes, ni saldos, ni pólizas, ni ningún
 * movimiento que ya traiga su `tipoDocumento`.
 *
 * `to_regclass` para saltar una instalación donde la tabla todavía no exista:
 * las migraciones crean el esquema por etapas y una tabla ausente no es un
 * fallo de ésta.
 * ============================================================================
 */
export class MedioTraspasoCancelado1790540000000 implements MigrationInterface {
  name = 'MedioTraspasoCancelado1790540000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const [existe] = await queryRunner.query(
      `SELECT to_regclass($1) AS tabla`,
      ['movimientos_tesoreria'],
    );
    if (!existe?.tabla) return;

    const filas: Array<{ id: string }> = await queryRunner.query(`
      UPDATE movimientos_tesoreria
         SET tipodocumento = 'TRASPASO_TESORERIA'
       WHERE origen = 'TRASPASO'
         AND tipodocumento IS NULL
      RETURNING id
    `);
    if (filas?.length) {
      console.log(
        `[MedioTraspasoCancelado] ${filas.length} movimiento(s) de traspaso quedaron marcados: ` +
          'ya no se pueden cancelar de a una pierna.',
      );
    }
  }

  public async down(): Promise<void> {
    /*
     * No se deshace. Quitar la marca volvería a dejar cancelable media
     * transferencia, que es justo el defecto que esto cierra.
     */
  }
}
