/**
 * ============================================================================
 * SyncroERP · Interruptor de tareas programadas
 * ----------------------------------------------------------------------------
 * POR QUÉ EXISTE
 *
 * Los cinco `@Cron` del sistema corren DENTRO del proceso de la API. Con una
 * sola instancia eso está bien; con dos o más, cada réplica ejecuta la misma
 * tarea a la misma hora.
 *
 * De los cinco, sólo `asientos-pendientes` está protegido: reclama cada fila
 * con un compare-and-set (`UPDATE ... WHERE estado = 'PENDIENTE'`), así que dos
 * instancias no pueden procesar el mismo asiento. Los otros cuatro no tienen
 * ninguna protección:
 *
 *   · cobranza-cron         → recalcula la cartera vencida dos veces
 *   · wms-liberar-reservas  → libera reservas dos veces
 *   · auditoria-nocturna    → duplica los cargos automáticos del hotel
 *   · notificaciones-cron   → envía el resumen semanal por duplicado
 *
 * El de hotelería es el más grave: duplica cargos de renta a los folios.
 *
 * CÓMO SE USA EN PRODUCCIÓN
 *
 *   API con varias réplicas   → CRONS_HABILITADOS=false
 *   Un único worker dedicado  → CRONS_HABILITADOS=true
 *
 * Por defecto está en `true` para no cambiar el comportamiento de quien corre
 * una sola instancia, que es el caso habitual hoy.
 * ============================================================================
 */

import { Logger } from '@nestjs/common';

const logger = new Logger('TareasProgramadas');

let anunciado = false;

export function cronsHabilitados(): boolean {
  const valor = (process.env.CRONS_HABILITADOS ?? 'true').trim().toLowerCase();
  const habilitados = valor !== 'false' && valor !== '0' && valor !== 'no';

  if (!anunciado) {
    anunciado = true;
    if (!habilitados) {
      logger.warn(
        'CRONS_HABILITADOS=false — esta instancia no ejecuta tareas programadas. ' +
          'Asegúrate de que exista un worker dedicado que sí las corra.',
      );
    }
  }
  return habilitados;
}

/**
 * Devuelve `true` cuando la tarea debe saltarse. Pensado para usarse como
 * primera línea del método:
 *
 *   if (omitirTareaProgramada('actualizar-cartera-vencida')) return;
 */
export function omitirTareaProgramada(nombre: string): boolean {
  if (cronsHabilitados()) return false;
  logger.debug(`Tarea "${nombre}" omitida: los crons están apagados aquí.`);
  return true;
}
