import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ============================================================================
 * El pedido que nadie apuntaba
 * ----------------------------------------------------------------------------
 * El ciclo de compra tiene cuatro documentos. El de venta tenía UNO: la venta,
 * que es de mostrador —cobra, descarga inventario y asienta en el mismo acto—.
 * Todo lo que pasa antes de cobrar no se registraba:
 *
 *   «Apártame diez y paso el viernes»   → nada reservaba esas diez.
 *   «Quiero cincuenta, tienes treinta»  → las veinte faltantes no existían.
 *   «Mándame la mitad ahora»            → dos ventas que nadie relacionaba.
 *
 * Dos tablas nuevas y ninguna columna tocada en las de venta. El apartado se
 * apoya en `reservas_inventario`, que ya existía completa —con su bloqueo y su
 * consumo— y a la que hasta hoy no llegaba ningún camino real del negocio.
 * ============================================================================
 */
export class ElPedidoQueNadieApuntaba1790920000000 implements MigrationInterface {
  name = 'ElPedidoQueNadieApuntaba1790920000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS pedidos_venta (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        empresaid uuid NOT NULL,
        folio varchar(32) NULL,
        clienteid uuid NULL,
        almacenid uuid NULL,
        listaprecioid uuid NULL,
        fechapedido date NOT NULL,
        fechacompromiso date NULL,
        estado varchar(20) NOT NULL DEFAULT 'BORRADOR',
        subtotal numeric(18,4) NOT NULL DEFAULT 0,
        descuento numeric(18,4) NOT NULL DEFAULT 0,
        impuestototal numeric(18,4) NOT NULL DEFAULT 0,
        total numeric(18,4) NOT NULL DEFAULT 0,
        notas varchar(300) NULL,
        motivocancelacion varchar(300) NULL,
        creadoporid uuid NULL,
        fechacreacion TIMESTAMP NOT NULL DEFAULT now(),
        fechaactualizacion TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pedidos_venta" PRIMARY KEY (id)
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IX_pedidos_venta_empresa_estado"
         ON pedidos_venta (empresaid, estado)`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IX_pedidos_venta_empresa_cliente"
         ON pedidos_venta (empresaid, clienteid)`,
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS pedidos_venta_detalle (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        pedidoid uuid NOT NULL,
        productoid uuid NOT NULL,
        cantidad numeric(18,4) NOT NULL,
        cantidadsurtida numeric(18,4) NOT NULL DEFAULT 0,
        cantidadreservada numeric(18,4) NOT NULL DEFAULT 0,
        reservaid uuid NULL,
        preciounitario numeric(18,4) NOT NULL,
        descuento numeric(18,4) NOT NULL DEFAULT 0,
        impuestoporcentaje numeric(7,4) NOT NULL DEFAULT 0,
        impuestomonto numeric(18,4) NOT NULL DEFAULT 0,
        subtotal numeric(18,4) NOT NULL DEFAULT 0,
        CONSTRAINT "PK_pedidos_venta_detalle" PRIMARY KEY (id),
        CONSTRAINT "FK_pedido_venta_detalle_pedido"
          FOREIGN KEY (pedidoid) REFERENCES pedidos_venta(id) ON DELETE CASCADE
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IX_pedidos_venta_detalle_pedido"
         ON pedidos_venta_detalle (pedidoid)`,
    );
    /*
     * El reporte de backorder filtra por lo que falta y no está apartado. Sin
     * este índice barre todos los renglones de todos los pedidos de la
     * historia cada vez que alguien abre la pantalla.
     */
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IX_pedidos_venta_detalle_en_espera"
         ON pedidos_venta_detalle (productoid)
       WHERE (cantidad - cantidadsurtida - cantidadreservada) > 0`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS pedidos_venta_detalle`);
    await q.query(`DROP TABLE IF EXISTS pedidos_venta`);
  }
}
