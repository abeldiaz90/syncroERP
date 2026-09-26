/**
 * ============================================================================
 * La matriz que se veia perfecta y no dejaba pasar nada
 * ----------------------------------------------------------------------------
 * El caso real, medido contra la instalacion de SUMA el 25-sep-2026:
 *
 *   POST /clientes  (rol credito, limiteCredito 300 000)
 *   → 409 «El nivel 1 requiere el rol credito, pero el solicitante es la unica
 *          persona activa con ese rol y la autoaprobacion esta deshabilitada.»
 *
 * Y la pantalla de gobierno enseñaba la matriz en verde, con sus dos niveles,
 * sus montos y sus plazos. El rechazo era correcto —quien pide no firma— pero
 * llegaba el dia que alguien intentaba trabajar, y no antes.
 *
 * Estas pruebas fijan que el diagnostico se pueda dar ANTES, mirando solo la
 * matriz y quien esta activo.
 * ============================================================================
 */

import {
  diagnosticarMatriz,
  diagnosticarNivel,
  matrizTieneAdvertencias,
} from './salud-matriz.util';

const persona = (id: string, rol: string, nombre?: string) => ({ id, rol, nombre });

describe('Salud de la matriz de aprobacion', () => {
  it('canta el nivel que solo una persona puede firmar', () => {
    const salud = diagnosticarNivel(
      { orden: 1, rolAprobador: 'credito', permiteAutoaprobacion: false },
      [persona('u1', 'credito', 'Ana'), persona('u2', 'admin')],
    );

    expect(salud.estado).toBe('FIRMANTE_UNICO');
    expect(salud.firmantesActivos).toBe(1);
    // El mensaje tiene que servirle a quien gobierna la matriz, no al programador.
    expect(salud.mensaje).toContain('Ana');
    expect(salud.mensaje).toMatch(/quien pide no puede firmar/i);
  });

  it('no dice nada cuando hay dos personas que pueden firmar', () => {
    const salud = diagnosticarNivel(
      { orden: 1, rolAprobador: 'credito', permiteAutoaprobacion: false },
      [persona('u1', 'credito'), persona('u2', 'CREDITO'), persona('u3', 'admin')],
    );

    expect(salud.estado).toBe('CORRECTO');
    expect(salud.firmantesActivos).toBe(2);
    expect(salud.mensaje).toBeNull();
  });

  it('compara el rol normalizado en los dos lados', () => {
    /*
     * El rol del usuario llega en MAYUSCULAS desde el directorio y el de la
     * matriz en minusculas. Comparar literalmente es el error que ya dejo a
     * `gobierno` con el historial vacio teniendo la regla bien escrita.
     */
    const salud = diagnosticarNivel(
      { orden: 2, rolAprobador: 'Direccion', permiteAutoaprobacion: false },
      [persona('u1', 'DIRECCION'), persona('u2', 'direccion')],
    );

    expect(salud.estado).toBe('CORRECTO');
  });

  it('avisa del nivel enrutado a un rol que nadie tiene', () => {
    const salud = diagnosticarNivel(
      { orden: 2, rolAprobador: 'direccion', permiteAutoaprobacion: false },
      [persona('u1', 'credito')],
    );

    expect(salud.estado).toBe('SIN_FIRMANTE');
    expect(salud.firmantesActivos).toBe(0);
    expect(salud.mensaje).toContain('direccion');
  });

  it('avisa del nivel asignado a una persona que ya no esta activa', () => {
    const salud = diagnosticarNivel(
      { orden: 1, usuarioId: 'se-fue', permiteAutoaprobacion: false },
      [persona('u1', 'credito')],
    );

    expect(salud.estado).toBe('SIN_FIRMANTE');
    expect(salud.mensaje).toMatch(/ya no esta activa/i);
  });

  it('con autoaprobacion encendida, un solo firmante no es un problema', () => {
    /*
     * Es una decision de la empresa, tomada a proposito y visible en la matriz.
     * Este diagnostico no opina sobre ella: opina sobre la contradiccion de
     * exigir una firma que nadie puede dar.
     */
    const salud = diagnosticarNivel(
      { orden: 1, rolAprobador: 'credito', permiteAutoaprobacion: true },
      [persona('u1', 'credito')],
    );

    expect(salud.estado).toBe('CORRECTO');
  });

  it('reproduce la matriz de CREDITO_CLIENTE de SUMA tal como estaba', () => {
    const matriz = diagnosticarMatriz(
      [
        { orden: 1, rolAprobador: 'credito', permiteAutoaprobacion: false },
        { orden: 2, rolAprobador: 'admin', permiteAutoaprobacion: false },
      ],
      [persona('u-credito', 'credito', 'Crédito UAT'), persona('u-admin', 'admin')],
    );

    expect(matriz.map((n) => n.estado)).toEqual([
      'FIRMANTE_UNICO',
      'FIRMANTE_UNICO',
    ]);
    expect(matrizTieneAdvertencias(matriz)).toBe(true);
  });

  it('devuelve los niveles ordenados aunque lleguen al reves', () => {
    const matriz = diagnosticarMatriz(
      [
        { orden: 3, rolAprobador: 'direccion' },
        { orden: 1, rolAprobador: 'credito' },
        { orden: 2, rolAprobador: 'finanzas' },
      ],
      [],
    );

    expect(matriz.map((n) => n.orden)).toEqual([1, 2, 3]);
  });

  it('una matriz sana no levanta advertencias', () => {
    const matriz = diagnosticarMatriz(
      [
        { orden: 1, rolAprobador: 'credito', permiteAutoaprobacion: false },
        { orden: 2, rolAprobador: 'direccion', permiteAutoaprobacion: false },
      ],
      [
        persona('a', 'credito'),
        persona('b', 'credito'),
        persona('c', 'direccion'),
        persona('d', 'direccion'),
      ],
    );

    expect(matrizTieneAdvertencias(matriz)).toBe(false);
  });

  it('un firmante unico NO es problema si ese rol no puede originar el documento', () => {
    /*
     * Gerencia no puede dar de alta un cliente. Que haya un solo gerente no
     * impide ninguna solicitud de credito, y avisarlo seria ruido: un aviso que
     * salta siempre se deja de leer, y entonces el aviso que si importa —el del
     * nivel 1— pasa desapercibido con el resto.
     */
    const salud = diagnosticarNivel(
      { orden: 2, rolAprobador: 'gerencia', permiteAutoaprobacion: false },
      [persona('u1', 'gerencia')],
      ['empleado', 'credito', 'cobranza', 'hoteleria'],
    );

    expect(salud.estado).toBe('CORRECTO');
  });

  it('sigue avisando del nivel firmado por el mismo rol que origina', () => {
    const salud = diagnosticarNivel(
      { orden: 1, rolAprobador: 'credito', permiteAutoaprobacion: false },
      [persona('u1', 'credito')],
      ['empleado', 'credito'],
    );

    expect(salud.estado).toBe('FIRMANTE_UNICO');
  });

  it('sin firmante avisa aunque el rol no origine nada', () => {
    // Un nivel que nadie puede firmar para el documento igual, origine quien origine.
    const salud = diagnosticarNivel(
      { orden: 2, rolAprobador: 'direccion', permiteAutoaprobacion: false },
      [persona('u1', 'credito')],
      ['empleado', 'credito'],
    );

    expect(salud.estado).toBe('SIN_FIRMANTE');
  });
});
