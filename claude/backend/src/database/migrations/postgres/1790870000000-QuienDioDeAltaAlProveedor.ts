import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ============================================================================
 * Quién dio de alta al proveedor
 * ----------------------------------------------------------------------------
 * EL CASO — hallazgo #11 del barrido, abierto desde el 5-oct-2026
 *
 * La homologación de un proveedor es un control: alguien distinto revisa y
 * aprueba. Pero no había forma de comprobar que fuera distinto, porque
 * `Proveedor` **no guardaba quién lo había creado**.
 *
 * Sin ese dato, el control no controla nada: quien quiera meter un proveedor
 * se lo da de alta y se lo aprueba en dos clics, y el expediente queda con dos
 * firmas que son la misma persona. Es el mismo razonamiento que la doble firma
 * del core, a menor escala.
 *
 * El hallazgo quedó abierto por esto mismo: «necesita migración». Ésta es.
 *
 * LAS FILAS QUE YA EXISTEN
 *
 * Se quedan en `NULL`, y eso significa **no se sabe**, no «no fue el mismo».
 * `resolverHomologacion` las deja pasar —bloquear retroactivamente a todos los
 * proveedores existentes sería peor que el agujero— pero lo anota en el
 * comentario de la resolución, para que el expediente no afirme un control que
 * no se pudo comprobar.
 *
 * No se intenta adivinar el creador desde la bitácora: un dato inventado con
 * buena intención es peor que un hueco, porque el hueco se ve.
 * ============================================================================
 */
export class QuienDioDeAltaAlProveedor1790870000000 implements MigrationInterface {
  name = 'QuienDioDeAltaAlProveedor1790870000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS creadoporid uuid NULL`,
    );
    /*
     * Por él se pregunta en cada homologación, y la tabla crece con el
     * catálogo de cada empresa.
     */
    await q.query(
      `CREATE INDEX IF NOT EXISTS "ix_proveedores_creadoporid" ON proveedores (creadoporid)`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "ix_proveedores_creadoporid"`);
    await q.query(`ALTER TABLE proveedores DROP COLUMN IF EXISTS creadoporid`);
  }
}
