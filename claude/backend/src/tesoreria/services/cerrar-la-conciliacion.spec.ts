/**
 * ============================================================================
 * Cerrar la conciliacion bancaria
 * ----------------------------------------------------------------------------
 * POR QUE EXISTE ESTA PRUEBA
 *
 * El diagnostico del cierre mensual cuenta las conciliaciones con
 * `estado = 'CERRADA'` para decidir si el banco del periodo esta cubierto, y
 * bloquea el cierre cuando no lo estan todas. Pero `EstadoCierre.CERRADA`
 * nunca se escribia: el estado de cuenta nacia ABIERTA en `crearEstadoCuenta`
 * y no habia endpoint, ni metodo, ni boton que lo cerrara. El enum estaba, las
 * columnas `fechaCierre` y `conciliadoPorId` estaban, y dos guardias ya se
 * negaban a modificar un estado cerrado: todo el diseno existia menos la
 * puerta.
 *
 * Resultado: `estadosCerrados` valia cero siempre, la cobertura nunca se
 * completaba, y NINGUN mes de NINGUNA empresa podia cerrarse. El control no
 * era estricto, era imposible, y no se veia porque hacia exactamente lo que
 * decia hacer.
 *
 * Estas pruebas fijan las dos mitades: que la puerta existe, y que no deja
 * firmar un descuadre.
 * ============================================================================
 */

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { TesoreriaService } from './tesoreria.service';
import { EstadoCierre } from '../entities/tesoreria.entity';

type Estado = {
  id: string;
  empresaId: string;
  estado: EstadoCierre;
  fechaCierre?: Date;
  conciliadoPorId?: string;
};

function servicioCon(estado: Estado | null, cuadra: boolean) {
  const guardados: Estado[] = [];
  const svc = Object.create(TesoreriaService.prototype) as TesoreriaService;
  // `estados` es privado: se inyecta el repositorio falso por la puerta de
  // atras porque lo que se prueba es la REGLA, no el acceso a la base.
  (svc as unknown as Record<string, unknown>).estados = {
    findOne: jest.fn().mockResolvedValue(estado),
    save: jest.fn(async (e: Estado) => {
      guardados.push({ ...e });
      return e;
    }),
  };
  jest.spyOn(svc, 'reporteConciliacion').mockResolvedValue({
    periodo: '08/2026',
    cuadra,
    diferencia: cuadra ? 0 : 1234.5,
    saldoSegunBanco: 1000,
    saldoSegunLibros: cuadra ? 1000 : -234.5,
  } as never);
  return { svc, guardados };
}

describe('Tesoreria · cerrar la conciliacion del periodo', () => {
  it('cierra cuando el reporte cuadra, y deja quien y cuando', async () => {
    const estado: Estado = {
      id: 'ec-1',
      empresaId: 'emp-1',
      estado: EstadoCierre.ABIERTA,
    };
    const { svc, guardados } = servicioCon(estado, true);

    const r = await svc.cerrarConciliacion('ec-1', 'emp-1', 'usuario-7');

    expect(r.estado).toBe(EstadoCierre.CERRADA);
    expect(guardados).toHaveLength(1);
    expect(guardados[0].estado).toBe(EstadoCierre.CERRADA);
    expect(guardados[0].conciliadoPorId).toBe('usuario-7');
    expect(guardados[0].fechaCierre).toBeInstanceOf(Date);
  });

  it('se niega a cerrar con diferencia, y dice cuanta', async () => {
    const { svc, guardados } = servicioCon(
      { id: 'ec-1', empresaId: 'emp-1', estado: EstadoCierre.ABIERTA },
      false,
    );

    await expect(
      svc.cerrarConciliacion('ec-1', 'emp-1', 'usuario-7'),
    ).rejects.toBeInstanceOf(BadRequestException);
    // Y sobre todo: no escribio nada.
    expect(guardados).toHaveLength(0);
  });

  it('no se cierra dos veces', async () => {
    const { svc } = servicioCon(
      {
        id: 'ec-1',
        empresaId: 'emp-1',
        estado: EstadoCierre.CERRADA,
        fechaCierre: new Date('2026-08-31T00:00:00.000Z'),
      },
      true,
    );

    await expect(
      svc.cerrarConciliacion('ec-1', 'emp-1', 'usuario-7'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('un estado de cuenta de otra empresa no existe', async () => {
    const { svc } = servicioCon(null, true);
    await expect(
      svc.cerrarConciliacion('ec-1', 'emp-1', 'usuario-7'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
