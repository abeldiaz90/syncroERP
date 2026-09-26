/**
 * ============================================================================
 * Una bandera de seguridad que se ignora en silencio es una trampa
 * ----------------------------------------------------------------------------
 * `POST /integracion/cuentas/aprovisionar` crea cuentas en el mayor externo y
 * NO tiene operación inversa —lo dice el propio servicio: «crear allá un
 * catálogo completo que nadie va a usar lo ensucia para todos y no hay
 * operación inversa»—.
 *
 * La bandera de ensayo vivía sólo en la cadena de consulta. Mandarla en el
 * cuerpo, que es lo que cualquiera escribe en un POST con opciones, no la
 * activaba: la operación se hacía de verdad y respondía `"simulacion": false`
 * con las cuentas ya creadas.
 *
 * Ocurrió el 25-sep-2026 durante estas mismas pruebas: cuatro cuentas creadas
 * en Fineract pidiendo un ensayo.
 * ============================================================================
 */

import { BadRequestException } from '@nestjs/common';
import { IntegracionController } from './integracion.controller';

function arnes() {
  const llamadas: Array<{ empresaId: string; opciones: any }> = [];
  const mapeo = {
    aprovisionar: jest.fn(async (empresaId: string, opciones: any) => {
      llamadas.push({ empresaId, opciones });
      return { simulacion: opciones.simular, creadas: [] };
    }),
  };
  const controller = Object.create(IntegracionController.prototype) as any;
  controller.mapeo = mapeo;
  return { controller, llamadas };
}

describe('Aprovisionar cuentas · el ensayo se respeta venga como venga', () => {
  it('lo respeta en el cuerpo, que es como lo manda cualquiera', async () => {
    const { controller, llamadas } = arnes();

    await controller.aprovisionarCuentas('emp-1', { simular: true });

    expect(llamadas[0].opciones.simular).toBe(true);
  });

  it('lo sigue respetando en la cadena de consulta, que ya se usaba', async () => {
    const { controller, llamadas } = arnes();

    await controller.aprovisionarCuentas('emp-1', undefined, '1');

    expect(llamadas[0].opciones.simular).toBe(true);
  });

  it('acepta el booleano y el texto: los clientes mandan de las dos formas', async () => {
    const { controller, llamadas } = arnes();

    await controller.aprovisionarCuentas('emp-1', { simular: 'true' });
    await controller.aprovisionarCuentas('emp-1', undefined, 'true');

    expect(llamadas.map(l => l.opciones.simular)).toEqual([true, true]);
  });

  it('sin pedir ensayo, aprovisiona de verdad', async () => {
    // El comportamiento por omisión no cambia: quien no pide ensayo, actúa.
    const { controller, llamadas } = arnes();

    await controller.aprovisionarCuentas('emp-1', {});

    expect(llamadas[0].opciones.simular).toBe(false);
  });

  it('el alcance por omisión sigue siendo el prudente', async () => {
    /*
     * `usadas` son las que ya detuvieron una póliza. `todas` crea el catálogo
     * entero en un mayor compartido entre inquilinos y no se deshace.
     */
    const { controller, llamadas } = arnes();

    await controller.aprovisionarCuentas('emp-1', {});

    expect(llamadas[0].opciones.alcance).toBe('usadas');
  });

  it('un alcance inventado se rechaza, venga de donde venga', () => {
    // El método valida antes de llamar a nada: lanza en el acto, no en promesa.
    const { controller, llamadas } = arnes();

    expect(() =>
      controller.aprovisionarCuentas('emp-1', { alcance: 'todas-las-que-sean' }),
    ).toThrow(BadRequestException);
    expect(() =>
      controller.aprovisionarCuentas('emp-1', undefined, undefined, undefined, 'lo-que-sea'),
    ).toThrow(BadRequestException);
    // Y no llegó a tocar el mayor externo.
    expect(llamadas).toEqual([]);
  });
});
