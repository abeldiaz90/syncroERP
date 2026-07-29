"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import {
  Boxes, Download, UploadCloud, CheckCircle2, AlertCircle,
  AlertTriangle, ArrowLeft, Loader2, PlayCircle,
} from "lucide-react";

interface ErrorFila { fila: number; sku?: string; campo?: string; mensaje: string; }
interface Resultado {
  modo: "validar" | "aplicar";
  totalFilas: number; creados: number; actualizados: number; conError: number;
  errores: ErrorFila[]; advertencias: ErrorFila[];
}

/**
 * Carga de STOCK INICIAL (saldos de apertura de inventario).
 * Flujo: descargar plantilla → llenar → validar sin guardar → aplicar.
 * Al aplicar, además del stock se genera la póliza contable de la carga.
 * Ruta sugerida: app/dashboard/inventario/stock-inicial/page.tsx
 */
export default function StockInicialPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
  const token = () => (typeof window !== "undefined" ? localStorage.getItem("syncro_token") ?? "" : "");

  const [archivo, setArchivo] = useState<File | null>(null);
  const [cargando, setCargando] = useState<"" | "plantilla" | "validar" | "aplicar">("");
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  const descargarPlantilla = async () => {
    setCargando("plantilla"); setError("");
    try {
      const res = await fetch(`${apiUrl}/catalogo/importacion/stock-inicial/plantilla`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) throw new Error("No se pudo descargar la plantilla");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "Plantilla-Stock-Inicial-SyncroERP.xlsx"; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) { setError(e.message || "Error al descargar"); }
    finally { setCargando(""); }
  };

  const enviar = async (modo: "validar" | "aplicar") => {
    if (!archivo) { setError("Selecciona primero el archivo de stock inicial"); return; }
    setCargando(modo); setError("");
    try {
      const fd = new FormData();
      fd.append("archivo", archivo);
      const res = await fetch(`${apiUrl}/catalogo/importacion/stock-inicial?modo=${modo}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Error en la carga");
      setResultado(data);
    } catch (e: any) { setError(e.message || "Error de conexión"); setResultado(null); }
    finally { setCargando(""); }
  };

  const puedeAplicar = resultado?.modo === "validar" && resultado.conError === 0 && resultado.creados > 0;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto text-slate-800">
      <Link href="/dashboard/inventario" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Inventario
      </Link>

      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
          <Boxes className="w-8 h-8 text-emerald-600" /> Carga de stock inicial
        </h1>
        <p className="text-slate-500 mt-1">
          Saldos de apertura de inventario. Entra la mercancía al almacén y genera
          la póliza contable de la carga (Inventario contra 399-01 Saldos iniciales).
        </p>
      </div>

      {/* Paso 1: plantilla */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold text-slate-800">1 · Descarga la plantilla</p>
          <p className="text-sm text-slate-500 mt-1">
            Incluye la hoja «Almacenes» con los nombres exactos de tus almacenes.
            Requisito: el catálogo de productos ya debe estar cargado.
          </p>
        </div>
        <button onClick={descargarPlantilla} disabled={cargando !== ""}
          className="shrink-0 inline-flex items-center gap-2 bg-slate-800 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-slate-900 disabled:opacity-50">
          {cargando === "plantilla" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Plantilla
        </button>
      </div>

      {/* Paso 2: archivo */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
        <p className="font-semibold text-slate-800 mb-3">2 · Sube el archivo llenado</p>
        <div
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/40 transition"
        >
          <UploadCloud className="w-10 h-10 text-slate-400 mx-auto mb-2" />
          {archivo ? (
            <p className="font-medium text-slate-700">{archivo.name}</p>
          ) : (
            <p className="text-slate-500">Haz clic para seleccionar el .xlsx</p>
          )}
          <input ref={inputRef} type="file" accept=".xlsx" className="hidden"
            onChange={(e) => { setArchivo(e.target.files?.[0] ?? null); setResultado(null); }} />
        </div>
      </div>

      {/* Paso 3: validar / aplicar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4 flex flex-wrap items-center gap-3">
        <p className="font-semibold text-slate-800 mr-auto">3 · Valida y aplica</p>
        <button onClick={() => enviar("validar")} disabled={!archivo || cargando !== ""}
          className="inline-flex items-center gap-2 border border-slate-300 px-4 py-2.5 rounded-lg font-medium hover:bg-slate-50 disabled:opacity-50">
          {cargando === "validar" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          Validar sin guardar
        </button>
        <button onClick={() => enviar("aplicar")} disabled={!puedeAplicar || cargando !== ""}
          title={!puedeAplicar ? "Primero valida con 0 errores" : ""}
          className="inline-flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50">
          {cargando === "aplicar" ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
          Aplicar carga
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-4 mb-4">
          <AlertCircle className="w-5 h-5 shrink-0" /> {error}
        </div>
      )}

      {resultado && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className={`px-5 py-4 border-b ${resultado.modo === "aplicar" ? "bg-emerald-50 border-emerald-100" : "bg-slate-50 border-slate-200"}`}>
            <p className="font-semibold">
              {resultado.modo === "aplicar"
                ? `✅ Carga aplicada: ${resultado.creados} entradas de stock registradas y póliza generada`
                : `Validación: ${resultado.creados} filas listas · ${resultado.conError} con error`}
            </p>
            <p className="text-sm text-slate-500 mt-0.5">{resultado.totalFilas} filas leídas del archivo</p>
          </div>

          {resultado.advertencias.length > 0 && (
            <div className="px-5 py-3 border-b border-amber-100 bg-amber-50/60">
              <p className="text-sm font-medium text-amber-800 flex items-center gap-1.5 mb-1">
                <AlertTriangle className="w-4 h-4" /> Advertencias ({resultado.advertencias.length})
              </p>
              <ul className="text-sm text-amber-800/90 space-y-0.5 max-h-36 overflow-y-auto">
                {resultado.advertencias.map((a, i) => (
                  <li key={i}>Fila {a.fila} · {a.sku}: {a.mensaje}</li>
                ))}
              </ul>
            </div>
          )}

          {resultado.errores.length > 0 && (
            <div className="px-5 py-3">
              <p className="text-sm font-medium text-rose-700 mb-2">
                Errores (estas filas no se cargan) ({resultado.errores.length})
              </p>
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-slate-500 border-b border-slate-200">
                      <th className="py-1.5 pr-4">Fila</th><th className="pr-4">SKU</th>
                      <th className="pr-4">Campo</th><th>Mensaje</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {resultado.errores.map((e, i) => (
                      <tr key={i}>
                        <td className="py-1.5 pr-4 font-mono">{e.fila}</td>
                        <td className="pr-4 font-mono">{e.sku ?? ""}</td>
                        <td className="pr-4">{e.campo ?? ""}</td>
                        <td className="text-slate-600">{e.mensaje}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
