import { Logger } from '@nestjs/common';
import { AuditoriaService } from './auditoria.service';

/**
 * Tests del SERVICIO de auditoría: el anexado seguro.
 * Foco: enmascarar contraseñas, serializar bien, y no romper nunca.
 */

function crearArnes(opts?: { fallarSave?: boolean }) {
  const guardados: any[] = [];
  const repo: any = {
    create: (obj: any) => obj,
    save: jest.fn(async (obj: any) => {
      if (opts?.fallarSave) throw new Error('BD caída');
      guardados.push(obj);
      return obj;
    }),
    findAndCount: jest.fn(async () => [[], 0]),
    find: jest.fn(async () => []),
    createQueryBuilder: () => ({
      select: () => ({ where: () => ({ orderBy: () => ({ getRawMany: async () => [] }) }) }),
    }),
  };
  return { servicio: new AuditoriaService(repo), guardados, repo };
}

beforeAll(() => {
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

describe('AuditoriaService.registrar', () => {
  it('guarda un registro con los datos de quién/qué/cuándo', async () => {
    const { servicio, guardados } = crearArnes();
    await servicio.registrar({
      empresaId: 'emp-1', usuarioEmail: 'ana@x.com', usuarioRol: 'admin',
      accion: 'CREAR', entidad: 'Producto', registroId: 'prod-9',
      endpoint: 'POST /api/catalogo/productos',
      valorNuevo: { sku: 'ABC', nombre: 'Taladro' },
    });
    expect(guardados).toHaveLength(1);
    expect(guardados[0]).toEqual(expect.objectContaining({
      empresaId: 'emp-1', usuarioEmail: 'ana@x.com',
      accion: 'CREAR', entidad: 'Producto', registroId: 'prod-9',
    }));
  });

  it('ENMASCARA contraseñas y tokens en el JSON guardado', async () => {
    const { servicio, guardados } = crearArnes();
    await servicio.registrar({
      accion: 'CREAR', entidad: 'Usuario',
      valorNuevo: {
        email: 'nuevo@x.com', password: 'SuperSecreta123',
        passwordHash: '$2b$10$abc', tokenRecuperacion: 'xyz', rol: 'admin',
      },
    });
    const json = guardados[0].valorNuevo;
    expect(json).toContain('nuevo@x.com');   // dato normal se conserva
    expect(json).toContain('***');           // sensibles enmascarados
    expect(json).not.toContain('SuperSecreta123');
    expect(json).not.toContain('$2b$10$abc');
    expect(json).not.toContain('xyz');
  });

  it('convierte registroId numérico a texto', async () => {
    const { servicio, guardados } = crearArnes();
    await servicio.registrar({ accion: 'ACTUALIZAR', entidad: 'Poliza', registroId: 12345 as any });
    expect(guardados[0].registroId).toBe('12345');
  });

  it('trunca payloads gigantes para no reventar la columna', async () => {
    const { servicio, guardados } = crearArnes();
    const gigante = { blob: 'x'.repeat(20000) };
    await servicio.registrar({ accion: 'CREAR', entidad: 'Producto', valorNuevo: gigante });
    expect(guardados[0].valorNuevo.length).toBeLessThan(8100);
    expect(guardados[0].valorNuevo).toContain('[truncado]');
  });

  it('NUNCA lanza aunque la BD falle: la operación de negocio no se rompe', async () => {
    const { servicio } = crearArnes({ fallarSave: true });
    await expect(
      servicio.registrar({ accion: 'CREAR', entidad: 'Producto' }),
    ).resolves.toBeUndefined();
  });

  it('valores null (altas sin anterior / bajas sin nuevo) quedan como null, no "null"', async () => {
    const { servicio, guardados } = crearArnes();
    await servicio.registrar({ accion: 'ELIMINAR', entidad: 'Producto', valorAnterior: { id: 1 } });
    expect(guardados[0].valorNuevo).toBeNull();
    expect(guardados[0].valorAnterior).toContain('"id":1');
  });
});

describe('AuditoriaService.consultar', () => {
  it('aplica paginación con tope de 200 por página', async () => {
    const { servicio, repo } = crearArnes();
    await servicio.consultar('emp-1', { porPagina: 9999, pagina: 2 });
    const args = repo.findAndCount.mock.calls[0][0];
    expect(args.take).toBe(200);       // tope aplicado
    expect(args.skip).toBe(200);       // (pagina 2 - 1) * 200
    expect(args.order).toEqual({ fechaHora: 'DESC' });
  });

  it('filtra por empresa siempre (aislamiento multi-tenant)', async () => {
    const { servicio, repo } = crearArnes();
    await servicio.consultar('emp-7', { entidad: 'Poliza' });
    const args = repo.findAndCount.mock.calls[0][0];
    expect(args.where.empresaId).toBe('emp-7');
    expect(args.where.entidad).toBe('Poliza');
  });
});
