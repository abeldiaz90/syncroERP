"use client";

import { useState, useEffect } from 'react';
import { 
  ShieldCheck, Trash2, CheckCircle2, 
  AlertCircle, Save, Plus, ArrowRight 
} from 'lucide-react';
import { PuedeCrear } from "@/app/components/ProtectedElement"; // ← NUEVO

export interface IDepartamento { id: string; nombre: string; }
export interface IUsuario { id: string; nombreCompleto: string; }
export interface IAprobador { id: string; usuarioId: string; usuario?: IUsuario; orden: number; }

export default function ConfigAprobacionPage() {
  const [departamentos, setDepartamentos] = useState<IDepartamento[]>([]);
  const [usuarios, setUsuarios] = useState<IUsuario[]>([]);
  const [departamentoId, setDepartamentoId] = useState('');
  const [configActual, setConfigActual] = useState<IAprobador[]>([]);
  const [nuevoUsuarioId, setNuevoUsuarioId] = useState('');
  const [guardando, setGuardando] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
  const token = typeof window !== 'undefined' ? localStorage.getItem('syncro_token') : '';

  const [toast, setToast] = useState<{ mensaje: string; tipo: 'exito' | 'error' | 'info' } | null>(null);
  const mostrarToast = (m: string, t: 'exito' | 'error' | 'info' = 'info') => {
    setToast({ mensaje: m, tipo: t });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchDepartamentos = async () => {
    const res = await fetch(`${apiUrl}/departamentos`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setDepartamentos(await res.json());
  };

  const fetchUsuarios = async () => {
    const res = await fetch(`${apiUrl}/usuarios`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setUsuarios(await res.json());
  };

  const fetchConfig = async (depId: string) => {
    const res = await fetch(`${apiUrl}/configuraciones-aprobacion/${depId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setConfigActual(await res.json());
    else setConfigActual([]);
  };

  useEffect(() => { fetchDepartamentos(); fetchUsuarios(); }, []);
  useEffect(() => { if (departamentoId) fetchConfig(departamentoId); }, [departamentoId]);

  const agregarAprobador = () => {
    if (!nuevoUsuarioId) return;
    if (configActual.some(c => c.usuarioId === nuevoUsuarioId)) {
      mostrarToast('El usuario ya fue agregado al flujo', 'error');
      return;
    }
    const usuarioSeleccionado = usuarios.find(u => u.id === nuevoUsuarioId);
    setConfigActual([
      ...configActual,
      { id: crypto.randomUUID(), usuarioId: nuevoUsuarioId, usuario: usuarioSeleccionado, orden: configActual.length + 1 },
    ]);
    setNuevoUsuarioId('');
  };

  const eliminarAprobador = (id: string) => {
    const reordenados = configActual
      .filter(c => c.id !== id)
      .map((c, idx) => ({ ...c, orden: idx + 1 }));
    setConfigActual(reordenados);
  };

  const guardarConfiguracion = async () => {
    if (!departamentoId || configActual.length === 0) {
      mostrarToast('Seleccione departamento y al menos un aprobador', 'error');
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch(`${apiUrl}/configuraciones-aprobacion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          departamentoId,
          aprobadores: configActual.map((c, idx) => ({ usuarioId: c.usuarioId, orden: idx + 1 })),
        }),
      });
      if (res.ok) {
        mostrarToast('Flujo de aprobación guardado correctamente', 'exito');
        fetchConfig(departamentoId);
      } else {
        const data = await res.json().catch(() => null);
        mostrarToast(`Error: ${data?.message || 'Error al guardar'}`, 'error');
      }
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto text-slate-800">
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-6 py-4 rounded-xl shadow-2xl font-medium text-white ${toast.tipo === 'exito' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
          {toast.tipo === 'exito' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {toast.mensaje}
        </div>
      )}

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
          <ShieldCheck className="w-8 h-8 text-indigo-500" /> Configuración de Aprobaciones
        </h1>
        <p className="text-slate-500 mt-1">Define la jerarquía de autorización por departamento.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

        {/* Panel de Selección */}
        <div className="md:col-span-1">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <label className="block text-sm font-bold text-slate-700 mb-2">Seleccionar Departamento</label>
            <select
              value={departamentoId}
              onChange={(e) => { setDepartamentoId(e.target.value); setConfigActual([]); }}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="">Seleccione...</option>
              {departamentos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          </div>
        </div>

        {/* Panel de Configuración */}
        <div className="md:col-span-2">
          {departamentoId && (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <ArrowRight className="w-5 h-5 text-indigo-500" /> Flujo de Autorización
              </h2>

              {/* Lista de Aprobadores — manipulación local, sin llamadas al backend */}
              <div className="space-y-3 mb-6">
                {configActual.length === 0 ? (
                  <p className="text-slate-400 italic py-4 text-center border border-dashed rounded-lg">No hay aprobadores definidos.</p>
                ) : (
                  configActual.map((c, idx) => (
                    <div key={c.id} className="flex items-center gap-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <span className="w-8 h-8 flex items-center justify-center bg-indigo-100 text-indigo-700 font-bold rounded-full text-sm">
                        {idx + 1}
                      </span>
                      <div className="flex-1 font-medium text-slate-800">
                        {c.usuario?.nombreCompleto || 'Usuario ID: ' + c.usuarioId}
                      </div>
                      <button onClick={() => eliminarAprobador(c.id)} className="text-rose-500 hover:bg-rose-50 p-2 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Agregar Aprobador — también local */}
              <div className="flex gap-3 mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <select
                  value={nuevoUsuarioId}
                  onChange={(e) => setNuevoUsuarioId(e.target.value)}
                  className="flex-1 px-4 py-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="">Seleccione un usuario...</option>
                  {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombreCompleto}</option>)}
                </select>
                <button
                  onClick={agregarAprobador}
                  disabled={!nuevoUsuarioId}
                  className="px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition flex items-center gap-2 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" /> Agregar
                </button>
              </div>

              {/* ✅ Solo aparece si tiene POST /api/configuraciones-aprobacion */}
              <PuedeCrear ruta="/api/configuraciones-aprobacion">
                <button
                  onClick={guardarConfiguracion}
                  disabled={guardando || configActual.length === 0}
                  className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-200 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {guardando ? 'Guardando...' : <><Save className="w-5 h-5" /> Guardar Configuración de Flujo</>}
                </button>
              </PuedeCrear>

            </div>
          )}
        </div>

      </div>
    </div>
  );
}
