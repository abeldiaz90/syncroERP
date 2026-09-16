import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ============================================================================
 * Fechas con zona horaria: `timestamp` → `timestamptz`
 * ----------------------------------------------------------------------------
 * QUÉ ARREGLA
 *
 * 199 de las 206 `@CreateDateColumn` del sistema son `timestamp without time
 * zone`. Postgres guarda el instante sin etiqueta y el driver lo reconstruye
 * con la zona del proceso, así que la misma fila podía tener dos verdades: en
 * un solo renglón del outbox, `fechaEnvio` marcaba 02:35Z —correcta— y
 * `fechaCreacion` 08:34Z, seis horas adelantada.
 *
 * Se veía en la operación: ninguna venta hecha después de las 18:00 se podía
 * devolver esa misma noche, porque su fecha caía en el día siguiente.
 *
 * Hoy está MITIGADO con `process.env.TZ = 'UTC'` en `main.ts`. Esto es el
 * arreglo de fondo: quien borre esa línea reintroduce el problema entero.
 *
 * ----------------------------------------------------------------------------
 * ⚠ LEE ESTO ANTES DE CORRERLA EN UNA BASE CON DATOS QUE IMPORTEN
 *
 * La conversión interpreta cada valor guardado como UTC. Eso es correcto para
 * las filas escritas por Postgres (`now()` con la sesión en UTC) y para TODAS
 * las escritas después de que `main.ts` fijara la zona del proceso.
 *
 * NO lo es para las filas anteriores que escribió la aplicación con
 * `new Date()`: el driver las mandaba con la hora de pared de México, así que
 * esas quedan guardadas en hora local y al convertirlas con 'UTC' se
 * desplazan seis horas.
 *
 * Dicho simple: **los timestamps viejos son una mezcla y no hay forma de
 * distinguirlos columna por columna**. En una base de pruebas eso da igual y
 * la conversión es lo correcto. En una base con historia real hay que decidir
 * antes qué se hace con lo anterior al arreglo de zona; no lo decide una
 * migración.
 *
 * ----------------------------------------------------------------------------
 * CÓMO LO HACE
 *
 * Recorre `information_schema` en vez de enumerar 199 columnas a mano, que es
 * una lista que algún día no se actualiza. Se salta las que ya están bien.
 * `down` deja de nuevo columnas sin zona, expresando el instante en UTC.
 * ============================================================================
 */
export class FechasConZonaHoraria1789560000000 implements MigrationInterface {
  name = 'FechasConZonaHoraria1789560000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE r record; convertidas int := 0;
      BEGIN
        FOR r IN
          SELECT c.table_schema, c.table_name, c.column_name
          FROM information_schema.columns c
          JOIN information_schema.tables t
            ON t.table_schema = c.table_schema AND t.table_name = c.table_name
          WHERE c.table_schema = current_schema()
            AND t.table_type = 'BASE TABLE'
            AND c.data_type = 'timestamp without time zone'
          ORDER BY c.table_name, c.column_name
        LOOP
          EXECUTE format(
            'ALTER TABLE %I.%I ALTER COLUMN %I TYPE timestamptz USING %I AT TIME ZONE ''UTC''',
            r.table_schema, r.table_name, r.column_name, r.column_name);
          convertidas := convertidas + 1;
        END LOOP;
        RAISE NOTICE 'Columnas convertidas a timestamptz: %', convertidas;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE r record;
      BEGIN
        FOR r IN
          SELECT c.table_schema, c.table_name, c.column_name
          FROM information_schema.columns c
          JOIN information_schema.tables t
            ON t.table_schema = c.table_schema AND t.table_name = c.table_name
          WHERE c.table_schema = current_schema()
            AND t.table_type = 'BASE TABLE'
            AND c.data_type = 'timestamp with time zone'
          ORDER BY c.table_name, c.column_name
        LOOP
          EXECUTE format(
            'ALTER TABLE %I.%I ALTER COLUMN %I TYPE timestamp USING %I AT TIME ZONE ''UTC''',
            r.table_schema, r.table_name, r.column_name, r.column_name);
        END LOOP;
      END $$;
    `);
  }
}
