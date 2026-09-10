"use client";

import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { esRolAdministrador } from '@/lib/roles';
import { leerSesion } from '@/lib/session';

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

  const refrescar = async () => {
    const token = localStorage.getItem('syncro_token');
    if (!token) {
      setPermisos({}); setIsAdmin(false); setCargando(false); return;
    }

    const adminPorSesion = esRolAdministrador(obtenerRolLocal());
    setIsAdmin(adminPorSesion);
    if (adminPorSesion) setPermisos({ '*': true });

    try {
      const r = await fetch(`${apiUrl}/auth/mis-permisos`, {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const mapa = normalizar(await r.json());
      const adminPorRespuesta = mapa['*'] === true;
      const finalAdmin = adminPorSesion || adminPorRespuesta;
      const finalMapa = finalAdmin ? { ...mapa, '*': true } : mapa;
      setIsAdmin(finalAdmin);
      setPermisos(finalMapa);
      localStorage.setItem('syncro_permisos', JSON.stringify(finalMapa));
    } catch {
      // El JWT firmado sigue siendo fuente confiable para el rol. Un fallo temporal
      // al cargar permisos no debe quitarle acciones al administrador.
      if (!adminPorSesion) setPermisos({});
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { void refrescar(); }, []);
  const value = useMemo(() => ({ permisos, cargando, isAdmin, refrescar }), [permisos, cargando, isAdmin]);
  return <PermisosContext.Provider value={value}>{children}</PermisosContext.Provider>;
}

export const usePermisosContext = () => useContext(PermisosContext);
