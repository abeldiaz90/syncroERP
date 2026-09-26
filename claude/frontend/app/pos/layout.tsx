"use client";

/**
 * ============================================================================
 * Punto de venta — terminal, no pantalla del ERP
 * ----------------------------------------------------------------------------
 * Vive FUERA de `/dashboard` a propósito, y eso es todo el diseño.
 *
 * El punto de venta estaba dentro del área de trabajo: barra lateral con
 * veinte módulos, migas de pan, pestañas del módulo y una barra de acciones.
 * Un quinto de la pantalla gastado en navegación que un cajero no usa nunca, y
 * veinte enlaces a sitios donde no debe estar mientras cobra. Una caja no es
 * una pantalla más del ERP: es una terminal, se abre al empezar el turno y se
 * cierra al terminarlo.
 *
 * Al colgar de `app/pos` en vez de `app/dashboard/...`, Next no aplica el
 * layout del área de trabajo: no hay menú que ocultar con CSS porque no se
 * monta. La sesión sí se comprueba aquí, porque ese guardia también vivía en el
 * layout del dashboard.
 *
 * Los permisos de verdad siguen donde deben: el backend los exige endpoint por
 * endpoint. Esta comprobación es para no dejar una caja abierta con la sesión
 * caducada, no para autorizar.
 * ============================================================================
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { leerSesion, puedeEntrar, sesionVigente, type Sesion } from '@/lib/session';
import { esRolAdministrador } from '@/lib/roles';
import { api } from '@/lib/api';

export default function PosLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [estado, setEstado] = useState<'cargando' | 'dentro' | 'sin-acceso' | 'sin-respuesta'>('cargando');

  useEffect(() => {
    const jwt = localStorage.getItem('syncro_token') ?? '';
    const sesion: Sesion | null = jwt ? leerSesion(jwt) : null;
    if (!sesion || !sesionVigente(sesion)) {
      router.replace('/login');
      return;
    }
    /*
     * ────────────────────────────────────────────────────────────────────────
     * La caja también comprueba el perfil, y aquí sí importa el momento
     * ------------------------------------------------------------------------
     * Al vivir fuera de `/dashboard`, esta ventana se saltaba el guardia de
     * rutas del área de trabajo: cualquiera con sesión la abría entera. Se
     * comprobó con un almacenista —sin permiso de ventas—: buscaba productos,
     * armaba el carrito y sólo al pulsar «Cobrar» el servidor decía que no.
     *
     * El backend nunca dejó pasar una venta, así que no era un agujero de
     * seguridad. Era peor en otro sentido: la negativa llegaba con el cliente
     * enfrente y el carrito lleno. Se avisa al abrir.
     * ────────────────────────────────────────────────────────────────────────
     */
    document.title = 'Caja · SyncroERP';
    if (esRolAdministrador(sesion.rol)) {
      setEstado('dentro');
      return;
    }
    let vivo = true;
    /*
     * Si la consulta FALLA no se concluye que el perfil no tiene la caja.
     *
     * Estaba envuelta en `intentar(..., { rutas: [] })`, así que un backend
     * reiniciándose o un corte de red de dos segundos le decía al cajero «tu
     * perfil no incluye la caja» —con el cliente enfrente— cuando lo único que
     * había pasado es que no se pudo preguntar. «No tienes» y «no pude
     * preguntar» son dos respuestas distintas y ésta es la pantalla donde
     * confundirlas cuesta más caro.
     */
    api
      .get<{ rutas?: string[] }>('/admin/permisos/mis-rutas')
      .then((r) => {
        if (!vivo) return;
        setEstado(puedeEntrar(r.rutas ?? [], '/pos') ? 'dentro' : 'sin-acceso');
      })
      .catch(() => {
        if (vivo) setEstado('sin-respuesta');
      });
    return () => {
      vivo = false;
    };
  }, [router]);

  if (estado === 'cargando') {
    return (
      <div className="h-screen grid place-items-center bg-slate-900">
        <Loader2 className="w-7 h-7 text-white/70 animate-spin" />
      </div>
    );
  }

  if (estado === 'sin-respuesta') {
    return (
      <div className="h-screen grid place-items-center bg-slate-900 px-6">
        <div className="max-w-sm text-center">
          <p className="text-lg font-bold text-white mb-2">No pudimos consultar tu perfil</p>
          <p className="text-sm text-white/70 mb-5">
            No es que te falte la caja: no se pudo preguntar al servidor. Suele
            ser momentáneo. Vuelve a intentarlo en unos segundos.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-xl bg-white text-slate-900 text-sm font-bold"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (estado === 'sin-acceso') {
    return (
      <div className="h-screen grid place-items-center bg-slate-900 px-6">
        <div className="max-w-sm text-center">
          <p className="text-lg font-bold text-white mb-2">Tu perfil no incluye la caja</p>
          <p className="text-sm text-slate-300 mb-6">
            Para cobrar hace falta el módulo de ventas. Pídeselo al administrador desde
            Administración → Roles y permisos.
          </p>
          <button
            onClick={() => window.close()}
            className="px-4 py-2 rounded-xl bg-white/10 text-white text-sm font-semibold hover:bg-white/20"
          >
            Cerrar la ventana
          </button>
        </div>
      </div>
    );
  }

  return <div className="h-screen flex flex-col overflow-hidden bg-slate-100">{children}</div>;
}
