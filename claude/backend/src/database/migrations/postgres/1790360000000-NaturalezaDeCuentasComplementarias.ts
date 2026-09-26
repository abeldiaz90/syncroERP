import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ============================================================================
 * Poner del derecho las cuentas complementarias
 * ----------------------------------------------------------------------------
 * LO QUE PASÓ
 *
 * La naturaleza de cada cuenta del catálogo se derivaba sólo de su TIPO:
 * activo y costo, deudoras; pasivo, capital e ingreso, acreedoras. Es cierto
 * salvo para las cuentas complementarias, que pertenecen al mismo tipo que la
 * cuenta que corrigen y llevan la naturaleza contraria.
 *
 * Resultado: 66 cuentas del catálogo SAT quedaron declaradas al revés. Las
 * seis familias de estimaciones y acumuladas —108 incobrables, 116 inventarios
 * obsoletos, 171 depreciación acumulada, 172 deterioro acumulado, 183
 * amortización acumulada, 189 deterioro de inversiones—, las devoluciones
 * sobre ventas (402) y las devoluciones sobre compras (503).
 *
 * POR QUÉ IMPORTA
 *
 * `naturaleza` es lo que decide el SIGNO con el que cada cuenta se presenta.
 * En la balanza de esta instalación, «Depreciación acumulada de mobiliario»
 * salía como −450 —un activo en negativo— en vez de 450 acreedor, que es lo
 * que es. Y «Devoluciones sobre ventas» salía como ingreso positivo de 1,720
 * cuando resta. Un contador lo ve en el primer vistazo y, con razón, desconfía
 * del resto del renglón.
 *
 * POR QUÉ ES SEGURO
 *
 * Sólo se toca la columna `naturaleza`, que es una declaración sobre la
 * cuenta, no un importe. NINGUNA póliza, partida ni saldo se modifica: los
 * cargos y abonos ya registrados son correctos —lo que estaba mal era cómo se
 * leía su suma—. Se seleccionan las cuentas por su código de agrupador SAT,
 * que no cambia, y no por su nombre, que sí.
 *
 * Es reversible: `down()` devuelve la naturaleza derivada del tipo, que es
 * exactamente lo que había antes.
 * ============================================================================
 */
export class NaturalezaDeCuentasComplementarias1790360000000
  implements MigrationInterface
{
  name = 'NaturalezaDeCuentasComplementarias1790360000000';

  /** Raíces del catálogo SAT cuyas cuentas son complementarias. */
  private readonly complementariasDeActivo = ['108', '116', '171', '172', '183', '189'];
  private readonly complementariaDeIngreso = ['402'];
  private readonly complementariaDeCosto = ['503'];

  private patrones(raices: string[]): string {
    return raices.map((r) => `'${r}%'`).join(', ');
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    /* Complementarias de activo: deben ser ACREEDORAS. */
    await queryRunner.query(
      `UPDATE cuentas_contables
          SET naturaleza = 'ACREEDORA'
        WHERE naturaleza <> 'ACREEDORA'
          AND (${this.complementariasDeActivo
            .map((r) => `numeroCuenta LIKE '${r}%'`)
            .join(' OR ')})`,
    );

    /* Devoluciones sobre ingresos: complementarias de ingreso, DEUDORAS. */
    await queryRunner.query(
      `UPDATE cuentas_contables
          SET naturaleza = 'DEUDORA'
        WHERE naturaleza <> 'DEUDORA'
          AND (${this.complementariaDeIngreso
            .map((r) => `numeroCuenta LIKE '${r}%'`)
            .join(' OR ')})`,
    );

    /* Devoluciones sobre compras: complementarias de costo, ACREEDORAS. */
    await queryRunner.query(
      `UPDATE cuentas_contables
          SET naturaleza = 'ACREEDORA'
        WHERE naturaleza <> 'ACREEDORA'
          AND (${this.complementariaDeCosto
            .map((r) => `numeroCuenta LIKE '${r}%'`)
            .join(' OR ')})`,
    );

    /*
     * Las cuentas de orden van en pares y la segunda compensa a la primera.
     * Ahí el criterio es el nombre, porque el catálogo no las distingue por
     * código.
     */
    await queryRunner.query(
      `UPDATE cuentas_contables
          SET naturaleza = 'ACREEDORA'
        WHERE naturaleza <> 'ACREEDORA'
          AND numeroCuenta LIKE '8%'
          AND nombre ILIKE 'contra cuenta%'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    /* La regla anterior: la naturaleza se derivaba del primer dígito. */
    await queryRunner.query(
      `UPDATE cuentas_contables
          SET naturaleza = 'DEUDORA'
        WHERE (${this.complementariasDeActivo
          .map((r) => `numeroCuenta LIKE '${r}%'`)
          .join(' OR ')})`,
    );
    await queryRunner.query(
      `UPDATE cuentas_contables
          SET naturaleza = 'ACREEDORA'
        WHERE numeroCuenta LIKE '402%'`,
    );
    await queryRunner.query(
      `UPDATE cuentas_contables
          SET naturaleza = 'DEUDORA'
        WHERE numeroCuenta LIKE '503%'`,
    );
    await queryRunner.query(
      `UPDATE cuentas_contables
          SET naturaleza = 'DEUDORA'
        WHERE numeroCuenta LIKE '8%' AND nombre ILIKE 'contra cuenta%'`,
    );
  }
}
