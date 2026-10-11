import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ============================================================================
 * Una cantidad no se redondea al guardarse
 * ----------------------------------------------------------------------------
 * EL DEFECTO
 *
 * El inventario lleva cuatro decimales y los documentos que lo mueven llevaban
 * dos:
 *
 *     stock_por_almacen.cantidad          numeric(18,4)
 *     reservas_inventario.cantidad        numeric(18,4)
 *     detalles_venta.cantidad             numeric(10,2)   ← aquí
 *     detalles_orden_compra.cantidad      numeric(10,2)   ← y aquí
 *
 * El ERP se instala con kilogramo, litro, mililitro y metro entre sus unidades
 * estándar, así que vender 0.125 kg es un caso previsto, no una rareza. Lo que
 * pasaba es que el servicio descontaba 0.125 del almacén —que sí los
 * guarda— y la línea de la venta se guardaba como 0.13, porque PostgreSQL
 * redondea al escribir. La venta y el movimiento de inventario quedaban
 * discrepando en 0.005, en silencio y para siempre; el importe de la línea se
 * había calculado con 0.125 y el papel decía 0.13.
 *
 * Y en la MISMA tabla, `detalles_venta.cantidadDevuelta` ya era numeric(18,4).
 * Se podía devolver con más precisión de la que se vendió: el tope de la
 * devolución compara contra una cantidad redondeada hacia arriba, así que la
 * última devolución de un producto fraccionado podía sacar del almacén un poco
 * más de lo que entró en la venta.
 *
 * LA SEGUNDA MITAD: EL TECHO DE OCHO DÍGITOS
 *
 * `precision: 10` con dos decimales son ocho dígitos enteros: $99,999,999.99
 * es el máximo, y el que lo pase no recibe un número malo sino un error de
 * PostgreSQL en mitad de un guardado. No es el defecto urgente, pero es el
 * mismo ALTER y dejarlo a medias significaba volver a tocar estas tablas.
 *
 * POR QUÉ ES SEGURO
 *
 * Ampliar un `numeric` no pierde datos ni reescribe las filas: PostgreSQL
 * cambia el tipo declarado y lo ya guardado —con sus dos decimales— sigue
 * valiendo lo mismo. Lo que se repara es de aquí en adelante. Las cantidades
 * que YA se redondearon no se pueden recuperar, porque el 0.125 original no
 * está en ninguna parte.
 *
 * El guardián está en `una-cantidad-lleva-cuatro-decimales.spec.ts`, para que
 * la próxima columna de cantidad no nazca con dos.
 * ============================================================================
 */
export class UnaCantidadNoSeRedondeaAlGuardarse1790910000000
  implements MigrationInterface
{
  name = 'UnaCantidadNoSeRedondeaAlGuardarse1790910000000';

  /** tabla → columnas que pasan a numeric(18,4). */
  private static readonly COLUMNAS: Record<string, string[]> = {
    detalles_orden_compra: [
      'cantidad',
      'preciounitario',
      'subtotal',
      'cantidadrecibidaok',
      'cantidadrechazada',
    ],
    detalles_cotizacion: ['cantidad', 'preciounitario', 'subtotal'],
    detalles_requisicion: ['cantidadsolicitada'],
    ordenes_compra: ['total'],
    detalles_venta: [
      'cantidad',
      'preciounitario',
      'descuento',
      'subtotal',
      'impuestomonto',
    ],
    recetas: ['rendimiento'],
    dotaciones_tipo_habitacion: ['cantidad'],
    /*
     * La cantidad mínima de pedido llevaba TRES decimales, que es el caso más
     * traicionero de todos: casi suficiente, y por eso nadie lo mira.
     */
    productos: ['cantidadminimapedido'],
    /*
     * Y los totales de la venta eran numeric(12,4): ocho dígitos enteros,
     * $99,999,999.99 de techo. El mismo techo que el de las órdenes, escrito
     * con otra precisión.
     */
    ventas: [
      'subtotal',
      'descuento',
      'impuestototal',
      'total',
      'montorecibido',
      'cambio',
    ],
  };

  public async up(q: QueryRunner): Promise<void> {
    for (const [tabla, columnas] of Object.entries(
      UnaCantidadNoSeRedondeaAlGuardarse1790910000000.COLUMNAS,
    )) {
      for (const columna of columnas) {
        /*
         * Se comprueba que la tabla y la columna existan antes de tocarlas.
         * Una instalación que no usa hotelería puede no tener
         * `dotaciones_tipo_habitacion`, y una migración que se cae ahí deja a
         * medias las que iban después.
         */
        const [hay] = await q.query(
          `SELECT 1 AS ok
             FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = $1
              AND column_name = $2`,
          [tabla, columna],
        );
        if (!hay) continue;
        await q.query(
          `ALTER TABLE ${tabla} ALTER COLUMN ${columna} TYPE numeric(18,4)`,
        );
      }
    }
  }

  /**
   * La vuelta atrás NO se implementa, y es una decisión, no un olvido.
   *
   * Estrechar un `numeric` sí destruye: cada cantidad con tres o cuatro
   * decimales se redondearía al revertir, y el redondeo no se deshace. Una
   * migración cuyo `down` pierde datos es peor que una sin `down`, porque la
   * primera se ejecuta sin pensar.
   */
  public async down(): Promise<void> {
    throw new Error(
      'UnaCantidadNoSeRedondeaAlGuardarse no se revierte: estrechar las columnas ' +
        'redondearía las cantidades fraccionadas ya guardadas y ese redondeo no se deshace.',
    );
  }
}
