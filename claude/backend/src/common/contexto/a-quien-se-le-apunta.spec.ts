/**
 * ============================================================================
 * A quién se le apunta lo que acaba de pasar
 * ----------------------------------------------------------------------------
 * El guardia de suplantación REEMPLAZA `request.user` por el usuario objetivo
 * —ésa es toda su gracia— y guarda al real en `user.suplantacion`. El contexto
 * de la petición no leía ese campo, así que lo único que podía decir era el
 * nombre del suplantado:
 *
 *     Modo de cartera de la empresa e1: ESPEJO → APAGADO, por juan@almacen
 *
 * …y juan no hizo nada. Es el peor renglón de auditoría posible: no está vacío,
 * está equivocado, y señala a una persona concreta.
 * ============================================================================
 */
import { nombreDelActor } from './contexto-peticion';

describe('nombreDelActor', () => {
  it('sin suplantación, es quien hizo la petición', () => {
    expect(nombreDelActor({ email: 'ana@suma.mx', usuarioId: 'u1' })).toBe('ana@suma.mx');
  });

  it('bajo suplantación nombra al REAL primero, y dice como quién actuaba', () => {
    const texto = nombreDelActor({
      email: 'juan@almacen.mx',
      usuarioId: 'u2',
      suplantacion: { realId: 'u1', realEmail: 'ana@suma.mx', realRol: 'ADMINISTRADOR' },
    });
    expect(texto).toMatch(/^ana@suma\.mx/);
    expect(texto).toContain('juan@almacen.mx');
  });

  it('nunca atribuye el cambio sólo al suplantado', () => {
    const texto = nombreDelActor({
      email: 'juan@almacen.mx',
      suplantacion: { realEmail: 'ana@suma.mx' },
    });
    expect(texto).not.toBe('juan@almacen.mx');
  });

  it('sin correo, cae a los identificadores en vez de mentir', () => {
    expect(nombreDelActor({ usuarioId: 'u2', suplantacion: { realId: 'u1' } })).toBe(
      'u1 (viendo el ERP como u2)',
    );
  });

  it('fuera de una petición lo dice, en vez de atribuírselo a nadie', () => {
    expect(nombreDelActor(undefined)).toBe('un proceso sin sesión');
    expect(nombreDelActor({})).toBe('un proceso sin sesión');
  });
});
