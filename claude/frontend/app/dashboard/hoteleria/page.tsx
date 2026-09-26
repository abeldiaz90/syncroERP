"use client";

/*
 * ============================================================================
 * `/dashboard/hoteleria` · portada vieja
 * ----------------------------------------------------------------------------
 * Aqui vivia el panel hotelero con datos. El problema no era el panel, era la
 * direccion: `/dashboard/hoteleria` es PADRE de `/dashboard/hoteleria/recetas`
 * y `/costos-recetas`, que son del modulo de Recetas y produccion. Un permiso
 * a esta ruta regalaba el escandallo y el costo teorico contra real a
 * cualquiera con hoteleria en consulta, asi que deliberadamente no se le
 * concedio a nadie... y entonces la pantalla quedo fuera del perfil de todos:
 * el enlace «Panel» de Reservaciones llevaba a «esta seccion no esta en tu
 * perfil», para los diez roles.
 *
 * El panel se mudo a `/dashboard/hoteleria/panel`, que no es padre de nada y
 * se concede solo. Esta direccion se queda como puerta que redirige al centro
 * de trabajo, sin datos propios: por eso puede vivir en RUTAS_CONTENEDOR sin
 * abrir nada.
 * ============================================================================
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function PortadaHoteleria() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard/centros/hoteleria");
  }, [router]);

  return (
    <div className="flex items-center gap-2 p-8 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin" /> Abriendo Hoteleria...
    </div>
  );
}
