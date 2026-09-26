// app/dashboard/hoteleria/auditoria/page.tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Moon,
  Loader2,
  CheckCircle2,
  X,
  Calendar,
  Users,
  Play,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import { fechaCorta } from "@/lib/fechas";

interface IHotel {
  id: string;
  nombre: string;
}
interface IEstado {
  fechaOperativa: string;
  ultimaAuditoria: string | null;
  huespedesHospedados: number;
  foliosContablesPendientes: number;
}
interface IResultado {
  fechaOperativa: string;
  reservacionesProcesadas: number;
  nochesPosteadas: number;
  montoTotal: number;
  detalle: { codigo: string; monto: number }[];
  /* La auditoría puede responder 200 y no haber corrido: ver más abajo. */
  ejecutada?: boolean;
  motivo?: string | null;
}

export default function AuditoriaPage() {
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
  const [estado, setEstado] = useState<IEstado | null>(null);
  const [resultado, setResultado] = useState<IResultado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [corriendo, setCorriendo] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const mostrar = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
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

  const cargarEstado = useCallback(async () => {
    if (!hotelId) return;
    const r = await fetch(
      `${api}/hoteleria/auditoria/estado?hotelId=${hotelId}`,
      { headers: h() },
    );
    if (r.ok) setEstado(await r.json());
  }, [api, hotelId]);

  useEffect(() => {
    cargarHoteles();
  }, [cargarHoteles]);
  useEffect(() => {
    if (hotelId) {
      cargarEstado();
      setResultado(null);
    }
  }, [hotelId, cargarEstado]);
  useEffect(() => {
    if (hoteles.length > 0) {
      const valido = hoteles.some((x) => x.id === hotelId);
      if (!valido) setHotelId(hoteles[0].id);
    }
  }, [hoteles, hotelId]);

  const correr = async () => {
    setCorriendo(true);
    const r = await fetch(`${api}/hoteleria/auditoria/ejecutar`, {
      method: "POST",
      headers: h(),
      body: JSON.stringify({ hotelId }),
    });
    if (r.ok) {
      const d = await r.json();
      setResultado(d);
      /*
        Un 200 no quiere decir que el día se haya cerrado. Cuando la fecha
        operativa todavía no termina, la auditoría se niega —correctamente— y
        devuelve ceros; esta pantalla anunciaba «Auditoría completada» igual.
        Ahora el aviso dice lo que pasó y el bloque de abajo, también.
      */
      if (d.ejecutada === false) {
        mostrar(d.motivo || "La auditoría no se ejecutó.", false);
      } else {
        mostrar(
          `Auditoría completada: ${d.nochesPosteadas} noche(s) posteadas`,
        );
      }
      cargarEstado();
    } else {
      const d = await r.json().catch(() => null);
      mostrar(
        Array.isArray(d?.message)
          ? d.message.join(", ")
          : d?.message || "No se pudo ejecutar la auditoría",
        false,
      );
    }
    setCorriendo(false);
  };

  const fmt$ = (n: number) =>
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(n ?? 0);
  const hotelActual = hoteles.find((x) => x.id === hotelId);

  if (cargando)
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-7 h-7 animate-spin text-slate-300" />
      </div>
    );

  if (hoteles.length === 0)
    return (
      <div className="p-8 text-center text-slate-500">
        Primero crea un hotel en Configuración.
      </div>
    );

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8">
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
            Cierre del día
          </p>
          <h1 className="text-3xl font-semibold text-slate-900 tracking-tight flex items-center gap-2">
            <Moon className="w-7 h-7 text-slate-700" /> Auditoría Nocturna
          </h1>
          <p className="text-slate-500 mt-1">
            Postea la renta de la noche a los huéspedes hospedados y cierra el
            día operativo.
          </p>
        </div>
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
      </div>

      {/* Estado actual */}
      {estado && (
        <div className="grid sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">
              <Calendar className="w-3.5 h-3.5" /> Fecha operativa
            </div>
            <p className="text-xl font-semibold text-slate-900">
              {fechaCorta(estado.fechaOperativa)}
            </p>
          </div>
          <div
            className={`bg-white border rounded-2xl p-5 ${estado.foliosContablesPendientes ? "border-amber-300" : "border-slate-200"}`}
          >
            <div className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">
              Folios por contabilizar
            </div>
            <p
              className={`text-xl font-semibold ${estado.foliosContablesPendientes ? "text-amber-700" : "text-slate-900"}`}
            >
              {estado.foliosContablesPendientes}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">
              <Users className="w-3.5 h-3.5" /> Huéspedes hospedados
            </div>
            <p className="text-xl font-semibold text-slate-900 tabular-nums">
              {estado.huespedesHospedados}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">
              <Moon className="w-3.5 h-3.5" /> Última auditoría
            </div>
            <p className="text-sm font-medium text-slate-600">
              {estado.ultimaAuditoria
                ? new Date(estado.ultimaAuditoria).toLocaleString("es-MX")
                : "Nunca"}
            </p>
          </div>
        </div>
      )}

      {/* Acción principal */}
      <div className="bg-slate-900 rounded-2xl p-6 mb-6 text-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-lg">Ejecutar cierre del día</h3>
            <p className="text-white/60 text-sm mt-1">
              Se posteará una noche de renta a cada huésped hospedado y se
              avanzará la fecha operativa.
            </p>
          </div>
          <button
            onClick={correr}
            disabled={corriendo}
            className="flex items-center gap-2 bg-white text-slate-900 font-semibold px-6 py-3 rounded-xl hover:bg-slate-100 disabled:opacity-50 whitespace-nowrap"
          >
            {corriendo ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {corriendo ? "Procesando…" : "Correr auditoría"}
          </button>
        </div>
        {(estado?.huespedesHospedados ?? 0) === 0 && (
          <p className="text-white/40 text-xs mt-3">
            No hay huéspedes hospedados; el cierre aún puede ejecutarse para
            avanzar la fecha operativa.
          </p>
        )}
      </div>

      {/* Resultado */}
      {resultado && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          {resultado.ejecutada === false ? (
            <div className="p-5 border-b border-slate-100 bg-amber-50">
              <div className="flex items-center gap-2 font-semibold text-amber-800">
                <AlertTriangle className="w-5 h-5" /> La auditoría no se ejecutó
              </div>
              <p className="mt-1 text-sm text-amber-800">{resultado.motivo}</p>
            </div>
          ) : (
            <div className="p-5 border-b border-slate-100 bg-emerald-50">
              <div className="flex items-center gap-2 text-emerald-700 font-semibold">
                <CheckCircle2 className="w-5 h-5" /> Auditoría completada
              </div>
            </div>
          )}
          <div className="grid sm:grid-cols-3 gap-4 p-5">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">
                Noches posteadas
              </p>
              <p className="text-2xl font-semibold text-slate-900 tabular-nums">
                {resultado.nochesPosteadas}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">
                Monto generado
              </p>
              <p className="text-2xl font-semibold text-emerald-600 tabular-nums">
                {fmt$(resultado.montoTotal)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">
                {resultado.ejecutada === false
                  ? "Fecha operativa (sin cambio)"
                  : "Nueva fecha operativa"}
              </p>
              <p className="text-lg font-semibold text-slate-900">
                {fechaCorta(resultado.fechaOperativa)}
              </p>
            </div>
          </div>
          {resultado.detalle.length > 0 && (
            <div className="border-t border-slate-100 p-5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                Cargos posteados
              </p>
              <div className="space-y-2">
                {resultado.detalle.map((d, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-sm border-b border-slate-50 pb-2"
                  >
                    <span className="font-mono text-slate-600">{d.codigo}</span>
                    <span className="font-semibold text-slate-900 tabular-nums">
                      {fmt$(d.monto)}
                    </span>
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
