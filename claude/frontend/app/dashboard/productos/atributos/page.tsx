"use client";

import { useState, useEffect, useCallback } from "react";
import { peticion } from '@/lib/api';
import { confirmarElegante } from '@/components/ui/dialogos';
import Link from "next/link";
import {
  FlaskConical, Plus, Trash2, Pencil, Check, X, ArrowLeft,
  Loader2, Sparkles, ListPlus, GripVertical,
} from "lucide-react";
import { extraerLista } from '@/lib/normalizar-respuesta';

import { useT } from '@/components/I18nProvider';
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
  const t = useT();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:4000/api');
  const token = () => (typeof window !== "undefined" ? localStorage.getItem("syncro_token") ?? "" : "");
  const H = () => ({ Authorization: `Bearer ${token()}`, "Content-Type": "application/json" });

  const [grupos, setGrupos] = useState<IGrupo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  /*
   * ──────────────────────────────────────────────────────────────────────────
   * Que no se pueda leer NO es que no haya nada
   * --------------------------------------------------------------------------
   * MEDIDO el 20-oct-2026: siete roles alcanzan esta pantalla —cobranza,
   * contador, crédito, finanzas, gobierno, rrhh y tesorería— y el servidor les
   * niega su ÚNICA lectura. Lo que veían era esto:
   *
   *     «No se pudieron cargar los grupos»              ← parece una avería
   *     «Aún no hay plantillas. Crea la primera abajo»  ← afirma un vacío
   *      [ campo de texto ] [ + ]                       ← e invita a crear
   *
   * Tres errores encadenados, y el del medio es el peor: la pantalla afirma
   * que no hay plantillas cuando lo que pasó es que no pudo mirar. Las dos
   * cosas se ven igual y no son la misma; una lleva a crear la primera, la
   * otra a pedir un permiso.
   *
   * Y debajo, la invitación a crear algo que el servidor va a rechazar: un
   * botón que lleva a un no.
   *
   * Un 403 se guarda aparte del resto de fallos, porque se cuenta distinto.
   * ──────────────────────────────────────────────────────────────────────────
   */
  const [vedada, setVedada] = useState(false);
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
    setCargando(true); setError(""); setVedada(false);
    try {
      const res = await peticion(`/catalogo/atributos-personalizados/grupos?incluirDefiniciones=1`, { headers: H() });
      if (res.status === 403) { setVedada(true); setGrupos([]); return; }
      if (!res.ok) throw new Error(t("No se pudieron cargar los grupos"));
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
      const res = await peticion(`${url}`, {
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
        <ArrowLeft className="w-4 h-4" />  {t("Productos")}
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <FlaskConical className="w-8 h-8 text-purple-600" />  {t("Atributos personalizados")}
          </h1>
          <p className="text-slate-500 mt-1">
            
            {t("Crea tus propias plantillas de atributos y sus campos. La ficha del producto dibujará el formulario automáticamente.")}
          </p>
        </div>
        {/* Quien no puede leerlas tampoco puede sembrarlas: el servidor lo
            rechaza igual, y ofrecerlo es prometer lo que no se cumple. */}
        {!vedada && (
          <button onClick={precargarEjemplos} disabled={guardando}
            className="inline-flex items-center gap-2 border border-purple-300 text-purple-700 px-4 py-2 rounded-lg font-medium hover:bg-purple-50 disabled:opacity-50">
            <Sparkles className="w-4 h-4" />  {t("Precargar plantillas de ejemplo")}
          </button>
        )}
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-3 mb-4 text-sm">{t(error)}</div>
      )}

      {vedada && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <strong className="block">{t("Las plantillas de atributos no están en tu perfil")}</strong>
          Esta pantalla no puede enseñarte lo que hay —ni decir si hay algo—, y tampoco
          crear nada: el servidor rechaza las dos cosas. Las administra quien lleva el
          catálogo de productos. Pídeselo a un administrador desde Administración →
          Roles y permisos si tu trabajo las necesita.
        </div>
      )}

      {cargando ? (
        <div className="text-center py-20 text-slate-400"><Loader2 className="w-8 h-8 animate-spin mx-auto" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* ── columna izquierda: grupos ── */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <p className="font-semibold text-slate-800 mb-3">{t("Plantillas")}</p>
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
                      <button aria-label={t("Guardar el nuevo nombre del grupo")} title={t("Guardar el nuevo nombre del grupo")} onClick={(e) => { e.stopPropagation(); renombrarGrupo(g.id); }}><Check className="w-4 h-4 text-emerald-600" /></button>
                      <button aria-label={t("Descartar el cambio de nombre")} title={t("Descartar el cambio de nombre")} onClick={(e) => { e.stopPropagation(); setEditandoGrupo(null); }}><X className="w-4 h-4 text-slate-400" /></button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm font-medium">{t(g.nombre)}</span>
                      <span className="text-xs text-slate-400">{g.definiciones.length}</span>
                      <button aria-label={t("Renombrar el grupo")} title={t("Renombrar el grupo")} className="opacity-0 group-hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); setEditandoGrupo(g.id); setNombreEditado(g.nombre); }}>
                        <Pencil className="w-3.5 h-3.5 text-slate-400 hover:text-blue-600" />
                      </button>
                      <button aria-label={t("Eliminar el grupo")} title={t("Eliminar el grupo")} className="opacity-0 group-hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); eliminarGrupo(g.id, g.nombre); }}>
                        <Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-rose-600" />
                      </button>
                    </>
                  )}
                </div>
              ))}
              {grupos.length === 0 && (
                /*
                 * «Aún no hay plantillas» es una afirmación, y sólo se puede
                 * hacer cuando se pudo mirar. Con la lectura negada lo honesto
                 * es decir que no se sabe.
                 */
                vedada ? (
                  <p className="text-sm text-slate-400 py-4 text-center">
                    
                    {t("No se puede saber qué plantillas hay")}<br />{t("con este perfil.")}
                  </p>
                ) : (
                  <p className="text-sm text-slate-400 py-4 text-center">{t("Aún no hay plantillas.")}<br />{t("Crea la primera abajo. 👇")}</p>
                )
              )}
            </div>
            {/* Ni el campo ni el botón: crear termina en el mismo no. */}
            <div className={`flex gap-2 ${vedada ? 'hidden' : ''}`}>
              <input value={nuevoGrupo} onChange={(e) => setNuevoGrupo(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && crearGrupo()}
                placeholder={t("Nueva plantilla… (ej. Ferretería)")}
                className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              <button aria-label={t("Crear el grupo")} title={t("Crear el grupo")} onClick={crearGrupo} disabled={guardando || !nuevoGrupo.trim()}
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
                {vedada
                  ? t("Los campos de una plantilla se definen desde el catálogo de productos.")
                  : t("Selecciona o crea una plantilla para definir sus campos")}
              </div>
            ) : (
              <>
                <p className="font-semibold text-slate-800 mb-3">Campos de «{t(activo.nombre)}»</p>

                {activo.definiciones.length > 0 && (
                  <div className="border border-slate-100 rounded-xl divide-y divide-slate-100 mb-4">
                    {activo.definiciones.map((d) => (
                      <div key={d.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                        <GripVertical className="w-4 h-4 text-slate-300" />
                        <div className="flex-1">
                          <span className="font-medium">{t(d.etiqueta)}</span>
                          {d.requerido && <span className="ml-1 text-rose-500">*</span>}
                          {d.unidad && <span className="ml-2 text-xs text-blue-500">({d.unidad})</span>}
                          {d.tipoValor === "SELECT" && d.opciones && (
                            <span className="ml-2 text-xs text-slate-400">[{d.opciones.split("|").join(" · ")}]</span>
                          )}
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                          {t(TIPOS.find((t) => t.value === d.tipoValor)?.label)}
                        </span>
                        <button onClick={() => moverCampo(d, -1)} className="text-slate-300 hover:text-slate-600">↑</button>
                        <button onClick={() => moverCampo(d, +1)} className="text-slate-300 hover:text-slate-600">↓</button>
                        <button aria-label={t("Eliminar el campo")} title={t("Eliminar el campo")} onClick={() => eliminarCampo(d.id)}>
                          <Trash2 className="w-4 h-4 text-slate-300 hover:text-rose-600" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* alta de campo */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-slate-700 mb-3">{t("Agregar campo")}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input value={nuevoCampo.etiqueta}
                      onChange={(e) => setNuevoCampo({ ...nuevoCampo, etiqueta: e.target.value })}
                      placeholder={t("Nombre del campo (ej. Voltaje)")}
                      className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                    <select value={nuevoCampo.tipoValor}
                      onChange={(e) => setNuevoCampo({ ...nuevoCampo, tipoValor: e.target.value })}
                      className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
                      {TIPOS.map((tipo) => <option key={tipo.value} value={tipo.value}>{t(tipo.label)}</option>)}
                    </select>
                    {nuevoCampo.tipoValor === "NUMBER" && (
                      <input value={nuevoCampo.unidad}
                        onChange={(e) => setNuevoCampo({ ...nuevoCampo, unidad: e.target.value })}
                        placeholder={t("Unidad (ej. V, kg, °C) — opcional")}
                        className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                    )}
                    {nuevoCampo.tipoValor === "SELECT" && (
                      <input value={nuevoCampo.opciones}
                        onChange={(e) => setNuevoCampo({ ...nuevoCampo, opciones: e.target.value })}
                        placeholder={t("Opciones separadas por | (ej. 110V|220V|440V)")}
                        className="border border-slate-300 rounded-lg px-3 py-2 text-sm sm:col-span-2" />
                    )}
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                      <input type="checkbox" checked={nuevoCampo.requerido}
                        onChange={(e) => setNuevoCampo({ ...nuevoCampo, requerido: e.target.checked })}
                        className="w-4 h-4 rounded border-slate-300 text-purple-600" />
                      
                      {t("Obligatorio")}
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
