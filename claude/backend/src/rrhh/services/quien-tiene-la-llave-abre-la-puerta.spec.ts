import { readFileSync } from 'fs';
import { join } from 'path';

import { PLANTILLAS_PERMISOS } from '../../iam/data/plantillas-permisos';

/**
 * ============================================================================
 * Quien tiene la llave puede abrir la puerta
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * La plantilla de `direccion` declara irrenunciables, con su motivo escrito,
 * `GET /rrhh/estructura/solicitudes` y `POST /rrhh/estructura/solicitudes/:id/
 * gerencia`: dirección está por encima de gerencia y la cubre cuando el
 * gerente falta, porque si no el alta de puestos se detiene en cuanto alguien
 * se va de vacaciones.
 *
 * El servicio no lo sabía. Su lista era `['rrhh', 'gerencia', 'finanzas']` para
 * listar y `['gerencia']` para la primera firma. Medido en vivo el 25-sep-2026
 * con la sesión de dirección: la tabla de permisos decía que sí —la pantalla
 * salía en su menú— y el servicio contestaba «No tienes acceso a las
 * solicitudes de estructura».
 *
 * Es el patrón de siempre visto del revés: no un botón que el permiso niega,
 * sino un permiso que el servicio niega. Las dos autorizaciones tienen que
 * decir lo mismo, y la que expresa la intención es la plantilla, porque ahí
 * está escrito el porqué.
 *
 * QUÉ CUIDA ESTA PRUEBA
 *
 * Que todo rol al que la plantilla le concede una acción de estructura
 * organizacional aparezca en la lista del servicio que la atiende. Si alguien
 * añade un rol a la plantilla y se olvida del servicio —o al revés—, esto
 * falla antes de que el usuario se encuentre con la puerta cerrada.
 * ============================================================================
 */

const SERVICIO = join(__dirname, 'estructura-organizacional.service.ts');

/** Los roles de la enésima lista `rolAutorizado(usuario.rol, [...])`. */
function listaDeRoles(texto: string, desde: number): string[] {
  const inicio = texto.indexOf('[', desde);
  const fin = texto.indexOf(']', inicio);
  if (inicio < 0 || fin < 0) return [];
  return [...texto.slice(inicio, fin).matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
}

describe('Estructura organizacional · quien tiene la llave abre la puerta', () => {
  const texto = readFileSync(SERVICIO, 'utf8');

  /** Roles cuya plantilla declara la acción como irrenunciable. */
  const conAccion = (accion: string) =>
    PLANTILLAS_PERMISOS.filter((p) =>
      (p.accionesIrrenunciables ?? []).includes(accion),
    ).map((p) => p.rol);

  it('la plantilla concede estas acciones a alguien (si no, no se mide nada)', () => {
    expect(conAccion('GET /rrhh/estructura/solicitudes').length).toBeGreaterThan(
      0,
    );
    expect(
      conAccion('POST /rrhh/estructura/solicitudes/:id/gerencia').length,
    ).toBeGreaterThan(0);
  });

  it('quien puede consultar por permiso, puede consultar por servicio', () => {
    const i = texto.indexOf('async listar(');
    expect(i).toBeGreaterThan(0);
    const permitidos = listaDeRoles(texto, texto.indexOf('rolAutorizado(', i));
    expect(permitidos.length).toBeGreaterThan(0);

    const sinAcceso = conAccion('GET /rrhh/estructura/solicitudes').filter(
      (rol) => !permitidos.includes(rol),
    );
    expect(sinAcceso.sort()).toEqual([]);
  });

  it('quien puede firmar la etapa de gerencia, puede firmarla', () => {
    const i = texto.indexOf('const rolesPermitidos');
    expect(i).toBeGreaterThan(0);
    /* `etapa === 'GERENCIA' ? [...] : [...]`: la primera lista es la de gerencia. */
    const permitidos = listaDeRoles(texto, i);
    expect(permitidos).toContain('gerencia');

    const sinFirma = conAccion(
      'POST /rrhh/estructura/solicitudes/:id/gerencia',
    ).filter((rol) => !permitidos.includes(rol));
    expect(sinFirma.sort()).toEqual([]);
  });

  it('la segunda etapa sigue siendo de Finanzas, y de nadie más', () => {
    /*
     * La holgura de la primera firma no puede colarse en la segunda: quien
     * cubre una no cubre las dos, o el control de cuatro ojos desaparece.
     */
    const i = texto.indexOf('const rolesPermitidos');
    const resto = texto.slice(i, i + 300);
    const segunda = resto.slice(resto.indexOf(':', resto.indexOf(']')));
    const roles = [...segunda.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    expect(roles).toEqual(['finanzas']);
  });
});
