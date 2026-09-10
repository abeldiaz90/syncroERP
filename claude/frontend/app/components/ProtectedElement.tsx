"use client";

import React from 'react';
import { usePermiso } from '@/hooks/use-permisos';

// ─────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────
interface ProtectedElementProps {
  /** Método HTTP que representa esta acción */
  metodo: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Ruta del backend que protege esta acción. Usa :id para parámetros. */
  ruta: string;
  /** Contenido a mostrar si tiene permiso */
  children: React.ReactNode;
  /**
   * Comportamiento cuando NO tiene permiso.
   * - 'ocultar' (default): no renderiza nada
   * - 'deshabilitar': renderiza el children envuelto en un span deshabilitado
   */
  sinPermiso?: 'ocultar' | 'deshabilitar';
  /** Clase CSS adicional para el wrapper cuando está deshabilitado */
  claseDeshabilitado?: string;
}

/**
 * Componente que muestra u oculta contenido según los permisos del usuario.
 *
 * @example
 * // Oculta el botón si no tiene permiso de editar marcas
 * <ProtectedElement metodo="PATCH" ruta="/api/marcas/:id">
 *   <button>Editar</button>
 * </ProtectedElement>
 *
 * // Deshabilita el botón visualmente en lugar de ocultarlo
 * <ProtectedElement metodo="DELETE" ruta="/api/marcas/:id" sinPermiso="deshabilitar">
 *   <button>Eliminar</button>
 * </ProtectedElement>
 */
export function ProtectedElement({
  metodo,
  ruta,
  children,
  sinPermiso = 'ocultar',
  claseDeshabilitado = 'opacity-40 pointer-events-none cursor-not-allowed select-none',
}: ProtectedElementProps) {
  const { tienePermiso, cargando } = usePermiso();

  // Mientras carga, no mostramos nada para evitar flash de contenido no autorizado
  if (cargando) return null;

  const permitido = tienePermiso(metodo, ruta);

  if (!permitido) {
    if (sinPermiso === 'deshabilitar') {
      return (
        <span
          className={claseDeshabilitado}
          title="No tienes permiso para esta acción"
          aria-disabled="true"
        >
          {children}
        </span>
      );
    }
    // 'ocultar' — no renderiza nada
    return null;
  }

  return <>{children}</>;
}

// ─────────────────────────────────────────────────────────────────
// VARIANTES DE CONVENIENCIA
// Evitan tener que escribir metodo= en cada uso
// ─────────────────────────────────────────────────────────────────

/** Solo muestra si puede hacer GET en esa ruta (ver/listar) */
export const PuedeVer = (props: Omit<ProtectedElementProps, 'metodo'>) =>
  <ProtectedElement {...props} metodo="GET" />;

/** Solo muestra si puede hacer POST en esa ruta (crear) */
export const PuedeCrear = (props: Omit<ProtectedElementProps, 'metodo'>) =>
  <ProtectedElement {...props} metodo="POST" />;

/** Solo muestra si puede hacer PATCH en esa ruta (editar) */
export const PuedeEditar = (props: Omit<ProtectedElementProps, 'metodo'>) =>
  <ProtectedElement {...props} metodo="PATCH" />;

/** Solo muestra si puede hacer DELETE en esa ruta (eliminar) */
export const PuedeEliminar = (props: Omit<ProtectedElementProps, 'metodo'>) =>
  <ProtectedElement {...props} metodo="DELETE" />;
