// app/dashboard/hoteleria/rack/page.tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Hotel,
  Sparkles,
  Loader2,
  RefreshCw,
  CheckCircle2,
  X,
} from "lucide-react";

interface IHabitacion {
  id: string;
  numero: string;
  piso: number | null;
  estado: string;
  tipoHabitacion?: { id: string; nombre: string; tarifaBase: number };
}
interface IResumen {
  total: number;
  disponibles: number;
  ocupadas: number;
  limpieza: number;
  mantenimiento: number;
}
interface IHotel {
  id: string;
  nombre: string;
  ciudad?: string | null;
}

// Flujo de estados válido (debe coincidir con el backend)
const TRANSICIONES: Record<string, string[]> = {
  DISPONIBLE: ["MANTENIMIENTO", "BLOQUEADA"],
  OCUPADA: [], // sale solo por check-out formal
  LIMPIEZA: [], // avanza desde la tarea de housekeeping
  INSPECCION: [], // se aprueba o rechaza desde housekeeping
  MANTENIMIENTO: ["DISPONIBLE", "BLOQUEADA"],
  BLOQUEADA: ["DISPONIBLE", "MANTENIMIENTO"],
};

const EST: Record<
  string,
  { label: string; ring: string; bg: string; dot: string; text: string }
> = {
  DISPONIBLE: {
    label: "Disponible",
    ring: "ring-emerald-200",
    bg: "bg-white",
    dot: "bg-emerald-500",
    text: "text-emerald-700",
  },
  OCUPADA: {
    label: "Ocupada",
    ring: "ring-rose-200",
    bg: "bg-rose-50/60",
    dot: "bg-rose-500",
    text: "text-rose-700",
  },
  LIMPIEZA: {
    label: "Limpieza",
    ring: "ring-amber-200",
    bg: "bg-amber-50/60",
    dot: "bg-amber-500",
    text: "text-amber-700",
  },
  MANTENIMIENTO: {
    label: "Mantenimiento",
    ring: "ring-slate-200",
    bg: "bg-slate-50",
    dot: "bg-slate-400",
    text: "text-slate-500",
  },
  INSPECCION: {
    label: "Inspección",
    ring: "ring-violet-200",
    bg: "bg-violet-50/60",
    dot: "bg-violet-500",
    text: "text-violet-700",
  },
  BLOQUEADA: {
    label: "Bloqueada",
    ring: "ring-slate-200",
    bg: "bg-slate-50",
    dot: "bg-slate-400",
    text: "text-slate-500",
  },
};

export default function RackPage() {
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
  const [habitaciones, setHabitaciones] = useState<IHabitacion[]>([]);
  const [resumen, setResumen] = useState<IResumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [precargando, setPrecargando] = useState(false);
  const [sel, setSel] = useState<IHabitacion | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const mostrarToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3200);
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

  const cargarRack = useCallback(async () => {
    if (!hotelId) return;
    const r = await fetch(
      `${api}/hoteleria/housekeeping/rack?hotelId=${hotelId}`,
      { headers: h() },
    );
    if (r.ok) {
      const d = await r.json();
      setHabitaciones(d.habitaciones);
      setResumen(d.resumen);
    }
  }, [api, hotelId]);

  useEffect(() => {
    cargarHoteles();
  }, [cargarHoteles]);
  useEffect(() => {
    if (hotelId) cargarRack();
  }, [hotelId, cargarRack]);

  const precargarDemo = async () => {
    setPrecargando(true);
    const r = await fetch(`${api}/hoteleria/config/precargar-demo`, {
      method: "POST",
      headers: h(),
    });
    if (r.ok) {
      mostrarToast("Propiedad de demostración creada");
      await cargarHoteles();
    } else mostrarToast("No se pudo crear la demostración", false);
    setPrecargando(false);
  };

  const cambiarEstado = async (habId: string, estado: string) => {
    const r = await fetch(
      `${api}/hoteleria/housekeeping/habitaciones/${habId}/estado`,
      {
        method: "PATCH",
        headers: h(),
        body: JSON.stringify({ estado }),
      },
    );
    if (r.ok) {
      mostrarToast("Estado actualizado");
      setSel(null);
      cargarRack();
    } else {
      const d = await r.json().catch(() => null);
      mostrarToast(d?.message || "No se pudo cambiar el estado", false);
    }
  };

  const porPiso = habitaciones.reduce(
    (acc, hab) => {
      const p = hab.piso ?? 0;
      (acc[p] = acc[p] || []).push(hab);
      return acc;
    },
    {} as Record<number, IHabitacion[]>,
  );

  const ocupacion =
    resumen && resumen.total > 0
      ? Math.round((resumen.ocupadas / resumen.total) * 100)
      : 0;
  const hotelActual = hoteles.find((ho) => ho.id === hotelId);

  if (cargando)
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-7 h-7 animate-spin text-slate-300" />
      </div>
    );

  if (hoteles.length === 0)
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-6">
        <div className="max-w-lg text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-900 flex items-center justify-center mx-auto mb-6">
            <Hotel className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-semibold text-slate-900 tracking-tight mb-2">
            Aún no hay propiedades
          </h2>
          <p className="text-slate-500 mb-8 leading-relaxed">
            Crea una propiedad de demostración con habitaciones listas, o da de
            alta tu cadena desde Configuración.
          </p>
          <button
            onClick={precargarDemo}
            disabled={precargando}
            className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-medium px-6 py-3 rounded-xl transition-colors disabled:opacity-60"
          >
            {precargando ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {precargando ? "Creando…" : "Crear propiedad de demostración"}
          </button>
        </div>
      </div>
    );

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8">
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
            Panel de operación
          </p>
          <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">
            {hotelActual?.nombre ?? "Rack de habitaciones"}
          </h1>
          {hotelActual?.ciudad && (
            <p className="text-slate-500 mt-0.5">{hotelActual.ciudad}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hoteles.length > 1 && (
            <select
              value={hotelId}
              onChange={(e) => setHotelId(e.target.value)}
              className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              {hoteles.map((ho) => (
                <option key={ho.id} value={ho.id}>
                  {ho.nombre}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={cargarRack}
            className="p-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
            title="Actualizar"
          >
            <RefreshCw className="w-4 h-4 text-slate-500" />
          </button>
        </div>
      </div>

      {resumen && (
        <div className="bg-slate-900 rounded-2xl p-6 mb-8 text-white">
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            <div className="md:border-r md:border-white/10 md:pr-8">
              <p className="text-xs font-medium text-white/50 uppercase tracking-wider mb-1">
                Ocupación
              </p>
              <div className="flex items-end gap-2">
                <span className="text-5xl font-semibold tracking-tight tabular-nums">
                  {ocupacion}
                </span>
                <span className="text-2xl text-white/50 mb-1">%</span>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-6 flex-1">
              {[
                {
                  label: "Disponibles",
                  val: resumen.disponibles,
                  dot: "bg-emerald-400",
                },
                {
                  label: "Ocupadas",
                  val: resumen.ocupadas,
                  dot: "bg-rose-400",
                },
                {
                  label: "Limpieza",
                  val: resumen.limpieza,
                  dot: "bg-amber-400",
                },
                {
                  label: "Manten.",
                  val: resumen.mantenimiento,
                  dot: "bg-slate-400",
                },
              ].map((c) => (
                <div key={c.label}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                    <span className="text-xs text-white/50">{c.label}</span>
                  </div>
                  <p className="text-2xl font-semibold tabular-nums">{c.val}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-8">
        {Object.keys(porPiso)
          .sort((a, b) => Number(a) - Number(b))
          .map((piso) => (
            <div key={piso}>
              <div className="flex items-center gap-3 mb-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  Piso {piso}
                </h3>
                <div className="h-px flex-1 bg-slate-100" />
                <span className="text-xs text-slate-400">
                  {porPiso[Number(piso)].length} habitaciones
                </span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5">
                {porPiso[Number(piso)].map((hab) => {
                  const c = EST[hab.estado] || EST.BLOQUEADA;
                  return (
                    <button
                      key={hab.id}
                      onClick={() => setSel(hab)}
                      className={`group relative ${c.bg} ring-1 ${c.ring} rounded-xl p-3 text-left hover:ring-2 hover:shadow-sm transition-all`}
                    >
                      <div className="flex items-start justify-between">
                        <span className="text-lg font-semibold text-slate-900 tabular-nums tracking-tight">
                          {hab.numero}
                        </span>
                        <span
                          className={`w-2 h-2 rounded-full ${c.dot} mt-1.5`}
                        />
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 truncate">
                        {hab.tipoHabitacion?.nombre}
                      </p>
                      <p className={`text-[11px] font-medium ${c.text} mt-0.5`}>
                        {c.label}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
      </div>

      {sel && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setSel(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Habitación
                  </p>
                  <h3 className="text-3xl font-semibold text-slate-900 tabular-nums tracking-tight">
                    {sel.numero}
                  </h3>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {sel.tipoHabitacion?.nombre} · Piso {sel.piso}
                  </p>
                </div>
                <button
                  onClick={() => setSel(null)}
                  className="p-2 text-slate-300 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              {sel.tipoHabitacion && (
                <div className="mt-4 flex items-center gap-2 text-sm">
                  <span className="text-slate-400">Tarifa</span>
                  <span className="font-semibold text-slate-900 tabular-nums">
                    ${Number(sel.tipoHabitacion.tarifaBase).toLocaleString()}
                  </span>
                  <span className="text-slate-400">/ noche</span>
                </div>
              )}
            </div>
            <div className="p-6">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
                Cambiar estado
              </p>
              {sel.estado === "OCUPADA" ? (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
                  <p className="text-sm text-rose-700 font-medium">
                    Habitación ocupada
                  </p>
                  <p className="text-xs text-rose-600 mt-1">
                    Para liberarla debes hacer el <b>check-out</b> desde
                    Reservaciones. Así se cierra el folio y se cobra la
                    estancia.
                  </p>
                </div>
              ) : (TRANSICIONES[sel.estado] ?? []).length === 0 ? (
                <p className="text-sm text-slate-400">
                  No hay cambios de estado disponibles desde aquí.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {(TRANSICIONES[sel.estado] ?? []).map((k) => {
                    const c = EST[k] || EST.BLOQUEADA;
                    return (
                      <button
                        key={k}
                        onClick={() => cambiarEstado(sel.id, k)}
                        className="flex items-center gap-2 rounded-xl py-2.5 px-3 text-sm font-medium bg-slate-50 text-slate-600 hover:bg-slate-100 transition-all"
                      >
                        <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-slate-400 mt-3">
                Estado actual:{" "}
                <span className="font-medium text-slate-600">
                  {(EST[sel.estado] || EST.BLOQUEADA).label}
                </span>
                . Solo se muestran los cambios permitidos por el flujo
                operativo.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
