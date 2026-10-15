/**
 * ============================================================================
 * Los mosaicos que una pantalla pinta por su cuenta
 * ----------------------------------------------------------------------------
 * POR QUÉ EXISTE ESTA PRUEBA
 *
 * El menú lateral, el panel principal, el centro de trabajo y la barra del
 * módulo ya filtran sus enlaces con `puedeAbrirRenglon`, y hay una prueba que
 * lo vigila. Lo que no vigilaba nadie eran los enlaces que una PANTALLA
 * escribe a mano en su propio JSX.
 *
 * MEDIDO el 15-oct-2026 en «Centro integral de nómina» viendo el ERP como
 * Tesorería —que es quien dispersa y paga la nómina, y por eso tiene esa
 * pantalla—: de los seis mosaicos del pie, CINCO llevaban a una pantalla que
 * su perfil no abre (puestos, aprobaciones de estructura, expedientes,
 * incidencias y configuración de nómina). La lista de requisitos enlazaba a
 * las mismas, y el botón «Alta de empleado» del encabezado también.
 *
 * Es la misma falta del menú, un piso más abajo: ofrecer lo que no se puede
 * abrir. La pantalla sigue siendo suya —Tesorería tiene que ver si la nómina
 * está lista—, pero los destinos se ofrecen a quien puede entrar.
 *
 * Las tres reglas del gancho no son adorno, y por eso se fijan aquí:
 *   · el administrador no pregunta, entra a todo;
 *   · pero mientras ve como otra persona sí pregunta, o «Ver como» no sirve;
 *   · y un fallo de red no recorta la pantalla.
 * ============================================================================
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..', '..', '..');
const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
  .map((n) => join(RAIZ, n))
  .find((r) => existsSync(join(r, 'hooks/use-rutas-permitidas.ts')));

const leer = (...p: string[]) => readFileSync(join(FRONTEND!, ...p), 'utf8');

describe('una pantalla no ofrece lo que no abre', () => {
  it('encuentra el frontend, o no mide nada', () => {
    expect(FRONTEND).toBeDefined();
  });

  describe('el gancho que contesta qué se puede abrir', () => {
    const hook = () => leer('hooks/use-rutas-permitidas.ts');

    it('existe y se apoya en la misma función que el menú', () => {
      expect(hook()).toMatch(/export function useRutasPermitidas\(\)/);
      expect(hook()).toMatch(/puedeAbrirRenglon\(/);
      expect(hook()).toMatch(/puedeEntrar\(rutas, ruta\)/);
    });

    it('el administrador no pregunta: preguntar le devuelve la lista vacía', () => {
      expect(hook()).toMatch(
        /if \(!verComoActual\(\) && esRolAdministrador\(sesion\.rol\)\) \{\s*if \(vivo\) setRutas\(\['\*'\]\);/,
      );
    });

    it('pero sí pregunta mientras ve como otra persona', () => {
      /*
       * `!verComoActual()` dentro de la misma condición es lo que lo garantiza.
       * Y el evento de cambio de persona vuelve a preguntar, porque el alcance
       * es otro desde ese instante.
       */
      expect(hook()).toMatch(/window\.addEventListener\(EVENTO_VER_COMO/);
    });

    it('un fallo de red no recorta la pantalla', () => {
      expect(hook()).toMatch(/catch \{\s*if \(vivo\) setRutas\(null\);/);
    });

    it('la query del enlace no entra en la pregunta', () => {
      expect(hook()).toMatch(/href\.split\('\?'\)\[0\]/);
    });
  });

  describe('el centro integral de nómina', () => {
    const centro = () => leer('app/dashboard/rrhh/centro-nomina/page.tsx');

    it('usa el gancho', () => {
      expect(centro()).toMatch(/const \{ puedeAbrir \} = useRutasPermitidas\(\);/);
    });

    it('los seis mosaicos del pie pasan por el filtro', () => {
      expect(centro()).toMatch(/\.filter\(\(a\) => puedeAbrir\(a\.href\)\)/);
    });

    it('los requisitos siguen contándose aunque no se puedan abrir', () => {
      /*
       * No se esconden: el avance se calcula con los cinco, y quien mira tiene
       * que saber si están cumplidos aunque no sea quien los cumple. Lo que se
       * quita es el enlace, no el renglón.
       */
      expect(centro()).toMatch(/href=\{puedeAbrir\(r\.href\) \? r\.href : null\}/);
      expect(centro()).toMatch(/requisitos\.filter\(\(r\) => r\.listo\)/);
    });

    it('el botón del encabezado y los siguientes pasos también', () => {
      expect(centro()).toMatch(/\{puedeAbrir\('\/dashboard\/rrhh\/empleados'\) && <Link/);
      expect(centro()).toMatch(/\{puedeAbrir\('\/dashboard\/rrhh\/pagos'\) && <Link/);
    });

    it('LA PRUEBA DE LA PRUEBA: no queda ningún mosaico escrito a mano', () => {
      /*
       * Ésa era la forma exacta del fallo: `<Acceso ... href="/dashboard/…" />`
       * suelto en el JSX. Si vuelve a aparecer uno, no pasó por el filtro.
       */
      expect(centro()).not.toMatch(/<Acceso [^>]*href="/);
    });
  });
});
