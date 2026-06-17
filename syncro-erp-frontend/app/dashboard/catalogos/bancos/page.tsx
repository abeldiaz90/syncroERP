"use client";

import { useState, useEffect } from 'react';
import { Search, Plus, Edit2, Power, X, Landmark, AlertCircle, CheckCircle2 } from 'lucide-react';
import { PuedeCrear, PuedeEditar } from "@/app/components/ProtectedElement"; // ← NUEVO

export interface IBanco { id: string; nombre: string; activo: boolean; }

export default function BancosPage() {
  const [bancos, setBancos] = useState<IBanco[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [busquedaDebounced, setBusquedaDebounced] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [formData, setFormData] = useState({ nombre: '' });
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

  const [toast, setToast] = useState<{ mensaje: string; tipo: 'exito' | 'error' | 'info' } | null>(null);
  const mostrarToast = (mensaje: string, tipo: 'exito' | 'error' | 'info' = 'info') => { setToast({ mensaje, tipo }); setTimeout(() => setToast(null), 4000); };

  useEffect(() => { const t = setTimeout(() => setBusquedaDebounced(busqueda), 400); return () => clearTimeout(t); }, [busqueda]);

  const fetchBancos = async () => {
    setCargando(true);
    const token = localStorage.getItem('syncro_token');
    try {
      const res = await fetch(`${apiUrl}/catalogos/bancos`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setBancos(await res.json());
      else mostrarToast('Error al cargar la lista de bancos', 'error');
    } catch { mostrarToast('Error de conexión con el servidor', 'error'); }
    finally { setCargando(false); }
  };

  useEffect(() => { fetchBancos(); }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, [e.target.name]: e.target.value });
  const abrirModalCrear = () => { setEditandoId(null); setFormData({ nombre: '' }); setIsModalOpen(true); };
  const abrirModalEditar = (b: IBanco) => { setEditandoId(b.id); setFormData({ nombre: b.nombre }); setIsModalOpen(true); };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nombre.trim()) { mostrarToast('El nombre del banco es obligatorio.', 'info'); return; }
    setGuardando(true);
    const token = localStorage.getItem('syncro_token');
    const url = editandoId ? `${apiUrl}/catalogos/bancos/${editandoId}` : `${apiUrl}/catalogos/bancos`;
    try {
      const res = await fetch(url, { method: editandoId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(formData) });
      if (res.ok) { setIsModalOpen(false); fetchBancos(); mostrarToast(editandoId ? 'Banco actualizado exitosamente.' : 'Banco creado exitosamente.', 'exito'); }
      else { const d = await res.json().catch(() => null); mostrarToast(`Error: ${Array.isArray(d?.message) ? d.message.join(', ') : d?.message || 'Error desconocido'}`, 'error'); }
    } catch { mostrarToast('Error de conexión al intentar guardar.', 'error'); }
    finally { setGuardando(false); }
  };

  const handleCambiarEstado = async (id: string, activo: boolean) => {
    if (!window.confirm(`¿Deseas ${activo ? 'desactivar' : 'activar'} este banco?`)) return;
    const token = localStorage.getItem('syncro_token');
    try {
      const res = await fetch(`${apiUrl}/catalogos/bancos/${id}/estado`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { fetchBancos(); mostrarToast(`Banco ${activo ? 'desactivado' : 'activado'} correctamente.`, 'exito'); }
      else mostrarToast('Error al cambiar el estado del banco', 'error');
    } catch { mostrarToast('Error de conexión con el servidor', 'error'); }
  };

  const bancosFiltrados = bancos.filter(b => b.nombre.toLowerCase().includes(busquedaDebounced.toLowerCase()));

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto text-slate-800">
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-6 py-4 rounded-xl shadow-2xl font-medium text-white ${toast.tipo === 'exito' ? 'bg-emerald-600' : toast.tipo === 'error' ? 'bg-rose-600' : 'bg-blue-600'}`}>
          {toast.tipo === 'exito' && <CheckCircle2 className="w-5 h-5" />}{toast.tipo === 'error' && <AlertCircle className="w-5 h-5" />}{toast.mensaje}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3"><Landmark className="w-8 h-8 text-indigo-500" />Catálogo de Bancos</h1>
          <p className="text-slate-500 mt-1">Administra las instituciones financieras para transacciones.</p>
        </div>
        {/* ✅ Solo aparece si tiene POST /api/catalogos/bancos */}
        <PuedeCrear ruta="/api/catalogos/bancos">
          <button onClick={abrirModalCrear} className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-indigo-700 hover:shadow-md transition-all active:scale-95">
            <Plus className="w-5 h-5" /> Nuevo Banco
          </button>
        </PuedeCrear>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6">
        <div className="relative w-full md:w-1/2 lg:w-1/3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input type="text" placeholder="Buscar banco por nombre..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all" />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {cargando ? (
          <div className="p-12 text-center flex flex-col items-center text-slate-400"><div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>Cargando bancos...</div>
        ) : bancosFiltrados.length === 0 ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center"><Landmark className="w-12 h-12 text-slate-300 mx-auto mb-3" /><p className="text-lg font-medium text-slate-700">No se encontraron bancos</p></div>
        ) : (
          <table className="w-full text-left whitespace-nowrap">
            <thead><tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-sm uppercase tracking-wider"><th className="p-4 font-semibold">Nombre del Banco</th><th className="p-4 font-semibold text-center w-32">Estado</th><th className="p-4 font-semibold text-center w-32">Acciones</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {bancosFiltrados.map((banco) => (
                <tr key={banco.id} className={`hover:bg-slate-50 transition-colors ${!banco.activo ? 'bg-slate-50/50 grayscale-[20%]' : ''}`}>
                  <td className="p-4 font-bold text-slate-900">{banco.nombre}</td>
                  <td className="p-4 text-center">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${banco.activo ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${banco.activo ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>{banco.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex justify-center items-center gap-2">
                      {/* ✅ Solo aparece si tiene PATCH /api/catalogos/bancos/:id */}
                      <PuedeEditar ruta="/api/catalogos/bancos/:id">
                        <button onClick={() => abrirModalEditar(banco)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Editar"><Edit2 className="w-4 h-4" /></button>
                      </PuedeEditar>
                      {/* ✅ Solo aparece si tiene PATCH /api/catalogos/bancos/:id/estado */}
                      <PuedeEditar ruta="/api/catalogos/bancos/:id/estado">
                        <button onClick={() => handleCambiarEstado(banco.id, banco.activo)} className={`p-2 rounded-lg transition-colors ${banco.activo ? 'text-rose-600 hover:bg-rose-50' : 'text-emerald-600 hover:bg-emerald-50'}`} title={banco.activo ? 'Desactivar' : 'Activar'}><Power className="w-4 h-4" /></button>
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col border-t-4 border-t-indigo-500">
            <div className="flex justify-between items-center p-6 border-b border-slate-100">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Landmark className="w-5 h-5 text-indigo-500" />{editandoId ? 'Editar Banco' : 'Nuevo Banco'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6">
              <form id="banco-form" onSubmit={handleGuardar}>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre del Banco *</label>
                <input required name="nombre" placeholder="Ej. BBVA, Santander..." value={formData.nombre} onChange={handleChange} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
              </form>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 rounded-b-2xl">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-700 font-medium hover:bg-slate-200 rounded-lg" disabled={guardando}>Cancelar</button>
              <button type="submit" form="banco-form" disabled={guardando} className="px-5 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
                {guardando && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}{guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
