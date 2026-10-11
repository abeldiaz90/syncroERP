/**
 * ============================================================================
 * EL COTEJO DE TRES VÍAS
 * ----------------------------------------------------------------------------
 * Tres cifras por renglón, y las tres tienen que decir lo mismo:
 *
 *     lo que PEDÍ      (la orden)      ¿me cobran lo que pedí?
 *     lo que LLEGÓ     (la recepción)  ¿me cobran lo que llegó?
 *     lo que me COBRAN (la factura)    ¿al precio que acordamos?
 *
 * Es lo que hacen SAP, Dynamics y Odoo antes de autorizar un pago, y la razón
 * es sencilla: dos de las tres se pueden falsificar por separado sin que nadie
 * lo note, y las tres a la vez no.
 *
 * ── POR QUÉ EN EL RENGLÓN Y NO EN EL TOTAL ────────────────────────────────
 *
 * Porque el total puede cuadrar con una partida de más y otra de menos. El
 * caso real que esto caza —y que un cotejo por totales deja pasar— es el
 * proveedor que factura la cantidad correcta a un precio más alto en la
 * partida cara y compensa bajándolo en la barata.
 *
 * ── LAS TOLERANCIAS, Y POR QUÉ SON CONSTANTES Y NO CONFIGURACIÓN ──────────
 *
 * Una tolerancia que cada empresa ajusta es una decisión que nadie ha tomado
 * todavía, y un campo de configuración sin dueño acaba en el valor que traía
 * de fábrica o en uno puesto para que deje de molestar. Mientras no haya esa
 * decisión, el número vive aquí, con su razón escrita y en un solo sitio:
 *
 *  · CANTIDAD — cero tolerancia por encima de lo recibido. No es una cifra
 *    discutible: facturar más piezas de las que llegaron no es un redondeo.
 *    El épsilon de 0.0001 es sólo contra el error de coma flotante.
 *
 *  · PRECIO — el mayor de 1 peso o 0.5%. Un centavo de diferencia por partida
 *    es redondeo del proveedor y frenar un pago por eso convierte el control
 *    en un trámite que alguien acabará saltándose; medio punto es ya una
 *    diferencia de criterio que vale la pena mirar.
 * ============================================================================
 */

/** Contra el error de coma flotante, no contra el proveedor. */
export const EPSILON_CANTIDAD = 0.0001;
export const TOLERANCIA_PRECIO_ABSOLUTA = 1;
export const TOLERANCIA_PRECIO_RELATIVA = 0.005;

export type TipoDiferencia =
  | 'FACTURA_MAS_DE_LO_RECIBIDO'
  | 'FACTURA_MAS_DE_LO_ORDENADO'
  | 'PRECIO_DISTINTO_AL_PACTADO'
  | 'PARTIDA_QUE_NO_ESTA_EN_LA_ORDEN';

export interface RenglonCotejo {
  detalleOrdenId: string | null;
  descripcion: string | null;
  ordenado: number;
  recibido: number;
  facturado: number;
  precioPactado: number;
  precioFacturado: number;
  diferencias: Array<{ tipo: TipoDiferencia; detalle: string }>;
}

export interface ResultadoCotejo {
  conciliado: boolean;
  renglones: RenglonCotejo[];
  /** Un resumen que se pueda leer sin abrir el detalle. */
  resumen: string;
}

const redondear = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export function precioFueraDeTolerancia(
  pactado: number,
  facturado: number,
): boolean {
  const diferencia = Math.abs(Number(facturado) - Number(pactado));
  const permitido = Math.max(
    TOLERANCIA_PRECIO_ABSOLUTA,
    Math.abs(Number(pactado)) * TOLERANCIA_PRECIO_RELATIVA,
  );
  return diferencia > permitido;
}

/**
 * Coteja una factura contra su orden y sus recepciones.
 *
 * `facturadoPrevio` es lo que YA facturaron otras facturas de la misma orden:
 * sin él, dos facturas por la mitad de la orden cada una pasarían las dos, y
 * juntas cobrarían el doble. Es el mismo razonamiento que el tope de las
 * devoluciones, que mira lo ya devuelto y no sólo esta devolución.
 */
export function cotejarTresVias(entrada: {
  partidasDeLaOrden: Array<{
    id: string;
    descripcion: string | null;
    cantidad: number;
    cantidadRecibidaOk: number;
    precioUnitario: number;
  }>;
  lineasDeLaFactura: Array<{
    detalleOrdenId: string | null;
    descripcion: string | null;
    cantidad: number;
    precioUnitario: number;
  }>;
  facturadoPrevio: Map<string, number>;
}): ResultadoCotejo {
  const porId = new Map(entrada.partidasDeLaOrden.map((p) => [p.id, p]));
  const renglones: RenglonCotejo[] = [];

  for (const linea of entrada.lineasDeLaFactura) {
    const partida = linea.detalleOrdenId ? porId.get(linea.detalleOrdenId) : undefined;
    const diferencias: RenglonCotejo['diferencias'] = [];

    if (!partida) {
      /*
       * Una línea que no apunta a ninguna partida de la orden. No es un error
       * de captura necesariamente —puede ser un flete o un cargo que el
       * proveedor añadió—, pero sí es algo que nadie pidió, y eso se mira
       * antes de pagarlo.
       */
      renglones.push({
        detalleOrdenId: linea.detalleOrdenId,
        descripcion: linea.descripcion,
        ordenado: 0,
        recibido: 0,
        facturado: Number(linea.cantidad),
        precioPactado: 0,
        precioFacturado: Number(linea.precioUnitario),
        diferencias: [
          {
            tipo: 'PARTIDA_QUE_NO_ESTA_EN_LA_ORDEN',
            detalle:
              `«${linea.descripcion ?? 'sin descripción'}» no corresponde a ninguna partida de la orden. ` +
              'Puede ser un flete o un cargo añadido: nadie lo pidió, así que alguien tiene que verlo antes de pagarlo.',
          },
        ],
      });
      continue;
    }

    const previo = entrada.facturadoPrevio.get(partida.id) ?? 0;
    const facturadoAcumulado = redondear(previo + Number(linea.cantidad));
    const recibido = Number(partida.cantidadRecibidaOk ?? 0);
    const ordenado = Number(partida.cantidad);

    if (facturadoAcumulado > recibido + EPSILON_CANTIDAD) {
      diferencias.push({
        tipo: 'FACTURA_MAS_DE_LO_RECIBIDO',
        detalle:
          `Facturan ${facturadoAcumulado} y en el almacén entraron ${recibido}. ` +
          (previo > 0 ? `(${previo} ya venían facturadas en otra factura de esta orden.) ` : '') +
          'Pagar esto es pagar mercancía que no está.',
      });
    }
    if (facturadoAcumulado > ordenado + EPSILON_CANTIDAD) {
      diferencias.push({
        tipo: 'FACTURA_MAS_DE_LO_ORDENADO',
        detalle: `Facturan ${facturadoAcumulado} y se pidieron ${ordenado}.`,
      });
    }
    if (precioFueraDeTolerancia(partida.precioUnitario, linea.precioUnitario)) {
      diferencias.push({
        tipo: 'PRECIO_DISTINTO_AL_PACTADO',
        detalle:
          `Facturan a ${Number(linea.precioUnitario).toFixed(2)} y lo pactado fue ` +
          `${Number(partida.precioUnitario).toFixed(2)}.`,
      });
    }

    renglones.push({
      detalleOrdenId: partida.id,
      descripcion: linea.descripcion ?? partida.descripcion,
      ordenado,
      recibido,
      facturado: facturadoAcumulado,
      precioPactado: Number(partida.precioUnitario),
      precioFacturado: Number(linea.precioUnitario),
      diferencias,
    });
  }

  const conDiferencias = renglones.filter((r) => r.diferencias.length);
  return {
    conciliado: conDiferencias.length === 0,
    renglones,
    resumen: conDiferencias.length
      ? `${conDiferencias.length} de ${renglones.length} partida(s) no coinciden con la orden o con lo recibido.`
      : `Las ${renglones.length} partida(s) coinciden con lo pedido, lo recibido y el precio pactado.`,
  };
}
