/**
 * ============================================================================
 * La vacación que nadie podía aprobar
 * ----------------------------------------------------------------------------
 * Medido por pantalla el 30-sep-2026, sesión `rrhh`, empleada 00002:
 *
 *   · Solicitud 02-oct → 06-oct capturada .......... EN REVISION, 4 laborables
 *   · Saldo ........................................ RESERVADOS 4, DISPONIBLES 10
 *   · «Aprobar nivel» .............................. 403
 *
 * No era un permiso mal puesto. Eran dos reglas correctas que juntas cierran
 * la puerta:
 *
 *   1. Sólo `rrhh` tiene el módulo de Vacaciones, así que sólo `rrhh` captura.
 *   2. `resolverVacaciones()` prohíbe —bien— que quien solicita apruebe.
 *   3. La ruta de aprobación por omisión asignaba el nivel 1 a... `rrhh`.
 *
 * Recién instalado el ERP, ninguna solicitud de vacaciones podía resolverse
 * jamás, y cada intento dejaba días reservados que no volvían solos.
 *
 * Esta prueba fija las dos mitades: que la ruta de fábrica NO apunte a quien
 * captura, y que apunte a alguien que de verdad tiene concedida la acción de
 * resolver.
 * ============================================================================
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { ROL_APROBADOR_VACACIONES_POR_OMISION } from './services/rrhh.service';
import { PLANTILLAS_PERMISOS } from '../iam/data/plantillas-permisos';

const ACCION_RESOLVER = 'PATCH /rrhh/vacaciones/solicitudes/:id/resolver';

const plantilla = (rol: string) => PLANTILLAS_PERMISOS.find((p) => p.rol === rol);

/** Todo lo que un rol puede hacer por acción concedida explícitamente. */
const accionesIrrenunciablesDe = (rol: string): string[] =>
  plantilla(rol)?.accionesIrrenunciables ?? [];

const modulosDe = (rol: string): string[] => plantilla(rol)?.modulos ?? [];

describe('La ruta de vacaciones de fábrica la puede recorrer alguien', () => {
  it('el aprobador por omisión NO es el rol que captura la solicitud', () => {
    /*
     * Quien tiene el módulo `rrhh` completo es quien abre la pantalla y
     * captura. Si el aprobador por omisión fuera uno de esos, la regla de los
     * cuatro ojos lo dejaría fuera en el mismo instante.
     */
    const capturan = PLANTILLAS_PERMISOS.map((p) => p.rol).filter((rol) =>
      modulosDe(rol).includes('rrhh'),
    );
    expect(capturan).toContain('rrhh');
    expect(capturan).not.toContain(ROL_APROBADOR_VACACIONES_POR_OMISION);
  });

  it('el aprobador por omisión sí tiene concedida la acción de resolver', () => {
    expect(accionesIrrenunciablesDe(ROL_APROBADOR_VACACIONES_POR_OMISION)).toContain(
      ACCION_RESOLVER,
    );
  });

  it('y también puede ver la bandeja que va a resolver', () => {
    expect(accionesIrrenunciablesDe(ROL_APROBADOR_VACACIONES_POR_OMISION)).toContain(
      'GET /rrhh/vacaciones/solicitudes',
    );
  });

  it('el aprobador por omisión es un rol real del ERP', () => {
    expect(PLANTILLAS_PERMISOS.map((p) => p.rol)).toContain(
      ROL_APROBADOR_VACACIONES_POR_OMISION,
    );
  });

  it('el servicio usa la constante y no un rol escrito a mano', () => {
    const fuente = readFileSync(
      join(__dirname, 'services', 'rrhh.service.ts'),
      'utf8',
    )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    const creacion = fuente.slice(
      fuente.indexOf('const niveles = matriz.length'),
      fuente.indexOf('const niveles = matriz.length') + 320,
    );
    expect(creacion).toContain('ROL_APROBADOR_VACACIONES_POR_OMISION');
    expect(creacion).not.toMatch(/rolAprobador: '[a-z]+'/);
  });

  it('la regla de los cuatro ojos sigue en pie: quien solicita no aprueba', () => {
    const fuente = readFileSync(join(__dirname, 'services', 'rrhh.service.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(fuente).toContain('solicitud.solicitadaPorId === usuarioId');
    expect(fuente).toContain('Quien solicita vacaciones no puede aprobarlas.');
  });
});
