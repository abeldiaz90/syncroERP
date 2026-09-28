"use client";

/**
 * ============================================================================
 * El enlace al core, en su propio componente y por una razón
 * ----------------------------------------------------------------------------
 * Este enlace vivía dentro de `app/dashboard/layout.tsx` con dos condiciones
 * correctas —que la empresa haya contratado el core, y que quien mira tenga
 * algo que hacer allí— y **nunca aparecía para nadie**.
 *
 * El motivo no estaba en las condiciones sino en dónde se preguntaban:
 * `DashboardLayout` llama a `usePermiso()` y, unas líneas más abajo, es él
 * mismo quien monta `<PermisosProvider>`. Un provider de React no sirve a su
 * propio componente: el hook resolvía contra el contexto por omisión —
 * `{ permisos: {}, cargando: true }`— y `tienePermiso` devolvía `false` para
 * todo, siempre.
 *
 * El resto del menú no se enteró porque no usa ese hook: se filtra con
 * `puedeVerEnlace()` contra la lista de RUTAS que el propio layout pide aparte.
 * Así que el defecto quedó reducido a lo único que dependía de `tienePermiso`
 * ahí arriba: este enlace. Se veía como una decisión de diseño —«parece que a
 * este perfil no le toca»— y era un hook contestando desde el vacío.
 *
 * Medido el 27-sep con la sesión de dirección: plan `usaRegistroExterno: true`,
 * `GET /integracion/estado` concedido y `true` en el mapa, y ni un solo `<a>`
 * en el DOM.
 *
 * Vive aquí porque es HIJO del provider. Es la diferencia entera.
 * ============================================================================
 */

import { ExternalLink, Landmark } from 'lucide-react';
import { usePermiso } from '@/hooks/use-permisos';

export function EnlaceAlCore({
  url,
  contratado,
  colapsado,
  etiqueta,
}: {
  url: string;
  /** La empresa contrató el registro externo. Lo resuelve el layout. */
  contratado: boolean;
  colapsado: boolean;
  /** Ya traducida por el layout, para no montar aquí otro diccionario. */
  etiqueta: string;
}) {
  const { tienePermiso } = usePermiso();

  /*
   * Fineract conserva su propia autorización: Keycloak aporta SSO, pero
   * SyncroERP nunca traduce ni suplanta sus permisos bancarios.
   *
   * Sólo aparece si la empresa lo contrató —una que sólo usa el ERP no tiene
   * nada al otro lado de ese enlace— y sólo para quien tiene algo que hacer
   * allí. Sin esa segunda condición se le pintaba a todos: el almacenista lo
   * veía en su menú, lo abría y aterrizaba en un login del core que lo
   * rechazaba. Un enlace que siempre termina en un error no es una función, es
   * una trampa.
   */
  if (!contratado) return null;
  if (!tienePermiso('GET', '/api/integracion/estado')) return null;

  return (
    <>
      <div className="h-px bg-white/[0.06] my-2" />
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={etiqueta}
        className="flex items-center gap-2.5 h-8 px-2.5 rounded-md text-[12.5px] text-slate-400 hover:text-white hover:bg-white/[0.05] transition-colors"
      >
        <Landmark className="w-4 h-4 shrink-0 text-emerald-400" />
        {!colapsado && (
          <>
            <span className="truncate">{etiqueta}</span>
            <ExternalLink className="ml-auto w-3 h-3 shrink-0 text-slate-500" />
          </>
        )}
      </a>
    </>
  );
}
