import { BadRequestException, ConflictException } from '@nestjs/common';

import { CotizacionesService } from './cotizaciones.service';

/**
 * ============================================================================
 * Dos adjudicaciones compitiendo por la misma requisición
 * ----------------------------------------------------------------------------
 * MEDIDO EL 28-SEP-2026, por pantalla, con la sesión de `comprador`
 *
 * Sobre la requisición REQ-0C5BE1A8 —6 cajas de guantes— se capturaron dos
 * propuestas: Proveedor B a $990.00 y Proveedor A a $1,080.00. La pantalla las
 * comparó bien, marcó la de B como «oferta más competitiva», y al enviar la de
 * A —la cara— exigió por escrito el motivo, que es exactamente lo que debe
 * hacer.
 *
 * Y después dejó enviar TAMBIÉN la de B. Las dos quedaron «En espera de
 * aprobación», al mismo tiempo, por la misma requisición, a proveedores
 * distintos y por importes distintos.
 *
 * Lo que eso deja en la bandeja del firmante son dos solicitudes para comprar
 * una sola cosa. Si firma las dos —y nada se lo impide, porque son documentos
 * distintos— salen dos órdenes de compra de 6 cajas cada una: se compra el
 * doble y se le debe a dos proveedores. Si firma una, la otra se queda
 * esperando una firma que ya no significa nada, que es el pendiente que este
 * proyecto ya tuvo que barrer una vez («se descartaron N cotizaciones que
 * seguían esperando firma en requisiciones ya adjudicadas»).
 *
 * El servicio SÍ sabía de hermanas: al adjudicar descarta las que quedaron
 * esperando. El hueco estaba un paso antes —al SOLICITAR no miraba a nadie más
 * que a sí misma—, así que el conflicto se creaba y se limpiaba después, en vez
 * de no crearse.
 *
 * LA REGLA: una requisición tiene una adjudicación en curso, o ninguna. La
 * segunda no se encola: se rechaza diciendo cuál está en curso y de quién es,
 * porque la salida ya existe y está en la misma pantalla —«Retirar solicitud»—.
 * ============================================================================
 */

function servicioCon(hermanas: any[], cotizacion: any) {
  const cotizacionRepo: any = {
    findOne: jest.fn(async () => null),
    find: jest.fn(async () => hermanas),
    save: jest.fn(async (v: any) => v),
    createQueryBuilder: jest.fn(() => ({
      update: () => ({ set: () => ({ where: () => ({ andWhere: () => ({ execute: async () => ({ affected: 0 }) }) }) }) }),
    })),
  };
  const servicio: any = Object.create(CotizacionesService.prototype);
  servicio.cotizacionRepo = cotizacionRepo;
  servicio.ordenRepo = { findOne: jest.fn(async () => null) };
  /*
   * Desde el 10-oct la matriz se elige por `proceso` + `departamentoId` —antes
   * se filtraba sólo por proceso y salían los niveles de dos matrices a la
   * vez—, así que el servicio lee las configuraciones con `find` y pregunta
   * por el departamento de quien solicita. Para esta prueba no hay ninguna
   * matriz: lo que se mide aquí es la regla de las hermanas, y la ruta
   * ausente es lo que hace que la llamada termine donde termina.
   */
  servicio.configuracionRepo = {
    find: jest.fn(async () => []),
    createQueryBuilder: jest.fn(() => ({
      where: () => ({
        andWhere: () => ({ orderBy: () => ({ getMany: async () => [] }) }),
      }),
    })),
  };
  servicio.dataSource = {
    getRepository: jest.fn(() => ({
      findOne: jest.fn(async () => ({ id: 'usr-1', empresaId: 'emp-1', departamentoId: null })),
      find: jest.fn(async () => []),
    })),
  };
  servicio.obtenerPorId = jest.fn(async () => cotizacion);
  servicio.validarProveedorOperable = jest.fn();
  return { servicio: servicio as CotizacionesService, cotizacionRepo };
}

const COTIZACION_A = {
  id: 'cot-a',
  empresaId: 'emp-1',
  requisicionId: 'req-1',
  proveedorId: 'prov-a',
  estado: 'PENDIENTE',
  total: 1252.8,
  proveedor: { id: 'prov-a', nombre: 'UAT COMPRAS · Proveedor A' },
};

describe('Cotizaciones · una requisición no tiene dos adjudicaciones en curso', () => {
  it('rechaza la segunda solicitud cuando una hermana ya espera firma', async () => {
    const { servicio } = servicioCon(
      [
        {
          id: 'cot-b',
          estado: 'PENDIENTE_APROBACION',
          proveedor: { nombre: 'UAT COMPRAS · Proveedor B' },
        },
      ],
      { ...COTIZACION_A },
    );

    await expect(
      servicio.solicitarAprobacion('cot-a', 'emp-1', 'usr-1', 'Entrega más rápida'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('el «no» dice cuál está en curso, para que se sepa qué retirar', async () => {
    const { servicio } = servicioCon(
      [
        {
          id: 'cot-b',
          estado: 'PENDIENTE_APROBACION',
          proveedor: { nombre: 'UAT COMPRAS · Proveedor B' },
        },
      ],
      { ...COTIZACION_A },
    );

    await expect(
      servicio.solicitarAprobacion('cot-a', 'emp-1', 'usr-1', 'Entrega más rápida'),
    ).rejects.toThrow(/Proveedor B/);
  });

  it('una requisición ya adjudicada —hermana APROBADA— tampoco admite otra solicitud', async () => {
    const { servicio } = servicioCon(
      [
        {
          id: 'cot-b',
          estado: 'APROBADA',
          proveedor: { nombre: 'UAT COMPRAS · Proveedor B' },
        },
      ],
      { ...COTIZACION_A },
    );

    await expect(
      servicio.solicitarAprobacion('cot-a', 'emp-1', 'usr-1', 'Entrega más rápida'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('las hermanas rechazadas o descartadas no estorban: ésas ya no están en curso', async () => {
    const { servicio } = servicioCon(
      [
        { id: 'cot-b', estado: 'DESCARTADA', proveedor: { nombre: 'B' } },
        { id: 'cot-c', estado: 'RECHAZADA', proveedor: { nombre: 'C' } },
        { id: 'cot-d', estado: 'PENDIENTE', proveedor: { nombre: 'D' } },
      ],
      { ...COTIZACION_A },
    );

    /*
     * Llega hasta la comprobación de la ruta de aprobación, que en esta prueba
     * está vacía: eso significa que pasó el control de hermanas, que es lo que
     * se está midiendo.
     */
    await expect(
      servicio.solicitarAprobacion('cot-a', 'emp-1', 'usr-1', 'Entrega más rápida'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('la propia cotización no se cuenta como su propia hermana', async () => {
    /*
     * Reenviar una RECHAZADA es un caso admitido a propósito. Si el control se
     * mirara a sí mismo, ese reenvío quedaría bloqueado por su propio estado.
     */
    const { servicio } = servicioCon(
      [{ id: 'cot-a', estado: 'PENDIENTE_APROBACION', proveedor: { nombre: 'A' } }],
      { ...COTIZACION_A, estado: 'RECHAZADA' },
    );

    await expect(
      servicio.solicitarAprobacion('cot-a', 'emp-1', 'usr-1', 'Reenvío tras rechazo'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
