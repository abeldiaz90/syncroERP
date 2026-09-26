/**
 * ============================================================================
 * El tablero de pendientes lo ve quien tiene que actuar
 * ----------------------------------------------------------------------------
 * «Operaciones pendientes» responde qué está esperando por alguien: cuántas
 * requisiciones hay por aprobar, cuántas órdenes por recibir, cuántos conteos
 * abiertos, cuánta cartera vencida. Cada línea nombra a su responsable —
 * «Aprobadores de compras», «Almacén receptor», «Cobranza»— y enlaza a la
 * pantalla donde se resuelve.
 *
 * Medido el 25-sep-2026: los NUEVE roles de prueba recibían 403. El endpoint
 * cuelga de `/configuracion`, que es de administración, así que el único que
 * podía abrir el tablero era quien no tiene que actuar en ninguna de sus
 * líneas. La gente nombrada en él no lo veía.
 *
 * Lo que devuelve son CUENTAS —«3 requisiciones pendientes»—, no documentos ni
 * importes: abrirlo en consulta no expone nada que el rol no pueda ver ya
 * dentro de su propio módulo, y es como funciona el tablero de tareas de
 * cualquier ERP moderno.
 * ============================================================================
 */
import { PLANTILLAS_PERMISOS } from './plantillas-permisos';

const ACCION = 'GET /configuracion/pendientes';

/** Los roles que aparecen como responsables de alguna línea del tablero. */
const ROLES_OPERATIVOS = [
  'gerencia',
  'direccion',
  'comprador',
  'almacenista',
  'contador',
  'finanzas',
  'tesoreria',
  'credito',
  'rrhh',
];

const plantillaDe = (rol: string) =>
  PLANTILLAS_PERMISOS.find((p) => p.rol === rol);

describe('Operaciones pendientes · lo ve quien tiene que actuar', () => {
  it('los roles declarados existen', () => {
    const inexistentes = ROLES_OPERATIVOS.filter((rol) => !plantillaDe(rol));
    expect(inexistentes).toEqual([]);
  });

  it('cada rol operativo puede abrir el tablero', () => {
    const sinAcceso = ROLES_OPERATIVOS.filter(
      (rol) =>
        !(plantillaDe(rol)?.accionesIrrenunciables ?? []).includes(ACCION),
    );
    expect(sinAcceso).toEqual([]);
  });

  it('a nadie se le concede y se le veda a la vez', () => {
    const contradicciones = ROLES_OPERATIVOS.filter((rol) =>
      (plantillaDe(rol)?.accionesVedadas ?? []).includes(ACCION),
    );
    expect(contradicciones).toEqual([]);
  });
});
