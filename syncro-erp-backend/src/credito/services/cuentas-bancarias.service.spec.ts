import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { CuentasBancariasService } from './cuentas-bancarias.service';
import {
  CuentaBancaria,
  TipoCuentaBancaria,
} from '../entities/cuenta-bancaria.entity';

describe('CuentasBancariasService', () => {
  let datos: CuentaBancaria[];
  let servicio: CuentasBancariasService;
  let repo: any;
  let bancos: any;
  let cuentasContables: any;

  beforeEach(() => {
    datos = [];
    repo = {
      create: jest.fn((valor) => ({ id: `cuenta-${datos.length + 1}`, ...valor })),
      save: jest.fn(async (entrada) => {
        const lista = Array.isArray(entrada) ? entrada : [entrada];
        for (const cuenta of lista) {
          const indice = datos.findIndex((x) => x.id === cuenta.id);
          if (indice >= 0) datos[indice] = cuenta;
          else datos.push(cuenta);
        }
        return entrada;
      }),
      find: jest.fn(async ({ where }: any) =>
        datos.filter(
          (x) =>
            x.empresaId === where.empresaId &&
            (where.tipo === undefined || x.tipo === where.tipo) &&
            (where.esPorDefecto === undefined ||
              x.esPorDefecto === where.esPorDefecto),
        ),
      ),
      findOne: jest.fn(async ({ where }: any) =>
        datos.find(
          (x) =>
            x.empresaId === where.empresaId &&
            ((where.id !== undefined && x.id === where.id) ||
              (where.clabe !== undefined && x.clabe === where.clabe)),
        ),
      ),
    };
    bancos = {
      findOne: jest.fn(async ({ where }: any) =>
        where.id === 'banco-012' && where.activo
          ? { id: 'banco-012', clave: '012', nombre: 'Banco de prueba', activo: true }
          : null,
      ),
    };
    cuentasContables = {
      findOne: jest.fn(async () => ({
        id: '11111111-1111-4111-8111-111111111111',
        empresaId: 'empresa-1',
        activo: true,
        esAfectable: true,
      })),
    };
    servicio = new CuentasBancariasService(
      repo,
      bancos,
      cuentasContables,
    );
  });

  it('crea una cuenta bancaria con banco y CLABE consistentes', async () => {
    const creada = await servicio.crear(
      {
        nombre: 'Cuenta principal',
        tipo: TipoCuentaBancaria.BANCO,
        bancoId: 'banco-012',
        clabe: '012180001234567899',
      },
      'empresa-1',
    );
    expect(creada.bancoId).toBe('banco-012');
    expect(creada.clabe).toBe('012180001234567899');
  });

  it('rechaza una CLABE cuyo banco no coincide con la institución', async () => {
    await expect(
      servicio.crear(
        {
          nombre: 'Cuenta incorrecta',
          tipo: TipoCuentaBancaria.BANCO,
          bancoId: 'banco-012',
          clabe: '002180001234567895',
        },
        'empresa-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza una CLABE duplicada dentro de la empresa', async () => {
    const dto = {
      nombre: 'Cuenta',
      tipo: TipoCuentaBancaria.BANCO,
      bancoId: 'banco-012',
      clabe: '012180001234567899',
    };
    await servicio.crear(dto, 'empresa-1');
    await expect(
      servicio.crear({ ...dto, nombre: 'Cuenta repetida' }, 'empresa-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('elimina datos bancarios impropios de una caja', async () => {
    const creada = await servicio.crear(
      {
        nombre: 'Caja general',
        tipo: TipoCuentaBancaria.CAJA,
        bancoId: 'banco-012',
        clabe: '012180001234567899',
        numeroCuenta: '123',
      },
      'empresa-1',
    );
    expect(creada.bancoId).toBeNull();
    expect(creada.clabe).toBeNull();
    expect(creada.numeroCuenta).toBeNull();
  });
});
