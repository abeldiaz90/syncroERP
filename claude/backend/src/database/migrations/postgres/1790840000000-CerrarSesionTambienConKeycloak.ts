import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ============================================================================
 * Cerrar sesión no cerraba nada cuando la identidad la lleva Keycloak
 * ----------------------------------------------------------------------------
 * EL CASO
 *
 * `AuthService.logout` incrementa `tokenVersion`, y la estrategia JWT compara
 * ese contador contra el del token… **sólo en modo local**. En modo `keycloak`
 * —el modo obligatorio de esta instalación— `validarKeycloak` nunca lo mira,
 * porque el token lo firma Keycloak y no lleva ese campo.
 *
 * Resultado medido leyendo las dos ramas: el botón «Cerrar sesión» escribía en
 * la base y no revocaba nada. Un token robado seguía valiendo hasta su `exp`.
 *
 * Desactivar al usuario SÍ surtía efecto inmediato —la rama de Keycloak relee
 * la fila en cada petición y comprueba `activo`—, así que la vía de emergencia
 * existía. Lo que no existía era la normal.
 *
 * POR QUÉ UNA FECHA Y NO EL CONTADOR
 *
 * El contador funciona cuando el ERP firma el token, porque puede meterlo
 * dentro. Con Keycloak no hay dónde meterlo: lo único que el ERP controla es su
 * propia fila. Así que se guarda **desde cuándo** valen las sesiones y se
 * compara contra el `iat` del token, que todo JWT trae y que Keycloak firma.
 *
 * Nulo —que es como nace para todos los usuarios de hoy— significa «nunca se
 * cerró sesión»: ningún token queda invalidado por esta columna, así que la
 * migración no echa a nadie fuera al aplicarse.
 *
 * `timestamptz` y no `timestamp`: el `iat` es segundos desde epoch, sin huso. Un
 * `timestamp` sin huso compararía contra la hora local del servidor y echaría
 * fuera a la gente, o no, según dónde esté la máquina.
 * ============================================================================
 */
export class CerrarSesionTambienConKeycloak1790840000000
  implements MigrationInterface
{
  name = 'CerrarSesionTambienConKeycloak1790840000000';

  /*
   * En minúsculas y sin comillas a propósito: el proyecto usa
   * `LowercaseNamingStrategy`, así que TypeORM pide `sesionesvalidasdesde`.
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE usuarios
      ADD COLUMN IF NOT EXISTS sesionesvalidasdesde timestamptz NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE usuarios
      DROP COLUMN IF EXISTS sesionesvalidasdesde
    `);
  }
}
