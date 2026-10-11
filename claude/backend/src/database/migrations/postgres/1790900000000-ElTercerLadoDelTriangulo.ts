import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ============================================================================
 * El tercer lado del triángulo: la factura del proveedor
 * ----------------------------------------------------------------------------
 * El ciclo de compra tenía dos documentos de los tres: la ORDEN —lo que pedí—
 * y la RECEPCIÓN —lo que llegó—. Faltaba el que dice LO QUE ME COBRAN, y sin
 * él se pagaba contra la recepción: nadie comparaba nunca el precio facturado
 * con el pactado.
 *
 * Y en México hay una segunda razón que no es de control sino legal: el
 * documento que detona la cuenta por pagar y el IVA acreditable es el CFDI que
 * emite el proveedor, no el acuse del almacén.
 *
 * NO TOCA NADA EXISTENTE
 *
 * Dos tablas nuevas y ninguna columna añadida a las de compras. El cotejo lee
 * las partidas de la orden y las cantidades recibidas donde ya están.
 * ============================================================================
 */
export class ElTercerLadoDelTriangulo1790900000000 implements MigrationInterface {
  name = 'ElTercerLadoDelTriangulo1790900000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS facturas_proveedor (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        empresaid uuid NOT NULL,
        folio varchar(32) NULL,
        proveedorid uuid NOT NULL,
        ordencompraid uuid NULL,
        uuidfiscal varchar(36) NULL,
        folioproveedor varchar(40) NULL,
        fechaemision date NOT NULL,
        fechavencimiento date NULL,
        subtotal numeric(18,2) NOT NULL DEFAULT 0,
        impuestos numeric(18,2) NOT NULL DEFAULT 0,
        total numeric(18,2) NOT NULL DEFAULT 0,
        moneda varchar(3) NOT NULL DEFAULT 'MXN',
        estado varchar(20) NOT NULL DEFAULT 'REGISTRADA',
        resultadocotejojson text NULL,
        fechacotejo TIMESTAMPTZ NULL,
        xml text NULL,
        registradaporid uuid NULL,
        notas varchar(300) NULL,
        fechacreacion TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_facturas_proveedor" PRIMARY KEY (id)
      )
    `);

    /*
     * El UUID del CFDI es la llave real del documento ante el SAT, y capturar
     * dos veces la misma factura es cómo se paga dos veces — un error que sólo
     * se ve conciliando el estado de cuenta del proveedor, meses después.
     *
     * Parcial: hay comprobantes que no son CFDI —un proveedor del extranjero,
     * un recibo simple— y un único corriente dejaría meter sólo uno sin UUID,
     * porque en PostgreSQL dos NULL no son iguales pero el índice sí los
     * admite todos... salvo que se use `WHERE`, que es lo que se quiere: que
     * los nulos convivan y los que tienen UUID no se repitan.
     */
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UX_factura_proveedor_uuid"
         ON facturas_proveedor (empresaid, uuidfiscal)
       WHERE uuidfiscal IS NOT NULL`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IX_facturas_proveedor_orden"
         ON facturas_proveedor (ordencompraid)`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IX_facturas_proveedor_empresa_estado"
         ON facturas_proveedor (empresaid, estado)`,
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS facturas_proveedor_detalle (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        facturaid uuid NOT NULL,
        detalleordenid uuid NULL,
        productoid uuid NULL,
        descripcion varchar(255) NULL,
        cantidad numeric(18,4) NOT NULL DEFAULT 0,
        preciounitario numeric(18,4) NOT NULL DEFAULT 0,
        subtotal numeric(18,2) NOT NULL DEFAULT 0,
        tasaiva numeric(7,4) NOT NULL DEFAULT 0,
        impuesto numeric(18,2) NOT NULL DEFAULT 0,
        CONSTRAINT "PK_facturas_proveedor_detalle" PRIMARY KEY (id),
        CONSTRAINT "FK_factura_proveedor_detalle_factura"
          FOREIGN KEY (facturaid) REFERENCES facturas_proveedor(id) ON DELETE CASCADE
      )
    `);
    /*
     * Por `detalleordenid` entra el cotejo —cuánto se lleva facturado de cada
     * partida, sumando TODAS las facturas de la orden—, y es la consulta que
     * corre en cada captura. Sin índice, cada factura barre la tabla entera.
     */
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IX_factura_proveedor_detalle_factura"
         ON facturas_proveedor_detalle (facturaid)`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IX_factura_proveedor_detalle_orden"
         ON facturas_proveedor_detalle (detalleordenid)`,
    );

    /*
     * Y el pago apunta a la factura que liquida. Nulo en los pagos de antes de
     * hoy, y NULL significa «no se sabe con qué comprobante se pagó», que es
     * exactamente la verdad de esos pagos: se hicieron contra la recepción.
     */
    await q.query(
      `ALTER TABLE pagos_proveedor ADD COLUMN IF NOT EXISTS facturaproveedorid uuid NULL`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IX_pagos_proveedor_factura"
         ON pagos_proveedor (facturaproveedorid)`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "IX_pagos_proveedor_factura"`);
    await q.query(
      `ALTER TABLE pagos_proveedor DROP COLUMN IF EXISTS facturaproveedorid`,
    );
    await q.query(`DROP TABLE IF EXISTS facturas_proveedor_detalle`);
    await q.query(`DROP TABLE IF EXISTS facturas_proveedor`);
  }
}
