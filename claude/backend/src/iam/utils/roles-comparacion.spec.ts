import {
  esRolAdministrador,
  normalizarRol,
  rolAutorizado,
  rolCoincideCon,
} from './roles.util';

/**
 * Preguntar «¿este rol es el que hace falta?».
 *
 * La comparacion a mano aparecio TRES veces en el sistema y las tres decidian
 * autorizacion. Estas pruebas EJECUTAN la regla —no comprueban que este
 * escrita— porque el fallo de `gobierno` era exactamente una regla escrita,
 * comentada y cubierta por una prueba que leia el codigo, que no corria nunca.
 */
describe('comparacion de roles', () => {
  it('no depende de mayusculas, acentos ni separadores', () => {
    for (const v of ['gerencia', 'GERENCIA', 'Gerencia', ' gerencia ']) {
      expect(rolCoincideCon(v, ['gerencia'])).toBe(true);
    }
    expect(rolCoincideCon('recursos humanos', ['RECURSOS_HUMANOS'])).toBe(true);
    expect(rolCoincideCon('Direccion', ['dirección'])).toBe(true);
  });

  /*
   * El fallo concreto de los seis sitios de RRHH: `rol !== 'admin'` solo
   * aceptaba una de las seis escrituras que el sistema reconoce. Un usuario
   * con rol `administrador` quedaba fuera de las etapas de aprobacion sin que
   * nadie entendiera por que.
   */
  it('rolAutorizado reconoce al administrador con cualquiera de sus nombres', () => {
    for (const alias of [
      'admin',
      'ADMIN',
      'administrador',
      'Administrador',
      'super_admin',
      'superadmin',
    ]) {
      expect(esRolAdministrador(alias)).toBe(true);
      expect(rolAutorizado(alias, ['finanzas'])).toBe(true);
    }
  });

  /*
   * Y la distincion que justifica que sean dos funciones: cuando la regla es
   * «esta etapa es de Finanzas», el administrador no ES de Finanzas. Quien
   * necesite que pase, usa `rolAutorizado` y lo dice.
   */
  it('rolCoincideCon es literal: el administrador no pasa por serlo', () => {
    expect(rolCoincideCon('admin', ['finanzas'])).toBe(false);
    expect(rolAutorizado('admin', ['finanzas'])).toBe(true);
  });

  it('una lista vacia, nula o con huecos no autoriza a nadie', () => {
    expect(rolCoincideCon('gerencia', [])).toBe(false);
    expect(rolCoincideCon('gerencia', [null, undefined, '  '])).toBe(false);
    expect(rolCoincideCon('', ['gerencia'])).toBe(false);
    expect(rolCoincideCon(undefined, ['gerencia'])).toBe(false);
    // Pero el administrador sigue pasando: es el ultimo responsable.
    expect(rolAutorizado('admin', [])).toBe(true);
  });

  it('no confunde un rol con otro que lo contiene', () => {
    expect(rolCoincideCon('credito', ['credito_cliente'])).toBe(false);
    expect(rolCoincideCon('gerencia', ['gerencia_compras'])).toBe(false);
  });

  it('normalizarRol sigue devolviendo mayusculas, que es de donde vino el lio', () => {
    expect(normalizarRol('gobierno')).toBe('GOBIERNO');
    expect(normalizarRol('Recursos Humanos')).toBe('RECURSOS_HUMANOS');
  });
});
