import { NotFoundException } from '@nestjs/common';

import { RecetasService } from './services/recetas.service';

/**
 * ============================================================================
 * Una receta rota dice qué insumo le falta
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * MEDIDO el 22-oct-2026, al estrenar la pantalla de producir contra la
 * instalación —hasta ese día `POST /recetas/producir` no lo llamaba nadie, era
 * una de las setenta y seis rutas sin pantalla—. La única receta que hay
 * apunta a un insumo, «Leche entera 1 L», que ya no está en el catálogo. Y
 * producir contestaba:
 *
 *     404 «Producto no encontrado»
 *
 * Esa frase sale de `InventarioService`, que no sabe de recetas: para él sólo
 * había un id que no está. Pero en esta operación hay TRES candidatos a no
 * existir —el producto terminado, cada uno de los insumos, y el almacén— así
 * que quien la lee no tiene por dónde empezar. Es la misma avería que este
 * proyecto lleva quitando de otras pantallas: una negativa que no señala a
 * ninguna parte.
 *
 * LA REGLA
 *
 * Se comprueba en el servicio de recetas, que es el único que sabe qué es un
 * insumo, y ANTES de abrir la transacción: una receta con tres insumos de los
 * que falta el tercero no debe descontar los dos primeros y caerse después.
 *
 * Y se nombra lo que falta, con el nombre que la receta guardó, no con el id:
 * un identificador no se puede buscar en una pantalla de catálogo.
 * ============================================================================
 */

type Insumo = { insumoId: string; insumoNombre: string; cantidad: number; mermaPorcentaje: number };

function armar(insumos: Insumo[], productosVivos: string[], recetaActiva = true) {
  const tocado: string[] = [];
  const s = Object.create(RecetasService.prototype) as Record<string, unknown>;

  s.recetaRepo = {
    findOne: async () =>
      recetaActiva
        ? {
            id: 'r1',
            productoId: 'p-terminado',
            productoNombre: 'Taza de cerámica',
            rendimiento: 1,
            insumos,
          }
        : null,
  };
  s.dataSource = {
    getRepository: () => ({
      find: async ({ where }: { where: { id: unknown } }) => {
        /*
         * El doble de `In(...)`. Se lee por `.value` y por `._value` porque es
         * detalle interno de TypeORM: atarse a uno de los dos haría que esta
         * prueba se cayera al actualizar la librería, señalando a un defecto
         * que no existe.
         */
        const op = where.id as { value?: string[]; _value?: string[] };
        const pedidos: string[] = op?.value ?? op?._value ?? [];
        return pedidos.filter((id) => productosVivos.includes(id)).map((id) => ({ id }));
      },
    }),
    transaction: async () => {
      tocado.push('transaccion');
      return {};
    },
  };
  s.inventarioService = {
    registrarSalida: async () => {
      tocado.push('salida');
      return { costoTotal: 0, cantidadTotal: 0, costoUnitarioPromedio: 0 };
    },
  };
  s.asientos = { encolarEnTransaccion: async () => undefined };

  return { servicio: s as unknown as RecetasService, tocado };
}

const DTO = { productoId: 'p-terminado', cantidad: 1, almacenId: 'alm-1' };
const insumo = (id: string, nombre: string): Insumo => ({
  insumoId: id,
  insumoNombre: nombre,
  cantidad: 1,
  mermaPorcentaje: 0,
});

describe('una receta rota dice qué insumo le falta', () => {
  it('nombra el insumo que ya no está, y no toca el inventario', async () => {
    const { servicio, tocado } = armar(
      [insumo('i-leche', 'Leche entera 1 L')],
      ['p-terminado'],
    );

    await expect(servicio.producir(DTO as never, 'e1', 'u1')).rejects.toThrow(
      /Leche entera 1 L/,
    );
    /* Ni transacción ni salidas: la receta rota se para antes de mover nada. */
    expect(tocado).toEqual([]);
  });

  it('y dice qué hacer, no sólo qué pasa', async () => {
    const { servicio } = armar([insumo('i-leche', 'Leche entera 1 L')], ['p-terminado']);

    await expect(servicio.producir(DTO as never, 'e1', 'u1')).rejects.toThrow(
      /Edita la receta y quítalo, o vuelve a dar de alta ese producto/,
    );
  });

  it('con dos insumos caídos los nombra a los dos', async () => {
    const { servicio } = armar(
      [insumo('i-leche', 'Leche entera 1 L'), insumo('i-cafe', 'Café molido')],
      ['p-terminado'],
    );

    const error = await servicio
      .producir(DTO as never, 'e1', 'u1')
      .catch((e: Error) => e);

    expect(String((error as Error).message)).toMatch(/Leche entera 1 L, Café molido/);
    expect(String((error as Error).message)).toMatch(/insumos que ya no existen/);
  });

  it('si el que se cayó es el producto terminado, lo dice de otra manera', async () => {
    /*
     * Son dos averías distintas y se arreglan en sitios distintos: un insumo
     * se quita de la receta, un producto terminado que ya no existe deja la
     * receta entera sin sentido.
     */
    const { servicio } = armar([insumo('i-leche', 'Leche entera 1 L')], ['i-leche']);

    await expect(servicio.producir(DTO as never, 'e1', 'u1')).rejects.toThrow(
      /El producto que esta receta produce ya no existe.*Taza de cerámica/,
    );
  });

  it('con todo en su sitio, no se queja: entra en la transacción', async () => {
    /*
     * La mitad que más importa de cualquier compuerta. Una que niegue siempre
     * tendría todas las de arriba en verde.
     */
    const { servicio, tocado } = armar(
      [insumo('i-leche', 'Leche entera 1 L')],
      ['p-terminado', 'i-leche'],
    );

    await servicio.producir(DTO as never, 'e1', 'u1');

    expect(tocado).toEqual(['transaccion']);
  });

  it('LA PRUEBA DE LA PRUEBA: la negativa vieja no señalaba a nadie', async () => {
    /*
     * Lo que se arregló no es que fallara —fallaba bien, y debía fallar— sino
     * que la frase no servía para arreglarlo. Aquí se fija esa diferencia: el
     * mensaje nuevo tiene que nombrar algo que se pueda buscar en el catálogo,
     * y «Producto no encontrado» no lo hace.
     */
    const { servicio } = armar([insumo('i-leche', 'Leche entera 1 L')], ['p-terminado']);

    const error = await servicio
      .producir(DTO as never, 'e1', 'u1')
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(NotFoundException);
    expect(String((error as Error).message)).not.toBe('Producto no encontrado');
    expect(String((error as Error).message)).toContain('Leche entera 1 L');
  });
});
