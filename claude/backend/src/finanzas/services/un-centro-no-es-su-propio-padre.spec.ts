/**
 * ============================================================================
 * El catálogo de centros de costo
 * ----------------------------------------------------------------------------
 * Un catálogo contable con un árbol mal formado no se nota al capturarlo: se
 * nota meses después, cuando un reporte entra en bucle o cuando el saldo de un
 * acumulador no coincide con la suma de sus hijos y nadie sabe por qué.
 * ============================================================================
 */
import { BadRequestException, ConflictException } from '@nestjs/common';

import { CentrosCostoService } from './centros-costo.service';

const EMPRESA = 'empresa-1';

function armar(existentes: any[] = []) {
  const filas = [...existentes];
  const repo: any = {
    find: async () => filas.filter((c) => c.empresaId === EMPRESA),
    findOne: async ({ where }: any) =>
      filas.find(
        (c) =>
          c.id === (where.id?.value ?? where.id) &&
          (!where.empresaId || c.empresaId === where.empresaId),
      ) ??
      filas.find(
        (c) =>
          where.codigo &&
          c.codigo === where.codigo &&
          c.empresaId === where.empresaId &&
          (!where.id || c.id !== where.id?.value),
      ) ??
      null,
    count: async ({ where }: any) =>
      filas.filter(
        (c) =>
          (!where.padreId || c.padreId === where.padreId) &&
          (where.activo === undefined || c.activo === where.activo) &&
          (where.aceptaMovimientos === undefined ||
            c.aceptaMovimientos === where.aceptaMovimientos) &&
          (!where.empresaId || c.empresaId === where.empresaId),
      ).length,
    create: (x: any) => ({ id: `cc-${filas.length + 1}`, ...x }),
    save: async (x: any) => {
      const i = filas.findIndex((c) => c.id === x.id);
      if (i >= 0) filas[i] = x;
      else filas.push(x);
      return x;
    },
    remove: async (x: any) => x,
    manager: {},
  };
  const dataSource: any = {
    transaction: (fn: any) => fn({ getRepository: () => repo }),
    query: async () => [{ total: 0 }],
  };
  return { servicio: new CentrosCostoService(repo, dataSource), filas, repo };
}

describe('Alta de un centro de costo', () => {
  it('el código se normaliza: sin espacios y en mayúsculas', async () => {
    const { servicio } = armar();
    const creado: any = await servicio.crear(EMPRESA, {
      codigo: '  norte-01 ',
      nombre: 'Sucursal Norte',
    });
    expect(creado.codigo).toBe('NORTE-01');
  });

  it('dos centros no comparten código dentro de la empresa', async () => {
    const { servicio } = armar([
      { id: 'cc-1', empresaId: EMPRESA, codigo: 'NORTE', nombre: 'Norte', activo: true, aceptaMovimientos: true },
    ]);
    await expect(
      servicio.crear(EMPRESA, { codigo: 'norte', nombre: 'Otro Norte' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('el padre deja de aceptar movimientos en cuanto tiene un hijo', async () => {
    /*
     * Se hace solo, no se le pide a quien captura. Si un acumulador recibe sus
     * propios movimientos, su saldo deja de ser la suma de sus hijos y el
     * reporte por centro ya no cuadra con el total; quien da de alta un hijo no
     * tiene por qué acordarse de eso.
     */
    const padre = {
      id: 'cc-1', empresaId: EMPRESA, codigo: 'CORP', nombre: 'Corporativo',
      activo: true, aceptaMovimientos: true, padreId: null,
    };
    const { servicio } = armar([padre]);
    await servicio.crear(EMPRESA, { codigo: 'NORTE', nombre: 'Norte', padreId: 'cc-1' });
    expect(padre.aceptaMovimientos).toBe(false);
  });

  it('un padre de otra empresa no vale', async () => {
    const { servicio } = armar([
      { id: 'cc-9', empresaId: 'otra', codigo: 'X', nombre: 'Ajeno', activo: true, aceptaMovimientos: true },
    ]);
    await expect(
      servicio.crear(EMPRESA, { codigo: 'NORTE', nombre: 'Norte', padreId: 'cc-9' }),
    ).rejects.toThrow(/otra empresa/);
  });

  it('el código y el nombre no pueden venir vacíos', async () => {
    const { servicio } = armar();
    await expect(servicio.crear(EMPRESA, { codigo: '  ', nombre: 'X' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(servicio.crear(EMPRESA, { codigo: 'X', nombre: ' ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('El árbol no se puede enredar', () => {
  it('un centro no es su propio padre', async () => {
    const { servicio } = armar([
      { id: 'cc-1', empresaId: EMPRESA, codigo: 'A', nombre: 'A', activo: true, aceptaMovimientos: true, padreId: null },
    ]);
    await expect(
      servicio.actualizar('cc-1', EMPRESA, { padreId: 'cc-1' }),
    ).rejects.toThrow(/su propio padre/);
  });

  it('no se puede cerrar un círculo', async () => {
    /*
     * A → B → C. Poner a C como padre de A cerraría el círculo, y el cálculo
     * de nivel —y cualquier recorrido del árbol— entraría en bucle.
     */
    const { servicio } = armar([
      { id: 'cc-1', empresaId: EMPRESA, codigo: 'A', nombre: 'A', activo: true, aceptaMovimientos: false, padreId: null },
      { id: 'cc-2', empresaId: EMPRESA, codigo: 'B', nombre: 'B', activo: true, aceptaMovimientos: false, padreId: 'cc-1' },
      { id: 'cc-3', empresaId: EMPRESA, codigo: 'C', nombre: 'C', activo: true, aceptaMovimientos: true, padreId: 'cc-2' },
    ]);
    await expect(
      servicio.actualizar('cc-1', EMPRESA, { padreId: 'cc-3' }),
    ).rejects.toThrow(/cerraría un círculo/);
  });

  it('un acumulador no puede volver a aceptar movimientos mientras tenga hijos', async () => {
    const { servicio } = armar([
      { id: 'cc-1', empresaId: EMPRESA, codigo: 'A', nombre: 'A', activo: true, aceptaMovimientos: false, padreId: null },
      { id: 'cc-2', empresaId: EMPRESA, codigo: 'B', nombre: 'B', activo: true, aceptaMovimientos: true, padreId: 'cc-1' },
    ]);
    await expect(
      servicio.actualizar('cc-1', EMPRESA, { aceptaMovimientos: true }),
    ).rejects.toThrow(/su saldo es la suma de ellos/);
  });

  it('no se desactiva un padre con hijos activos colgando', async () => {
    const { servicio } = armar([
      { id: 'cc-1', empresaId: EMPRESA, codigo: 'A', nombre: 'A', activo: true, aceptaMovimientos: false, padreId: null },
      { id: 'cc-2', empresaId: EMPRESA, codigo: 'B', nombre: 'B', activo: true, aceptaMovimientos: true, padreId: 'cc-1' },
    ]);
    await expect(
      servicio.actualizar('cc-1', EMPRESA, { activo: false }),
    ).rejects.toThrow(/colgando de un padre inactivo/);
  });
});

describe('Borrar un centro que ya movió dinero', () => {
  it('no se borra: se manda desactivar, y se dice cuántas partidas tiene', async () => {
    const { servicio } = armar([
      { id: 'cc-1', empresaId: EMPRESA, codigo: 'A', nombre: 'Norte', activo: true, aceptaMovimientos: true, padreId: null },
    ]);
    (servicio as any).dataSource.query = async () => [{ total: 412 }];
    await expect(servicio.eliminar('cc-1', EMPRESA)).rejects.toThrow(/412 partida/);
    await expect(servicio.eliminar('cc-1', EMPRESA)).rejects.toThrow(/Desactívalo/);
  });

  it('uno que nunca se usó sí se borra', async () => {
    const { servicio } = armar([
      { id: 'cc-1', empresaId: EMPRESA, codigo: 'A', nombre: 'Norte', activo: true, aceptaMovimientos: true, padreId: null },
    ]);
    const r: any = await servicio.eliminar('cc-1', EMPRESA);
    expect(r.mensaje).toMatch(/eliminado/);
  });
});
