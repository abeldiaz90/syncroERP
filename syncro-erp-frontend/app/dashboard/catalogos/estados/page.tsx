"use client";

import { useState, useEffect } from 'react';
import { 
  Search, Plus, Edit2, Power, X, Map, AlertCircle, CheckCircle2, Filter 
} from 'lucide-react';

// ==========================================
// INTERFACES TYPESCRIPT
// ==========================================
export interface IPais {
  id: string;
  nombre: string;
}

export interface IEstado {
  id: string;
  nombre: string;
  paisId: string;
  pais?: IPais;
  activo: boolean;
}

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================
export default function EstadosPage() {
  const [estados, setEstados] = useState<IEstado[]>([]);
  const [paises, setPaises] = useState<IPais[]>([]);
  
  const [paisFiltro, setPaisFiltro] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [busquedaDebounced, setBusquedaDebounced] = useState('');
  
  const [cargandoEstados, setCargandoEstados] = useState(true);
  const [cargandoPaises, setCargandoPaises] = useState(true);
  const [guardando, setGuardando] = useState(false);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ nombre: '', paisId: '' });

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

  // Sistema de Notificaciones Toast
  const [toast, setToast] = useState<{ mensaje: string; tipo: 'exito' | 'error' | 'info' } | null>(null);
  const mostrarToast = (mensaje: string, tipo: 'exito' | 'error' | 'info' = 'info') => {
    setToast({ mensaje, tipo });
    setTimeout(() => setToast(null), 4000);
  };

  // Efecto Debounce para el buscador local
  useEffect(() => {
    const timer = setTimeout(() => setBusquedaDebounced(busqueda), 400);
    return () => clearTimeout(timer);
  }, [busqueda]);

  const fetchPaises = async () => {
    setCargandoPaises(true);
    const token = localStorage.getItem('syncro_token');
    try {
      const res = await fetch(`${apiUrl}/catalogos/paises`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPaises(data);
        if (data.length > 0 && !formData.paisId) {
          setFormData(prev => ({ ...prev, paisId: data[0].id }));
        }
      }
    } catch (error) {
      console.error('Error al cargar países:', error);
      mostrarToast('Error al cargar la lista de países', 'error');
    } finally {
      setCargandoPaises(false);
    }
  };

  const fetchEstados = async (paisIdFiltrado?: string) => {
    setCargandoEstados(true);
    const token = localStorage.getItem('syncro_token');
    try {
      const url = paisIdFiltrado
        ? `${apiUrl}/catalogos/estados?paisId=${paisIdFiltrado}`
        : `${apiUrl}/catalogos/estados`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setEstados(await res.json());
      } else {
        mostrarToast('Error al cargar los estados', 'error');
      }
    } catch (error) {
      console.error('Error al cargar estados:', error);
      mostrarToast('Error de conexión con el servidor', 'error');
    } finally {
      setCargandoEstados(false);
    }
  };

  useEffect(() => {
    fetchPaises();
    fetchEstados();
  }, []);

  // Volver a cargar los estados cuando cambie el filtro de país
  useEffect(() => {
    if (paisFiltro !== undefined) {
      fetchEstados(paisFiltro);
    }
  }, [paisFiltro]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const abrirModalCrear = () => {
    if (paises.length === 0) {
      mostrarToast('No hay países disponibles. Cree al menos uno primero.', 'error');
      return;
    }
    setEditandoId(null);
    setFormData({ nombre: '', paisId: paises[0]?.id || '' });
    setIsModalOpen(true);
  };

  const abrirModalEditar = (estado: IEstado) => {
    setEditandoId(estado.id);
    setFormData({ nombre: estado.nombre, paisId: estado.paisId || paises[0]?.id || '' });
    setIsModalOpen(true);
  };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nombre.trim()) {
      mostrarToast('El nombre del estado es obligatorio.', 'info');
      return;
    }
    if (!formData.paisId || formData.paisId.trim() === '') {
      mostrarToast('Debe seleccionar un país.', 'error');
      return;
    }

    setGuardando(true);
    const token = localStorage.getItem('syncro_token');
    const url = editandoId
      ? `${apiUrl}/catalogos/estados/${editandoId}`
      : `${apiUrl}/catalogos/estados`;
    const metodo = editandoId ? 'PATCH' : 'POST';

    try {
      const body = {
        nombre: formData.nombre,
        paisId: formData.paisId,
      };

      const res = await fetch(url, {
        method: metodo,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setIsModalOpen(false);
        fetchEstados(paisFiltro);
        mostrarToast(editandoId ? 'Estado actualizado exitosamente.' : 'Estado creado exitosamente.', 'exito');
      } else {
        const data = await res.json().catch(() => null);
        const mensaje = Array.isArray(data?.message)
          ? data.message.join(', ')
          : data?.message || 'Error interno del servidor';
        mostrarToast(`Error: ${mensaje}`, 'error');
      }
    } catch (error) {
      console.error('Error al guardar estado:', error);
      mostrarToast('Error de conexión al intentar guardar.', 'error');
    } finally {
      setGuardando(false);
    }
  };

  const handleCambiarEstado = async (id: string, activo: boolean) => {
    if (!window.confirm(`¿Estás seguro de que deseas ${activo ? 'desactivar' : 'activar'} este estado?`)) return;
    const token = localStorage.getItem('syncro_token');
    try {
      const res = await fetch(`${apiUrl}/catalogos/estados/${id}/estado`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        fetchEstados(paisFiltro);
        mostrarToast(`Estado ${activo ? 'desactivado' : 'activado'} correctamente.`, 'exito');
      } else {
        mostrarToast('Error al cambiar el estatus del estado.', 'error');
      }
    } catch (error) {
      console.error('Error al cambiar estado:', error);
      mostrarToast('Error de conexión con el servidor', 'error');
    }
  };

  // Filtrado de estados en el cliente por nombre
  const estadosFiltrados = estados.filter(estado => 
    estado.nombre.toLowerCase().includes(busquedaDebounced.toLowerCase())
  );

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto text-slate-800">
      
      {/* Notificaciones Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-6 py-4 rounded-xl shadow-2xl font-medium text-white transition-all duration-300 transform translate-y-0 opacity-100 ${
          toast.tipo === 'exito' ? 'bg-emerald-600' : toast.tipo === 'error' ? 'bg-rose-600' : 'bg-blue-600'
        }`}>
          {toast.tipo === 'exito' && <CheckCircle2 className="w-5 h-5" />}
          {toast.tipo === 'error' && <AlertCircle className="w-5 h-5" />}
          {toast.mensaje}
        </div>
      )}

      {/* Encabezado */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <Map className="w-8 h-8 text-indigo-500" />
            Catálogo de Estados
          </h1>
          <p className="text-slate-500 mt-1">Configura las subdivisiones territoriales de los países.</p>
        </div>
        <button
          onClick={abrirModalCrear}
          disabled={cargandoPaises || paises.length === 0}
          className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-sm active:scale-95"
        >
          <Plus className="w-5 h-5" />
          Nuevo Estado
        </button>
      </div>

      {/* Barra de Búsqueda y Filtros */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-1/2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar estado por nombre..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
          />
        </div>
        <div className="relative w-full md:w-64">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <select
            value={paisFiltro}
            onChange={(e) => setPaisFiltro(e.target.value)}
            disabled={cargandoPaises}
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all appearance-none"
          >
            <option value="">Todos los países</option>
            {paises.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
          </div>
        </div>
      </div>

      {/* Contenedor de la Tabla */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {cargandoEstados ? (
          <div className="p-12 text-center flex flex-col items-center justify-center text-slate-400">
            <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
            Cargando estados...
          </div>
        ) : estadosFiltrados.length === 0 ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center">
            <Map className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-lg font-medium text-slate-700">No se encontraron estados</p>
            <p className="text-sm">Ajusta los filtros o agrega un estado nuevo.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-sm uppercase tracking-wider">
                  <th className="p-4 font-semibold">Nombre del Estado</th>
                  <th className="p-4 font-semibold hidden sm:table-cell">País</th>
                  <th className="p-4 font-semibold text-center w-32">Estatus</th>
                  <th className="p-4 font-semibold text-center w-32">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {estadosFiltrados.map((estado) => (
                  <tr key={estado.id} className={`hover:bg-slate-50 transition-colors ${!estado.activo ? 'bg-slate-50/50 grayscale-[20%]' : ''}`}>
                    <td className="p-4 font-bold text-slate-900">{estado.nombre}</td>
                    <td className="p-4 text-slate-600 hidden sm:table-cell font-medium">
                      {estado.pais?.nombre || estado.paisId}
                    </td>
                    <td className="p-4 text-center">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${estado.activo ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${estado.activo ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                        {estado.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex justify-center items-center gap-2">
                        <button onClick={() => abrirModalEditar(estado)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Editar">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleCambiarEstado(estado.id, estado.activo)}
                          className={`p-2 rounded-lg transition-colors ${estado.activo ? 'text-rose-600 hover:bg-rose-50' : 'text-emerald-600 hover:bg-emerald-50'}`}
                          title={estado.activo ? 'Desactivar' : 'Activar'}
                        >
                          <Power className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL CREAR / EDITAR */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col border-t-4 border-t-indigo-500">
            <div className="flex justify-between items-center p-6 border-b border-slate-100">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Map className="w-5 h-5 text-indigo-500" />
                {editandoId ? 'Editar Estado' : 'Nuevo Estado'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              <form id="estado-form" onSubmit={handleGuardar} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nombre del Estado *</label>
                  <input
                    required
                    name="nombre"
                    placeholder="Ej. Veracruz, Texas..."
                    value={formData.nombre}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">País *</label>
                  <select
                    name="paisId"
                    required
                    value={formData.paisId}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all appearance-none"
                  >
                    {paises.length === 0 && <option value="">Cargando países...</option>}
                    {paises.map((p) => (
                      <option key={p.id} value={p.id}>{p.nombre}</option>
                    ))}
                  </select>
                </div>
              </form>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 rounded-b-2xl">
              <button 
                type="button" 
                onClick={() => setIsModalOpen(false)} 
                className="px-4 py-2 text-slate-700 font-medium hover:bg-slate-200 rounded-lg transition-colors"
                disabled={guardando}
              >
                Cancelar
              </button>
              <button 
                type="submit" 
                form="estado-form" 
                disabled={guardando || !formData.paisId} 
                className="px-5 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-sm flex items-center gap-2"
              >
                {guardando && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}