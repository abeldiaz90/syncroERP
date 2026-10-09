import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ============================================================================
 * El ticket sale en papel
 * ----------------------------------------------------------------------------
 * QUÉ FALTABA
 *
 * El punto de venta cobraba y ofrecía un botón «Ticket» que abría una pestaña
 * con el comprobante en pantalla. Imprimirlo era cosa del cajero: el diálogo
 * del navegador, elegir impresora, aceptar. En un mostrador con cola eso no
 * ocurre, y el cliente se va sin papel.
 *
 * Ahora el servidor le escribe directamente a la impresora térmica de la caja,
 * en ESC/POS, por el puerto crudo 9100. No hay nada que instalar en el
 * mostrador: la impresora tiene su IP y el servidor le manda los bytes.
 *
 * LAS DOS COLUMNAS QUE NACEN
 *
 *   · `caja_impresoras` · qué impresora tiene cada caja. Una fila con
 *     `cuentaCajaId` nulo es la de la empresa, para el negocio de un solo
 *     mostrador, que es la mayoría.
 *
 *   · `ventas.impresionesTicket` · cuántas veces se pidió el ticket. A partir
 *     de la segunda el papel sale marcado «REIMPRESION». Un ticket reimpreso
 *     indistinguible del original sirve para cobrar dos veces una devolución.
 *
 * POR QUÉ NO SE CREA NINGUNA IMPRESORA AQUÍ
 *
 * Porque no se sabe qué hay enchufado. Una caja sin configurar se comporta
 * exactamente como antes —el ticket se manda desde el navegador—, así que esta
 * migración no le cambia el comportamiento a nadie. La impresora se declara
 * cuando se conoce su dirección, y hay una página de prueba para comprobarla
 * sin tener que vender.
 * ============================================================================
 */
export class ElTicketSaleEnPapel1790850000000 implements MigrationInterface {
  name = 'ElTicketSaleEnPapel1790850000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    /*
     * Los identificadores van SIN comillas. El proyecto usa
     * `LowercaseNamingStrategy`, así que TypeORM pide `empresaid`; una columna
     * creada como "empresaId" conserva las mayúsculas y deja de existir para
     * el código. Es el error que mató entera la tabla `empresa_identidad` y se
     * escondió detrás de un try/catch durante semanas.
     */
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS caja_impresoras (
        id                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
        empresaId          uuid                     NOT NULL,
        cuentaCajaId       uuid                     NULL,
        nombre             character varying(100)   NOT NULL DEFAULT 'Impresora de tickets',
        modo               character varying(20)    NOT NULL DEFAULT 'NAVEGADOR',
        host               character varying(120)   NULL,
        puerto             integer                  NOT NULL DEFAULT 9100,
        ancho              integer                  NOT NULL DEFAULT 48,
        abrirCajon         boolean                  NOT NULL DEFAULT true,
        pie                character varying(300)   NULL,
        copias             integer                  NOT NULL DEFAULT 1,
        activo             boolean                  NOT NULL DEFAULT true,
        ultimoIntento      TIMESTAMP WITH TIME ZONE NULL,
        ultimoExito        boolean                  NULL,
        ultimoMotivo       character varying(300)   NULL,
        fechaCreacion      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        fechaActualizacion TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_caja_impresoras" PRIMARY KEY (id)
      )
    `);

    /*
     * Un índice único corriente trataría dos filas con `cuentacajaid` nulo como
     * distintas —en SQL, NULL no es igual a NULL— y la empresa acabaría con
     * varias impresoras «por omisión» y ninguna manera de saber cuál manda. Se
     * parte en dos índices parciales: uno para las cajas con cuenta y otro que
     * sólo deja una fila por empresa sin ella.
     */
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UX_caja_impresoras_empresa_cuenta"
        ON caja_impresoras (empresaId, cuentaCajaId)
        WHERE cuentaCajaId IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UX_caja_impresoras_empresa_default"
        ON caja_impresoras (empresaId)
        WHERE cuentaCajaId IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE ventas
        ADD COLUMN IF NOT EXISTS impresionesTicket integer NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE ventas DROP COLUMN IF EXISTS impresionesTicket`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UX_caja_impresoras_empresa_default"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UX_caja_impresoras_empresa_cuenta"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS caja_impresoras`);
  }
}
