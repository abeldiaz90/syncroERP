import { BadRequestException } from '@nestjs/common';
import {
  estadoDerivadoOC,
  valorRecibidoOC,
} from '../entities/orden-compra.entity';
import { CotizacionesService } from './cotizaciones.service';

/**
 * ============================================================================
 * Las tres reglas que sostienen el módulo de compras
 * ----------------------------------------------------------------------------
 * 1. Recepción y pago son dos ejes independientes. Mezclarlos en un solo
 *    `estado` dejaba las órdenes con entrega incompleta en un callejón sin
 *    salida: no se podían pagar, y si se hubieran podido, ya no se podía
 *    recibir lo que faltaba.
 * 2. Al proveedor se le paga lo que entregó, no lo que se le pidió.
 * 3. El impuesto de una compra lo determina lo que se compra, no un número
 *    tecleado en el navegador.
 * ============================================================================
 */

describe('estadoDerivadoOC', () => {
  const base = {
    estado: 'ENVIADA' as const,
    estadoRecepcion: 'PENDIENTE' as const,
    estadoPago: 'PENDIENTE' as const,
  };

  it('una orden enviada sin movimientos sigue ENVIADA', () => {
    expect(estadoDerivadoOC(base)).toBe('ENVIADA');
  });

  it('con entrega parcial se rotula CON_INCIDENCIAS', () => {
    expect(estadoDerivadoOC({ ...base, estadoRecepcion: 'PARCIAL' })).toBe(
      'CON_INCIDENCIAS',
    );
  });

  it('con entrega completa y sin pagos, RECIBIDA', () => {
    expect(estadoDerivadoOC({ ...base, estadoRecepcion: 'COMPLETA' })).toBe(
      'RECIBIDA',
    );
  });

  it('el pago manda sobre la recepción en la etiqueta', () => {
    expect(
      estadoDerivadoOC({
        ...base,
        estadoRecepcion: 'COMPLETA',
        estadoPago: 'PAGADA',
      }),
    ).toBe('PAGADA');
  });

  it('entrega incompleta con pago parcial se ve como pago parcial, y la recepción NO se pierde', () => {
    const orden = {
      ...base,
      estadoRecepcion: 'PARCIAL' as const,
      estadoPago: 'PARCIAL' as const,
    };
    expect(estadoDerivadoOC(orden)).toBe('PARCIALMENTE_PAGADA');
    /*
     * Éste es el caso que rompía todo: la etiqueta cambiaba y con ella se iba
     * la única constancia de que faltaba mercancía por recibir. Ahora la
     * etiqueta es un resumen y el eje de recepción sigue ahí.
     */
    expect(orden.estadoRecepcion).toBe('PARCIAL');
  });

  it('cancelada gana a todo', () => {
    expect(
      estadoDerivadoOC({
        estado: 'CANCELADA',
        estadoRecepcion: 'COMPLETA',
        estadoPago: 'PAGADA',
      }),
    ).toBe('CANCELADA');
  });
});

describe('valorRecibidoOC', () => {
  it('sin recepciones no hay nada que pagar', () => {
    expect(
      valorRecibidoOC([{ cantidad: 10, subtotal: 1000, impuestoImporte: 160 }]),
    ).toBe(0);
  });

  it('con entrega completa, el valor es el de la partida con su impuesto', () => {
    expect(
      valorRecibidoOC([
        { cantidad: 10, cantidadRecibidaOk: 10, subtotal: 1000, impuestoImporte: 160 },
      ]),
    ).toBe(1160);
  });

  it('prorratea POR PARTIDA, no sobre el total', () => {
    /*
     * Dos partidas de muy distinto valor: recibir toda la barata y nada de la
     * cara no es «la mitad de la orden». Prorratear sobre el total pagaría de
     * más justo cuando falta lo caro.
     */
    const recibido = valorRecibidoOC([
      { cantidad: 10, cantidadRecibidaOk: 10, subtotal: 100, impuestoImporte: 16 },
      { cantidad: 10, cantidadRecibidaOk: 0, subtotal: 10000, impuestoImporte: 1600 },
    ]);
    expect(recibido).toBe(116);
  });

  it('una entrega a medias vale la mitad de su partida', () => {
    expect(
      valorRecibidoOC([
        { cantidad: 10, cantidadRecibidaOk: 5, subtotal: 1000, impuestoImporte: 160 },
      ]),
    ).toBe(580);
  });

  it('recibir de más no infla el valor pagable', () => {
    expect(
      valorRecibidoOC([
        { cantidad: 10, cantidadRecibidaOk: 99, subtotal: 1000, impuestoImporte: 160 },
      ]),
    ).toBe(1160);
  });
});

describe('CotizacionesService · el impuesto se calcula, no se cree', () => {
  const requisicion = {
    id: 'req',
    empresaId: 'emp',
    estado: 'COTIZANDO',
    detalles: [
      { productoId: 'p-gravado', cantidadSolicitada: 10 },
      { productoId: 'p-exento', cantidadSolicitada: 10 },
    ],
  };
  const proveedor = { id: 'prov', empresaId: 'emp', activo: true, estadoHomologacion: 'APROBADO' };

  let guardadas: any[] = [];

  const construir = () => {
    guardadas = [];
    const cotizacionRepo = {
      create: (x: any) => x,
      save: async (x: any) => ({ ...x, id: 'cot' }),
      findOne: async () => ({ id: 'cot', empresaId: 'emp', detalles: [] }),
    };
    const detalleRepo = {
      create: (x: any) => x,
      save: async (filas: any[]) => {
        guardadas = filas;
        return filas;
      },
    };
    return new CotizacionesService(
      cotizacionRepo as any,
      detalleRepo as any,
      { findOne: async () => requisicion } as any,
      {} as any,
      {} as any,
      {} as any,
      { findOne: async () => proveedor } as any,
      {
        find: async () => [
          { id: 'p-gravado', impuesto: { porcentaje: 16 } },
          { id: 'p-exento', impuesto: { porcentaje: 0 } },
        ],
      } as any,
      {} as any,
    );
  };

  const dto = (extra: Record<string, unknown> = {}) =>
    ({
      requisicionId: 'req',
      proveedorId: 'prov',
      detalles: [
        { productoId: 'p-gravado', cantidad: 10, precioUnitario: 100 },
        { productoId: 'p-exento', cantidad: 10, precioUnitario: 50 },
      ],
      ...extra,
    }) as any;

  it('toma la tasa de cada producto cuando no se pacta una', async () => {
    await construir().crear(dto(), 'emp');

    expect(guardadas).toHaveLength(2);
    expect(guardadas[0]).toMatchObject({ tasaIva: 0.16, impuestoImporte: 160 });
    // El exento no paga impuesto aunque el otro renglón sí.
    expect(guardadas[1]).toMatchObject({ tasaIva: 0, impuestoImporte: 0 });
  });

  it('ignora el impuesto que llega del formulario', async () => {
    /*
     * Antes este número se guardaba tal cual y de él salía la reclasificación
     * de IVA acreditable al pagar. Un cero aquí significaba no acreditar nunca
     * el IVA de una compra gravada.
     */
    await construir().crear(dto({ impuestoTotal: 0, total: 1500 }), 'emp');
    expect(guardadas[0].impuestoImporte).toBe(160);
  });

  it('respeta la tasa pactada con el proveedor por encima del catálogo', async () => {
    await construir().crear(dto({ tasaIva: 0.08 }), 'emp');
    expect(guardadas[0]).toMatchObject({ tasaIva: 0.08, impuestoImporte: 80 });
    expect(guardadas[1]).toMatchObject({ tasaIva: 0.08, impuestoImporte: 40 });
  });

  it('rechaza una tasa que no viene en tanto por uno', async () => {
    await expect(construir().crear(dto({ tasaIva: 16 }), 'emp')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
