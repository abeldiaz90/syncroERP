"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type PermisosMap = Record<string, Record<string, boolean>>;

const PermisosContext = createContext<PermisosMap>({});

export function PermisosProvider({ children }: { children: ReactNode }) {
  const [permisos, setPermisos] = useState<PermisosMap>({});
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

  useEffect(() => {
    const token = localStorage.getItem('syncro_token');
    if (!token) return;
    fetch(`${apiUrl}/permisos/mis-permisos`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setPermisos(data))
      .catch(console.error);
  }, []);

  return (
    <PermisosContext.Provider value={permisos}>
      {children}
    </PermisosContext.Provider>
  );
}

export function usePermiso() {
  const permisos = useContext(PermisosContext);
  const tiene = (modulo: string, accion: string) => {
    return !!permisos[modulo]?.[accion];
  };
  return { tiene };
}