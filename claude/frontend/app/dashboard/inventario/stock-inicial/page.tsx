"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Boxes, CheckCircle2, Download, Loader2, PlayCircle, UploadCloud, XCircle } from "lucide-react";

type Estado = "PENDIENTE" | "VALIDANDO" | "PROCESANDO" | "COMPLETADO" | "COMPLETADO_CON_ERRORES" | "FALLIDO" | "CANCELADO";
interface Job {
  id: string; jobId: string; estado: Estado; modo: "VALIDAR" | "APLICAR"; nombreArchivo: string;
  totalFilas: number; procesadas: number; correctas: number; conError: number; omitidas: number;
  porcentaje: number; loteActual: number; tamanoLote: number; mensajeError?: string;
  estadoContable?: string; polizaId?: string; archivoDuplicado?: boolean;
}
interface ErrorFila { numeroFila: number; sku?: string; campo?: string; valor?: string; mensaje: string; }

const terminales: Estado[] = ["COMPLETADO", "COMPLETADO_CON_ERRORES", "FALLIDO", "CANCELADO"];

export default function StockInicialPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:4000/api');
  const token = () => typeof window !== "undefined" ? localStorage.getItem("syncro_token") ?? "" : "";
  const [archivo, setArchivo] = useState<File | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [errores, setErrores] = useState<ErrorFila[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [almacenes, setAlmacenes] = useState<Array<{ id: string; nombre: string; activo?: boolean }>>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const idempotencyRef = useRef<string>("");

  useEffect(() => {
    fetch(`${apiUrl}/catalogo/almacenes`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(async (r) => r.ok ? r.json() : [])
      .then((lista) => setAlmacenes((Array.isArray(lista) ? lista : []).filter((a) => a.activo !== false)))
      .catch(() => setAlmacenes([]));
  }, [apiUrl]);

  useEffect(() => {
    if (!job || terminales.includes(job.estado)) return;
    const t = window.setInterval(async () => {
      try {
        const res = await fetch(`${apiUrl}/catalogo/importacion/stock-inicial/${job.id}`, { headers: { Authorization: `Bearer ${token()}` } });
        if (!res.ok) return;
        const actual = await res.json();
        setJob(actual);
        if (terminales.includes(actual.estado) && actual.conError > 0) await cargarErrores(actual.id);
      } catch { /* el siguiente sondeo vuelve a intentar */ }
    }, 1500);
    return () => window.clearInterval(t);
  }, [job?.id, job?.estado]);

  const cargarErrores = async (id: string) => {
    const res = await fetch(`${apiUrl}/catalogo/importacion/stock-inicial/${id}/errores`, { headers: { Authorization: `Bearer ${token()}` } });
    if (res.ok) setErrores(await res.json());
  };

  const descargarPlantilla = async () => {
    setOcupado(true); setError("");
    try {
      const res = await fetch(`${apiUrl}/catalogo/importacion/stock-inicial/plantilla`, { headers: { Authorization: `Bearer ${token()}` } });
      if (!res.ok) {
        const detalle = await res.json().catch(() => null);
        throw new Error(Array.isArray(detalle?.message) ? detalle.message.join(" · ") : detalle?.message || "No se pudo descargar la plantilla");
      }
      const url = URL.createObjectURL(await res.blob()); const a = document.createElement("a");
      a.href = url; a.download = "Plantilla-Stock-Inicial-SyncroERP.xlsx"; a.click(); URL.revokeObjectURL(url);
    } catch (e: any) { setError(e.message || "Error al descargar"); } finally { setOcupado(false); }
  };

  const iniciar = async (modo: "validar" | "aplicar") => {
    if (!archivo) { setError("Selecciona el archivo .xlsx"); return; }
    setOcupado(true); setError(""); setErrores([]);
    try {
      const fd = new FormData(); fd.append("archivo", archivo);
      if (!idempotencyRef.current) idempotencyRef.current = crypto.randomUUID();
      const key = idempotencyRef.current;
      const res = await fetch(`${apiUrl}/catalogo/importacion/stock-inicial?modo=${modo}`, {
        method: "POST", headers: { Authorization: `Bearer ${token()}`, "Idempotency-Key": key }, body: fd,
      });
      const data = await res.json(); if (!res.ok) throw new Error(data?.message || "No se pudo iniciar la importación");
      setJob(data);
      if (terminales.includes(data.estado) && data.procesadas === 0) {
        setError(data.mensajeError || "La importación terminó sin procesar filas. El stock no fue modificado.");
        idempotencyRef.current = crypto.randomUUID();
      }
    } catch (e: any) { setError(e.message || "Error de conexión"); } finally { setOcupado(false); }
  };

  /*
   * Cancelar una importación en curso es una escritura y puede fallar —el
   * trabajo ya terminó, el permiso no está—. Se lanzaba sin mirar la
   * respuesta: el usuario veía la barra seguir avanzando sin una palabra que
   * explicara por qué no se detuvo.
   */
  const cancelar = async () => {
    if (!job) return;
    setError("");
    try {
      const r = await fetch(`${apiUrl}/catalogo/importacion/stock-inicial/${job.id}/cancelar`, { method: "POST", headers: { Authorization: `Bearer ${token()}` } });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        setError((Array.isArray(d?.message) ? d.message.join(", ") : d?.message) || "No se pudo cancelar la importación: sigue en curso.");
      }
    } catch { setError("No hay conexión con el servidor. La importación sigue en curso."); }
  };

  const descargarErrores = () => {
    const encabezado = "fila,sku,campo,valor,mensaje\n";
    const csv = encabezado + errores.map(e => [e.numeroFila, e.sku, e.campo, e.valor, e.mensaje].map(v => `"${String(v ?? "").replaceAll('"','""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `errores-importacion-${job?.id}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const activo = !!job && !terminales.includes(job.estado);
  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto text-slate-800">
      <Link href="/dashboard/inventario" className="inline-flex items-center gap-1 text-sm text-slate-500 mb-4"><ArrowLeft className="w-4 h-4"/> Inventario</Link>
      <h1 className="text-3xl font-bold flex items-center gap-3"><Boxes className="w-8 h-8 text-emerald-600"/> Carga masiva de stock inicial</h1>
      <p className="text-slate-500 mt-1 mb-6">Carga un solo Excel grande. El ERP lo procesa internamente por bloques, permite salir de la pantalla y conserva el avance.</p>

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <div className="bg-white border rounded-2xl p-5">
          <p className="font-semibold mb-2">1 · Plantilla</p>
          <p className="text-sm text-slate-500 mb-3">La plantilla se genera con tus productos y precarga un almacén activo en cada fila.</p>
          <p className={`mb-4 rounded-lg px-3 py-2 text-xs ${almacenes.length ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{almacenes.length ? `${almacenes.length} almacén(es) activo(s): el stock quedará asociado al indicado en cada fila.` : "Falta un almacén activo. Créalo antes de descargar o importar."}</p>
          <button onClick={descargarPlantilla} disabled={ocupado || activo || almacenes.length === 0} className="inline-flex items-center gap-2 bg-slate-800 text-white px-4 py-2.5 rounded-lg disabled:opacity-50"><Download className="w-4 h-4"/> Descargar</button>
          {almacenes.length === 0 && <Link href="/dashboard/almacenes" className="ml-3 text-sm font-bold text-indigo-700 underline">Crear almacén</Link>}
        </div>
        <div className="bg-white border rounded-2xl p-5">
          <p className="font-semibold mb-2">2 · Archivo completo</p>
          <div onClick={() => !activo && inputRef.current?.click()} className="border-2 border-dashed rounded-xl p-5 text-center cursor-pointer hover:border-emerald-400">
            <UploadCloud className="w-8 h-8 mx-auto text-slate-400"/>
            <p className="mt-2 text-sm font-medium">{archivo?.name || "Selecciona el archivo .xlsx"}</p>
            <input ref={inputRef} type="file" accept=".xlsx" className="hidden" onChange={e => { setArchivo(e.target.files?.[0] || null); setJob(null); setErrores([]); setError(""); idempotencyRef.current = crypto.randomUUID(); }}/>
          </div>
        </div>
      </div>

      <div className="bg-white border rounded-2xl p-5 mb-4 flex flex-wrap gap-3 items-center">
        <p className="font-semibold mr-auto">3 · Ejecutar</p>
        <button onClick={() => iniciar("validar")} disabled={!archivo || ocupado || activo || almacenes.length === 0} className="inline-flex items-center gap-2 border px-4 py-2.5 rounded-lg disabled:opacity-50"><CheckCircle2 className="w-4 h-4"/> Validar archivo</button>
        <button onClick={() => iniciar("aplicar")} disabled={!archivo || ocupado || activo || almacenes.length === 0} className="inline-flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-lg disabled:opacity-50"><PlayCircle className="w-4 h-4"/> Procesar filas válidas</button>
        {activo && <button onClick={cancelar} className="inline-flex items-center gap-2 border border-rose-300 text-rose-700 px-4 py-2.5 rounded-lg"><XCircle className="w-4 h-4"/> Cancelar</button>}
      </div>

      {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-4 mb-4">{error}</div>}

      {job && <div className="bg-white border rounded-2xl p-5 mb-4">
        <div className="flex items-center justify-between gap-4"><div><p className="font-semibold">{job.nombreArchivo}</p><p className="text-sm text-slate-500">{job.estado} · lote interno {job.loteActual} · {job.tamanoLote} filas por lote</p></div>{activo && <Loader2 className="w-6 h-6 animate-spin text-emerald-600"/>}</div>
        <div className="h-3 bg-slate-100 rounded-full mt-4 overflow-hidden"><div className="h-full bg-emerald-600 transition-all" style={{width:`${job.porcentaje || 0}%`}}/></div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4 text-sm">
          <Dato titulo="Avance" valor={`${job.porcentaje.toFixed(1)}%`}/><Dato titulo="Procesadas" valor={job.procesadas}/><Dato titulo="Correctas" valor={job.correctas}/><Dato titulo="Errores" valor={job.conError}/><Dato titulo="Omitidas" valor={job.omitidas}/>
        </div>
        {terminales.includes(job.estado) && job.procesadas === 0 && <p className="mt-4 text-sm text-rose-700 bg-rose-50 border border-rose-200 p-3 rounded-lg"><b>No se aplicó stock.</b> El archivo terminó sin filas procesadas. Corrige el archivo o vuelve a cargarlo después de aplicar el hotfix.</p>}
        {job.mensajeError && <p className="mt-4 text-sm text-amber-700 bg-amber-50 p-3 rounded-lg">{job.mensajeError}</p>}
        {job.estadoContable && <p className="mt-3 text-sm">Estado contable: <b>{job.estadoContable}</b></p>}
      </div>}

      {errores.length > 0 && <div className="bg-white border rounded-2xl overflow-hidden">
        <div className="p-4 border-b flex justify-between"><p className="font-semibold">Errores por fila ({errores.length})</p><button onClick={descargarErrores} className="text-sm font-medium text-emerald-700">Descargar CSV</button></div>
        <div className="max-h-96 overflow-auto"><table className="w-full text-sm"><thead className="sticky top-0 bg-slate-50"><tr><th className="p-2 text-left">Fila</th><th className="p-2 text-left">SKU</th><th className="p-2 text-left">Campo</th><th className="p-2 text-left">Mensaje</th></tr></thead><tbody>{errores.map((e,i)=><tr key={i} className="border-t"><td className="p-2">{e.numeroFila}</td><td className="p-2 font-mono">{e.sku}</td><td className="p-2">{e.campo}</td><td className="p-2">{e.mensaje}</td></tr>)}</tbody></table></div>
      </div>}
    </div>
  );
}
function Dato({titulo,valor}:{titulo:string;valor:string|number}){return <div className="bg-slate-50 rounded-lg p-3"><p className="text-slate-500">{titulo}</p><p className="text-lg font-bold">{valor}</p></div>}
