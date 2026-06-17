"use client";

import { useState, useEffect } from "react";
import { Search, Plus, Edit2, Power, X, Bookmark, AlertCircle, CheckCircle2, Loader2, Save } from "lucide-react";
import { PuedeCrear, PuedeEditar } from "@/app/components/ProtectedElement";

export interface IMarca { id: string; nombre: string; activo: boolean; }

export default function MarcasPage() {
  const [marcas, setMarcas] = useState<IMarca[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombreMarca, setNombreMarca] = useState("");
  const [guardando, setGuardando] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  const [toast, setToast] = useState<{ mensaje: string; tipo: 'exito' | 'error' | 'info' } | null>(null);
  const mostrarToast = (mensaje: string, tipo: 'exito' | 'error' | 'info' = 'info') => {
    setToast({ mensaje, tipo });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchMarcas = async () => {
    setCargando(true);
    const token = localStorage.getItem("syncro_token");
    try {
      const res = await fetch(`${apiUrl}/catalogo/marcas`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setMarcas(await res.json());
      else mostrarToast("Error al cargar las marcas", "error");
    } catch { mostrarToast("Error de conexión", "error"); }
    finally { setCargando(false); }
  };

  useEffect(() => { fetchMarcas(); }, []);

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    const token = localStorage.getItem("syncro_token");
    const url = editandoId ? `${apiUrl}/catalogo/marcas/${editandoId}` : `${apiUrl}/catalogo/marcas`;
    const metodo = editandoId ? "PATCH" : "POST";

    try {
      const res = await fetch(url, {
        method: metodo,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nombre: nombreMarca }),
      });
      if (res.ok) {
        setIsModalOpen(false);
        fetchMarcas();
        mostrarToast(editandoId ? "Marca actualizada exitosamente" : "Marca creada exitosamente", "exito");
      } else {
        const data = await res.json().catch(() => ({}));
        mostrarToast(data.message || "Error al guardar", "error");
      }
    } finally { setGuardando(false); }
  };

  const handleCambiarEstado = async (id: string, activo: boolean) => {
    if (!confirm(`¿Confirmas ${activo ? "desactivar" : "activar"} esta marca?`)) return;
    const token = localStorage.getItem("syncro_token");
    const res = await fetch(`${apiUrl}/catalogo/marcas/${id}/estado`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) { fetchMarcas(); mostrarToast("Estado actualizado", "exito"); }
  };

  const marcasFiltradas = marcas.filter(m => m.nombre.toLowerCase().includes(busqueda.toLowerCase()));

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto text-slate-800 animate-in fade-in duration-500">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-[100] flex items-center gap-2 px-6 py-4 rounded-2xl shadow-2xl text-white ${toast.tipo === 'exito' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
          {toast.tipo === 'exito' ? <CheckCircle2 /> : <AlertCircle />} {toast.mensaje}
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Catálogo de Marcas</h1>
          <p className="text-slate-500 font-medium">Gestión de marcas operativas para el inventario.</p>
        </div>

        {/* ✅ Solo aparece si tiene POST /api/catalogo/marcas */}
        <PuedeCrear ruta="/api/catalogo/marcas">
          <button
            onClick={() => { setEditandoId(null); setNombreMarca(""); setIsModalOpen(true); }}
            className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-95"
          >
            <Plus className="w-5 h-5" /> Nueva Marca
          </button>
        </PuedeCrear>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
            <input
              className="w-full pl-12 pr-4 py-3 bg-slate-50 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Buscar marca por nombre..."
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
        </div>

        {cargando ? (
          <div className="p-20 text-center text-slate-400">
            <Loader2 className="w-10 h-10 animate-spin mx-auto mb-4" /> Cargando...
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-widest font-bold text-slate-500">
              <tr>
                <th className="px-6 py-4">Nombre</th>
                <th className="px-6 py-4 text-center">Estado</th>
                <th className="px-6 py-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {marcasFiltradas.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-6 py-4 font-bold text-slate-900">{m.nombre}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold ${m.activo ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'bg-slate-100 text-slate-500'}`}>
                      {m.activo ? 'ACTIVO' : 'INACTIVO'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex justify-center gap-2">

                      {/* ✅ Solo aparece si tiene PATCH /api/catalogo/marcas/:id */}
                      <PuedeEditar ruta="/api/catalogo/marcas/:id">
                        <button
                          onClick={() => { setEditandoId(m.id); setNombreMarca(m.nombre); setIsModalOpen(true); }}
                          className="p-2 text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-all"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </PuedeEditar>

                      {/* ✅ Solo aparece si tiene PATCH /api/catalogo/marcas/:id/estado */}
                      <PuedeEditar ruta="/api/catalogo/marcas/:id/estado">
                        <button
                          onClick={() => handleCambiarEstado(m.id, m.activo)}
                          className="p-2 text-slate-500 bg-slate-100 rounded-lg hover:bg-slate-200 transition-all"
                        >
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

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 animate-in zoom-in-95 duration-200">
            <h2 className="text-xl font-black mb-6">{editandoId ? "Editar Marca" : "Nueva Marca"}</h2>
            <form onSubmit={handleGuardar}>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Nombre de la Marca</label>
              <input
                autoFocus
                value={nombreMarca}
                onChange={(e) => setNombreMarca(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl mb-6 outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <div className="flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-3 font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
                  Cancelar
                </button>
                <button disabled={guardando} className="flex-1 px-4 py-3 font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2">
                  {guardando ? <Loader2 className="animate-spin w-4 h-4" /> : <Save className="w-4 h-4" />} Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
