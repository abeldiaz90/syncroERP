import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { ProductoUbicacion } from '../entities/producto-ubicacion.entity';
import {
  EstadoStockUbicacion,
  StockUbicacion,
} from '../entities/stock-ubicacion.entity';
import {
  EstadoUbicacionAlmacen,
  UbicacionAlmacen,
} from '../entities/ubicacion-almacen.entity';
import { buscarUbicacionDeRecepcion } from './ubicacion-de-recepcion';

/**
 * ============================================================================
 * Una entrada cae en una posición
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ, Y POR QUÉ ESTO VIVE APARTE
 *
 * El 8 de octubre se cerró que **toda entrada caiga en una posición** —la
 * elegida, o el andén de recepción del almacén—. El arreglo se escribió dentro
 * de `InventarioService.registrarCompra`, que entonces era el único sitio por
 * el que subía la existencia.
 *
 * No lo era. La **devolución de venta** devuelve mercancía por su cuenta:
 * escribe el lote, escribe el movimiento y sincroniza el resumen del almacén,
 * porque necesita recuperar el costo ORIGINAL de cada salida y `registrarCompra`
 * calcularía un promedio nuevo. Nunca tocó `stock_ubicaciones`.
 *
 * Medido en vivo el 12 de octubre, dos veces:
 *
 *   · FER-CAB-12 — kardex y resumen 2000, posiciones 1999, después de la
 *     devolución DEV-2 de ese mismo día.
 *   · FER-CAS-SEG — resumen 99, posiciones 98. El kardex dice de dónde sale:
 *     «6/10 ENTRADA +1 · Devolución DEV-1». La pieza que llevaba seis días sin
 *     explicación no la movió nadie a mano: la metió una devolución.
 *
 * Y ese hueco **se cobra en otro módulo**: el apartado de un pedido de venta
 * mira el resumen del almacén y la salida se sirve de las posiciones, así que
 * el pedido promete una pieza que la salida no encuentra y el surtido se niega
 * con «Stock insuficiente no reservado», con el cliente delante.
 *
 * Es el patrón de la casa: **la pieza buena existe y el camino real no la usa.**
 *
 * Por eso esto no se copia dentro de la devolución, se SACA aquí: una sola
 * implementación de «una entrada cae en una posición», que usan la recepción y
 * la devolución. La próxima vía que suba existencia tiene dónde llamar, y el
 * día que cambien las reglas de capacidad o de estado, cambian una vez.
 *
 * ── LAS DOS MITADES, Y POR QUÉ SON DOS ─────────────────────────────────────
 *
 * `resolverPosicionDeEntrada` comprueba y no escribe; `sumarEnPosicion`
 * escribe. Van separadas porque quien recibe mercancía valida ANTES de tocar el
 * lote —si la posición está llena, la operación se cae antes de mover nada— y
 * escribe DESPUÉS, cuando ya sabe en qué lote quedó. Fundirlas en una sola
 * llamada movería la validación detrás del movimiento del lote; dentro de una
 * transacción daría igual al final, pero el orden de los mensajes de error
 * dejaría de contar lo que pasó.
 * ============================================================================
 */

export interface DondeCaeLaEntrada {
  empresaId: string;
  productoId: string;
  almacenId: string;
  /** La que eligió una persona. Sin ella se busca el andén de recepción. */
  ubicacionId?: string | null;
  /** Lo que va a entrar, para comprobar la capacidad. */
  cantidad: number;
}

/**
 * Qué posición recibe esta entrada, ya comprobada: existe, está activa, es del
 * almacén, admite recepciones y le cabe. Devuelve `null` cuando el almacén no
 * tiene andén de recepción y nadie eligió posición.
 *
 * **No rechazar en ese caso es deliberado** y está contado en
 * `ubicacion-de-recepcion.ts`: un control que impide trabajar el primer día se
 * acaba desactivando, y entonces no protege de nada. La mercancía entra sin
 * ubicar —como antes— y el diagnóstico de integridad la nombra.
 */
export async function resolverPosicionDeEntrada(
  em: EntityManager,
  datos: DondeCaeLaEntrada,
): Promise<UbicacionAlmacen | null> {
  const { empresaId, productoId, almacenId, cantidad } = datos;
  const elegida =
    datos.ubicacionId ??
    (await buscarUbicacionDeRecepcion(em, empresaId, almacenId))?.id;
  if (!elegida) return null;

  const ubicacion = await em.findOne(UbicacionAlmacen, {
    where: { id: elegida, almacenId, empresaId, activo: true },
  });
  if (!ubicacion) {
    throw new BadRequestException(
      'La ubicación no existe, está inactiva o no pertenece al almacén seleccionado.',
    );
  }
  if (
    [EstadoUbicacionAlmacen.BLOQUEADA, EstadoUbicacionAlmacen.EMBARQUE].includes(
      ubicacion.estado,
    )
  ) {
    throw new BadRequestException(
      `La ubicación ${ubicacion.codigo} no admite recepciones en estado ${ubicacion.estado}.`,
    );
  }

  /*
   * La asignación producto–posición se crea si falta. No es un permiso que
   * alguien conceda: es el dato de slotting que dice «este artículo se guarda
   * en N-01-01». Lo que impide guardar ahí es el ESTADO de la posición y su
   * CAPACIDAD, que se comprueban arriba y abajo de estas líneas. Es lo que
   * hacen SAP EWM, Business Central y Odoo con un putaway a una posición que
   * el operario elige.
   */
  let asignacion = await em.findOne(ProductoUbicacion, {
    where: { empresaId, productoId, almacenId, ubicacionId: elegida, activo: true },
  });
  if (!asignacion) {
    const previa = await em.findOne(ProductoUbicacion, {
      where: { empresaId, productoId, almacenId, ubicacionId: elegida },
    });
    if (previa) {
      previa.activo = true;
      asignacion = await em.save(previa);
    } else {
      asignacion = await em.save(
        em.create(ProductoUbicacion, {
          empresaId,
          productoId,
          almacenId,
          ubicacionId: elegida,
          esPrincipal: false,
          activo: true,
          observaciones:
            'Creada automáticamente al recibir mercancía en esta posición.',
        }),
      );
    }
  }

  const ocupado = await em
    .createQueryBuilder(StockUbicacion, 'su')
    .select('COALESCE(SUM(su.cantidad),0)', 'total')
    .where('su.empresaId=:empresaId AND su.ubicacionId=:ubicacionId', {
      empresaId,
      ubicacionId: elegida,
    })
    .getRawOne();
  const capacidad = Number(
    ubicacion.capacidadMaxima ?? asignacion.capacidadAsignada ?? 0,
  );
  if (capacidad > 0 && Number(ocupado?.total ?? 0) + cantidad > capacidad) {
    throw new BadRequestException(
      `La ubicación ${ubicacion.codigo} excedería su capacidad (${capacidad}).`,
    );
  }

  return ubicacion;
}

/** Suma la cantidad en la posición, para ese lote y en estado disponible. */
export async function sumarEnPosicion(
  em: EntityManager,
  datos: {
    empresaId: string;
    productoId: string;
    almacenId: string;
    ubicacionId: string;
    loteId: string;
    cantidad: number;
  },
): Promise<void> {
  const { empresaId, productoId, almacenId, ubicacionId, loteId, cantidad } =
    datos;
  let fila = await em.findOne(StockUbicacion, {
    where: {
      empresaId,
      productoId,
      almacenId,
      ubicacionId,
      loteId,
      estado: EstadoStockUbicacion.DISPONIBLE,
    },
  });
  if (!fila) {
    fila = em.create(StockUbicacion, {
      empresaId,
      productoId,
      almacenId,
      ubicacionId,
      loteId,
      estado: EstadoStockUbicacion.DISPONIBLE,
      cantidad: 0,
    });
  }
  fila.cantidad = Number(fila.cantidad ?? 0) + cantidad;
  await em.save(fila);
}
