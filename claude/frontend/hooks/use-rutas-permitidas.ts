'use client';

/**
 * ============================================================================
 * Qué pantallas puede abrir de verdad quien está mirando
 * ----------------------------------------------------------------------------
 * El menú lateral, el panel y los centros de trabajo ya filtran sus enlaces
 * con `puedeAbrirRenglon`. Lo que no filtraba nadie eran los MOSAICOS que una
 * pantalla pinta por su cuenta: «Expedientes», «Puestos y estructura»,
 * «Configuración»… escritos a mano dentro de la página.
 *
 * MEDIDO el 15-oct-2026 en «Centro integral de nómina» entrando como
 * Tesorería —que es quien dispersa y paga, y por eso tiene la pantalla—:
 * de los seis mosaicos del pie, CINCO llevaban a una pantalla que su perfil
 * no abre. La página los pintaba igual porque los tenía escritos en el JSX.
 *
 * Esto hace para cualquier pantalla lo que `puedeAbrirRenglon` hace en el
 * menú: pregunta una vez por las rutas del propio perfil y contesta
 * `puedeAbrir(href)`.
 *
 * Tres reglas que no son adorno, las tres aprendidas en el panel principal:
 *
 *  · El administrador no pregunta: entra a todo, y preguntar le devuelve una
 *    lista vacía porque no pasa por la tabla de permisos. Sin este atajo la
 *    pantalla se le quedaría sin un solo acceso.
 *  · Pero el atajo NO se toma mientras se ve como otra persona, porque
 *    entonces el alcance es el del suplantado y «Ver como» dejaría de servir
 *    para lo único que sirve.
 *  · Si la consulta falla se queda en `null`, que significa «aún no se sabe»
 *    y ofrece todo: una pantalla no se recorta por un fallo de red, que es
 *    otro problema y se nota por otro lado.
 * ============================================================================
 */

import { useCallback, useEffect, useState } from 'react';

import { api, token } from '@/lib/api';
import { leerSesion, puedeEntrar } from '@/lib/session';
import { esRolAdministrador } from '@/lib/roles';
import { EVENTO_VER_COMO, verComoActual } from '@/lib/ver-como';
import { puedeAbrirRenglon } from '@/app/dashboard/module-config';

export function useRutasPermitidas() {
  const [rutas, setRutas] = useState<string[] | null>(null);
  const [vuelta, setVuelta] = useState(0);

  /* Cambiar de persona vuelve a preguntar: el alcance es otro. */
  useEffect(() => {
    const otra = () => setVuelta((n) => n + 1);
    window.addEventListener(EVENTO_VER_COMO, otra);
    return () => window.removeEventListener(EVENTO_VER_COMO, otra);
  }, []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const sesion = leerSesion(token.get());
      if (!sesion) return;
      if (!verComoActual() && esRolAdministrador(sesion.rol)) {
        if (vivo) setRutas(['*']);
        return;
      }
      try {
        const r = await api.get<{ rutas?: string[] }>('/admin/permisos/mis-rutas');
        if (vivo) setRutas(r.rutas ?? []);
      } catch {
        if (vivo) setRutas(null);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [vuelta]);

  /** El `href` puede traer query (`?periodoId=…`); el permiso es de la ruta. */
  const puedeAbrir = useCallback(
    (href: string) =>
      puedeAbrirRenglon(href.split('?')[0], (ruta) => puedeEntrar(rutas, ruta)),
    [rutas],
  );

  return { rutas, puedeAbrir };
}
