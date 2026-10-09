import { EntityManager } from 'typeorm';

import {
  EstadoUbicacionAlmacen,
  UbicacionAlmacen,
} from '../entities/ubicacion-almacen.entity';

/**
 * ============================================================================
 * La posicion de recepcion de un almacen
 * ----------------------------------------------------------------------------
 * EL PROBLEMA
 *
 * `registrarCompra` es el unico sitio por el que sube la existencia, y se
 * llama desde ocho lugares. Cuatro pasan ubicacion y cuatro no: la importacion
 * de stock inicial lee un Excel, el alta de producto captura una cantidad, la
 * transferencia por la via vieja no conoce el WMS, y la reversion de consumo
 * de receta devuelve lo que se consumio —y el consumo tampoco dijo de donde
 * salia—. Ninguna de esas cuatro pasa por una pantalla donde alguien elija una
 * posicion, asi que **no tienen de donde sacar el dato**.
 *
 * Resultado medido: ABA-CAF-1KG con 124 en el almacen y 119 localizados. Cinco
 * kilos que existen y no estan en ningun sitio.
 *
 * COMO LO RESUELVEN LOS ERP MODERNOS
 *
 * Odoo crea las ubicaciones con el almacen, y al activar la recepcion en dos
 * pasos crea el `WH/Input` por su cuenta: no existe el momento en que el
 * almacen maneje posiciones y le falte la de entrada. Dynamics guarda una
 * `default receipt location` por almacen y valida en la CONFIGURACION —no deja
 * guardar un almacen cuya ubicacion de recepcion sea invalida—. NetSuite
 * SUGIERE la posicion al recibir y tiene area de preparacion: recibir no se
 * bloquea por no saber donde poner la mercancia.
 *
 * Los tres coinciden en lo mismo: **la posicion de recepcion no se configura,
 * nace con el almacen**, y lo que se valida al configurar no se vuelve a
 * validar al trabajar.
 *
 * LA DECISION
 *
 * Por eso aqui no se elige entre rechazar la entrada y dejarla sin ubicar: se
 * hace que el estado «almacen con posiciones y sin recepcion» no exista.
 *
 *   1. Cuando un almacen estrena posiciones —al crear la primera— se le crea
 *      la de recepcion. En este modelo no hay interruptor de «maneja
 *      posiciones»: un almacen las maneja cuando tiene alguna, asi que ese es
 *      el momento equivalente al `WH/Input` de Odoo.
 *   2. Al arrancar se repone en los almacenes que ya tenian posiciones. Sin
 *      esto solo quedarian bien los almacenes nuevos.
 *   3. La de recepcion no se puede apagar ni cambiar de estado mientras el
 *      almacen tenga posiciones (la validacion de Dynamics, en su sitio).
 *   4. Y la entrada NO se rechaza nunca. Si pese a todo falta, la mercancia
 *      entra igual y el diagnostico de integridad nombra la causa: un control
 *      que impide trabajar el primer dia se acaba desactivando, y entonces no
 *      protege de nada.
 *
 * El punto 4 es la red que no deberia activarse. Si salta, lo que avisa es que
 * algo se salto los tres de arriba.
 * ============================================================================
 */

/** El codigo reservado. Mayusculas, como todo codigo de ubicacion. */
export const CODIGO_UBICACION_RECEPCION = 'RECEPCION';

/** Cuantas posiciones tiene el almacen. Cero significa que no las maneja. */
export async function cuantasPosicionesTiene(
  em: EntityManager,
  empresaId: string,
  almacenId: string,
): Promise<number> {
  return em.count(UbicacionAlmacen, {
    where: { empresaId, almacenId, activo: true },
  });
}

/** La posicion de recepcion del almacen, si la tiene. */
export async function buscarUbicacionDeRecepcion(
  em: EntityManager,
  empresaId: string,
  almacenId: string,
): Promise<UbicacionAlmacen | null> {
  return em.findOne(UbicacionAlmacen, {
    where: {
      empresaId,
      almacenId,
      estado: EstadoUbicacionAlmacen.RECEPCION,
      activo: true,
    },
  });
}

/**
 * Crea la posicion de recepcion si el almacen no la tiene. Devuelve la que
 * queda, o `null` si el almacen no maneja posiciones —ahi no hay nada que
 * ubicar y crear una posicion seria inventarle un WMS a quien no lo usa—.
 *
 * Es idempotente a proposito: la llaman el alta de ubicacion, el arranque y la
 * entrada de mercancia, y las tres tienen que poder llamarla sin mirar antes.
 */
export async function asegurarUbicacionDeRecepcion(
  em: EntityManager,
  empresaId: string,
  almacenId: string,
): Promise<UbicacionAlmacen | null> {
  const yaEsta = await buscarUbicacionDeRecepcion(em, empresaId, almacenId);
  if (yaEsta) return yaEsta;

  if ((await cuantasPosicionesTiene(em, empresaId, almacenId)) === 0) {
    return null;
  }

  /*
   * Puede existir con el codigo reservado pero apagada o en otro estado —si
   * alguien la edito antes de que esto existiera—. Se reutiliza en vez de
   * chocar contra la unicidad del codigo.
   */
  const porCodigo = await em.findOne(UbicacionAlmacen, {
    where: { empresaId, almacenId, codigo: CODIGO_UBICACION_RECEPCION },
  });
  if (porCodigo) {
    porCodigo.estado = EstadoUbicacionAlmacen.RECEPCION;
    porCodigo.activo = true;
    return em.save(porCodigo);
  }

  return em.save(
    em.create(UbicacionAlmacen, {
      empresaId,
      almacenId,
      codigo: CODIGO_UBICACION_RECEPCION,
      zona: 'RECEPCION',
      estado: EstadoUbicacionAlmacen.RECEPCION,
      descripcion:
        'Anden de recepcion. Aqui cae la mercancia que entra sin posicion ' +
        'indicada; el almacenista la reubica desde Almacenes -> Reubicar.',
      activo: true,
    }),
  );
}
