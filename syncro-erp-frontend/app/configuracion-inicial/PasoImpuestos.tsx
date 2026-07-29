"use client";

import { useState, useEffect } from "react";
import { Percent, Zap, Plus, CheckCircle2, AlertCircle, Trash2 } from "lucide-react";

/**
 * Paso "Impuestos" del wizard de configuración inicial.
 *
 * Uso: inclúyelo como uno de los pasos del asistente. Llama a onListo(true)
 * cuando hay al menos un impuesto, para que el wizard permita avanzar
 * (si decides que el paso sea obligatorio).
 *
 * Endpoints usados (ya existentes tras el parche del backend):
 *   GET  /catalogo/impuestos
 *   POST /catalogo/impuestos/precargar-estandar   ← precarga IVA 16%, IVA 0%, Exento
 *   POST /catalogo/impuestos                       ← alta manual
 */
interface Impuesto {
  id: string;
  nombre: string;
  porcentaje: number;
  activo: boolean;
}

export default function PasoImpuestos({
  onListo,
}: {
  onListo?: (listo: boolean) => void;
}) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  const [impuestos, setImpuestos] = useState<Impuesto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [precargando, setPrecargando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [porcentaje, setPorcentaje] = useState<string>("");
  const [guardando, setGuardando] = useState(false);

  const [toast, setToast] = useState<{ msg: string; tipo: "exito" | "error" | "info" } | null>(null);
  const aviso = (msg: string, tipo: "exito" | "error" | "info" = "info") => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 3500);
  };

  const token = () =>
    typeof window !== "undefined" ? localStorage.getItem("syncro_token") ?? "" : "";

  const cargar = async () => {
    setCargando(true);
    try {
      const res = await fetch(`${apiUrl}/catalogo/impuestos`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (res.ok) {
        const data: Impuesto[] = await res.json();
        setImpuestos(data);
        onListo?.(data.length > 0);
      }
    } catch {
      aviso("Error de conexión al cargar impuestos", "error");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const precargarEstandar = async () => {
    setPrecargando(true);
    try {
      const res = await fetch(`${apiUrl}/catalogo/impuestos/precargar-estandar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (res.ok) {
        const r = await res.json();
        aviso(`Listo: ${r.creados} creados, ${r.yaExistian} ya existían`, "exito");
        cargar();
      } else {
        aviso("No se pudieron precargar los impuestos", "error");
      }
    } catch {
      aviso("Error de conexión", "error");
    } finally {
      setPrecargando(false);
    }
  };

  const agregarManual = async () => {
    if (!nombre.trim()) return aviso("El nombre es obligatorio", "info");
    setGuardando(true);
    try {
      const res = await fetch(`${apiUrl}/catalogo/impuestos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify({ nombre: nombre.trim(), porcentaje: Number(porcentaje) || 0 }),
      });
      if (res.ok) {
        setNombre("");
        setPorcentaje("");
        aviso("Impuesto agregado", "exito");
        cargar();
      } else {
        const d = await res.json().catch(() => null);
        aviso(`Error: ${d?.message || "no se pudo guardar"}`, "error");
      }
    } catch {
      aviso("Error de conexión", "error");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-white flex items-center gap-2 ${
            toast.tipo === "exito"
              ? "bg-emerald-600"
              : toast.tipo === "error"
                ? "bg-rose-600"
                : "bg-blue-600"
          }`}
        >
          {toast.tipo === "exito" ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {toast.msg}
        </div>
      )}

      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 mb-3">
          <Percent className="w-7 h-7" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Configura tus impuestos</h2>
        <p className="text-slate-500 mt-1">
          Necesitas al menos un impuesto para poder dar de alta productos.
        </p>
      </div>

      {/* Precarga rápida */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5 mb-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-semibold text-slate-800 flex items-center gap-2">
              <Zap className="w-4 h-4 text-indigo-600" /> Opción rápida
            </p>
            <p className="text-sm text-slate-600 mt-1">
              Carga de un clic los impuestos estándar de México:
              <span className="font-medium"> IVA 16%, IVA 0% y Exento.</span>
            </p>
          </div>
          <button
            onClick={precargarEstandar}
            disabled={precargando}
            className="shrink-0 bg-indigo-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            {precargando ? "Cargando..." : "Cargar estándar"}
          </button>
        </div>
      </div>

      {/* Alta manual */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-5">
        <p className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4 text-slate-500" /> O agrega uno manual
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Nombre (ej. IEPS 8%)"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <div className="relative w-32">
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="16.00"
              value={porcentaje}
              onChange={(e) => setPorcentaje(e.target.value)}
              className="w-full pl-3 pr-7 py-2 bg-slate-50 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">%</span>
          </div>
          <button
            onClick={agregarManual}
            disabled={guardando}
            className="bg-slate-800 text-white px-4 rounded-lg hover:bg-slate-900 disabled:opacity-50 transition"
          >
            Agregar
          </button>
        </div>
      </div>

      {/* Lista actual */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 text-sm font-medium text-slate-600">
          Impuestos configurados ({impuestos.length})
        </div>
        {cargando ? (
          <div className="p-6 text-center text-slate-400">Cargando...</div>
        ) : impuestos.length === 0 ? (
          <div className="p-6 text-center text-slate-500">
            Aún no hay impuestos. Usa la opción rápida de arriba.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {impuestos.map((imp) => (
              <li key={imp.id} className="px-5 py-3 flex items-center justify-between">
                <span className="font-medium text-slate-800">{imp.nombre}</span>
                <span className="inline-flex items-center bg-slate-100 text-slate-700 font-semibold px-3 py-1 rounded-lg border border-slate-200">
                  {imp.porcentaje}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {impuestos.length > 0 && (
        <div className="mt-4 flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          <CheckCircle2 className="w-5 h-5" />
          Listo. Ya puedes continuar y crear o importar productos.
        </div>
      )}
    </div>
  );
}
