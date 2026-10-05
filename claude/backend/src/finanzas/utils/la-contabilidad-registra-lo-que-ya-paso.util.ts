import { BadRequestException } from '@nestjs/common';
import { diaCalendario } from '../../common/utils/fecha-calendario.util';

/*
 * ============================================================================
 * LA CONTABILIDAD REGISTRA LO QUE YA PASÓ
 * ----------------------------------------------------------------------------
 * EL CASO QUE LA PUSO
 *
 * Se registró —y se pagó— la nómina del 1 al 15 de OCTUBRE el 23 de septiembre,
 * con su póliza de devengo fechada 22 días adelante. Para el ERP no pasó nada.
 * El mayor externo lo rechazó en cuanto le llegó el asiento: «The journal entry
 * cannot be made for a future date». Una regla contable que el otro sistema
 * cumple y éste no significa que las dos balanzas van a divergir, y que la que
 * está mal es la nuestra.
 *
 * Lo que un asiento futuro rompe, en orden de gravedad: la balanza de un mes ya
 * cerrado puede cambiar DESPUÉS de cerrarlo —basta que alguien fechara algo
 * adelante—; el gasto se reconoce antes de incurrirse; y la conciliación
 * bancaria busca en el estado de cuenta un movimiento que el banco todavía no
 * hizo.
 *
 * POR QUÉ ESTE ARCHIVO EXISTE
 *
 * La regla estaba escrita en `PolizasService`, y su comentario afirmaba:
 *
 *     «Vive en `aFecha` y no en cada camino de creación a propósito: las
 *      pólizas nacen desde el motor contable, la captura manual, la captura en
 *      transacción, las reversas y el cierre, y todas pasan por aquí.»
 *
 * No era cierto. `MotorContableService` tiene su PROPIO `crearPoliza` —con su
 * transacción, su folio y su verificación de período cerrado— que no llama a
 * `PolizasService` en ningún momento. Y por ahí nacen casi todas: ventas,
 * compras, cobranza, tesorería, depreciación, hospedaje, cierres de caja.
 *
 * Así que la regla cubría la captura manual, que es la minoría, y el comentario
 * afirmaba lo contrario. Un control que se cree puesto es peor que uno que se
 * sabe ausente: nadie lo va a buscar.
 *
 * Ahora vive aquí y la llaman los dos. El comentario de `PolizasService` se
 * corrigió para que diga lo que hay.
 *
 * EL DÍA SE COMPARA CON EL CALENDARIO LOCAL, NO CON UTC
 *
 * En México, a partir de las 18:00, comparar contra UTC declara futuro lo que se
 * está capturando hoy mismo. Es el mismo defecto que ya costó un día entero de
 * atraso en toda la cartera del portal.
 * ============================================================================
 */

/** El último instante del día de hoy, en el calendario local de la empresa. */
function finDelDiaDeHoy(ahora = new Date()): number {
  return new Date(
    ahora.getFullYear(),
    ahora.getMonth(),
    ahora.getDate(),
    23,
    59,
    59,
    999,
  ).getTime();
}

/** `true` cuando la fecha todavía no ha llegado. */
export function esFechaFutura(fecha: Date, ahora = new Date()): boolean {
  return fecha.getTime() > finDelDiaDeHoy(ahora);
}

/**
 * Rechaza una póliza fechada en un día que todavía no llega.
 *
 * `contexto` sale en el mensaje para que quien la reciba sepa qué operación
 * quedó parada: desde el motor contable el error llega a la bandeja de asientos
 * pendientes, y «no se puede registrar una póliza» a secas no dice cuál.
 */
export function exigirQueYaHayaOcurrido(fecha: Date, contexto?: string): void {
  if (!esFechaFutura(fecha)) return;
  throw new BadRequestException(
    `No se puede registrar una póliza con fecha ${diaCalendario(fecha)}, que todavía no llega. ` +
      'La contabilidad registra lo que ya ocurrió.' +
      (contexto ? ` (${contexto})` : ''),
  );
}
