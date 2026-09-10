"use client";

import { ReactElement, cloneElement } from 'react';
import { usePermiso } from '@/hooks/use-permisos';

type Props = {
  metodo: string;
  ruta: string;
  children: ReactElement<any>;
  ocultar?: boolean;
  mensaje?: string;
};

export function AccionProtegida({ metodo, ruta, children, ocultar = true, mensaje = 'No tienes permiso para esta acción' }: Props) {
  const { tienePermiso, cargando } = usePermiso();
  const permitido = !cargando && tienePermiso(metodo, ruta);
  if (!permitido && ocultar) return null;
  return cloneElement(children, {
    disabled: !permitido || children.props.disabled,
    title: permitido ? children.props.title : mensaje,
    'aria-disabled': !permitido,
  });
}
