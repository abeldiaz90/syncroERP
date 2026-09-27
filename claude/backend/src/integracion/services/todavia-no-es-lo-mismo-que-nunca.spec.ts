/**
 * ============================================================================
 * «Todavía no» no es lo mismo que «nunca»
 * ----------------------------------------------------------------------------
 * QUÉ SE MIDIÓ
 *
 * En la cola del espejo contable había tres eventos FALLIDO, los tres con la
 * misma causa:
 *
 *     Fineract respondió 403: The journal entry cannot be made for a future date
 *
 * Son pólizas con fecha posterior a hoy —la nómina fechada el 15 de octubre,
 * corrida en septiembre—. El proveedor hace bien en rechazarlas: no se asienta
 * en un periodo que no ha llegado. Lo que estaba mal es lo que el ERP hacía con
 * ese rechazo: contarlo como fallo, gastar un intento, gastar los que quedaban
 * y dejar el evento en FALLIDO para siempre.
 *
 * El resultado es un rojo permanente en «Pólizas sin espejar» que NADIE puede
 * resolver: no hay nada que corregir, sólo que esperar. Y como el control del
 * cierre mensual mira esa cola, un pendiente imposible bloqueaba el cierre —el
 * mismo daño que ya costó una vez con los eventos sin destino, y por el mismo
 * motivo: meter en el cajón de los errores algo que no es un error.
 *
 * QUÉ SE HIZO
 *
 * Un tercer desenlace, junto a «enviado» y «fallido»: APLAZADO. El evento se
 * queda REINTENTABLE, con `proximoIntento` puesto en el futuro y —esto es lo
 * importante— SIN gastar un intento, porque un contador de intentos que avanza
 * con el tiempo acaba agotándose por esperar. Reintenta cada día y el día que
 * la fecha llega, entra solo.
 *
 * No hace falta leer la fecha de la póliza para saber cuándo reintentar: la
 * condición se resuelve por sí sola con el calendario, así que basta volver
 * mañana. Menos que saber es aquí más simple y no puede equivocarse.
 * ============================================================================
 */

import { EstadoEventoIntegracion } from '../integracion.constants';
import {
  esRechazoPorFechaFutura,
  proximoAmanecer,
} from '../utils/aplazamiento.util';
import { IntegracionOutboxService } from './integracion-outbox.service';

describe('«todavía no» no es lo mismo que «nunca»', () => {
  describe('reconocer el rechazo', () => {
    it('reconoce el rechazo de Fineract tal como llega', () => {
      expect(
        esRechazoPorFechaFutura(
          'Fineract respondió 403: The journal entry cannot be made for a future date',
        ),
      ).toBe(true);
    });

    it('no confunde otros rechazos con éste', () => {
      for (const otro of [
        'Fineract respondió 403: No autorizado',
        'Fineract respondió 500: Internal error',
        'La cuenta 105.01 no está mapeada',
        'connect ECONNREFUSED',
        '',
      ]) {
        expect(esRechazoPorFechaFutura(otro)).toBe(false);
      }
    });

    it('no se rompe con un error que no es texto', () => {
      expect(esRechazoPorFechaFutura(undefined)).toBe(false);
      expect(esRechazoPorFechaFutura(null)).toBe(false);
    });
  });

  describe('cuándo volver', () => {
    it('vuelve el día siguiente, pasada la medianoche local', () => {
      const ahora = new Date('2026-09-27T15:30:00');
      const cuando = proximoAmanecer(ahora);
      expect(cuando.getDate()).toBe(28);
      expect(cuando.getMonth()).toBe(8);
      expect(cuando.getFullYear()).toBe(2026);
      // Pasada la medianoche, no EN la medianoche: un reintento clavado en
      // 00:00 corre contra el cambio de día del propio servidor.
      expect(cuando.getHours()).toBe(0);
      expect(cuando.getMinutes()).toBeGreaterThan(0);
    });

    it('cruza el fin de mes sin inventar un día 32', () => {
      const cuando = proximoAmanecer(new Date('2026-09-30T23:50:00'));
      expect(cuando.getMonth()).toBe(9); // octubre
      expect(cuando.getDate()).toBe(1);
    });
  });

  describe('aplazar no gasta intentos', () => {
    function servicio() {
      const guardadas: Array<{ id: string; campos: Record<string, unknown> }> =
        [];
      const repo = {
        update: (id: string, campos: Record<string, unknown>) => {
          guardadas.push({ id, campos });
          return Promise.resolve();
        },
      };
      const s = new IntegracionOutboxService(repo as never);
      return { s, guardadas };
    }

    it('deja el evento reintentable, con fecha, y con los intentos intactos', async () => {
      const { s, guardadas } = servicio();
      await s.marcarAplazado(
        { id: 'e9', tipo: 'POLIZA_REGISTRADA', intentos: 2 } as never,
        'La fecha de la póliza todavía no ha llegado.',
        new Date('2026-09-28T00:05:00'),
      );

      expect(guardadas).toHaveLength(1);
      const campos = guardadas[0].campos;
      expect(campos.estado).toBe(EstadoEventoIntegracion.REINTENTABLE);
      expect(campos.proximoIntento).toEqual(new Date('2026-09-28T00:05:00'));
      /*
       * Lo que de verdad importa: `intentos` NO se toca. Si se incrementara,
       * una póliza fechada a tres semanas agotaría el máximo esperando y
       * acabaría FALLIDO igual, sólo más tarde y con peor explicación.
       */
      expect(campos).not.toHaveProperty('intentos');
      expect(String(campos.ultimoError)).toMatch(/todavía no ha llegado/);
    });
  });
});
