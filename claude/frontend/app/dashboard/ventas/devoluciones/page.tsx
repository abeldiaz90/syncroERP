"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Plus, RotateCcw } from "lucide-react";
import { api, ApiError } from "@/lib/api";

interface Devolucion {
  id: string;
  folio: number;
  fechaDevolucion: string;
  total: number;
  resolucion: string;
  estadoFiscal: string;
  motivo: string;
  venta?: { id: string; folio: number; cliente?: { nombre: string } };
}

const dinero = (valor: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(valor));

export default function DevolucionesPage() {
  const [datos, setDatos] = useState<Devolucion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<Devolucion[]>("/ventas/devoluciones")
      .then(setDatos)
      .catch((e) => setError(e instanceof ApiError ? e.mensajeParaPantalla() : "No se pudieron cargar las devoluciones."))
      .finally(() => setCargando(false));
  }, []);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto text-slate-800">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-7">
        <div>
          <h1 className="text-3xl font-black flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-amber-100"><RotateCcw className="w-7 h-7 text-amber-700" /></span>
            Devoluciones de venta
          </h1>
          <p className="text-slate-500 mt-2">Reembolsos, saldos a favor y reintegros de inventario con trazabilidad.</p>
        </div>
        <Link href="/dashboard/ventas/devoluciones/nueva" className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl font-bold shadow-sm">
          <Plus className="w-4 h-4" /> Nueva devolución
        </Link>
      </div>

      {error && <div className="mb-5 p-4 rounded-xl bg-rose-50 text-rose-700 border border-rose-200">{error}</div>}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {cargando ? (
          <div className="p-16 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
        ) : datos.length === 0 ? (
          <div className="p-16 text-center text-slate-500">
            <RotateCcw className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="font-bold text-slate-700">Aún no hay devoluciones</p>
            <p className="text-sm mt-1">Puedes iniciarla desde aquí o desde el historial de ventas.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-4">Devolución</th><th className="px-5 py-4">Venta / cliente</th>
                  <th className="px-5 py-4">Resolución</th><th className="px-5 py-4">Fiscal</th>
                  <th className="px-5 py-4 text-right">Importe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {datos.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4"><b>DEV-{d.folio}</b><span className="block text-xs text-slate-500">{new Date(d.fechaDevolucion).toLocaleString("es-MX")}</span></td>
                    <td className="px-5 py-4"><b>Venta #{d.venta?.folio ?? "—"}</b><span className="block text-xs text-slate-500">{d.venta?.cliente?.nombre ?? "Público general"}</span></td>
                    <td className="px-5 py-4"><span className="rounded-full bg-indigo-50 text-indigo-700 px-3 py-1 text-xs font-bold">{d.resolucion.replaceAll("_", " ")}</span></td>
                    <td className="px-5 py-4 text-xs">
                      {d.estadoFiscal === "PENDIENTE_NOTA_CREDITO" ? <span className="text-amber-700 flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> Nota de crédito pendiente</span> : <span className="text-emerald-700">Sin pendiente</span>}
                    </td>
                    <td className="px-5 py-4 text-right font-black">{dinero(d.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
