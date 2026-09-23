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
import { useAvisos } from '@/components/ui';

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
 *
 * Sobre el error: antes este hook guardaba el mensaje en `error` y volvía a
 * lanzar la excepción. Quien llamaba tenía que acordarse de pintar `.error`
 * *y* de atrapar el rechazo. Casi ningún botón hacía las dos cosas: el patrón
 * `onClick={() => void accion.ejecutar(id).catch(() => {})}` aparecía en 15
 * acciones de 10 pantallas, y en todas ellas un fallo del servidor no dejaba
 * rastro en la pantalla. En asistencia eso significaba pulsar «salida» y no
 * ver absolutamente nada: ni el registro, ni el motivo.
 *
 * Ahora el hook se hace cargo. Si nadie pinta el error, lo anuncia él mismo
 * como aviso; y ya no relanza, así que un `void ejecutar()` sin `.catch` no
 * puede producir un rechazo sin atender. Las pantallas que sí muestran el
 * mensaje en su sitio —dentro del modal, junto al formulario— lo declaran con
 * `{ errorVisible: true }` para no decir lo mismo dos veces.
 *
 * En caso de fallo `ejecutar` devuelve `null`; quien necesite distinguir
 * «falló» de «no hizo nada» tiene `error` y `ejecutando`.
 */
export function useAccion<A extends unknown[], R>(
  accion: (...args: A) => Promise<R>,
  opciones: { errorVisible?: boolean } = {},
) {
  const [ejecutando, setEjecutando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { avisar } = useAvisos();

  // El candado va en una referencia, no en el estado: dos clics dentro del
  // mismo tick de React leen el mismo `ejecutando` viejo y ambos pasarían.
  const enCurso = useRef(false);
  const errorVisible = opciones.errorVisible ?? false;

  const ejecutar = useCallback(
    async (...args: A): Promise<R | null> => {
      if (enCurso.current) return null;   // el doble clic no pasa
      enCurso.current = true;
      setEjecutando(true);
      setError(null);
      try {
        return await accion(...args);
      } catch (e) {
        const mensaje = e instanceof ApiError
          ? e.mensajeParaPantalla()
          : 'No se pudo completar la operación.';
        setError(mensaje);
        if (!errorVisible) avisar(mensaje, 'error');
        return null;
      } finally {
        enCurso.current = false;
        setEjecutando(false);
      }
    },
    [accion, avisar, errorVisible],
  );

  return { ejecutar, ejecutando, error, limpiarError: () => setError(null) };
}
