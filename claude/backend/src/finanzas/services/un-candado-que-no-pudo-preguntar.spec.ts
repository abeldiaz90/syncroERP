/**
 * ============================================================================
 * Un candado que no pudo preguntar no dice «abierto»
 * ----------------------------------------------------------------------------
 * `periodoEstaCerrado` remataba su consulta con `.catch(() => [])`, así que
 * cuando la consulta fallaba —por lo que fuera— la respuesta a «¿está cerrado
 * este período?» era **no**. El único control que impide escribir en un mes ya
 * cerrado se volvía permisivo justo en el momento en que dejaba de funcionar.
 *
 * Es el mismo error contra el que avisa el comentario del cierre contable —«un
 * dato que no se pudo leer no vale cero»— cometido en el candado que protege lo
 * que ese cierre acaba de firmar. Y no deja rastro: la póliza entra, un mes ya
 * cerrado cambia después de cerrarse, y la balanza que alguien certificó deja
 * de ser la que es.
 *
 * Lo mismo con la numeración: un `.catch(() => [null])` reiniciaba el folio en
 * 1, y un folio contable repetido es una póliza que tapa a otra en cualquier
 * reporte que agrupe por folio.
 *
 * Entre no poder comprobar y dejar pasar, un candado elige lo primero.
 * ============================================================================
 */

import { ConflictException } from '@nestjs/common';
import { PolizasService } from './polizas.service';

function servicioConBaseRota(mensaje = 'connection terminated') {
  const dataSource = {
    query: jest.fn(async () => {
      throw new Error(mensaje);
    }),
  };
  const svc = new PolizasService(dataSource as any);
  return { svc, dataSource };
}

describe('El período cerrado, cuando la base no contesta', () => {
  it('no contesta «abierto»: falla y lo dice', async () => {
    const { svc } = servicioConBaseRota();

    await expect(
      (svc as any).periodoEstaCerrado('emp-1', '2026-08-15'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('el mensaje explica por qué no se hizo la operación', async () => {
    /*
     * Quien lo lee está capturando una póliza. «Error de base de datos» lo deja
     * reintentando; saber que el candado no pudo comprobarse, no.
     */
    const { svc } = servicioConBaseRota();

    await expect(
      (svc as any).periodoEstaCerrado('emp-1', '2026-08-15'),
    ).rejects.toThrow(/no comprobarlo equivale a permitirlo/i);
  });

  it('nombra el período que no pudo comprobar', async () => {
    const { svc } = servicioConBaseRota();

    await expect(
      (svc as any).periodoEstaCerrado('emp-1', '2026-08-15'),
    ).rejects.toThrow(/8\/2026/);
  });

  it('conserva el detalle técnico para quien tenga que arreglarlo', async () => {
    const { svc } = servicioConBaseRota('connection terminated unexpectedly');

    await expect(
      (svc as any).periodoEstaCerrado('emp-1', '2026-08-15'),
    ).rejects.toThrow(/connection terminated unexpectedly/);
  });
});

describe('El folio siguiente, cuando la base no contesta', () => {
  /*
   * `generarFolio` recibe desde el 10-oct el EJECUTOR de la transacción y el
   * AÑO de la póliza: antes leía por `this.dataSource` —fuera de la
   * transacción que estaba creando la póliza— y tomaba el año del reloj del
   * servidor. El doble es el mismo de siempre; lo que cambia es por dónde
   * entra.
   */
  /** El candado responde; lo que se rompe es la lectura del último folio. */
  function ejecutorConLecturaRota() {
    const query = jest.fn(async (sql: string, _params?: unknown[]) => {
      if (/pg_advisory_xact_lock/.test(sql)) return [{ resultado: 0 }];
      throw new Error('connection terminated');
    });
    return { query };
  }

  it('no reinicia la numeración en 1: falla', async () => {
    const svc = Object.create(PolizasService.prototype);
    const ejecutor = ejecutorConLecturaRota();

    await expect(
      (svc as any).generarFolio(ejecutor, 'emp-1', 'INGRESO', 2026),
    ).rejects.toThrow(/podría repetir uno existente/i);
  });

  it('y el candado del folio se pide antes de leer nada', async () => {
    /*
     * Si el último folio se leyera antes de reservar, dos capturas simultáneas
     * nacerían con el mismo número aunque la base funcionara perfectamente.
     */
    const svc = Object.create(PolizasService.prototype);
    const ejecutor = ejecutorConLecturaRota();
    await expect(
      (svc as any).generarFolio(ejecutor, 'emp-1', 'INGRESO', 2026),
    ).rejects.toThrow();
    expect(ejecutor.query.mock.calls[0][0]).toMatch(/pg_advisory_xact_lock/);
    expect(ejecutor.query.mock.calls[0][1]).toEqual(['FOLIO_POLIZA:emp-1:IN:2026']);
  });
});
