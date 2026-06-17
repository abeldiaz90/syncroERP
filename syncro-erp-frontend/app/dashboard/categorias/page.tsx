"use client";

import { useState, useEffect } from 'react';
import { Search, Plus, Edit2, Power, X, Tags, AlertCircle, CheckCircle2 } from 'lucide-react';
import { PuedeCrear, PuedeEditar } from "@/app/components/ProtectedElement"; // ← NUEVO

export interface ICategoria { id: string; nombre: string; descripcion: string | null; activo: boolean; }

export default function CategoriasPage() {
  const [categorias, setCategorias] = useState<ICategoria[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [busquedaDebounced, setBusquedaDebounced] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [categoriaEditandoId, setCategoriaEditandoId] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

  const [toast, setToast] = useState<{ mensaje: string; tipo: 'exito' | 'error' | 'info' } | null>(null);
  const mostrarToast = (mensaje: string, tipo: 'exito' | 'error' | 'info' = 'info') => { setToast({ mensaje, tipo }); setTimeout(() => setToast(null), 4000); };

  useEffect(() => { const t = setTimeout(() => setBusquedaDebounced(busqueda), 400); return () => clearTimeout(t); }, [busqueda]);

  const fetchCategorias = async () => {
    setCargando(true);
    const token = localStorage.getItem('syncro_token');
    try {
      const res = await fetch(`${apiUrl}/catalogo/categorias`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setCategorias(await res.json());
      else mostrarToast('Error al cargar categorías del servidor', 'error');
    } catch { mostrarToast('Error de conexión con el servidor', 'error'); }
    finally { setCargando(false); }
  };

  useEffect(() => { fetchCategorias(); }, []);

  const abrirModalCrear = () => { setCategoriaEditandoId(null); setNombre(''); setDescripcion(''); setIsModalOpen(true); };
  const abrirModalEditar = (cat: ICategoria) => { setCategoriaEditandoId(cat.id); setNombre(cat.nombre); setDescripcion(cat.descripcion || ''); setIsModalOpen(true); };

  const handleGuardarCategoria = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    const token = localStorage.getItem('syncro_token');
    const url = categoriaEditandoId ? `${apiUrl}/catalogo/categorias/${categoriaEditandoId}` : `${apiUrl}/catalogo/categorias`;
    try {
      const res = await fetch(url, { method: categoriaEditandoId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ nombre, descripcion }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || 'Error al guardar la categoría'); }
      setIsModalOpen(false); setNombre(''); setDescripcion(''); fetchCategorias();
      mostrarToast(categoriaEditandoId ? 'Categoría actualizada exitosamente' : 'Categoría creada exitosamente', 'exito');
    } catch (error: any) { mostrarToast(error.message || 'Error de conexión al intentar guardar', 'error'); }
    finally { setGuardando(false); }
  };

  const handleCambiarEstado = async (id: string, estadoActual: boolean) => {
    if (!window.confirm(`¿Deseas ${estadoActual ? 'desactivar' : 'activar'} esta categoría?`)) return;
    const token = localStorage.getItem('syncro_token');
    try {
      const res = await fetch(`${apiUrl}/catalogo/categorias/${id}/estado`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { fetchCategorias(); mostrarToast(`Categoría ${estadoActual ? 'desactivada' : 'activada'} correctamente`, 'exito'); }
      else { const d = await res.json(); mostrarToast(`Error: ${d.message}`, 'error'); }
    } catch { mostrarToast('Error al procesar la solicitud', 'error'); }
  };

  const categoriasFiltradas = categorias.filter(c => c.nombre.toLowerCase().includes(busquedaDebounced.toLowerCase()) || (c.descripcion && c.descripcion.toLowerCase().includes(busquedaDebounced.toLowerCase())));

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto text-slate-800">
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-6 py-4 rounded-xl shadow-2xl font-medium text-white ${toast.tipo === 'exito' ? 'bg-emerald-600' : toast.tipo === 'error' ? 'bg-rose-600' : 'bg-blue-600'}`}>
          {toast.tipo === 'exito' && <CheckCircle2 className="w-5 h-5" />}{toast.tipo === 'error' && <AlertCircle className="w-5 h-5" />}{toast.mensaje}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3"><Tags className="w-8 h-8 text-indigo-500" />Categorías</h1>
          <p className="text-slate-500 mt-1">Administra la clasificación de tu catálogo de productos.</p>
        </div>
        {/* ✅ Solo aparece si tiene POST /api/catalogo/categorias */}
        <PuedeCrear ruta="/api/catalogo/categorias">
          <button onClick={abrirModalCrear} className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-indigo-700 hover:shadow-md transition-all active:scale-95">
            <Plus className="w-5 h-5" /> Nueva Categoría
          </button>
        </PuedeCrear>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6">
        <div className="relative w-full md:w-1/2 lg:w-1/3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input type="text" placeholder="Buscar por nombre o descripción..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all" />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {cargando ? (
          <div className="p-12 text-center flex flex-col items-center text-slate-400"><div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>Cargando categorías...</div>
        ) : categoriasFiltradas.length === 0 ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center"><Tags className="w-12 h-12 text-slate-300 mx-auto mb-3" /><p className="text-lg font-medium text-slate-700">No se encontraron categorías</p></div>
        ) : (
          <table className="w-full text-left whitespace-nowrap">
            <thead><tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-sm uppercase tracking-wider"><th className="p-4 font-semibold">Nombre</th><th className="p-4 font-semibold hidden sm:table-cell">Descripción</th><th className="p-4 font-semibold text-center w-32">Estado</th><th className="p-4 font-semibold text-center w-32">Acciones</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {categoriasFiltradas.map((cat) => (
                <tr key={cat.id} className={`hover:bg-slate-50 transition-colors ${!cat.activo ? 'bg-slate-50/50 grayscale-[20%]' : ''}`}>
                  <td className="p-4 font-bold text-slate-900">{cat.nombre}</td>
                  <td className="p-4 text-slate-500 hidden sm:table-cell whitespace-normal">{cat.descripcion ? <span className="line-clamp-2">{cat.descripcion}</span> : <span className="italic text-slate-400 text-sm">Sin descripción</span>}</td>
                  <td className="p-4 text-center">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cat.activo ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${cat.activo ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>{cat.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex justify-center items-center gap-2">
                      {/* ✅ Solo aparece si tiene PATCH /api/catalogo/categorias/:id */}
                      <PuedeEditar ruta="/api/catalogo/categorias/:id">
                        <button onClick={() => abrirModalEditar(cat)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Editar"><Edit2 className="w-4 h-4" /></button>
                      </PuedeEditar>
                      {/* ✅ Solo aparece si tiene PATCH /api/catalogo/categorias/:id/estado */}
                      <PuedeEditar ruta="/api/catalogo/categorias/:id/estado">
                        <button onClick={() => handleCambiarEstado(cat.id, cat.activo)} className={`p-2 rounded-lg transition-colors ${cat.activo ? 'text-rose-600 hover:bg-rose-50' : 'text-emerald-600 hover:bg-emerald-50'}`} title={cat.activo ? 'Desactivar' : 'Activar'}><Power className="w-4 h-4" /></button>
                      </PuedeEditar>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-slate-100">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Tags className="w-5 h-5 text-indigo-500" />{categoriaEditandoId ? 'Editar Categoría' : 'Nueva Categoría'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6">
              <form id="categoria-form" onSubmit={handleGuardarCategoria} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nombre de la Categoría *</label>
                  <input type="text" required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Plomería, Electrónica..." className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Descripción <span className="text-slate-400 font-normal">(Opcional)</span></label>
                  <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Breve descripción del alcance de esta categoría..." rows={3} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none" />
                </div>
              </form>
            </div>
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 rounded-b-2xl">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-slate-700 font-medium hover:bg-slate-200 rounded-lg" disabled={guardando}>Cancelar</button>
              <button type="submit" form="categoria-form" disabled={guardando} className="px-5 py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
                {guardando && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}{guardando ? 'Guardando...' : categoriaEditandoId ? 'Guardar Cambios' : 'Crear Categoría'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
