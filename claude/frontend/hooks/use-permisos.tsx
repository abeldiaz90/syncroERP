"use client";

import { useCallback, useMemo } from 'react';
import { usePermisosContext } from '@/app/context/PermisosContext';

type MapaPermisos = Record<string, boolean>;

export const usePermiso = () => {
  const { permisos, cargando, refrescar, isAdmin } = usePermisosContext();

  const reglas = useMemo(() => Object.entries(permisos as MapaPermisos)
    .filter(([clave, v]) => v && clave !== '*')
    .map(([clave]) => {
      const [metodo, ...partes] = clave.trim().split(/\s+/);
      const ruta = partes.join(' ').replace(/^\/api/, '').replace(/\/$/, '');
      const patron = ruta.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:[^/]+/g, '[^/]+');
      return { metodo: metodo.toUpperCase(), regex: new RegExp(`^${patron}$`, 'i') };
    }), [permisos]);

  const tienePermiso = useCallback((metodo: string, ruta: string) => {
    if (isAdmin || (permisos as MapaPermisos)['*'] === true) return true;
    if (cargando) return false;
    const m = metodo.toUpperCase();
    const r = ruta.replace(/^\/api/, '').replace(/\/$/, '') || '/';
    if ((permisos as MapaPermisos)[`${m} ${r}`] === true) return true;
    return reglas.some(x => x.metodo === m && x.regex.test(r));
  }, [isAdmin, cargando, permisos, reglas]);

  return { tienePermiso, cargando, isAdmin, refrescarPermisos: refrescar };
};
