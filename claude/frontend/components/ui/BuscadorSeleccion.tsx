"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

export type OpcionBusqueda = { valor: string; etiqueta: string; detalle?: string; busqueda?: string };
export function BuscadorSeleccion({ opciones, valor, onChange, placeholder = "Seleccionar…", disabled = false, className = "" }: { opciones: OpcionBusqueda[]; valor?: string; onChange: (valor: string) => void; placeholder?: string; disabled?: boolean; className?: string }) {
  const [abierto, setAbierto] = useState(false); const [filtro, setFiltro] = useState(""); const ref = useRef<HTMLDivElement>(null);
  const seleccionada = opciones.find((o) => o.valor === valor);
  const filtradas = useMemo(() => { const q = filtro.trim().toLocaleLowerCase("es"); return q ? opciones.filter((o) => `${o.etiqueta} ${o.detalle ?? ""} ${o.busqueda ?? ""}`.toLocaleLowerCase("es").includes(q)) : opciones; }, [opciones, filtro]);
  useEffect(() => { const cerrar = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAbierto(false); }; document.addEventListener("mousedown", cerrar); return () => document.removeEventListener("mousedown", cerrar); }, []);
  return <div ref={ref} className={`relative ${className}`}>
    <button type="button" disabled={disabled} onClick={() => setAbierto(!abierto)} className="campo flex w-full items-center justify-between gap-2 text-left disabled:bg-slate-100"><span className={seleccionada ? "truncate text-slate-800" : "truncate text-slate-400"}>{seleccionada?.etiqueta ?? placeholder}</span><ChevronDown className="h-4 w-4 shrink-0 text-slate-400"/></button>
    {abierto && <div className="absolute z-[420] mt-1 w-full min-w-[280px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"><div className="flex items-center gap-2 border-b p-2"><Search className="h-4 w-4 text-slate-400"/><input autoFocus value={filtro} onChange={(e) => setFiltro(e.target.value)} className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none" placeholder="Buscar por nombre o clave…"/>{filtro && <button type="button" onClick={() => setFiltro("")}><X className="h-4 w-4 text-slate-400"/></button>}</div><div className="max-h-64 overflow-y-auto p-1">{filtradas.map((o) => <button type="button" key={o.valor} onClick={() => { onChange(o.valor); setAbierto(false); setFiltro(""); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-indigo-50"><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-800">{o.etiqueta}</span>{o.detalle && <span className="block truncate text-xs text-slate-400">{o.detalle}</span>}</span>{o.valor === valor && <Check className="h-4 w-4 text-indigo-600"/>}</button>)}{!filtradas.length && <p className="p-5 text-center text-xs text-slate-500">No hay coincidencias.</p>}</div></div>}
  </div>;
}
