import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ============================================================================
 * Un folio que se pueda decir
 * ----------------------------------------------------------------------------
 * QUÉ PASABA
 *
 * Los cinco documentos de compras —requisición, cotización, orden de compra,
 * recepción y pago a proveedor— **no tenían folio**. Lo que la pantalla
 * llamaba «OC-4F3A9C21» se calculaba al vuelo recortando los primeros ocho
 * caracteres del uuid, en 29 lugares del servidor y 11 pantallas, cada uno por
 * su cuenta y sin que nada lo guardara.
 *
 * Tres consecuencias, y la tercera es la grave:
 *
 *   1. No se puede dictar por teléfono ni anotar en una factura. Un folio
 *      existe exactamente para que dos personas que no están frente a la misma
 *      pantalla puedan hablar del mismo documento.
 *   2. No se puede ordenar ni auditar. «¿Cuántas órdenes van este año?» no
 *      tiene respuesta cuando los folios son aleatorios.
 *   3. **No es único.** Ocho caracteres hexadecimales son 32 bits. Por la
 *      paradoja del cumpleaños, a los ~10,000 documentos ya hay cerca de 1% de
 *      probabilidad de que dos distintos muestren el mismo «folio», y a los
 *      ~77,000 es del 50%. Y nueve de los lugares que lo armaban están en el
 *      motor contable: **la póliza referencia su documento de origen por ese
 *      recorte.** Dos órdenes con el mismo folio en el rastro contable es un
 *      asiento que no se puede amarrar a su origen.
 *
 * QUÉ HACE ESTA MIGRACIÓN
 *
 *   · Crea `folio_secuencias`: una fila por empresa, tipo y año, con el último
 *     consecutivo entregado.
 *   · Agrega la columna `folio` —nula— a las cinco tablas, con un índice único
 *     parcial por `(empresaid, folio)`. Parcial porque una instalación a medio
 *     rellenar tiene nulos, y en Postgres `NULL` no colisiona con nada.
 *   · **Rellena hacia atrás**: por decisión de Abel del 1-oct-2026, renumera
 *     todos los documentos existentes en orden de fecha de creación, por
 *     empresa y por año, con el formato `OC-2026-000001`.
 *   · Y deja las secuencias apuntando al último número usado, para que el
 *     primer documento nuevo siga la cuenta en lugar de chocar con el índice.
 *
 * POR QUÉ RENUMERAR Y NO CONSERVAR
 *
 * Porque esos «folios» nunca fueron folios: eran recortes de uuid que nadie
 * tiene apuntados en ninguna parte. Conservarlos dejaría dos formatos
 * conviviendo para siempre y un hueco sin explicación al principio de la
 * numeración, que es lo primero que un auditor pregunta.
 *
 * El año se toma de la fecha de creación de cada documento. Se usa la fecha en
 * la zona del negocio (`America/Mexico_City`) y no la UTC, por la misma razón
 * que el resto del ERP: un documento guardado a las 19:00 del 31 de diciembre
 * en México es del ejercicio que termina, y en UTC ya es del siguiente.
 *
 * REVERSIBLE
 *
 * `down()` quita las columnas y la tabla. No intenta restaurar los recortes de
 * uuid porque se pueden volver a calcular del id: no se pierde nada.
 * ============================================================================
 */
export class UnFolioQueSePuedaDecir1790800000000 implements MigrationInterface {
  name = 'UnFolioQueSePuedaDecir1790800000000';

  /** Tabla, prefijo y columna de fecha de creación de cada documento. */
  private readonly DOCUMENTOS: {
    tabla: string;
    tipo: string;
    fecha: string;
  }[] = [
    { tabla: 'requisiciones', tipo: 'REQ', fecha: 'fechasolicitud' },
    { tabla: 'cotizaciones', tipo: 'COT', fecha: 'fechacotizacion' },
    { tabla: 'ordenes_compra', tipo: 'OC', fecha: 'fechacreacion' },
    { tabla: 'recepciones_compra', tipo: 'REC', fecha: 'fecharecepcion' },
    { tabla: 'pagos_proveedor', tipo: 'PP', fecha: 'fechacreacion' },
  ];

  private async existe(q: QueryRunner, tabla: string): Promise<boolean> {
    const [fila] = await q.query(`SELECT to_regclass($1) AS tabla`, [tabla]);
    return Boolean(fila?.tabla);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS folio_secuencias (
        empresaid uuid NOT NULL,
        tipo varchar(16) NOT NULL,
        anio int NOT NULL,
        ultimo int NOT NULL DEFAULT 0,
        CONSTRAINT "PK_folio_secuencias" PRIMARY KEY (empresaid, tipo, anio)
      )
    `);

    for (const { tabla, tipo, fecha } of this.DOCUMENTOS) {
      if (!(await this.existe(queryRunner, tabla))) continue;

      await queryRunner.query(
        `ALTER TABLE ${tabla} ADD COLUMN IF NOT EXISTS folio varchar(32)`,
      );

      /*
       * El relleno. `row_number()` numera dentro de cada partición
       * (empresa + año) ordenando por fecha y, para empatar deterministamente
       * dos documentos del mismo instante, por id. Sin ese segundo criterio el
       * resultado dependería del plan de ejecución y dos instalaciones de la
       * misma base podrían numerar distinto.
       *
       * `AT TIME ZONE` dos veces es lo que convierte un `timestamp` guardado en
       * UTC a la hora de México: la primera lo interpreta como UTC, la segunda
       * lo lleva a la zona. Es lo mismo que hace `fechaCalendarioNegocio` en el
       * servidor, y tiene que coincidir o el año del folio viejo no cuadraría
       * con el del nuevo.
       */
      /**
       * El año del documento en la zona del negocio, calificado por alias.
       *
       * ========================================================================
       * UN `AT TIME ZONE` DE MÁS VA EN LA DIRECCIÓN CONTRARIA
       * ------------------------------------------------------------------------
       * Aquí ponía `… AT TIME ZONE 'UTC' AT TIME ZONE 'America/Mexico_City'`,
       * razonando que la primera lo interpreta como UTC y la segunda lo lleva a
       * la zona. Eso es cierto para un `timestamp` SIN zona.
       *
       * Estas columnas son `timestamptz` —las convirtió la migración
       * `FechasConZonaHoraria`—. Sobre un `timestamptz`, el primer
       * `AT TIME ZONE 'UTC'` devuelve un `timestamp` sin zona, y el segundo lo
       * INTERPRETA como hora de México en vez de convertirlo a ella. El
       * resultado suma seis horas donde había que restarlas:
       *
       *     guardado 2026-12-31 23:00+00  →  daba 2027-01-01 05:00
       *                                   →  correcto 2026-12-31 17:00
       *
       * Es decir, el año del folio salía mal justo en el cruce de ejercicio,
       * que es lo único que esta función existe para acertar.
       *
       * Sobre un `timestamptz` basta un `AT TIME ZONE`, y es lo que hace falta.
       *
       * Se descubrió corriendo la migración contra un PostgreSQL de verdad, con
       * datos a ambos lados del 31 de diciembre. `tsc` no lo ve —es una cadena
       * SQL— y ninguna prueba estática lo habría visto: sólo ejecutarla.
       * ========================================================================
       */
      const anioDe = (alias: string) =>
        `EXTRACT(YEAR FROM (${alias}.${fecha} AT TIME ZONE 'America/Mexico_City'))::int`;

      await queryRunner.query(`
        WITH ya_tienen AS (
          /*
           * El consecutivo más alto ya repartido en cada partición. En una base
           * nueva no hay ninguno; importa si esta migración se interrumpió a
           * medio camino y se vuelve a correr, porque entonces «row_number()»
           * empezaría otra vez en 1 y chocaría con el índice único. Un relleno
           * que sólo funciona la primera vez es un relleno que falla el día que
           * algo salió mal.
           *
           * Se lee el número DEL FOLIO y no se cuentan las filas: contar
           * supone que la numeración no tiene huecos, y si los tuviera el
           * siguiente documento pisaría uno existente.
           */
          SELECT
            d.empresaid,
            ${anioDe('d')} AS anio,
            MAX(SUBSTRING(d.folio FROM '([0-9]{6})$')::int) AS tope
          FROM ${tabla} d
          WHERE d.folio IS NOT NULL
          GROUP BY 1, 2
        ),
        numerados AS (
          SELECT
            d.id,
            ${anioDe('d')} AS anio,
            row_number() OVER (
              PARTITION BY d.empresaid, ${anioDe('d')}
              ORDER BY d.${fecha} ASC, d.id ASC
            ) + COALESCE(y.tope, 0) AS consecutivo
          FROM ${tabla} d
          LEFT JOIN ya_tienen y
            ON y.empresaid = d.empresaid AND y.anio = ${anioDe('d')}
          WHERE d.folio IS NULL
        )
        UPDATE ${tabla} t
        SET folio = '${tipo}-' || n.anio::text || '-' || lpad(n.consecutivo::text, 6, '0')
        FROM numerados n
        WHERE t.id = n.id
      `);

      /*
       * Y las secuencias quedan en el último número repartido. Sin esto, el
       * primer documento nuevo pediría el 1 y chocaría con el índice único:
       * el alta fallaría con un error de llave duplicada que nadie sabría leer.
       */
      await queryRunner.query(`
        INSERT INTO folio_secuencias (empresaid, tipo, anio, ultimo)
        SELECT
          d.empresaid,
          '${tipo}',
          ${anioDe('d')},
          MAX(SUBSTRING(d.folio FROM '([0-9]{6})$')::int)
        FROM ${tabla} d
        WHERE d.folio IS NOT NULL
        GROUP BY 1, 3
        ON CONFLICT (empresaid, tipo, anio)
        DO UPDATE SET ultimo = GREATEST(folio_secuencias.ultimo, EXCLUDED.ultimo)
      `);

      await queryRunner.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "UQ_${tabla}_folio"
        ON ${tabla} (empresaid, folio) WHERE folio IS NOT NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const { tabla } of this.DOCUMENTOS) {
      if (!(await this.existe(queryRunner, tabla))) continue;
      await queryRunner.query(`DROP INDEX IF EXISTS "UQ_${tabla}_folio"`);
      await queryRunner.query(
        `ALTER TABLE ${tabla} DROP COLUMN IF EXISTS folio`,
      );
    }
    await queryRunner.query(`DROP TABLE IF EXISTS folio_secuencias`);
  }
}
