import { ConfiguracionAprobacion } from '../entities/configuracion-aprobacion.entity';
import {
  asignarRutaSegregada,
  derivarEscalaFinanciera,
  diagnosticarEscalaFinanciera,
  existeAsignacionSegregada,
  resolverFirmante,
  seleccionarRutaAprobacion,
} from './rutas-aprobacion.util';
import { Usuario } from '../../iam/entities/usuario.entity';

const nivel = (orden: number, montoHasta?: number) =>
  ({ orden, montoDesde: 0, montoHasta }) as ConfiguracionAprobacion;

describe('rutas de aprobación financieras', () => {
  const matriz = [nivel(1, 50_000), nivel(2, 250_000), nivel(3)];

  it('exige todos los niveles anteriores hasta la autoridad suficiente', () => {
    expect(seleccionarRutaAprobacion(matriz, 'CREDITO_CLIENTE', 40_000)).toHaveLength(1);
    expect(seleccionarRutaAprobacion(matriz, 'CREDITO_CLIENTE', 100_000)).toHaveLength(2);
    expect(seleccionarRutaAprobacion(matriz, 'HOTEL_CONVENIO', 300_000)).toHaveLength(3);
  });

  it('deriva rangos contiguos sin duplicar centavos', () => {
    expect(
      derivarEscalaFinanciera([
        { montoHasta: 50_000 },
        { montoHasta: 250_000 },
        {},
      ]),
    ).toEqual([
      { montoDesde: 0, montoHasta: 50_000 },
      { montoDesde: 50_000.01, montoHasta: 250_000 },
      { montoDesde: 250_000.01 },
    ]);
  });
});


describe('diagnosticarEscalaFinanciera', () => {
  it('acepta una escala acumulativa global, obligatoria y sin autoaprobación', () => {
    expect(
      diagnosticarEscalaFinanciera([
        { orden: 1, montoDesde: 0, montoHasta: 50_000, obligatorio: true, permiteAutoaprobacion: false },
        { orden: 2, montoDesde: 50_000.01, montoHasta: 250_000, obligatorio: true, permiteAutoaprobacion: false },
        { orden: 3, montoDesde: 250_000.01, montoHasta: null, obligatorio: true, permiteAutoaprobacion: false },
      ]),
    ).toEqual([]);
  });

  it('rechaza matrices departamentales, saltos, autoaprobación y último nivel con tope', () => {
    const errores = diagnosticarEscalaFinanciera([
      { orden: 1, montoDesde: 10, montoHasta: 50_000, obligatorio: false, permiteAutoaprobacion: true, departamentoId: 'area-1' },
      { orden: 3, montoDesde: 50_000, montoHasta: 100_000, obligatorio: true, permiteAutoaprobacion: false },
    ]);
    expect(errores.length).toBeGreaterThanOrEqual(5);
  });
});


describe('existeAsignacionSegregada', () => {
  it('encuentra una combinación de personas distintas por nivel', () => {
    expect(
      existeAsignacionSegregada([
        { orden: 1, candidatos: ['u1'] },
        { orden: 2, candidatos: ['u1', 'u2'] },
        { orden: 3, candidatos: ['u3'] },
      ]),
    ).toBe(true);
  });

  it('rechaza rutas que sólo pueden ser atendidas por la misma persona', () => {
    expect(
      existeAsignacionSegregada([
        { orden: 1, candidatos: ['u1'] },
        { orden: 2, candidatos: ['u1'] },
      ]),
    ).toBe(false);
  });

  it('excluye al solicitante de todos los niveles financieros', () => {
    expect(
      existeAsignacionSegregada(
        [
          { orden: 1, candidatos: ['solicitante', 'u2'] },
          { orden: 2, candidatos: ['u2'] },
        ],
        ['solicitante'],
      ),
    ).toBe(false);
  });
});


describe('asignarRutaSegregada', () => {
  it('materializa personas distintas y evita dejar un nivel posterior sin aprobador', () => {
    const asignacion = asignarRutaSegregada(
      [
        { orden: 1, candidatos: ['usuario-b', 'usuario-a'] },
        { orden: 2, candidatos: ['usuario-b'] },
      ],
      ['solicitante'],
    );

    expect(asignacion?.get(1)).toBe('usuario-a');
    expect(asignacion?.get(2)).toBe('usuario-b');
  });

  it('rechaza una ruta que sólo puede reutilizar a la misma persona', () => {
    expect(
      asignarRutaSegregada([
        { orden: 1, candidatos: ['usuario-a'] },
        { orden: 2, candidatos: ['usuario-a'] },
      ]),
    ).toBeNull();
  });
});


/**
 * La cadena de firma. Las pruebas fijan sobre todo los dos modos de fallar que
 * ya costaron caro: que la ruta nombre a alguien que ya no esta y el area
 * entera se pare, y que el solicitante acabe firmandose a si mismo.
 */
describe('quien firma: persona -> rol -> suplente -> administracion', () => {
  const persona = (
    id: string,
    rol: string,
    activo = true,
    esPropietario = false,
  ) => ({ id, rol, activo, esPropietario }) as Usuario;

  const PADRON = [
    persona('ana', 'gerencia'),
    persona('beto', 'gerencia'),
    persona('caro', 'contador'),
    persona('dir', 'admin'),
    persona('viejo', 'gerencia', false),
  ];

  it('respeta a la persona que la ruta nombra', () => {
    expect(
      resolverFirmante({ usuarioId: 'caro' }, PADRON, 'quien-pide')?.id,
    ).toBe('caro');
  });

  it('con ruta por rol toma a alguien de ese rol', () => {
    expect(
      resolverFirmante({ rolAprobador: 'gerencia' }, PADRON, 'quien-pide')?.id,
    ).toBe('ana');
  });

  /*
   * El escalon que estaba muerto. Buscaba al original dentro de la lista de
   * ACTIVOS, y el original esta inactivo por definicion —si estuviera activo
   * habriamos salido en el primer escalon—, asi que no lo encontraba nunca y
   * se caia directo a administracion. Con el padron completo encuentra su rol
   * y busca un suplente con la misma autoridad.
   */
  it('si la persona nombrada esta de baja, firma alguien de su mismo rol', () => {
    const firmante = resolverFirmante({ usuarioId: 'viejo' }, PADRON, 'quien-pide');
    expect(firmante?.id).toBe('ana');
    expect(firmante?.rol).toBe('gerencia');
  });

  it('cae en administracion cuando no queda nadie con esa autoridad', () => {
    expect(
      resolverFirmante({ rolAprobador: 'tesoreria' }, PADRON, 'quien-pide')?.id,
    ).toBe('dir');
  });

  /*
   * Invariante que no cede en ningun escalon. Si `noEsElSolicitante` se
   * aplicara solo al final, este caso devolveria null en vez de pasar al
   * siguiente de su mismo rol.
   */
  it('el solicitante no se firma a si mismo, ni nombrado ni por rol', () => {
    expect(resolverFirmante({ usuarioId: 'ana' }, PADRON, 'ana')?.id).toBe('beto');
    expect(resolverFirmante({ rolAprobador: 'gerencia' }, PADRON, 'ana')?.id).toBe('beto');
  });

  it('devuelve null cuando el unico candidato posible es quien pide', () => {
    const solos = [persona('ana', 'gerencia')];
    expect(resolverFirmante({ rolAprobador: 'gerencia' }, solos, 'ana')).toBeNull();
  });

  it('nunca propone a alguien inactivo', () => {
    const soloInactivos = [persona('viejo', 'gerencia', false)];
    expect(
      resolverFirmante({ usuarioId: 'viejo' }, soloInactivos, 'quien-pide'),
    ).toBeNull();
  });
});
