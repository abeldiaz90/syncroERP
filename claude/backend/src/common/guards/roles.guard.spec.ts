import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

/**
 * ============================================================================
 * Que `@Roles(...)` signifique algo — y que encenderlo no deje a nadie fuera
 * ----------------------------------------------------------------------------
 * Este guardia se enciende sobre 47 anotaciones que llevaban tiempo sin
 * evaluarse, escritas con tres estilos distintos. El riesgo de encenderlo no es
 * que niegue de más en general: es que niegue por una MAYÚSCULA. Eso es lo que
 * se prueba aquí, además de que niegue lo que debe.
 * ============================================================================
 */

const contexto = (roles: string[] | undefined, usuario: unknown) =>
  ({
    getHandler: () => 'h',
    getClass: () => 'c',
    switchToHttp: () => ({
      getRequest: () => ({
        user: usuario,
        method: 'GET',
        url: '/api/integracion/roles/diagnostico',
      }),
    }),
  }) as any;

const guardia = (roles: string[] | undefined) => {
  const reflector = {
    getAllAndOverride: () => roles,
  } as unknown as Reflector;
  return new RolesGuard(reflector);
};

const niega = (roles: string[] | undefined, usuario: unknown) => {
  let mensaje = '(no negó)';
  try {
    guardia(roles).canActivate(contexto(roles, usuario));
  } catch (e: any) {
    mensaje = e?.message ?? String(e);
  }
  return mensaje;
};

describe('RolesGuard', () => {
  it('sin anotación no opina: manda la tabla de permisos', () => {
    expect(guardia(undefined).canActivate(contexto(undefined, { rol: 'empleado' }))).toBe(true);
    expect(guardia([]).canActivate(contexto([], { rol: 'empleado' }))).toBe(true);
  });

  it('deja pasar al rol exigido', () => {
    expect(
      guardia(['administrador', 'direccion']).canActivate(
        contexto(['administrador', 'direccion'], { rol: 'direccion' }),
      ),
    ).toBe(true);
  });

  it('niega al rol que no está', () => {
    // El caso concreto: `credito` tiene el módulo `integracion` en consulta, así
    // que la tabla de permisos lo dejaba entrar al diagnóstico de usuarios.
    expect(niega(['administrador', 'direccion'], { rol: 'credito' })).toContain(
      'de administración',
    );
  });

  it('el administrador pasa siempre, escrito como sea', () => {
    for (const rol of ['admin', 'ADMIN', 'administrador', 'Administrador', 'SUPER_ADMIN']) {
      expect(
        guardia(['direccion']).canActivate(contexto(['direccion'], { rol })),
      ).toBe(true);
    }
  });

  it('la mayúscula y el acento no deciden quién entra', () => {
    // Las anotaciones se escribieron con tres estilos a lo largo del tiempo y
    // el rol en la base es un varchar que nadie garantiza en minúsculas.
    const casos: [string, string][] = [
      ['DIRECCION', 'direccion'],
      ['direccion', 'DIRECCIÓN'],
      ['contador', 'Contador'],
      ['cobranza', ' cobranza '],
    ];
    for (const [exigido, mio] of casos) {
      expect(guardia([exigido]).canActivate(contexto([exigido], { rol: mio }))).toBe(true);
    }
  });

  it('sin usuario no decide aquí: las rutas públicas siguen abiertas', () => {
    // El webhook del core y la comprobación de dirección son @Public() y su
    // propia clave es la que manda. Negar aquí las rompería.
    expect(guardia(['administrador']).canActivate(contexto(['administrador'], undefined))).toBe(
      true,
    );
  });

  it('un rol vacío o nulo no pasa por accidente', () => {
    expect(niega(['administrador'], { rol: '' })).toContain('de administración');
    expect(niega(['administrador'], { rol: null })).toContain('de administración');
    expect(niega(['administrador'], {})).toContain('de administración');
  });
});
