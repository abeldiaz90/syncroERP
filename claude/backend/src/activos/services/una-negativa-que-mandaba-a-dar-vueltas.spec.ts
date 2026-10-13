/**
 * ============================================================================
 * Una negativa que mandaba a dar vueltas
 * ----------------------------------------------------------------------------
 * QUÉ PASABA
 *
 * `revertirCorrida` se niega, con razón, a deshacer una depreciación cuyo mes
 * sigue contabilizado: borrar sólo el auxiliar dejaría el mayor con el cargo
 * puesto y los dos desalineados para siempre. Y además decía qué hacer:
 * «Cancélala primero desde Finanzas → Pólizas y vuelve a intentar».
 *
 * Esa instrucción no se podía seguir. La pantalla de pólizas trae encendida por
 * omisión la casilla «Volver a generar la póliza del documento» —lo correcto
 * para una recepción o una venta, que no pueden quedarse sin contabilidad—, y
 * con ella encendida el asiento vuelve a la cola, el motor rehace la póliza en
 * segundos y esta misma negativa se repite. Quien la siguiera al pie de la
 * letra daba vueltas sin que nada le explicara por qué.
 *
 * Una negativa que nombra un remedio tiene que nombrarlo completo. Si no, es
 * peor que no decir nada: manda a trabajar a un callejón sin salida.
 *
 * QUÉ SE ARREGLÓ
 *
 *  1. El mensaje nombra la casilla y dice qué pasa si se enciende.
 *  2. La pantalla de pólizas enciende la casilla según el origen: apagada para
 *     las de DEPRECIACION, que no nacen de un documento sino de una corrida que
 *     se está deshaciendo (`REGENERAR_ESTORBA`, en la propia pantalla).
 *
 * Esta prueba vigila (1), que es la que vive en el servidor, y de paso que la
 * negativa siga nombrando los folios y diciendo que no se revirtió nada.
 * ============================================================================
 */
import { ConflictException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';

import { ActivosService } from './activos.service';

describe('revertirCorrida · la negativa dice cómo salir de ella', () => {
  /**
   * Monta el servicio con un `dataSource.transaction` que corre de verdad
   * contra repositorios de mentira. Interesa sólo el camino de la negativa.
   */
  function servicio(polizasDelPeriodo: Array<Record<string, unknown>>) {
    // Constructor de consulta encadenable: todo devuelve el mismo objeto.
    const consulta: Record<string, unknown> = {
      getCount: async () => 0, // no hay periodos posteriores
    };
    consulta.where = () => consulta;
    consulta.andWhere = () => consulta;

    const repoDep: Record<string, unknown> = {
      createQueryBuilder: () => consulta,
      find: async () => [{ id: 'dep-1', activoId: 'af-1', importe: 100 }],
      remove: async () => undefined,
    };

    const manager = {
      getRepository: (entidad: { name?: string }) => {
        const nombre = entidad?.name ?? String(entidad);
        if (nombre.includes('Depreciacion')) return repoDep;
        if (nombre.includes('Poliza')) {
          return { find: async () => polizasDelPeriodo };
        }
        return { findOne: async () => null, save: async (x: unknown) => x };
      },
    };

    const s = Object.create(ActivosService.prototype) as Record<string, unknown>;
    s.dataSource = {
      transaction: (fn: (m: unknown) => Promise<unknown>) => fn(manager),
    };
    return s as unknown as ActivosService;
  }

  async function negativa(polizas: Array<Record<string, unknown>>) {
    try {
      await servicio(polizas).revertirCorrida(2026, 8, 'e1');
    } catch (e) {
      if (e instanceof ConflictException) return (e.getResponse() as { message: string }).message;
      throw e;
    }
    throw new Error('se esperaba una negativa y no la hubo');
  }

  it('nombra la casilla que hay que dejar apagada', async () => {
    const msg = await negativa([{ folio: 'DI-2026-00019', estatus: 'VIGENTE' }]);
    expect(msg).toContain('Volver a generar la póliza del documento');
    expect(msg).toMatch(/SIN marcar/);
  });

  it('nombra el folio concreto, no «una póliza»', async () => {
    const msg = await negativa([{ folio: 'DI-2026-00019', estatus: 'VIGENTE' }]);
    expect(msg).toContain('DI-2026-00019');
    expect(msg).toContain('Finanzas → Pólizas');
  });

  it('con varias pólizas vigentes las nombra todas y concuerda en plural', async () => {
    const msg = await negativa([
      { folio: 'DI-2026-00019', estatus: 'VIGENTE' },
      { folio: 'DI-2026-00021', estatus: 'VIGENTE' },
    ]);
    expect(msg).toContain('las pólizas');
    expect(msg).toContain('Cancélalas');
    expect(msg).toContain('DI-2026-00019');
    expect(msg).toContain('DI-2026-00021');
  });

  it('deja claro que no se revirtió nada', async () => {
    const msg = await negativa([{ folio: 'DI-2026-00019', estatus: 'VIGENTE' }]);
    expect(msg).toContain('Ninguna depreciación fue revertida');
  });

  it('una póliza ya cancelada no estorba: la reversión procede', async () => {
    await expect(
      servicio([{ folio: 'DI-2026-00019', estatus: 'CANCELADA' }]).revertirCorrida(2026, 8, 'e1'),
    ).resolves.toEqual({ revertidos: 1, ejercicio: 2026, mes: 8 });
  });

  /*
   * La prueba de la prueba. El mensaje manda a apagar una casilla concreta de
   * una pantalla concreta; si esa pantalla deja de ofrecerla con ese texto, la
   * instrucción vuelve a ser inseguible y nadie se entera.
   */
  it('la pantalla de pólizas sigue teniendo esa casilla, y apagada para DEPRECIACION', () => {
    const pantalla = readFileSync(
      join(__dirname, '../../../../frontend/app/dashboard/finanzas/polizas/page.tsx'),
      'utf8',
    );
    expect(pantalla).toContain('Volver a generar la póliza del documento');
    expect(pantalla).toContain('REGENERAR_ESTORBA');
    expect(pantalla).toMatch(/REGENERAR_ESTORBA[\s\S]{0,400}DEPRECIACION:/);
    expect(pantalla).toContain("setRegenerar(!REGENERAR_ESTORBA[p.origenTipo ?? ''])");
  });
});
