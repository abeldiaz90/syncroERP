"use client";

import { useState, useRef } from "react";
import {
  UploadCloud,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  X,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { PuedeCrear } from "@/app/components/ProtectedElement";

// ── Tipos (espejo del backend: ResultadoImportacion / ErrorFila) ──
interface ErrorFila {
  fila: number;
  sku?: string;
  campo?: string;
  mensaje: string;
}
interface ResultadoImportacion {
  modo: "validar" | "aplicar";
  totalFilas: number;
  creados: number;
  actualizados: number;
  conError: number;
  errores: ErrorFila[];
  advertencias: ErrorFila[];
}

export default function ImportarInventarioPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  const [archivo, setArchivo] = useState<File | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
  const [yaValidado, setYaValidado] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [toast, setToast] = useState<{
    mensaje: string;
    tipo: "exito" | "error" | "info";
  } | null>(null);
  const mostrarToast = (
    mensaje: string,
    tipo: "exito" | "error" | "info" = "info",
  ) => {
    setToast({ mensaje, tipo });
    setTimeout(() => setToast(null), 4000);
  };

  const token = () =>
    typeof window !== "undefined"
      ? localStorage.getItem("syncro_token") ?? ""
      : "";

  // ── Descargar plantilla ──
  const descargarPlantilla = async () => {
    try {
      const res = await fetch(`${apiUrl}/catalogo/importacion/plantilla`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) return mostrarToast("No se pudo descargar la plantilla", "error");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Plantilla-Carga-Inventario.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      mostrarToast("Error de conexión al descargar la plantilla", "error");
    }
  };

  // ── Selección de archivo ──
  const seleccionar = (f: File | null) => {
    if (!f) return;
    if (!/\.(xlsx|xls)$/i.test(f.name)) {
      mostrarToast("El archivo debe ser .xlsx o .xls", "error");
      return;
    }
    setArchivo(f);
    setResultado(null);
    setYaValidado(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setArrastrando(false);
    seleccionar(e.dataTransfer.files?.[0] ?? null);
  };

  // ── Enviar (validar o aplicar) ──
  const enviar = async (modo: "validar" | "aplicar") => {
    if (!archivo) return;
    setProcesando(true);
    try {
      const fd = new FormData();
      fd.append("archivo", archivo);
      const res = await fetch(
        `${apiUrl}/catalogo/importacion/productos?modo=${modo}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token()}` }, // NO fijar Content-Type: el navegador pone el boundary
          body: fd,
        },
      );
      if (!res.ok) {
        const txt = await res.text();
        mostrarToast(`Error del servidor: ${txt.slice(0, 120)}`, "error");
        return;
      }
      const data: ResultadoImportacion = await res.json();
      setResultado(data);
      if (modo === "validar") {
        setYaValidado(true);
        mostrarToast(
          `Validación: ${data.totalFilas - data.conError} listos, ${data.conError} con error`,
          data.conError ? "info" : "exito",
        );
      } else {
        setYaValidado(false);
        setArchivo(null);
        mostrarToast(
          `Carga aplicada: ${data.creados} creados, ${data.actualizados} actualizados`,
          "exito",
        );
      }
    } catch {
      mostrarToast("Error de conexión con el servidor", "error");
    } finally {
      setProcesando(false);
    }
  };

  const hayErrores = (resultado?.conError ?? 0) > 0;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Encabezado */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <FileSpreadsheet className="text-blue-600" /> Carga masiva de inventario
        </h1>
        <p className="text-gray-500 mt-1">
          Sube tus productos de golpe desde un archivo de Excel. Carga el
          catálogo (datos del producto); las existencias se cargan aparte.
        </p>
      </div>

      {/* Paso 1: plantilla */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 text-white w-8 h-8 rounded-lg flex items-center justify-center font-bold">
            1
          </div>
          <div>
            <p className="font-semibold text-gray-800">Descarga la plantilla</p>
            <p className="text-sm text-gray-500">
              Llénala en Excel. No borres los encabezados; borra solo la fila de ejemplo.
            </p>
          </div>
        </div>
        <button
          onClick={descargarPlantilla}
          className="flex items-center gap-2 bg-white border border-blue-300 text-blue-700 px-4 py-2 rounded-lg hover:bg-blue-100 transition"
        >
          <Download size={18} /> Plantilla
        </button>
      </div>

      {/* Paso 2: subir */}
      <PuedeCrear>
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-blue-600 text-white w-8 h-8 rounded-lg flex items-center justify-center font-bold">
              2
            </div>
            <p className="font-semibold text-gray-800">Sube tu archivo lleno</p>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setArrastrando(true);
            }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
              arrastrando
                ? "border-blue-500 bg-blue-50"
                : "border-gray-300 hover:border-blue-400 hover:bg-gray-50"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => seleccionar(e.target.files?.[0] ?? null)}
            />
            <UploadCloud className="mx-auto text-gray-400 mb-2" size={40} />
            {archivo ? (
              <p className="text-gray-800 font-medium flex items-center justify-center gap-2">
                <FileSpreadsheet size={18} className="text-green-600" />
                {archivo.name}
              </p>
            ) : (
              <p className="text-gray-500">
                Arrastra tu Excel aquí o{" "}
                <span className="text-blue-600 font-medium">haz clic para elegir</span>
              </p>
            )}
          </div>

          {/* Acciones */}
          {archivo && (
            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={() => enviar("validar")}
                disabled={procesando}
                className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition disabled:opacity-50"
              >
                {procesando ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <CheckCircle2 size={18} />
                )}
                Validar sin guardar
              </button>

              <button
                onClick={() => enviar("aplicar")}
                disabled={procesando || (yaValidado && hayErrores)}
                title={
                  yaValidado && hayErrores
                    ? "Corrige los errores antes de aplicar"
                    : ""
                }
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              >
                {procesando ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <ArrowRight size={18} />
                )}
                Aplicar carga
              </button>

              <button
                onClick={() => {
                  setArchivo(null);
                  setResultado(null);
                  setYaValidado(false);
                }}
                className="ml-auto text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>
          )}
        </div>
      </PuedeCrear>

      {/* Paso 3: reporte */}
      {resultado && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-blue-600 text-white w-8 h-8 rounded-lg flex items-center justify-center font-bold">
              3
            </div>
            <p className="font-semibold text-gray-800">
              Resultado ({resultado.modo === "validar" ? "validación" : "carga aplicada"})
            </p>
          </div>

          {/* Contadores */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <Contador
              label="Total filas"
              valor={resultado.totalFilas}
              color="gray"
            />
            <Contador label="Creados" valor={resultado.creados} color="green" />
            <Contador
              label="Actualizados"
              valor={resultado.actualizados}
              color="blue"
            />
            <Contador
              label="Con error"
              valor={resultado.conError}
              color={resultado.conError ? "red" : "gray"}
            />
          </div>

          {/* Errores */}
          {resultado.errores.length > 0 && (
            <TablaMensajes
              titulo="Errores (estas filas no se cargan)"
              icono={<AlertCircle size={16} className="text-red-500" />}
              filas={resultado.errores}
              color="red"
            />
          )}

          {/* Advertencias */}
          {resultado.advertencias.length > 0 && (
            <TablaMensajes
              titulo="Advertencias"
              icono={<AlertTriangle size={16} className="text-amber-500" />}
              filas={resultado.advertencias}
              color="amber"
            />
          )}

          {resultado.errores.length === 0 && resultado.modo === "validar" && (
            <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
              <CheckCircle2 size={18} /> Todo en orden. Ya puedes aplicar la carga.
            </div>
          )}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg text-white flex items-center gap-2 ${
            toast.tipo === "exito"
              ? "bg-green-600"
              : toast.tipo === "error"
                ? "bg-red-600"
                : "bg-gray-800"
          }`}
        >
          {toast.tipo === "exito" ? (
            <CheckCircle2 size={18} />
          ) : (
            <AlertCircle size={18} />
          )}
          {toast.mensaje}
        </div>
      )}
    </div>
  );
}

// ── Subcomponentes ──
function Contador({
  label,
  valor,
  color,
}: {
  label: string;
  valor: number;
  color: "gray" | "green" | "blue" | "red";
}) {
  const colores: Record<string, string> = {
    gray: "bg-gray-50 text-gray-700 border-gray-200",
    green: "bg-green-50 text-green-700 border-green-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    red: "bg-red-50 text-red-700 border-red-200",
  };
  return (
    <div className={`border rounded-lg p-3 text-center ${colores[color]}`}>
      <div className="text-2xl font-bold">{valor}</div>
      <div className="text-xs mt-1">{label}</div>
    </div>
  );
}

function TablaMensajes({
  titulo,
  icono,
  filas,
  color,
}: {
  titulo: string;
  icono: React.ReactNode;
  filas: ErrorFila[];
  color: "red" | "amber";
}) {
  const head =
    color === "red" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800";
  return (
    <div className="mb-4">
      <p className="font-medium text-gray-700 flex items-center gap-2 mb-2">
        {icono} {titulo} ({filas.length})
      </p>
      <div className="border border-gray-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className={head}>
            <tr>
              <th className="text-left px-3 py-2 w-16">Fila</th>
              <th className="text-left px-3 py-2 w-32">SKU</th>
              <th className="text-left px-3 py-2 w-32">Campo</th>
              <th className="text-left px-3 py-2">Mensaje</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="px-3 py-2 text-gray-500">{f.fila}</td>
                <td className="px-3 py-2 font-mono text-xs">{f.sku ?? "—"}</td>
                <td className="px-3 py-2 text-gray-600">{f.campo ?? "—"}</td>
                <td className="px-3 py-2 text-gray-800">{f.mensaje}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
