"use client";
/**
 * ============================================================================
 * SyncroERP · Hook de datos
 * ----------------------------------------------------------------------------
 * Las páginas del proyecto repetían este patrón a mano, cada una a su manera:
 * `useState` para datos, otro para cargando, casi nunca uno para el error, y
 * un `useEffect` sin limpieza que provocaba avisos de React al desmontar.
 *
 * Aquí queda resuelto una vez: carga, error, recarga y cancelación al salir
 * de la pantalla.
 * ============================================================================
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api';

interface Estado<T> {
  datos: T | null;
  cargando: boolean;
  error: string | null;
}

export function useDatos<T>(
  cargar: () => Promise<T>,
  dependencias: unknown[] = [],
) {
  const [estado, setEstado] = useState<Estado<T>>({
    datos: null, cargando: true, error: null,
  });

  // Evita `setState` sobre un componente ya desmontado.
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => { vivo.current = false; };
  }, []);

  const ejecutar = useCallback(async () => {
    setEstado((e) => ({ ...e, cargando: true, error: null }));
    try {
      const datos = await cargar();
      if (vivo.current) setEstado({ datos, cargando: false, error: null });
    } catch (e) {
      if (!vivo.current) return;
      const mensaje = e instanceof ApiError
        ? e.mensajeParaPantalla()
        : 'No se pudo cargar la información.';
      setEstado({ datos: null, cargando: false, error: mensaje });
    }
    // `cargar` se recrea en cada render; las dependencias reales las controla
    // quien usa el hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencias);

  useEffect(() => { void ejecutar(); }, [ejecutar]);

  return { ...estado, recargar: ejecutar };
}

/**
 * Para acciones (guardar, eliminar, aprobar): expone `ejecutando` para
 * deshabilitar el botón y evitar el doble envío, que en un ERP significa
 * duplicar un documento.
 */
export function useAccion<A extends unknown[], R>(
  accion: (...args: A) => Promise<R>,
) {
  const [ejecutando, setEjecutando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ejecutar = useCallback(
    async (...args: A): Promise<R | null> => {
      if (ejecutando) return null;   // el doble clic no pasa
      setEjecutando(true);
      setError(null);
      try {
        return await accion(...args);
      } catch (e) {
        const mensaje = e instanceof ApiError
          ? e.mensajeParaPantalla()
          : 'No se pudo completar la operación.';
        setError(mensaje);
        throw e;
      } finally {
        setEjecutando(false);
      }
    },
    [accion, ejecutando],
  );

  return { ejecutar, ejecutando, error, limpiarError: () => setError(null) };
}
