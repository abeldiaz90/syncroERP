import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ============================================================================
 * El año del folio, en la zona del negocio
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * La migración `UnFolioQueSePuedaDecir` calculaba el ejercicio de cada
 * documento así:
 *
 *     fecha AT TIME ZONE 'UTC' AT TIME ZONE 'America/Mexico_City'
 *
 * El razonamiento era: la primera lo interpreta como UTC, la segunda lo lleva a
 * la zona. Eso vale para un `timestamp` SIN zona. Estas columnas son
 * `timestamptz` —las convirtió `FechasConZonaHoraria`—, y sobre un `timestamptz`
 * el primer `AT TIME ZONE 'UTC'` ya devuelve un `timestamp` sin zona, así que el
 * segundo lo INTERPRETA como hora de México en vez de convertirlo a ella.
 *
 * El resultado suma seis horas donde había que restarlas:
 *
 *     guardado 2026-12-31 23:00+00  →  daba 2027-01-01 05:00
 *                                   →  correcto 2026-12-31 17:00
 *
 * Es decir: el año del folio salía mal **justo en el cruce de ejercicio**, que
 * es lo único que ese cálculo existe para acertar. Un documento de la tarde del
 * 31 de diciembre recibía folio del año siguiente.
 *
 * Se descubrió corriendo la migración contra un PostgreSQL de verdad con datos a
 * ambos lados del 31 de diciembre. `tsc` no lo ve —es una cadena SQL— y ninguna
 * prueba estática lo habría visto: sólo ejecutarla.
 *
 * QUÉ HACE ESTA MIGRACIÓN
 *
 * La original ya está corregida, así que una instalación nueva nace bien. Ésta
 * es para las que ya la corrieron.
 *
 *   · Busca los documentos cuyo folio lleva un año distinto del que les
 *     corresponde en la zona del negocio.
 *   · A ésos —y sólo a ésos— les da el siguiente consecutivo libre de su año
 *     correcto. **No renumera los que están bien.**
 *   · Resiembra las secuencias con el máximo real de cada año.
 *
 * POR QUÉ NO SE RENUMERA TODO
 *
 * Renumerar la serie entera dejaría coherente la numeración, y le cambiaría el
 * folio a documentos que ya se imprimieron, se dictaron por teléfono o se
 * anotaron en una factura. Corregir sólo los equivocados deja un hueco en el
 * año que no les correspondía —el número que nunca debió emitirse ahí— y
 * conserva intacto todo lo demás. Entre un hueco explicable y un folio que
 * cambia debajo de quien ya lo usó, el hueco.
 *
 * En la práctica la ventana es estrecha: el año sólo salía mal para documentos
 * creados dentro de las seis horas anteriores o posteriores al cambio de año
 * UTC. Lo más probable es que esta migración no toque ninguna fila, y aun así
 * tiene que existir: «probablemente ninguna» no es «ninguna».
 * ============================================================================
 */
export class ElAnioDelFolioEnLaZonaDelNegocio1790830000000
  implements MigrationInterface
{
  name = 'ElAnioDelFolioEnLaZonaDelNegocio1790830000000';

  /** Las cinco series con ejercicio, su tabla, su columna de fecha y su prefijo. */
  private readonly DOCUMENTOS = [
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
    if (!(await this.existe(queryRunner, 'folio_secuencias'))) return;

    for (const { tabla, tipo, fecha } of this.DOCUMENTOS) {
      if (!(await this.existe(queryRunner, tabla))) continue;

      /* El año correcto: un solo `AT TIME ZONE` sobre un `timestamptz`. */
      const anioOk = `EXTRACT(YEAR FROM (d.${fecha} AT TIME ZONE 'America/Mexico_City'))::int`;
      /* El año que el folio dice llevar. */
      const anioFolio = `SUBSTRING(d.folio FROM '^${tipo}-([0-9]{4})-')::int`;
      const bienFormado = `d.folio ~ '^${tipo}-[0-9]{4}-[0-9]{6}$'`;

      /*
       * Los mal numerados reciben consecutivo en su año correcto, a partir del
       * máximo que ya hay ahí. `row_number()` ordena por fecha para que, si
       * fueran varios, entren en el orden en que ocurrieron.
       */
      await queryRunner.query(`
        WITH tope AS (
          SELECT d.empresaid,
                 ${anioFolio} AS anio,
                 MAX(SUBSTRING(d.folio FROM '([0-9]{6})$')::int) AS ultimo
            FROM ${tabla} d
           WHERE ${bienFormado}
           GROUP BY 1, 2
        ),
        mal AS (
          SELECT d.id,
                 d.empresaid,
                 ${anioOk} AS anio_ok,
                 row_number() OVER (
                   PARTITION BY d.empresaid, ${anioOk}
                   ORDER BY d.${fecha} ASC, d.id ASC
                 ) AS orden
            FROM ${tabla} d
           WHERE ${bienFormado}
             AND ${anioFolio} <> ${anioOk}
        )
        UPDATE ${tabla} t
           SET folio = '${tipo}-' || m.anio_ok::text || '-' ||
                       lpad((m.orden + COALESCE(p.ultimo, 0))::text, 6, '0')
          FROM mal m
          LEFT JOIN tope p
            ON p.empresaid = m.empresaid AND p.anio = m.anio_ok
         WHERE t.id = m.id
      `);

      /*
       * Y las secuencias, al máximo real de cada año. Hace falta aunque no se
       * haya corregido ninguna fila: las sembró la migración original con los
       * años mal calculados, así que puede haber una fila de un ejercicio que
       * no existe y faltar la del que sí.
       */
      await queryRunner.query(`
        INSERT INTO folio_secuencias (empresaid, tipo, anio, ultimo)
        SELECT d.empresaid::uuid,
               '${tipo}',
               ${anioFolio},
               MAX(SUBSTRING(d.folio FROM '([0-9]{6})$')::int)
          FROM ${tabla} d
         WHERE ${bienFormado}
         GROUP BY 1, 3
        ON CONFLICT (empresaid, tipo, anio)
        DO UPDATE SET ultimo = GREATEST(folio_secuencias.ultimo, EXCLUDED.ultimo)
      `);
    }
  }

  public async down(): Promise<void> {
    /*
     * No se deshace. Devolver un folio a su año equivocado no es un estado al
     * que nadie quiera volver, y las filas corregidas ya no se distinguen de
     * las que siempre estuvieron bien.
     */
  }
}
