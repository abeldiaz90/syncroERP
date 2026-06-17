"use client";

import { useState, useEffect } from 'react';
import { Building2, Plus, Edit2, Power, X, Search, AlertCircle, CheckCircle2 } from 'lucide-react';
import { PuedeCrear, PuedeEditar } from "@/app/components/ProtectedElement"; // ← NUEVO

export interface IDepartamento { id: string; nombre: string; activo: boolean; }

export default function DepartamentosPage() {
  const [departamentos, setDepartamentos] = useState<IDepartamento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [busquedaDebounced, setBusquedaDebounced] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [formData, setFormData] = useState({ nombre: '' });

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

  const [toast, setToast] = useState<{ mensaje: string; tipo: 'exito' | 'error' | 'info' } | null>(null);
  const mostrarToast = (mensaje: string, tipo: 'exito' | 'error' | 'info' = 'info') => {
    setToast({ mensaje, tipo });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    const timer = setTimeout(() => setBusquedaDebounced(busqueda), 400);
    return () => clearTimeout(timer);
  }, [busqueda]);

  const fetchDepartamentos = async () => {
    setCargando(true);
    const token = localStorage.getItem('syncro_token');
    try {
      const res = await fetch(`${apiUrl}/departamentos`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setDepartamentos(await res.json());
      else mostrarToast('Error al cargar departamentos', 'error');
    } catch { mostrarToast('Error de conexión', 'error'); }
    finally { setCargando(false); }
  };

  useEffect(() => { fetchDepartamentos(); }, []);

  const abrirModalCrear = () => { setEditandoId(null); setFormData({ nombre: '' }); setIsModalOpen(true); };
  const abrirModalEditar = (dep: IDepartamento) => { setEditandoId(dep.id); setFormData({ nombre: dep.nombre }); setIsModalOpen(true); };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nombre.trim()) { mostrarToast('El nombre es obligatorio', 'info'); return; }
    setGuardando(true);
    const token = localStorage.getItem('syncro_token');
    const url = editandoId ? `${apiUrl}/departamentos/${editandoId}` : `${apiUrl}/departamentos`;
    try {
      const res = await fetch(url, {
        method: editandoId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(formData),
      });
      if (res.ok) { setIsModalOpen(false); fetchDepartamentos(); mostrarToast(editandoId ? 'Departamento actualizado' : 'Departamento creado', 'exito'); }
      else { const d = await res.json().catch(() => null); mostrarToast(`Error: ${d?.message || 'Error al guardar'}`, 'error'); }
    } catch { mostrarToast('Error de conexión', 'error'); }
    finally { setGuardando(false); }
  };

  const handleToggle = async (id: string, activo: boolean) => {
    if (!window.confirm(`¿Seguro que deseas ${activo ? 'desactivar' : 'activar'} este departamento?`)) return;
    const token = localStorage.getItem('syncro_token');
    try {
      const res = await fetch(`${apiUrl}/departamentos/${id}/estado`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { fetchDepartamentos(); mostrarToast('Estado actualizado', 'exito'); }
    } catch { mostrarToast('Error al actualizar estado', 'error'); }
  };

  const depFiltrados = departamentos.filter(d => d.nombre.toLowerCase().includes(busquedaDebounced.toLowerCase()));

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto text-slate-800">
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-6 py-4 rounded-xl shadow-2xl font-medium text-white transition-all duration-300 ${toast.tipo === 'exito' ? 'bg-emerald-600' : toast.tipo === 'error' ? 'bg-rose-600' : 'bg-blue-600'}`}>
          {toast.tipo === 'exito' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {toast.mensaje}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <Building2 className="w-8 h-8 text-indigo-500" /> Departamentos
          </h1>
          <p className="text-slate-500 mt-1">Configuración de la estructura organizacional.</p>
        </div>
        {/* ✅ Solo aparece si tiene POST /api/departamentos */}
        <PuedeCrear ruta="/api/departamentos">
          <button onClick={abrirModalCrear} className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-indigo-700 hover:shadow-md transition-all active:scale-95">
            <Plus className="w-5 h-5" /> Nuevo Departamento
          </button>
        </PuedeCrear>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {cargando ? (
          <div className="p-12 text-center text-slate-400">Cargando...</div>
        ) : (
          <table className="w-full text-left whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-sm uppercase">
              <tr>
                <th className="p-4 font-semibold">Nombre</th>
                <th className="p-4 font-semibold text-center">Estado</th>
                <th className="p-4 font-semibold text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {depFiltrados.map((dep) => (
                <tr key={dep.id} className="hover:bg-slate-50">
                  <td className="p-4 font-bold text-slate-900">{dep.nombre}</td>
                  <td className="p-4 text-center">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${dep.activo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                      {dep.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex justify-center gap-2">
                      {/* ✅ Solo aparece si tiene PATCH /api/departamentos/:id */}
                      <PuedeEditar ruta="/api/departamentos/:id">
                        <button onClick={() => abrirModalEditar(dep)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </PuedeEditar>
                      {/* ✅ Solo aparece si tiene PATCH /api/departamentos/:id/estado */}
                      <PuedeEditar ruta="/api/departamentos/:id/estado">
                        <button onClick={() => handleToggle(dep.id, dep.activo)} className={`p-2 rounded-lg transition-colors ${dep.activo ? 'text-rose-600 hover:bg-rose-50' : 'text-emerald-600 hover:bg-emerald-50'}`}>
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

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 border-t-4 border-t-indigo-500">
            <h2 className="text-xl font-bold mb-4">{editandoId ? 'Editar' : 'Nuevo'} Departamento</h2>
            <form onSubmit={handleGuardar} className="space-y-4">
              <input
                required value={formData.nombre} onChange={(e) => setFormData({ nombre: e.target.value })}
                placeholder="Nombre del departamento"
                className="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-700 font-medium hover:bg-slate-100 rounded-lg">Cancelar</button>
                <button type="submit" disabled={guardando} className="px-5 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                  {guardando ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
