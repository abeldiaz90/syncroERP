"use client";

import { ReactElement, cloneElement } from 'react';
import { usePermiso } from '@/hooks/use-permisos';
import { useT } from '@/components/I18nProvider';


type Props = {
  metodo: string;
  ruta: string;
  children: ReactElement<any>;
  ocultar?: boolean;
  mensaje?: string;
};

export function AccionProtegida({ metodo, ruta, children, ocultar = true, mensaje }: Props) {
  const t = useT();
  /*
   * El aviso se arma AQUÍ, no en el valor por omisión del parámetro.
   *
   * `mensaje = t('No tienes permiso…')` se evalúa al entrar a la función, antes
   * de que exista el hook, así que `t` no está definido todavía: el codemod lo
   * envolvió ahí y dejó la pantalla sin compilar. Un valor por omisión no puede
   * depender de un hook.
   */
  const aviso = mensaje ?? t('No tienes permiso para esta acción');
  const { tienePermiso, cargando } = usePermiso();
  const permitido = !cargando && tienePermiso(metodo, ruta);
  if (!permitido && ocultar) return null;
  return cloneElement(children, {
    disabled: !permitido || children.props.disabled,
    title: permitido ? children.props.title : aviso,
    'aria-disabled': !permitido,
  });
}
