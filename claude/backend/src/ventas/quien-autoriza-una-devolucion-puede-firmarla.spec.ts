/**
 * ============================================================================
 * Quien autoriza una devolución puede firmarla
 * ----------------------------------------------------------------------------
 * `constants/autorizacion-ventas.ts` se escribió para las DOS operaciones —lo
 * dice su encabezado: «Aquí queda un único punto para ambas operaciones»— y
 * `devoluciones-ventas.service.ts` nunca se conectó a él. Se quedó con una
 * copia privada cuyo conjunto por defecto era
 *
 *     ADMIN, ADMINISTRADOR, SUPER_ADMIN, GERENTE, SUPERVISOR
 *
 * y `GERENTE` y `SUPERVISOR` NO EXISTEN como rol en este ERP. Los trece roles
 * reales incluyen `gerencia` y `direccion`, que es lo que el archivo central ya
 * contemplaba y la copia no.
 *
 * Además faltaba la otra mitad: `POST /ventas/:id/devoluciones` es del módulo
 * `ventas`, que gerencia y dirección sólo tienen en consulta. O sea que aunque
 * el umbral los hubiera nombrado, la capa de permisos les habría contestado
 * 403.
 *
 * Resultado en una instalación por omisión: **una devolución de $5,000 o más
 * sólo la podía autorizar el administrador del sistema**, y el mensaje que
 * recibía el cajero —«requiere autorización de supervisor»— lo mandaba a
 * pedirle la firma a alguien que tampoco podía darla.
 *
 * Es el mismo defecto que `anular`, corregido el 25-sep-2026 con este mismo
 * patrón y dejado sin corregir aquí.
 * ============================================================================
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ROLES_AUTORIZADORES_ANULACION,
  ROLES_AUTORIZADORES_DEVOLUCION,
  UMBRAL_APROBACION_DEVOLUCION,
  normalizarRolAutorizador,
} from './constants/autorizacion-ventas';
import { PLANTILLAS_PERMISOS } from '../iam/data/plantillas-permisos';

const ACCION_DEVOLVER = 'POST /ventas/:id/devoluciones';

const plantilla = (rol: string) => PLANTILLAS_PERMISOS.find((p) => p.rol === rol);
const acciones = (rol: string) => plantilla(rol)?.accionesIrrenunciables ?? [];

const sinComentarios = (texto: string) =>
  texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const servicio = sinComentarios(
  readFileSync(join(__dirname, 'services', 'devoluciones-ventas.service.ts'), 'utf8'),
);

describe('El umbral de devolución nombra a roles que existen', () => {
  it.each(['gerencia', 'direccion'])(
    'el rol real %s está entre los autorizadores',
    (rol) => {
      expect(ROLES_AUTORIZADORES_DEVOLUCION().has(normalizarRolAutorizador(rol))).toBe(
        true,
      );
    },
  );

  it('todo rol autorizador que no sea de administración es un rol real del ERP', () => {
    /*
     * `GERENTE` y `SUPERVISOR` se conservan por compatibilidad con
     * instalaciones que ya los tenían en su variable de entorno; lo que no
     * puede pasar es que sean los ÚNICOS, que es lo que ocurría.
     */
    const reales = new Set(
      PLANTILLAS_PERMISOS.map((p) => normalizarRolAutorizador(p.rol)),
    );
    const autorizadores = [...ROLES_AUTORIZADORES_DEVOLUCION()];
    const deAdministracion = ['ADMIN', 'ADMINISTRADOR', 'SUPER_ADMIN'];
    const operativos = autorizadores.filter((r) => !deAdministracion.includes(r));
    expect(operativos.some((r) => reales.has(r))).toBe(true);
  });

  it('anular y devolver comparten los nombres de rol reales', () => {
    for (const rol of ['gerencia', 'direccion']) {
      const clave = normalizarRolAutorizador(rol);
      expect(ROLES_AUTORIZADORES_ANULACION().has(clave)).toBe(true);
      expect(ROLES_AUTORIZADORES_DEVOLUCION().has(clave)).toBe(true);
    }
  });

  it('el umbral por omisión sigue siendo $5,000', () => {
    expect(UMBRAL_APROBACION_DEVOLUCION()).toBe(5000);
  });
});

describe('Y además pueden llegar al botón', () => {
  it.each(['gerencia', 'direccion'])('%s tiene concedida la acción de devolver', (rol) => {
    expect(acciones(rol)).toContain(ACCION_DEVOLVER);
  });

  it.each(['gerencia', 'direccion'])('%s NO gana el módulo de ventas por eso', (rol) => {
    /*
     * Autorizar una devolución no es tener el mostrador. Si `ventas` pasara a
     * `modulos`, gerencia podría vender, que es justo lo que la separación de
     * funciones evita.
     */
    expect(plantilla(rol)?.modulos ?? []).not.toContain('ventas');
    expect(plantilla(rol)?.modulosConsulta ?? []).toContain('ventas');
    expect(acciones(rol)).not.toContain('POST /ventas');
  });

  it('el mostrador sigue pudiendo devolver por debajo del umbral', () => {
    expect(plantilla('empleado')?.modulos ?? []).toContain('ventas');
  });
});

describe('El servicio usa el único punto, no una copia', () => {
  it('importa las constantes centralizadas', () => {
    expect(servicio).toMatch(/from '\.\.\/constants\/autorizacion-ventas'/);
    expect(servicio).toMatch(/ROLES_AUTORIZADORES_DEVOLUCION/);
    expect(servicio).toMatch(/UMBRAL_APROBACION_DEVOLUCION/);
  });

  it('ya no tiene su propia lista de roles cableada', () => {
    expect(servicio).not.toMatch(/rolesAutorizadoresDevolucion/);
    expect(servicio).not.toMatch(/DEVOLUCIONES_ROLES_AUTORIZADORES/);
    expect(servicio).not.toMatch(/'ADMIN,ADMINISTRADOR,SUPER_ADMIN/);
  });

  it('ni su propia lectura del umbral', () => {
    expect(servicio).not.toMatch(/numeroConfiguracion\(\s*'DEVOLUCIONES_MONTO_APROBACION'/);
  });

  it('usa la normalización compartida y no una suya', () => {
    expect(servicio).toMatch(/normalizarRolAutorizador\(rolUsuario\)/);
    expect(servicio).not.toMatch(/const normalizarRol = /);
  });
});
