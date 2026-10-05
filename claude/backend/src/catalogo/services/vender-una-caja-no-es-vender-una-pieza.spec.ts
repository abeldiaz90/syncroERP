import { BadRequestException } from '@nestjs/common';
import { PreciosService } from './precios.service';
import { factorDeEmpaque } from '../utils/factor-de-empaque.util';

/**
 * ============================================================================
 * VENDER UNA CAJA NO ES VENDER UNA PIEZA
 * ----------------------------------------------------------------------------
 * EL CASO
 *
 * Los precios y los costos de este ERP viven en la **unidad base**. La entrada
 * de inventario ya lo asumía —«si compraste una caja de 12 a $120, cada pieza
 * costó $10»— y la salida descuenta `cantidad × factor`.
 *
 * El precio de venta **no convertía**. `precioDe()` recibía el producto, el
 * precio de lista y la lista, y nunca el empaque, aunque el POS manda
 * `equivalenciaId` y el tipo `RenglonSolicitado` lo declara desde el principio.
 *
 * Resultado, en cada venta por empaque:
 *
 *     Refresco 600 ml · unidad base pieza · precio de lista $18
 *     equivalencia «Caja», factorConversion 12
 *
 *     se cobra ....... 1 × $18  = $18.00
 *     se descuenta ... 1 × 12   = 12 piezas  (y 12 × costo al costo de ventas)
 *
 * $18 por $216 de mercancía, con el ticket aparentemente correcto. No es un
 * descuadre que se vea en una balanza: es margen que desaparece renglón a
 * renglón.
 *
 * POR QUÉ ERA FÁCIL QUE PASARA
 *
 * La regla del factor vivía en un **método privado** del servicio de inventario,
 * así que el de precios no podía usarla ni queriéndolo. Dos lados de la misma
 * operación con una sola mitad de la conversión. Ahora la regla es
 * `catalogo/utils/factor-de-empaque` y los dos la llaman.
 * ============================================================================
 */

const PRODUCTO = {
  id: 'p1',
  empresaId: 'e1',
  nombre: 'Refresco 600 ml',
  activo: true,
  controlaInventario: true,
  precioCompra: 10,
  impuesto: { id: 'i1', porcentaje: 16 },
};

const CAJA_DE_12 = { id: 'eq-caja', productoId: 'p1', factorConversion: 12 };

function servicio(empaques: Array<Record<string, unknown>> = []) {
  const productoRepo = { find: jest.fn().mockResolvedValue([PRODUCTO]) };
  const precioRepo = {
    createQueryBuilder: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
  };
  const listaRepo = { findOne: jest.fn().mockResolvedValue(null) };
  const equivalenciaRepo = { find: jest.fn().mockResolvedValue(empaques) };

  const srv = new PreciosService(
    productoRepo as never,
    precioRepo as never,
    listaRepo as never,
    equivalenciaRepo as never,
  );
  /* El precio de lista se resuelve aparte; aquí se fija para medir sólo la
     conversión por empaque. */
  Object.assign(srv, {
    resolverLista: async () => 'lista-1',
    cargarPreciosDeLista: async () => new Map([['p1', 18]]),
    cargarLista: async () => null,
  });
  return { srv, equivalenciaRepo };
}

describe('el precio de un renglón con empaque', () => {
  it('una caja de doce se cobra doce veces la pieza', async () => {
    const { srv } = servicio([CAJA_DE_12]);
    const r = await srv.resolverVenta(
      [{ productoId: 'p1', cantidad: 1, equivalenciaId: 'eq-caja' }],
      'e1',
    );
    expect(r.detalles[0].precioUnitario).toBe(216);
    /* Y el subtotal del renglón es el de la caja, no el de la pieza. */
    expect(r.detalles[0].subtotal).toBe(216);
  });

  it('sin empaque se cobra la unidad base, como siempre', async () => {
    /* La mitad que importa no romper: el 99 % de las ventas no lleva empaque. */
    const { srv, equivalenciaRepo } = servicio();
    const r = await srv.resolverVenta([{ productoId: 'p1', cantidad: 3 }], 'e1');
    expect(r.detalles[0].precioUnitario).toBe(18);
    expect(r.detalles[0].subtotal).toBe(54);
    /* Y no se consulta la tabla de empaques por nada. */
    expect(equivalenciaRepo.find).not.toHaveBeenCalled();
  });

  it('el impuesto se calcula sobre el importe del empaque', async () => {
    /*
     * Lo que hacía el defecto caro de verdad: el IVA salía del precio de la
     * pieza, así que lo trasladado al cliente y lo declarado al SAT eran una
     * doceava parte de lo que correspondía.
     */
    const { srv } = servicio([CAJA_DE_12]);
    const r = await srv.resolverVenta(
      [{ productoId: 'p1', cantidad: 1, equivalenciaId: 'eq-caja' }],
      'e1',
    );
    expect(r.detalles[0].impuestoMonto).toBe(34.56);
    expect(r.total).toBe(250.56);
  });

  it('un empaque que no es de ese producto se rechaza, no se multiplica', async () => {
    /*
     * `equivalenciaId` lo manda el cliente. Si se aceptara el empaque de otro
     * producto, su factor multiplicaría un precio con el que no tiene nada que
     * ver — y el inventario, que sí comprueba `{ id, productoId }`, descontaría
     * otra cosa. El rechazo deja los dos lados de acuerdo.
     */
    /*
     * El doble devuelve el empaque **con el id pedido** y con `productoId` de
     * otro artículo. Es la única forma de que la prueba mida la comparación y no
     * la casualidad de que el id no apareciera: la primera versión de esta
     * prueba usaba otro id, pasaba, y el arreglo no comparaba nada. Lo descubrió
     * un mutante que quitó el filtro de la consulta y no rompió nada.
     */
    const { srv } = servicio([{ id: 'eq-caja', productoId: 'p9', factorConversion: 100 }]);
    await expect(
      srv.resolverVenta(
        [{ productoId: 'p1', cantidad: 1, equivalenciaId: 'eq-caja' }],
        'e1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('y un empaque que no aparece en la tabla tampoco se acepta', async () => {
    const { srv } = servicio([]);
    await expect(
      srv.resolverVenta(
        [{ productoId: 'p1', cantidad: 1, equivalenciaId: 'eq-fantasma' }],
        'e1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('el descuento del renglón se mide contra el precio del empaque', async () => {
    /* Si el tope de descuento se midiera contra el precio de la pieza, un
       descuento legítimo sobre una caja se rechazaría por desproporcionado. */
    const { srv } = servicio([CAJA_DE_12]);
    const r = await srv.resolverVenta(
      [
        {
          productoId: 'p1',
          cantidad: 1,
          equivalenciaId: 'eq-caja',
          descuentoPorcentaje: 5,
        },
      ],
      'e1',
      { rolUsuario: 'gerente' },
    );
    expect(r.detalles[0].descuento).toBe(10.8);
    expect(r.detalles[0].subtotal).toBe(205.2);
  });
});

describe('el factor de un empaque', () => {
  it('convierte multiplicando', () => {
    expect(factorDeEmpaque({ factorConversion: 12 })).toBe(12);
    expect(factorDeEmpaque({ factorConversion: '2.5' })).toBe(2.5);
  });

  it('un empaque mal capturado vale 1, no 0', () => {
    /*
     * Deliberado. Con `0`, la cantidad y —ahora que el precio también convierte—
     * el importe se volvían cero **en silencio**: una venta que regala la
     * mercancía. Con `1` se cobra y se descuenta de menos, que se nota.
     */
    for (const malo of [0, -3, null, undefined, NaN, 'caja' as unknown as number]) {
      expect(factorDeEmpaque({ factorConversion: malo as never })).toBe(1);
    }
    expect(factorDeEmpaque(null)).toBe(1);
    expect(factorDeEmpaque(undefined)).toBe(1);
  });
});
