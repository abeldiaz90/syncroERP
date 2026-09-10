import { of, throwError, lastValueFrom } from 'rxjs';
import { AuditoriaInterceptor } from './auditoria.interceptor';

/**
 * Tests del INTERCEPTOR: lo que decide QUÉ se audita y CÓMO se clasifica.
 * Es la pieza con más lógica, así que la cubrimos a conciencia.
 */

function contexto(req: any) {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
}

function crearInterceptor(opts?: { eximido?: boolean }) {
  const registros: any[] = [];
  const auditoria: any = {
    registrar: jest.fn(async (d: any) => {
      registros.push(d);
    }),
  };
  const reflector: any = {
    getAllAndOverride: jest.fn(() => opts?.eximido ?? false),
  };
  return {
    interceptor: new AuditoriaInterceptor(auditoria, reflector),
    registros,
  };
}

const req = (over: Partial<any> = {}) => ({
  method: 'POST',
  url: '/api/catalogo/productos',
  route: { path: '/api/catalogo/productos' },
  originalUrl: '/api/catalogo/productos',
  params: {},
  body: {},
  headers: {},
  user: { id: 'u1', email: 'ana@x.com', empresaId: 'emp-1', rol: 'admin' },
  ...over,
});

async function ejecutar(
  interceptor: AuditoriaInterceptor,
  request: any,
  respuesta: any = { id: 'nuevo-1' },
) {
  const handler = { handle: () => of(respuesta) };
  return lastValueFrom(
    interceptor.intercept(contexto(request), handler as any),
  );
}

describe('AuditoriaInterceptor — qué se audita', () => {
  it('audita un POST sobre una ruta de la lista blanca', async () => {
    const { interceptor, registros } = crearInterceptor();
    await ejecutar(interceptor, req());
    expect(registros).toHaveLength(1);
    expect(registros[0]).toEqual(
      expect.objectContaining({
        entidad: 'Producto',
        accion: 'CREAR',
        usuarioEmail: 'ana@x.com',
        empresaId: 'emp-1',
        resultado: 'OK',
      }),
    );
  });

  it('NO audita peticiones GET (solo escrituras)', async () => {
    const { interceptor, registros } = crearInterceptor();
    await ejecutar(interceptor, req({ method: 'GET' }));
    expect(registros).toHaveLength(0);
  });

  it('NO audita rutas fuera de la lista blanca', async () => {
    const { interceptor, registros } = crearInterceptor();
    await ejecutar(
      interceptor,
      req({
        url: '/api/auth/login',
        route: { path: '/api/auth/login' },
        originalUrl: '/api/auth/login',
      }),
    );
    expect(registros).toHaveLength(0);
  });

  it('respeta @SinAuditoria()', async () => {
    const { interceptor, registros } = crearInterceptor({ eximido: true });
    await ejecutar(interceptor, req());
    expect(registros).toHaveLength(0);
  });
});

describe('AuditoriaInterceptor — clasificación de acción', () => {
  const casos: Array<[string, string, string]> = [
    ['POST', '/api/catalogo/productos', 'CREAR'],
    ['PATCH', '/api/catalogo/productos/5', 'ACTUALIZAR'],
    ['PUT', '/api/catalogo/productos/5', 'ACTUALIZAR'],
    ['DELETE', '/api/catalogo/productos/5', 'ELIMINAR'],
    ['POST', '/api/finanzas/polizas/9/cancelar', 'CANCELAR'],
  ];
  it.each(casos)('%s %s → %s', async (metodo, ruta, esperado) => {
    const { interceptor, registros } = crearInterceptor();
    await ejecutar(
      interceptor,
      req({
        method: metodo,
        url: ruta,
        route: { path: ruta },
        originalUrl: ruta,
        params: ruta.includes('/5') ? { id: '5' } : {},
      }),
    );
    expect(registros[0].accion).toBe(esperado);
  });

  it('la ruta finanzas/polizas se clasifica como Poliza (segmento más específico)', async () => {
    const { interceptor, registros } = crearInterceptor();
    const ruta = '/api/finanzas/polizas/9/cancelar';
    await ejecutar(
      interceptor,
      req({
        method: 'POST',
        url: ruta,
        route: { path: ruta },
        originalUrl: ruta,
        params: { id: '9' },
      }),
    );
    expect(registros[0].entidad).toBe('Poliza');
  });
});

describe('AuditoriaInterceptor — datos capturados', () => {
  it('saca el registroId de los params de la ruta en updates', async () => {
    const { interceptor, registros } = crearInterceptor();
    await ejecutar(
      interceptor,
      req({
        method: 'PATCH',
        url: '/api/catalogo/productos/abc',
        route: { path: '/api/catalogo/productos/:id' },
        originalUrl: '/api/catalogo/productos/abc',
        params: { id: 'abc' },
      }),
    );
    expect(registros[0].registroId).toBe('abc');
  });

  it('saca el registroId de la respuesta en altas (POST)', async () => {
    const { interceptor, registros } = crearInterceptor();
    await ejecutar(interceptor, req(), { id: 'creado-77' });
    expect(registros[0].registroId).toBe('creado-77');
  });

  it('captura la IP de x-forwarded-for', async () => {
    const { interceptor, registros } = crearInterceptor();
    await ejecutar(
      interceptor,
      req({ headers: { 'x-forwarded-for': '187.190.1.1, 10.0.0.1' } }),
    );
    expect(registros[0].ip).toBe('187.190.1.1');
  });

  it('en DELETE no manda payload como valorNuevo', async () => {
    const { interceptor, registros } = crearInterceptor();
    await ejecutar(
      interceptor,
      req({
        method: 'DELETE',
        url: '/api/catalogo/productos/5',
        route: { path: '/api/catalogo/productos/:id' },
        originalUrl: '/api/catalogo/productos/5',
        params: { id: '5' },
      }),
    );
    expect(registros[0].valorNuevo).toBeNull();
  });
});

describe('AuditoriaInterceptor — errores', () => {
  it('audita como ERROR cuando la operación falla y re-lanza el error', async () => {
    const { interceptor, registros } = crearInterceptor();
    const handler = {
      handle: () => throwError(() => new Error('falló el negocio')),
    };
    await expect(
      lastValueFrom(interceptor.intercept(contexto(req()), handler as any)),
    ).rejects.toThrow('falló el negocio');
    expect(registros).toHaveLength(1);
    expect(registros[0].resultado).toBe('ERROR');
  });
});
