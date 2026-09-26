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
  it('no reinicia la numeración en 1: falla', async () => {
    const { svc } = servicioConBaseRota();

    await expect(
      (svc as any).generarFolio('emp-1', 'INGRESO'),
    ).rejects.toThrow(/podría repetir uno existente/i);
  });
});
