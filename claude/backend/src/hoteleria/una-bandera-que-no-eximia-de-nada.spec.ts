/**
 * ============================================================================
 * `exigirInventarioDotacion = false` no eximía de nada
 * ----------------------------------------------------------------------------
 * La bandera sólo se consultaba en la rama del hotel SIN almacén. Con almacén
 * configurado —el caso normal— se llamaba a `registrarSalida` sin red: si
 * faltaba un jabón, la salida lanzaba «Disponibilidad insuficiente» y, como
 * esto corre dentro de la transacción del check-in, el check-in entero se caía.
 *
 * O sea que el hotel que declaró «no me exijas inventario para la dotación» no
 * podía recibir a NINGÚN huésped en cuanto se acabara cualquier amenidad. Y el
 * mensaje que llegaba al mostrador hablaba de la disponibilidad de un producto:
 * nadie relaciona eso con una bandera de configuración del hotel.
 * ============================================================================
 */
import { BadRequestException } from '@nestjs/common';

import { OperacionHotelService } from './services/operacion-hotel.service';

const EMPRESA = 'empresa-1';

function armar(exigir: boolean, falla: 'ninguno' | 'stock' | 'base') {
  const dotacion = [
    { productoId: 'jabon', cantidad: 2, tipoArticulo: 'CONSUMIBLE' },
    { productoId: 'cafe', cantidad: 1, tipoArticulo: 'CONSUMIBLE' },
    { productoId: 'sabana', cantidad: 2, tipoArticulo: 'BLANCO' },
  ];
  const manager: any = {
    getRepository: () => ({ find: async () => dotacion }),
  };
  const inventario: any = {
    registrarSalida: jest.fn(async (productoId: string) => {
      if (productoId === 'jabon' && falla === 'stock') {
        throw new BadRequestException('Disponibilidad insuficiente.');
      }
      if (productoId === 'jabon' && falla === 'base') {
        throw new Error('current transaction is aborted');
      }
      return { mensaje: 'ok' };
    }),
  };
  const servicio = Object.create(OperacionHotelService.prototype);
  (servicio as any).inventarioService = inventario;
  (servicio as any).logger = { warn: jest.fn(), log: jest.fn() };

  const correr = () =>
    (servicio as any).descontarDotacion(
      manager,
      'tipo-1',
      { id: 'hab-1', numero: '101' },
      { id: 'hotel-1', almacenId: 'alm-1', exigirInventarioDotacion: exigir },
      EMPRESA,
      'folio-1',
    );
  return { correr, inventario };
}

describe('Check-in · la dotación que no alcanza', () => {
  it('sin exigir inventario, el huésped entra y se dice qué faltó', async () => {
    const { correr, inventario } = armar(false, 'stock');
    const r = await correr();
    expect(r.omitidos).toEqual(['jabon']);
    expect(r.consumibles).toBe(1);       // el café sí se descontó
    expect(r.blancos).toBe(1);
    expect(inventario.registrarSalida).toHaveBeenCalledTimes(2);
  });

  it('exigiendo inventario, se sigue negando', async () => {
    const { correr } = armar(true, 'stock');
    await expect(correr()).rejects.toThrow(/Disponibilidad insuficiente/);
  });

  it('un fallo que NO es de disponibilidad tira el check-in aunque no se exija', async () => {
    /*
     * La red tiene que ser estrecha. Si la transacción se abortó de verdad,
     * seguir adelante escribe un check-in sobre una transacción muerta: peor
     * que la negativa que se quería evitar.
     */
    const { correr } = armar(false, 'base');
    await expect(correr()).rejects.toThrow(/transaction is aborted/);
  });

  it('con todo en existencia, nada se omite', async () => {
    const { correr } = armar(false, 'ninguno');
    const r = await correr();
    expect(r.omitidos).toEqual([]);
    expect(r.consumibles).toBe(2);
  });
});
