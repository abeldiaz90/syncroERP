import { BadRequestException, ConflictException } from '@nestjs/common';
import { TipoCuentaBancaria } from '../../credito/entities/cuenta-bancaria.entity';
import {
  NaturalezaMovimientoCaja,
  TipoMovimientoCaja,
} from '../entities/movimiento-caja.entity';
import { EstadoTurnoCaja } from '../entities/turno-caja.entity';
import { CajaService } from './caja.service';

describe('CajaService', () => {
  function managerConTurno(efectivoEsperado = 100) {
    const turno = {
      id: 'turno-1',
      empresaId: 'empresa-1',
      cuentaCajaId: 'caja-1',
      estado: EstadoTurnoCaja.ABIERTO,
      fondoInicial: 100,
      totalEntradas: 0,
      totalSalidas: 0,
      efectivoEsperado,
    };
    const save = jest.fn(async (valor) => valor);
    const manager: any = {
      findOne: jest.fn(async (entidad: unknown, opciones: any) => {
        if (opciones?.where?.tipo === TipoCuentaBancaria.CAJA) {
          return { id: 'caja-1', activo: true, tipo: TipoCuentaBancaria.CAJA };
        }
        return null;
      }),
      createQueryBuilder: jest.fn(() => ({
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn(async () => turno),
      })),
      create: jest.fn((_entidad: unknown, valor: unknown) => valor),
      save,
    };
    return { manager, turno, save };
  }

  /*
   * `registrarManual` propaga ahora el movimiento a Tesorería dentro de la
   * misma transacción, así que el servicio recibe TesoreriaService. Estas
   * pruebas no ejercitan esa ruta; basta con un doble inerte.
   */
  const tesoreriaFalsa = { registrarEnTransaccion: jest.fn(async () => null) } as any;
  const servicio = new CajaService({} as any, {} as any, {} as any, tesoreriaFalsa);

  it('rechaza una salida que dejaría efectivo esperado negativo', async () => {
    const { manager, save } = managerConTurno(100);

    await expect(
      servicio.registrarEnTransaccion(
        manager,
        {
          cuentaCajaId: 'caja-1',
          naturaleza: NaturalezaMovimientoCaja.SALIDA,
          tipo: TipoMovimientoCaja.RETIRO,
          importe: 100.01,
          concepto: 'Retiro mayor al disponible',
        },
        'empresa-1',
        'usuario-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(save).not.toHaveBeenCalled();
  });

  it('actualiza el turno y registra una entrada en la misma transacción', async () => {
    const { manager, turno, save } = managerConTurno(100);

    await servicio.registrarEnTransaccion(
      manager,
      {
        cuentaCajaId: 'caja-1',
        naturaleza: NaturalezaMovimientoCaja.ENTRADA,
        tipo: TipoMovimientoCaja.INGRESO_MANUAL,
        importe: 25.5,
        concepto: 'Fondo adicional',
      },
      'empresa-1',
      'usuario-1',
    );

    expect(turno.totalEntradas).toBe(25.5);
    expect(turno.efectivoEsperado).toBe(125.5);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('rechaza abrir la caja cuando SQL Server no concede el candado', async () => {
    const manager: any = { query: jest.fn(async () => [{ resultado: -1 }]) };
    const dataSource: any = {
      transaction: jest.fn(async (_nivel: string, callback: any) => callback(manager)),
    };
    const instancia = new CajaService(
      dataSource,
      {} as any,
      {} as any,
      { registrarEnTransaccion: jest.fn(async () => null) } as any,
    );

    await expect(
      instancia.abrir(
        { cuentaCajaId: 'caja-1', fondoInicial: 0 },
        'empresa-1',
        'usuario-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
