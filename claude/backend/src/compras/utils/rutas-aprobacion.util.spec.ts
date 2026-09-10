import { ConfiguracionAprobacion } from '../entities/configuracion-aprobacion.entity';
import {
  asignarRutaSegregada,
  derivarEscalaFinanciera,
  diagnosticarEscalaFinanciera,
  existeAsignacionSegregada,
  seleccionarRutaAprobacion,
} from './rutas-aprobacion.util';

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
