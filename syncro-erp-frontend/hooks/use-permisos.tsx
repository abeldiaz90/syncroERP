"use client";

import { useEffect, useState, useMemo, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────
type MapaPermisos = Record<string, boolean>;
// Formato: { "GET /marcas": true, "PATCH /marcas": false, ... }
// Este es el único formato que maneja el sistema.
// El backend (auth.service.ts) genera exactamente este mapa en el login.

// ─────────────────────────────────────────────────────────────────
// HOOK PRINCIPAL
// ─────────────────────────────────────────────────────────────────
export const usePermiso = () => {
  const [permisos, setPermisos] = useState<MapaPermisos>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    try {
      const userRaw = localStorage.getItem('syncro_user');
      const permisosRaw = localStorage.getItem('syncro_permisos');

      if (userRaw) {
        const user = JSON.parse(userRaw);
        // Admin tiene bypass total — no necesita revisar el mapa
        setIsAdmin(user.rol === 'admin' || user.rol === 'SUPER_ADMIN');
      }

      if (permisosRaw) {
        const datos = JSON.parse(permisosRaw);
        // El dato ya viene en el formato correcto desde el login
        // { "GET /marcas": true, "PATCH /marcas": false }
        if (datos && typeof datos === 'object' && !Array.isArray(datos)) {
          setPermisos(datos as MapaPermisos);
        }
      }
    } catch (e) {
      console.error('[usePermiso] Error leyendo localStorage:', e);
    } finally {
      setCargando(false);
    }
  }, []);

  // Pre-compilamos las rutas con parámetros (:id) a RegExp una sola vez
  const reglas = useMemo(() => {
    return Object.entries(permisos)
      .filter(([, permitido]) => permitido)
      .map(([clave]) => {
        // "GET /api/marcas/:id" → RegExp que acepta UUIDs en lugar de :id
        const patron = clave
          .replace(/:[^\s/]+/g, '[^/]+')   // :id → cualquier segmento
          .replace(/\//g, '\\/');            // escapamos las barras
        return new RegExp(`^${patron}$`, 'i');
      });
  }, [permisos]);

  /**
   * Verifica si el usuario puede ejecutar una acción.
   *
   * @param metodo  'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
   * @param ruta    La ruta del backend, ej: '/api/marcas' o '/api/marcas/uuid-aqui'
   *
   * @example
   *   tienePermiso('GET', '/api/marcas')       // ¿puede listar marcas?
   *   tienePermiso('PATCH', '/api/marcas/:id') // ¿puede editar marcas?
   *   tienePermiso('DELETE', '/api/marcas/:id')// ¿puede eliminar marcas?
   */
  const tienePermiso = useCallback(
    (metodo: string, ruta: string): boolean => {
      // Admin siempre puede todo
      if (isAdmin) return true;
      // Mientras carga, ocultamos por seguridad
      if (cargando) return false;

      const test = `${metodo.toUpperCase()} ${ruta.replace(/\/+$/, '')}`;

      // Primero intentamos coincidencia exacta (más rápido)
      if (permisos[test] === true) return true;

      // Luego intentamos con RegExp (para rutas con parámetros)
      return reglas.some(regex => regex.test(test));
    },
    [isAdmin, cargando, permisos, reglas],
  );

  /**
   * Refresca los permisos desde el servidor sin hacer logout.
   * Útil cuando el admin cambia permisos y el usuario los necesita al momento.
   */
  const refrescarPermisos = useCallback(async () => {
    const token = localStorage.getItem('syncro_token');
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
    if (!token) return;

    try {
      const res = await fetch(`${apiUrl}/auth/mis-permisos`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const nuevosPermisos: MapaPermisos = await res.json();
      setPermisos(nuevosPermisos);
      localStorage.setItem('syncro_permisos', JSON.stringify(nuevosPermisos));
    } catch (e) {
      console.error('[usePermiso] Error refrescando permisos:', e);
    }
  }, []);

  return { tienePermiso, cargando, isAdmin, refrescarPermisos };
};
