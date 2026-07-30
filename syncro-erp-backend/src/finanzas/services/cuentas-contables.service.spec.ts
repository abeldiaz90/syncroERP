import { CuentaContable } from '../entities/cuenta-contable.entity';
import { PLAN_CUENTAS_ESTANDAR } from '../data/plan-cuentas-estandar';
import { CuentasContablesService } from './cuentas-contables.service';

describe('CuentasContablesService - carga inicial mexicana', () => {
  let datos: CuentaContable[];
  let secuencia: number;
  let repo: any;
  let catalogosSat: any;
  let service: CuentasContablesService;

  beforeEach(() => {
    datos = [];
    secuencia = 0;
    repo = {
      find: jest.fn(async ({ where }: any) =>
        datos.filter((cuenta) => cuenta.empresaId === where.empresaId),
      ),
      findOne: jest.fn(async ({ where }: any) =>
        datos.find(
          (cuenta) =>
            cuenta.empresaId === where.empresaId &&
            (where.id ? cuenta.id === where.id : true) &&
            (where.numeroCuenta
              ? cuenta.numeroCuenta === where.numeroCuenta
              : true),
        ),
      ),
      create: jest.fn((valor) => ({ ...valor })),
      save: jest.fn(async (entrada: CuentaContable | CuentaContable[]) => {
        const lista = Array.isArray(entrada) ? entrada : [entrada];
        for (const cuenta of lista) {
          if (!cuenta.id) cuenta.id = `cuenta-${++secuencia}`;
          const indice = datos.findIndex((actual) => actual.id === cuenta.id);
          if (indice >= 0) datos[indice] = cuenta;
          else datos.push(cuenta);
        }
        return entrada;
      }),
    };
    catalogosSat = {
      asegurarCatalogo2026: jest.fn(async () => ({ id: 'version-2026' })),
      sincronizarCuenta: jest.fn(),
      sincronizarCuentasMasivo: jest.fn(async () => ({
        creados: 700,
        existentes: 0,
      })),
      validarCodigoAgrupador: jest.fn(),
    };
    service = new CuentasContablesService(repo, catalogosSat);
  });

  it('instala el plan completo desde una empresa vacía y conserva jerarquía', async () => {
    const resultado = await service.precargarPlanEstandar('empresa-1');
    expect(resultado.totalCatalogo).toBe(PLAN_CUENTAS_ESTANDAR.length);
    expect(resultado.creadas).toBe(PLAN_CUENTAS_ESTANDAR.length);
    expect(datos).toHaveLength(PLAN_CUENTAS_ESTANDAR.length);

    const padre = datos.find((cuenta) => cuenta.numeroCuenta === '102');
    const hija = datos.find((cuenta) => cuenta.numeroCuenta === '102.01');
    expect(padre?.esAfectable).toBe(false);
    expect(hija?.cuentaPadreId).toBe(padre?.id);
    expect(hija?.esAfectable).toBe(true);
  });

  it('es idempotente y no elimina cuentas personalizadas', async () => {
    datos.push({
      id: 'personalizada-1',
      empresaId: 'empresa-1',
      numeroCuenta: '1100-CLIENTE',
      nombre: 'Cuenta personalizada',
      codigoAgrupadorSAT: '101.01',
      naturaleza: 'DEUDORA',
      tipo: 'ACTIVO',
      cuentaPadre: null,
      cuentaPadreId: null,
      subcuentas: [],
      esAfectable: true,
      activo: true,
      rolSistema: null,
      fechaCreacion: new Date(),
      fechaActualizacion: new Date(),
    } as CuentaContable);

    await service.precargarPlanEstandar('empresa-1');
    const segunda = await service.precargarPlanEstandar('empresa-1');
    expect(segunda.creadas).toBe(0);
    expect(
      datos.find((cuenta) => cuenta.id === 'personalizada-1')?.nombre,
    ).toBe('Cuenta personalizada');
    expect(new Set(datos.map((cuenta) => cuenta.numeroCuenta)).size).toBe(
      datos.length,
    );
  });
});
