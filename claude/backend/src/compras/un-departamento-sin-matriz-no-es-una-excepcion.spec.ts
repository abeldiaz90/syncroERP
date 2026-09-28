/**
 * ============================================================================
 * Un departamento sin matriz no es una excepción de monto
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * La ruta de aprobación de una requisición se busca así:
 *
 *     where: { empresaId, proceso: 'REQUISICION', departamentoId: usuario.departamentoId }
 *
 * Exacto, sin alternativa. Y unas líneas más abajo, cuando no queda ningún
 * nivel, el código concluye —con un comentario que lo razona bien— que «el monto
 * quedó por debajo de lo que exige firma» y la requisición nace lista para
 * cotizar.
 *
 * Las dos cosas son correctas por separado y juntas dicen una mentira: cuando el
 * departamento NO TIENE matriz configurada, la lista llega vacía por una razón
 * completamente distinta —nadie la configuró— y el sistema lo lee como «no hace
 * falta firma». Dar de alta un departamento nuevo apaga el control de compras de
 * ese departamento, en silencio y sin que nadie lo decida.
 *
 * Es la familia de siempre: la ausencia de un dato interpretada como una
 * decisión. El mismo error que el `?? []` del espejo contable y que el cero del
 * control de costos.
 *
 * QUÉ SE HIZO
 *
 * Lo que hace cualquier ERP: matriz GLOBAL por omisión, y la departamental como
 * excepción que la sustituye. Si el departamento tiene la suya, manda ella; si
 * no, se aplica la global. Sólo cuando no hay ninguna de las dos se concluye que
 * no hay control configurado, y entonces es verdad.
 * ============================================================================
 */

import { IsNull } from 'typeorm';
import { RequisicionesService } from './services/requisiciones.service';

describe('un departamento sin matriz no es una excepción de monto', () => {
  /** Devuelve lo que se le pida, y apunta con qué se le preguntó. */
  function repo(porDepartamento: unknown[], global: unknown[]) {
    const consultas: Array<Record<string, unknown>> = [];
    return {
      consultas,
      find: (opciones: { where: Record<string, unknown> }) => {
        consultas.push(opciones.where);
        const pidioGlobal =
          opciones.where.departamentoId !== null &&
          typeof opciones.where.departamentoId === 'object';
        return Promise.resolve(pidioGlobal ? global : porDepartamento);
      },
    };
  }

  function servicio(r: ReturnType<typeof repo>) {
    const s = Object.create(RequisicionesService.prototype) as Record<
      string,
      unknown
    >;
    s.configAprobacionRepo = r;
    return s as unknown as RequisicionesService;
  }

  it('usa la matriz del departamento cuando existe', async () => {
    const r = repo([{ orden: 1, rolAprobador: 'gerencia' }], []);
    const niveles = await servicio(r).configuracionesDeRequisicion('e1', 'd1');
    expect(niveles).toHaveLength(1);
    // Y no llegó a preguntar por la global: no hacía falta.
    expect(r.consultas).toHaveLength(1);
    expect(r.consultas[0].departamentoId).toBe('d1');
  });

  it('cae en la global cuando el departamento no tiene la suya', async () => {
    const r = repo([], [{ orden: 1, rolAprobador: 'gerencia' }]);
    const niveles = await servicio(r).configuracionesDeRequisicion('e1', 'd1');
    expect(niveles).toHaveLength(1);
    expect(r.consultas).toHaveLength(2);
    // La segunda pregunta es por la global, y se escribe como IsNull().
    expect(String(r.consultas[1].departamentoId)).toBe(String(IsNull()));
  });

  it('sin departamento pregunta directamente por la global', async () => {
    const r = repo([], [{ orden: 1, rolAprobador: 'gerencia' }]);
    const niveles = await servicio(r).configuracionesDeRequisicion(
      'e1',
      undefined,
    );
    expect(niveles).toHaveLength(1);
    expect(r.consultas).toHaveLength(1);
  });

  it('sin ninguna de las dos, no hay niveles y eso sí es verdad', async () => {
    const r = repo([], []);
    const niveles = await servicio(r).configuracionesDeRequisicion('e1', 'd1');
    expect(niveles).toEqual([]);
  });
});
