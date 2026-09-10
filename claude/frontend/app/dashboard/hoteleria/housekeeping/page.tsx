// app/dashboard/hoteleria/housekeeping/page.tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  Play,
  Check,
  X,
  BedDouble,
  RefreshCw,
  Wrench,
} from "lucide-react";

interface ITarea {
  id: string;
  habitacionNumero: string;
  tipo: string;
  estado: string;
  asignadoANombre: string | null;
  habitacionId: string;
}
interface IHab {
  id: string;
  numero: string;
  piso: number | null;
  estado: string;
  tipoHabitacion?: { nombre: string };
}
interface IHotel {
  id: string;
  nombre: string;
}

export default function HousekeepingPage() {
  const api =
    process.env.NEXT_PUBLIC_API_URL ||
    (process.env.NODE_ENV === "production"
      ? "/api"
      : "http://localhost:4000/api");
  const tok = () =>
    typeof window !== "undefined"
      ? (localStorage.getItem("syncro_token") ?? "")
      : "";
  const h = () => ({
    Authorization: `Bearer ${tok()}`,
    "Content-Type": "application/json",
  });

  const [hoteles, setHoteles] = useState<IHotel[]>([]);
  const [hotelId, setHotelId] = useState("");
  const [tareas, setTareas] = useState<ITarea[]>([]);
  const [habs, setHabs] = useState<IHab[]>([]);
  const [cargando, setCargando] = useState(true);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const mostrar = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const cargarHoteles = useCallback(async () => {
    const r = await fetch(`${api}/hoteleria/config/hoteles`, { headers: h() });
    if (r.ok) {
      const d = await r.json();
      setHoteles(d);
      if (d.length && !hotelId) setHotelId(d[0].id);
    }
    setCargando(false);
  }, [api, hotelId]);

  const cargar = useCallback(async () => {
    const rt = await fetch(`${api}/hoteleria/housekeeping/tareas`, {
      headers: h(),
    });
    if (rt.ok) setTareas(await rt.json());
    if (hotelId) {
      const rh = await fetch(
        `${api}/hoteleria/housekeeping/rack?hotelId=${hotelId}`,
        { headers: h() },
      );
      if (rh.ok) {
        const d = await rh.json();
        setHabs(d.habitaciones);
      }
    }
  }, [api, hotelId]);

  useEffect(() => {
    cargarHoteles();
  }, [cargarHoteles]);
  useEffect(() => {
    if (hotelId) cargar();
  }, [hotelId, cargar]);
  useEffect(() => {
    if (hoteles.length > 0) {
      const valido = hoteles.some((x) => x.id === hotelId);
      if (!valido) setHotelId(hoteles[0].id);
    }
  }, [hoteles, hotelId]);

  // Habitaciones que necesitan atención: en LIMPIEZA o MANTENIMIENTO
  const enLimpieza = habs.filter((hb) => hb.estado === "LIMPIEZA");
  const enInspeccion = habs.filter((hb) => hb.estado === "INSPECCION");
  const enMantenimiento = habs.filter((hb) => hb.estado === "MANTENIMIENTO");

  const ejecutarTarea = async (hab: IHab) => {
    const tarea = tareas.find(
      (t) =>
        t.habitacionId === hab.id &&
        ["PENDIENTE", "EN_PROCESO"].includes(t.estado),
    );
    if (!tarea) {
      mostrar("No existe una tarea activa para esta habitación.", false);
      return;
    }
    const accion = tarea.estado === "PENDIENTE" ? "iniciar" : "terminar";
    const r = await fetch(
      `${api}/hoteleria/housekeeping/tareas/${tarea.id}/${accion}`,
      { method: "POST", headers: h() },
    );
    if (r.ok) {
      mostrar(
        accion === "iniciar"
          ? `Limpieza ${hab.numero} iniciada`
          : `Habitación ${hab.numero} pendiente de inspección`,
      );
      await cargar();
      return;
    }
    const d = await r.json().catch(() => null);
    mostrar(d?.message || "No se pudo actualizar la tarea.", false);
  };

  const inspeccionar = async (hab: IHab, aprobado: boolean) => {
    const tarea = tareas.find(
      (t) => t.habitacionId === hab.id && t.estado === "TERMINADA",
    );
    if (!tarea) {
      mostrar("No se encontró la limpieza terminada.", false);
      return;
    }
    const comentario = aprobado
      ? undefined
      : "Rechazada por supervisión; requiere nueva limpieza.";
    const r = await fetch(
      `${api}/hoteleria/housekeeping/tareas/${tarea.id}/inspeccionar`,
      {
        method: "POST",
        headers: h(),
        body: JSON.stringify({ aprobado, comentario }),
      },
    );
    if (r.ok) {
      mostrar(
        aprobado
          ? `Habitación ${hab.numero} liberada`
          : `Habitación ${hab.numero} devuelta a limpieza`,
      );
      await cargar();
      return;
    }
    const d = await r.json().catch(() => null);
    mostrar(d?.message || "No se pudo registrar la inspección.", false);
  };

  const volverDisponible = async (hab: IHab) => {
    const r = await fetch(
      `${api}/hoteleria/housekeeping/habitaciones/${hab.id}/estado`,
      {
        method: "PATCH",
        headers: h(),
        body: JSON.stringify({ estado: "DISPONIBLE" }),
      },
    );
    if (r.ok) {
      mostrar(`Habitación ${hab.numero} disponible`);
      cargar();
    }
  };

  if (cargando)
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-7 h-7 animate-spin text-slate-300" />
      </div>
    );

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-8">
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-5 py-3 rounded-xl shadow-xl text-sm font-medium text-white ${toast.ok ? "bg-slate-900" : "bg-rose-600"}`}
        >
          {toast.ok ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <X className="w-4 h-4" />
          )}{" "}
          {toast.msg}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-[0.15em] mb-1">
            Operación
          </p>
          <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">
            Housekeeping
          </h1>
          <p className="text-slate-500 mt-1">
            Habitaciones que requieren limpieza o mantenimiento.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hoteles.length > 1 && (
            <select
              value={hotelId}
              onChange={(e) => setHotelId(e.target.value)}
              className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white"
            >
              {hoteles.map((ho) => (
                <option key={ho.id} value={ho.id}>
                  {ho.nombre}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={cargar}
            className="p-2.5 border border-slate-200 rounded-xl hover:bg-slate-50"
          >
            <RefreshCw className="w-4 h-4 text-slate-500" />
          </button>
        </div>
      </div>

      {enLimpieza.length === 0 &&
      enInspeccion.length === 0 &&
      enMantenimiento.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-200 mx-auto mb-3" />
          <p className="font-semibold text-slate-700">Todo en orden</p>
          <p className="text-sm text-slate-400 mt-1">
            No hay habitaciones pendientes de limpieza o mantenimiento.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Pendientes de limpieza */}
          {enLimpieza.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <h3 className="font-semibold text-slate-900">
                  Pendientes de limpieza
                </h3>
                <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                  {enLimpieza.length}
                </span>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {enLimpieza.map((hab) => (
                  <div
                    key={hab.id}
                    className="bg-white border border-amber-200 rounded-2xl p-4"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <BedDouble className="w-4 h-4 text-slate-400" />
                          <span className="text-lg font-semibold text-slate-900 tabular-nums">
                            {hab.numero}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {hab.tipoHabitacion?.nombre} · Piso {hab.piso}
                        </p>
                      </div>
                      <span className="text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded-full">
                        Limpieza
                      </span>
                    </div>
                    <button
                      onClick={() => ejecutarTarea(hab)}
                      className="w-full flex items-center justify-center gap-2 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800"
                    >
                      {tareas.find(
                        (t) =>
                          t.habitacionId === hab.id &&
                          t.estado === "EN_PROCESO",
                      ) ? (
                        <>
                          <Check className="w-4 h-4" /> Terminar limpieza
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" /> Iniciar limpieza
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {enInspeccion.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="w-2.5 h-2.5 rounded-full bg-violet-500" />
                <h3 className="font-semibold text-slate-900">
                  Pendientes de inspección
                </h3>
                <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                  {enInspeccion.length}
                </span>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {enInspeccion.map((hab) => (
                  <div
                    key={hab.id}
                    className="bg-white border border-violet-200 rounded-2xl p-4"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-violet-500" />
                          <span className="text-lg font-semibold">
                            {hab.numero}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {hab.tipoHabitacion?.nombre} · Piso {hab.piso}
                        </p>
                      </div>
                      <span className="text-[11px] text-violet-700 bg-violet-50 px-2 py-1 rounded-full">
                        Inspección
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => void inspeccionar(hab, false)}
                        className="rounded-lg border border-rose-200 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
                      >
                        <X className="inline w-4 h-4 mr-1" />
                        Rechazar
                      </button>
                      <button
                        onClick={() => void inspeccionar(hab, true)}
                        className="rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                      >
                        <Check className="inline w-4 h-4 mr-1" />
                        Aprobar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* En mantenimiento */}
          {enMantenimiento.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                <h3 className="font-semibold text-slate-900">
                  En mantenimiento
                </h3>
                <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                  {enMantenimiento.length}
                </span>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {enMantenimiento.map((hab) => (
                  <div
                    key={hab.id}
                    className="bg-white border border-slate-200 rounded-2xl p-4"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <Wrench className="w-4 h-4 text-slate-400" />
                          <span className="text-lg font-semibold text-slate-900 tabular-nums">
                            {hab.numero}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {hab.tipoHabitacion?.nombre} · Piso {hab.piso}
                        </p>
                      </div>
                      <span className="text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded-full">
                        Mantenim.
                      </span>
                    </div>
                    <button
                      onClick={() => volverDisponible(hab)}
                      className="w-full flex items-center justify-center gap-2 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800"
                    >
                      <Check className="w-4 h-4" /> Marcar disponible
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
