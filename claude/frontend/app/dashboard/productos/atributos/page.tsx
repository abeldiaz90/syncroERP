"use client";

import { useState, useEffect, useCallback } from "react";
import { confirmarElegante } from '@/components/ui/dialogos';
import Link from "next/link";
import {
  FlaskConical, Plus, Trash2, Pencil, Check, X, ArrowLeft,
  Loader2, Sparkles, ListPlus, GripVertical,
} from "lucide-react";
import { extraerLista } from '@/lib/normalizar-respuesta';

interface IDefinicion {
  id: string; clave: string; etiqueta: string;
  tipoValor: "TEXT" | "NUMBER" | "BOOLEAN" | "DATE" | "SELECT";
  unidad?: string | null; opciones?: string | null;
  requerido: boolean; orden: number;
}
interface IGrupo {
  id: string; nombre: string; descripcion?: string | null;
  definiciones: IDefinicion[];
}

const TIPOS = [
  { value: "TEXT", label: "Texto" },
  { value: "NUMBER", label: "Número" },
  { value: "BOOLEAN", label: "Sí / No" },
  { value: "DATE", label: "Fecha" },
  { value: "SELECT", label: "Lista de opciones" },
];

/**
 * Constructor de ATRIBUTOS DINÁMICOS.
 * El usuario crea sus propios grupos (plantillas) y dentro los campos
 * que quiera: nombre, tipo, unidad, opciones, requerido y orden.
 * La ficha del producto dibuja el formulario a partir de esto.
 * Ruta: app/dashboard/productos/atributos/page.tsx
 */
export default function AtributosPersonalizadosPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:4000/api');
  const token = () => (typeof window !== "undefined" ? localStorage.getItem("syncro_token") ?? "" : "");
  const H = () => ({ Authorization: `Bearer ${token()}`, "Content-Type": "application/json" });

  const [grupos, setGrupos] = useState<IGrupo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [grupoActivo, setGrupoActivo] = useState<string | null>(null);

  // formularios
  const [nuevoGrupo, setNuevoGrupo] = useState("");
  const [editandoGrupo, setEditandoGrupo] = useState<string | null>(null);
  const [nombreEditado, setNombreEditado] = useState("");
  const [nuevoCampo, setNuevoCampo] = useState({
    etiqueta: "", tipoValor: "TEXT", unidad: "", opciones: "", requerido: false,
  });
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true); setError("");
    try {
      const res = await fetch(`${apiUrl}/catalogo/atributos-personalizados/grupos?incluirDefiniciones=1`, { headers: H() });
      if (!res.ok) throw new Error("No se pudieron cargar los grupos");
      const data = await res.json();
      setGrupos(extraerLista(data));
      if (data.length > 0 && !grupoActivo) setGrupoActivo(data[0].id);
    } catch (e: any) { setError(e.message); }
    finally { setCargando(false); }
  }, [apiUrl, grupoActivo]);

  useEffect(() => { cargar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const llamar = async (url: string, method: string, body?: any) => {
    setGuardando(true); setError("");
    try {
      const res = await fetch(`${apiUrl}${url}`, {
        method, headers: H(), body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Error");
      await cargar();
      return true;
    } catch (e: any) { setError(Array.isArray(e.message) ? e.message.join(", ") : e.message); return false; }
    finally { setGuardando(false); }
  };

  const crearGrupo = async () => {
    if (!nuevoGrupo.trim()) return;
    if (await llamar(`/catalogo/atributos-personalizados/grupos`, "POST", { nombre: nuevoGrupo })) setNuevoGrupo("");
  };
  const renombrarGrupo = async (id: string) => {
    if (await llamar(`/catalogo/atributos-personalizados/grupos/${id}`, "PATCH", { nombre: nombreEditado })) setEditandoGrupo(null);
  };
  const eliminarGrupo = async (id: string, nombre: string) => {
    if (!await confirmarElegante(`¿Eliminar la plantilla "${nombre}"? Los valores ya capturados en productos no se pierden.`, { peligroso: true })) return;
    await llamar(`/catalogo/atributos-personalizados/grupos/${id}`, "DELETE");
    if (grupoActivo === id) setGrupoActivo(null);
  };

  const crearCampo = async () => {
    if (!grupoActivo || !nuevoCampo.etiqueta.trim()) return;
    const ok = await llamar(`/catalogo/atributos-personalizados/grupos/${grupoActivo}/definiciones`, "POST", {
      etiqueta: nuevoCampo.etiqueta,
      tipoValor: nuevoCampo.tipoValor,
      unidad: nuevoCampo.unidad || undefined,
      opciones: nuevoCampo.tipoValor === "SELECT" ? nuevoCampo.opciones : undefined,
      requerido: nuevoCampo.requerido,
      orden: (grupos.find((g) => g.id === grupoActivo)?.definiciones.length ?? 0) + 1,
    });
    if (ok) setNuevoCampo({ etiqueta: "", tipoValor: "TEXT", unidad: "", opciones: "", requerido: false });
  };
  const eliminarCampo = async (id: string) => {
    await llamar(`/catalogo/atributos-personalizados/definiciones/${id}`, "DELETE");
  };
  const moverCampo = async (def: IDefinicion, delta: number) => {
    await llamar(`/catalogo/atributos-personalizados/definiciones/${def.id}`, "PATCH", { orden: def.orden + delta });
  };

  const precargarEjemplos = async () => {
    await llamar(`/catalogo/atributos-personalizados/precargar-ejemplos`, "POST");
  };

  const activo = grupos.find((g) => g.id === grupoActivo) ?? null;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto text-slate-800">
      <Link href="/dashboard/productos" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Productos
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <FlaskConical className="w-8 h-8 text-purple-600" /> Atributos personalizados
          </h1>
          <p className="text-slate-500 mt-1">
            Crea tus propias plantillas de atributos y sus campos. La ficha del producto
            dibujará el formulario automáticamente.
          </p>
        </div>
        <button onClick={precargarEjemplos} disabled={guardando}
          className="inline-flex items-center gap-2 border border-purple-300 text-purple-700 px-4 py-2 rounded-lg font-medium hover:bg-purple-50 disabled:opacity-50">
          <Sparkles className="w-4 h-4" /> Precargar plantillas de ejemplo
        </button>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-3 mb-4 text-sm">{error}</div>
      )}

      {cargando ? (
        <div className="text-center py-20 text-slate-400"><Loader2 className="w-8 h-8 animate-spin mx-auto" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* ── columna izquierda: grupos ── */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <p className="font-semibold text-slate-800 mb-3">Plantillas</p>
            <div className="space-y-1 mb-3">
              {grupos.map((g) => (
                <div key={g.id}
                  className={`group flex items-center gap-1.5 rounded-lg px-2.5 py-2 cursor-pointer border ${
                    grupoActivo === g.id ? "bg-purple-50 border-purple-200" : "border-transparent hover:bg-slate-50"}`}
                  onClick={() => setGrupoActivo(g.id)}>
                  {editandoGrupo === g.id ? (
                    <>
                      <input autoFocus value={nombreEditado} onChange={(e) => setNombreEditado(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && renombrarGrupo(g.id)}
                        className="flex-1 border border-slate-300 rounded px-2 py-1 text-sm" />
                      <button onClick={(e) => { e.stopPropagation(); renombrarGrupo(g.id); }}><Check className="w-4 h-4 text-emerald-600" /></button>
                      <button onClick={(e) => { e.stopPropagation(); setEditandoGrupo(null); }}><X className="w-4 h-4 text-slate-400" /></button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm font-medium">{g.nombre}</span>
                      <span className="text-xs text-slate-400">{g.definiciones.length}</span>
                      <button className="opacity-0 group-hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); setEditandoGrupo(g.id); setNombreEditado(g.nombre); }}>
                        <Pencil className="w-3.5 h-3.5 text-slate-400 hover:text-blue-600" />
                      </button>
                      <button className="opacity-0 group-hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); eliminarGrupo(g.id, g.nombre); }}>
                        <Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-rose-600" />
                      </button>
                    </>
                  )}
                </div>
              ))}
              {grupos.length === 0 && (
                <p className="text-sm text-slate-400 py-4 text-center">Aún no hay plantillas.<br />Crea la primera abajo. 👇</p>
              )}
            </div>
            <div className="flex gap-2">
              <input value={nuevoGrupo} onChange={(e) => setNuevoGrupo(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && crearGrupo()}
                placeholder="Nueva plantilla… (ej. Ferretería)"
                className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              <button onClick={crearGrupo} disabled={guardando || !nuevoGrupo.trim()}
                className="bg-purple-600 text-white rounded-lg px-3 hover:bg-purple-700 disabled:opacity-40">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* ── columna derecha: campos del grupo activo ── */}
          <div className="md:col-span-2 bg-white border border-slate-200 rounded-2xl p-4">
            {!activo ? (
              <div className="text-center py-16 text-slate-400">
                <ListPlus className="w-12 h-12 mx-auto mb-2 text-slate-200" />
                Selecciona o crea una plantilla para definir sus campos
              </div>
            ) : (
              <>
                <p className="font-semibold text-slate-800 mb-3">Campos de «{activo.nombre}»</p>

                {activo.definiciones.length > 0 && (
                  <div className="border border-slate-100 rounded-xl divide-y divide-slate-100 mb-4">
                    {activo.definiciones.map((d) => (
                      <div key={d.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                        <GripVertical className="w-4 h-4 text-slate-300" />
                        <div className="flex-1">
                          <span className="font-medium">{d.etiqueta}</span>
                          {d.requerido && <span className="ml-1 text-rose-500">*</span>}
                          {d.unidad && <span className="ml-2 text-xs text-blue-500">({d.unidad})</span>}
                          {d.tipoValor === "SELECT" && d.opciones && (
                            <span className="ml-2 text-xs text-slate-400">[{d.opciones.split("|").join(" · ")}]</span>
                          )}
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                          {TIPOS.find((t) => t.value === d.tipoValor)?.label}
                        </span>
                        <button onClick={() => moverCampo(d, -1)} className="text-slate-300 hover:text-slate-600">↑</button>
                        <button onClick={() => moverCampo(d, +1)} className="text-slate-300 hover:text-slate-600">↓</button>
                        <button onClick={() => eliminarCampo(d.id)}>
                          <Trash2 className="w-4 h-4 text-slate-300 hover:text-rose-600" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* alta de campo */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-slate-700 mb-3">Agregar campo</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input value={nuevoCampo.etiqueta}
                      onChange={(e) => setNuevoCampo({ ...nuevoCampo, etiqueta: e.target.value })}
                      placeholder="Nombre del campo (ej. Voltaje)"
                      className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                    <select value={nuevoCampo.tipoValor}
                      onChange={(e) => setNuevoCampo({ ...nuevoCampo, tipoValor: e.target.value })}
                      className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
                      {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    {nuevoCampo.tipoValor === "NUMBER" && (
                      <input value={nuevoCampo.unidad}
                        onChange={(e) => setNuevoCampo({ ...nuevoCampo, unidad: e.target.value })}
                        placeholder="Unidad (ej. V, kg, °C) — opcional"
                        className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                    )}
                    {nuevoCampo.tipoValor === "SELECT" && (
                      <input value={nuevoCampo.opciones}
                        onChange={(e) => setNuevoCampo({ ...nuevoCampo, opciones: e.target.value })}
                        placeholder="Opciones separadas por | (ej. 110V|220V|440V)"
                        className="border border-slate-300 rounded-lg px-3 py-2 text-sm sm:col-span-2" />
                    )}
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                      <input type="checkbox" checked={nuevoCampo.requerido}
                        onChange={(e) => setNuevoCampo({ ...nuevoCampo, requerido: e.target.checked })}
                        className="w-4 h-4 rounded border-slate-300 text-purple-600" />
                      Obligatorio
                    </label>
                  </div>
                  <button onClick={crearCampo} disabled={guardando || !nuevoCampo.etiqueta.trim()}
                    className="mt-3 inline-flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-40">
                    {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Agregar campo
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
