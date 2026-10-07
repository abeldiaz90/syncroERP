"use client";

import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { esRolAdministrador } from '@/lib/roles';
import { leerSesion } from '@/lib/session';
import { CABECERA_SUPLANTACION, EVENTO_VER_COMO, verComoActual } from '@/lib/ver-como';

type MapaPermisos = Record<string, boolean>;
type Contexto = {
  permisos: MapaPermisos;
  cargando: boolean;
  isAdmin: boolean;
  refrescar: () => Promise<void>;
};

const PermisosContext = createContext<Contexto>({
  permisos: {}, cargando: true, isAdmin: false, refrescar: async () => undefined,
});

const normalizar = (data: unknown): MapaPermisos => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const plano: MapaPermisos = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (typeof v === 'boolean') {
      const clave = k === '*' ? '*' : k.replace(/^\/api/, '');
      plano[clave] = v;
    } else if (v && typeof v === 'object') {
      for (const [accion, permitido] of Object.entries(v as Record<string, unknown>)) {
        if (typeof permitido === 'boolean') plano[`${accion.toUpperCase()} /${k}`] = permitido;
      }
    }
  }
  return plano;
};

function obtenerRolLocal(): string {
  try {
    const token = localStorage.getItem('syncro_token') || '';
    const sesion = leerSesion(token);
    if (sesion?.rol) return sesion.rol;
    return JSON.parse(localStorage.getItem('syncro_user') || '{}')?.rol || '';
  } catch {
    return '';
  }
}

export function PermisosProvider({ children }: { children: ReactNode }) {
  const [permisos, setPermisos] = useState<MapaPermisos>({});
  const [cargando, setCargando] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:4000/api');

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * «VER COMO» CAMBIABA LO QUE EL SERVIDOR PERMITE, NO LO QUE LA PANTALLA OFRECE
   * --------------------------------------------------------------------------
   * MEDIDO EN VIVO el 7-oct-2026, viendo el ERP como «Almacen Prueba»:
   *
   *   · `GET /auth/mis-permisos` CON la cabecera de suplantación devuelve 514
   *     permisos concretos y `*` en falso: el servidor contesta como el
   *     almacenista, que es justo lo que se le pide.
   *   · Esta función la pedía SIN la cabecera —con `fetch` a pelo, fuera del
   *     cliente central— y recibía `{ '*': true }`.
   *   · Y aunque la hubiera mandado, `adminPorSesion || adminPorRespuesta`
   *     habría devuelto el mando al administrador: el rol sale del JWT, que es
   *     el de quien suplanta.
   *
   * Resultado: el letrero decía «Estás viendo el ERP como Almacen Prueba» y el
   * menú seguía enseñando Finanzas, Recursos humanos, Administración y
   * Hotelería. La mitad del sistema —la que decide qué se OFRECE— seguía
   * contestando como administrador.
   *
   * Eso convierte la función en una trampa para lo que se inventó: se prueba un
   * rol, se ve que «todo funciona», y los defectos que sólo aparecen cuando la
   * pantalla ofrece algo que el servidor va a negar —un botón que lleva a un
   * no— quedan todos escondidos.
   *
   * Ahora: la cabecera viaja, el rol local NO manda mientras se suplanta, y un
   * cambio de suplantación vuelve a pedir los permisos.
   * ══════════════════════════════════════════════════════════════════════════
   */
  const refrescar = async () => {
    const token = localStorage.getItem('syncro_token');
    if (!token) {
      setPermisos({}); setIsAdmin(false); setCargando(false); return;
    }

    const suplantando = verComoActual();
    /*
     * Mientras se suplanta, el rol del JWT es el de quien mira, no el de quien
     * se mira. Usarlo aquí es lo que devolvía el mando al administrador.
     */
    const adminPorSesion = !suplantando && esRolAdministrador(obtenerRolLocal());
    setIsAdmin(adminPorSesion);
    setPermisos(adminPorSesion ? { '*': true } : {});

    try {
      const r = await fetch(`${apiUrl}/auth/mis-permisos`, {
        headers: {
          Authorization: `Bearer ${token}`,
          ...(suplantando ? { [CABECERA_SUPLANTACION]: suplantando.id } : {}),
        },
        cache: 'no-store',
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const mapa = normalizar(await r.json());
      const adminPorRespuesta = mapa['*'] === true;
      const finalAdmin = adminPorSesion || adminPorRespuesta;
      const finalMapa = finalAdmin ? { ...mapa, '*': true } : mapa;
      setIsAdmin(finalAdmin);
      setPermisos(finalMapa);
      /*
       * Y no se guarda lo del suplantado: `syncro_permisos` vive en
       * `localStorage` y sobrevive al cierre de la pestaña, que es justo donde
       * TERMINA la suplantación. Guardarlo dejaría al administrador con los
       * permisos del almacenista al día siguiente, sin saber por qué.
       */
      if (suplantando) localStorage.removeItem('syncro_permisos');
      else localStorage.setItem('syncro_permisos', JSON.stringify(finalMapa));
    } catch {
      // El JWT firmado sigue siendo fuente confiable para el rol. Un fallo temporal
      // al cargar permisos no debe quitarle acciones al administrador.
      if (!adminPorSesion) setPermisos({});
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { void refrescar(); }, []);

  /*
   * Empezar o dejar de ver como otro cambia QUÉ SE OFRECE, no sólo qué se
   * permite. Sin esto habría que recargar a mano, y lo que se viera entre
   * medias serían los permisos de la persona equivocada.
   */
  useEffect(() => {
    const alCambiar = () => { void refrescar(); };
    window.addEventListener(EVENTO_VER_COMO, alCambiar);
    return () => window.removeEventListener(EVENTO_VER_COMO, alCambiar);
  }, []);
  const value = useMemo(() => ({ permisos, cargando, isAdmin, refrescar }), [permisos, cargando, isAdmin]);
  return <PermisosContext.Provider value={value}>{children}</PermisosContext.Provider>;
}

export const usePermisosContext = () => useContext(PermisosContext);
