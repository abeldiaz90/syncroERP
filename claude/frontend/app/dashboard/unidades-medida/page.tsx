// app/dashboard/unidades-medida/page.tsx
"use client";
import FormValidationGuard from "@/app/components/FormValidationGuard";
import { useState, useEffect } from "react";
import { Ruler, Plus, Edit2, Power, X, AlertCircle, CheckCircle2, Sparkles } from "lucide-react";
import { PuedeCrear, PuedeEditar } from "@/app/components/ProtectedElement";

interface IUnidad {
  id: string;
  nombre: string;
  abreviatura: string | null;
  claveSAT: string | null;
  activo: boolean;
}

const FORM_VACIO = { nombre: "", abreviatura: "", claveSAT: "" };

export default function UnidadesMedidaPage() {
  const [unidades, setUnidades] = useState<IUnidad[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modal, setModal] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [precargando, setPrecargando] = useState(false);

  const api = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:4000/api');
  const tok = () => localStorage.getItem("syncro_token") ?? "";

  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const mostrarToast = (msg: string, ok = true) => {
    setToast({ msg, ok }); setTimeout(() => setToast(null), 4000);
  };

  const cargar = async () => {
    setCargando(true);
    try {
      const res = await fetch(`${api}/catalogo/unidades-medida`, {
        headers: { Authorization: `Bearer ${tok()}` },
      });
      if (res.ok) setUnidades(await res.json());
      else mostrarToast("Error al cargar las unidades", false);
    } catch {
      mostrarToast("Error de conexión", false);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const abrirCrear = () => { setEditandoId(null); setForm(FORM_VACIO); setModal(true); };
  const abrirEditar = (u: IUnidad) => {
    setEditandoId(u.id);
    setForm({ nombre: u.nombre, abreviatura: u.abreviatura ?? "", claveSAT: u.claveSAT ?? "" });
    setModal(true);
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim()) { mostrarToast("El nombre es obligatorio", false); return; }
    setGuardando(true);
    const url = editandoId
      ? `${api}/catalogo/unidades-medida/${editandoId}`
      : `${api}/catalogo/unidades-medida`;
    try {
      const res = await fetch(url, {
        method: editandoId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok()}` },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setModal(false); cargar();
        mostrarToast(editandoId ? "Unidad actualizada" : "Unidad creada");
      } else {
        const d = await res.json().catch(() => null);
        mostrarToast(d?.message || "No se pudo guardar", false);
      }
    } catch {
      mostrarToast("Error de conexión", false);
    } finally {
      setGuardando(false);
    }
  };

  const cambiarEstado = async (u: IUnidad) => {
    try {
      const res = await fetch(`${api}/catalogo/unidades-medida/${u.id}/estado`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${tok()}` },
      });
      if (res.ok) { cargar(); mostrarToast(`Unidad ${u.activo ? "desactivada" : "activada"}`); }
      else mostrarToast("Error al cambiar estado", false);
    } catch { mostrarToast("Error de conexión", false); }
  };

  const precargar = async () => {
    setPrecargando(true);
    try {
      const res = await fetch(`${api}/catalogo/unidades-medida/precargar-estandar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tok()}` },
      });
      const d = await res.json().catch(() => null);
      if (res.ok) {
        mostrarToast(
          d.creadas > 0 ? `${d.creadas} unidades comunes cargadas.` : "Ya tenías todas las unidades comunes.",
        );
        cargar();
      } else mostrarToast(d?.message || "No se pudo precargar", false);
    } catch { mostrarToast("Error de conexión", false); }
    finally { setPrecargando(false); }
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto text-slate-800">
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-6 py-4 rounded-xl shadow-2xl font-medium text-white ${toast.ok ? "bg-emerald-600" : "bg-rose-600"}`}>
          {toast.ok ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {toast.msg}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <Ruler className="w-8 h-8 text-indigo-500" /> Unidades de Medida
          </h1>
          <p className="text-slate-500 mt-1">Define cómo se miden tus productos (pieza, kilo, litro…). Incluyen su clave SAT para facturación.</p>
        </div>
        <PuedeCrear ruta="/api/catalogo/unidades-medida">
          <button onClick={abrirCrear}
            className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-indigo-700 shadow-sm transition-all">
            <Plus className="w-5 h-5" /> Nueva Unidad
          </button>
        </PuedeCrear>
      </div>

      {/* Banner de precarga — solo si hay pocas unidades */}
      {!cargando && unidades.length < 3 && (
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-xl p-5 mb-6 flex flex-col sm:flex-row sm:items-center gap-4 shadow-lg">
          <div className="flex-1">
            <p className="font-bold text-white">Empieza rápido con las unidades comunes</p>
            <p className="text-indigo-100 text-sm mt-0.5">Cargamos Pieza, Kilogramo, Litro, Caja y más — con su clave SAT lista para facturar.</p>
          </div>
          <button onClick={precargar} disabled={precargando}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-white text-indigo-700 font-bold rounded-xl hover:bg-indigo-50 shadow-md transition-colors shrink-0 disabled:opacity-70">
            {precargando
              ? <><div className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-700 rounded-full animate-spin" /> Cargando…</>
              : <><Sparkles className="w-4 h-4" /> Cargar unidades comunes</>}
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {cargando ? (
          <div className="p-12 text-center text-slate-400">
            <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            Cargando unidades...
          </div>
        ) : unidades.length === 0 ? (
          <div className="p-12 text-center">
            <Ruler className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="font-semibold text-slate-600">No hay unidades</p>
            <p className="text-sm text-slate-400 mt-1">Usa "Cargar unidades comunes" o crea una nueva.</p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-semibold">
                <th className="p-4">Unidad</th>
                <th className="p-4">Abreviatura</th>
                <th className="p-4">Clave SAT</th>
                <th className="p-4 text-center w-28">Estado</th>
                <th className="p-4 text-center w-28">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {unidades.map((u) => (
                <tr key={u.id} className={`hover:bg-slate-50 ${!u.activo ? "opacity-60" : ""}`}>
                  <td className="p-4 font-semibold text-slate-900">{u.nombre}</td>
                  <td className="p-4 text-slate-600">{u.abreviatura || <span className="text-slate-300">—</span>}</td>
                  <td className="p-4">
                    {u.claveSAT
                      ? <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded">{u.claveSAT}</span>
                      : <span className="text-slate-300 text-xs">Sin clave</span>}
                  </td>
                  <td className="p-4 text-center">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${u.activo ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-600 border border-slate-200"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${u.activo ? "bg-emerald-500" : "bg-slate-400"}`} />
                      {u.activo ? "Activa" : "Inactiva"}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex justify-center gap-2">
                      <PuedeEditar ruta="/api/catalogo/unidades-medida/:id">
                        <button onClick={() => abrirEditar(u)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg" title="Editar">
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </PuedeEditar>
                      <PuedeEditar ruta="/api/catalogo/unidades-medida/:id/estado">
                        <button onClick={() => cambiarEstado(u)}
                          className={`p-2 rounded-lg ${u.activo ? "text-rose-600 hover:bg-rose-50" : "text-emerald-600 hover:bg-emerald-50"}`}
                          title={u.activo ? "Desactivar" : "Activar"}>
                          <Power className="w-4 h-4" />
                        </button>
                      </PuedeEditar>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal crear/editar */}
      {modal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col border-t-4 border-t-indigo-500">
            <div className="flex justify-between items-center p-6 border-b border-slate-100">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Ruler className="w-5 h-5 text-indigo-500" />
                {editandoId ? "Editar Unidad" : "Nueva Unidad"}
              </h2>
              <button onClick={() => setModal(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form id="unidad-medida-form" noValidate onSubmit={guardar} className="p-6 space-y-4">
                <FormValidationGuard formId="unidad-medida-form" labels={{"nombre": "Nombre de la unidad"}} />
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre *</label>
                <input type="text" required value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  placeholder="Ej. Pieza, Kilogramo, Litro"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Abreviatura</label>
                  <input type="text" value={form.abreviatura}
                    onChange={(e) => setForm({ ...form, abreviatura: e.target.value })}
                    placeholder="pza, kg, L…" maxLength={10}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Clave SAT <span className="text-slate-400 font-normal">(CFDI)</span>
                  </label>
                  <input type="text" value={form.claveSAT}
                    onChange={(e) => setForm({ ...form, claveSAT: e.target.value.toUpperCase() })}
                    placeholder="H87, KGM, LTR…" maxLength={10}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-mono" />
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-800">
                  <span className="font-bold">Clave SAT:</span> es el código del catálogo oficial (c_ClaveUnidad) que va en tus facturas. Si no lo conoces, déjalo vacío y complétalo después.
                </p>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setModal(false)}
                  className="px-4 py-2 text-slate-700 font-medium hover:bg-slate-200 rounded-lg" disabled={guardando}>
                  Cancelar
                </button>
                <button type="submit" disabled={guardando}
                  className="px-5 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2 shadow-sm">
                  {guardando && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  {guardando ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
