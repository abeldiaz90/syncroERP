"use client";

import React, { useState, useEffect, useCallback, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import Swal from 'sweetalert2';
import { 
  Shield, Loader2, Save, Search, X, AlertTriangle, 
  ChevronDown, ChevronRight, Lock, Info
} from 'lucide-react';
import { usePermiso } from '@/hooks/use-permisos'; // ← NUEVO

// ==========================================
// TIPOS DE DATOS
// ==========================================
interface Endpoint {
  id: string;
  metodo: string;
  ruta: string;
  nombre: string;
  descripcion: string | null;
}

interface Controlador {
  id: string;
  nombre: string;
  titulo: string;
  categoria: string;
  orden: number;
  endpoints: Endpoint[];
}

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================
export default function PermisosAdminPage() {
  const router = useRouter();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

  // ✅ SISTEMA DINÁMICO: el hook consulta los permisos reales del usuario logueado
  const { tienePermiso, cargando: cargandoPermisos } = usePermiso();

  // ✅ puedeEditar se resuelve dinámicamente desde BD, sin hardcodear roles
  const puedeEditar = tienePermiso('PUT', '/api/admin/permisos/rol/:rol');

  // Estados de sesión
  const [token, setToken] = useState<string | null>(null);

  // Datos principales
  const [roles, setRoles] = useState<string[]>([]);
  const [rolSeleccionado, setRolSeleccionado] = useState('');
  const [arbol, setArbol] = useState<Controlador[]>([]);
  const [permisos, setPermisos] = useState<Record<string, boolean>>({});

  // UI state
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [cambiosSinGuardar, setCambiosSinGuardar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [controladoresExpandidos, setControladoresExpandidos] = useState<Set<string>>(new Set());

  // ======================= AUTORIZACIÓN =======================
  useEffect(() => {
    const tkn = localStorage.getItem('syncro_token');
    const userJson = localStorage.getItem('syncro_user');

    if (!tkn || !userJson) { router.push('/auth/login'); return; }

    setToken(tkn);

    try {
      const user = JSON.parse(userJson);
      if (user.rol !== 'admin' && user.rol !== 'SUPER_ADMIN') {
        router.push('/dashboard');
      }
    } catch { router.push('/auth/login'); }
  }, [router]);

  // ======================= CARGAR ROLES =======================
  const cargarRoles = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${apiUrl}/admin/permisos/roles`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('No se pudieron obtener los roles');
      const data = await res.json();
      setRoles(data);
      if (data.length > 0 && !rolSeleccionado) setRolSeleccionado(data[0]);
    } catch (err) {
      console.error(err);
      Swal.fire('Error', 'No se pudieron cargar los roles', 'error');
    }
  }, [token, rolSeleccionado, apiUrl]);

  // ======================= CARGAR ÁRBOL Y PERMISOS =======================
  const cargarArbolYPermisos = useCallback(async () => {
    if (!token || !rolSeleccionado) return;
    setCargando(true);
    setError(null);
    try {
      const [arbolRes, permisosRes] = await Promise.all([
        fetch(`${apiUrl}/admin/permisos/arbol`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/admin/permisos/rol/${rolSeleccionado}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (!arbolRes.ok) throw new Error('Error cargando estructura');
      if (!permisosRes.ok) throw new Error('Error cargando permisos');
      const arbolData = await arbolRes.json();
      const permisosData = await permisosRes.json();
      setArbol(arbolData);
      setPermisos(permisosData);
      setCambiosSinGuardar(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, [token, rolSeleccionado, apiUrl]);

  // ======================= EFECTOS =======================
  useEffect(() => { if (token) cargarRoles(); }, [token, cargarRoles]);
  useEffect(() => { if (rolSeleccionado && token) cargarArbolYPermisos(); }, [rolSeleccionado, token, cargarArbolYPermisos]);

  // ======================= HANDLERS =======================
  const toggleEndpoint = (endpointId: string, currentValue: boolean) => {
    if (!puedeEditar) return;
    setPermisos(prev => ({ ...prev, [endpointId]: !currentValue }));
    setCambiosSinGuardar(true);
  };

  const toggleControlador = (controladorId: string, endpoints: Endpoint[]) => {
    if (!puedeEditar) return;
    const todosTienenTrue = endpoints.every(ep => permisos[ep.id] === true);
    const nuevosPermisos = { ...permisos };
    for (const ep of endpoints) nuevosPermisos[ep.id] = !todosTienenTrue;
    setPermisos(nuevosPermisos);
    setCambiosSinGuardar(true);
  };

  const guardarPermisos = async () => {
    if (!token || !puedeEditar) return;
    setGuardando(true);
    try {
      const res = await fetch(`${apiUrl}/admin/permisos/rol/${rolSeleccionado}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ permisos }),
      });
      if (!res.ok) throw new Error('Error al guardar los permisos');
      setCambiosSinGuardar(false);
      Swal.fire({
        title: 'Permisos actualizados',
        text: `Los permisos para el rol "${rolSeleccionado}" han sido guardados correctamente.`,
        icon: 'success',
        confirmButtonColor: '#4f46e5',
      });
    } catch (err: any) {
      Swal.fire('Error', err.message, 'error');
    } finally {
      setGuardando(false);
    }
  };

  const toggleExpandirControlador = (id: string) => {
    setControladoresExpandidos(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  const filtrarArbol = (): Controlador[] => {
    if (!busqueda.trim()) return arbol;
    const lowerQuery = busqueda.toLowerCase();
    return arbol
      .map(ctrl => ({
        ...ctrl,
        endpoints: ctrl.endpoints.filter(ep =>
          ep.nombre.toLowerCase().includes(lowerQuery) ||
          ep.ruta.toLowerCase().includes(lowerQuery) ||
          ctrl.nombre.toLowerCase().includes(lowerQuery)
        ),
      }))
      .filter(ctrl => ctrl.endpoints.length > 0);
  };

  const arbolFiltrado = filtrarArbol();

  // ======================= RENDER =======================
  if (cargandoPermisos) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto text-slate-800 pb-32">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
          <Shield className="w-8 h-8 text-indigo-600" /> Permisos y Privilegios
        </h1>
        <p className="text-slate-500 mt-2">
          Administra los niveles de acceso de tu personal a las diferentes secciones del sistema.
        </p>
      </div>

      {/* SELECTOR DE ROL Y BUSCADOR */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm mb-8 flex flex-col lg:flex-row gap-6">
        <div className="w-full lg:w-80">
          <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Selecciona un Rol</label>
          <select
            value={rolSeleccionado}
            onChange={(e) => setRolSeleccionado(e.target.value)}
            disabled={cargando || guardando || cambiosSinGuardar}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-indigo-900 focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            {roles.map(rol => (
              <option key={rol} value={rol}>{rol.toUpperCase()}</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Buscar Operación</label>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por módulo, ruta o nombre..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            {busqueda && (
              <button onClick={() => setBusqueda('')} className="absolute right-4 top-1/2 -translate-y-1/2">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ✅ ALERTA DINÁMICA — aparece solo si el backend dice que no puedes editar */}
      {!puedeEditar && (
        <div className="mb-6 bg-amber-50 border border-amber-200 p-4 rounded-xl flex gap-4 animate-in fade-in">
          <Info className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-amber-900">Modo solo lectura</h3>
            <p className="text-sm text-amber-800 mt-1">
              No tienes permiso para modificar los privilegios de los roles. Contacta a tu administrador para obtener acceso de edición.
            </p>
          </div>
        </div>
      )}

      {/* TABLA DE PERMISOS */}
      <div className={`bg-white rounded-2xl border border-slate-200 overflow-hidden relative ${!puedeEditar ? 'opacity-70' : ''}`}>
        {cargando && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center z-20">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          </div>
        )}

        {error && (
          <div className="p-6 text-center text-red-600">
            <p>{error}</p>
            <button onClick={cargarArbolYPermisos} className="mt-3 text-indigo-600 font-bold hover:underline">Reintentar conexión</button>
          </div>
        )}

        {!error && arbolFiltrado.length === 0 && !cargando && (
          <div className="p-12 text-center text-slate-500">
            <Shield className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p>No hay módulos que coincidan con la búsqueda.</p>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead className="bg-slate-900 text-white text-xs uppercase font-bold">
              <tr>
                <th className="px-6 py-4 w-1/3">Módulo / Operación</th>
                <th className="px-6 py-4">Estatus del Permiso</th>
                <th className="px-6 py-4 w-32 text-center">Acción Masiva</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {arbolFiltrado.map(ctrl => {
                const expandido = controladoresExpandidos.has(ctrl.id) || busqueda.trim() !== '';
                const todosConPermiso = ctrl.endpoints.length > 0 && ctrl.endpoints.every(ep => permisos[ep.id] === true);

                return (
                  <Fragment key={ctrl.id}>
                    {/* FILA DE CONTROLADOR */}
                    <tr
                      className="bg-slate-50/80 hover:bg-slate-50 transition-colors cursor-pointer"
                      onClick={() => toggleExpandirControlador(ctrl.id)}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {expandido
                            ? <ChevronDown className="w-4 h-4 text-indigo-600" />
                            : <ChevronRight className="w-4 h-4 text-slate-400" />}
                          <span className="font-bold capitalize text-indigo-900 text-sm">{ctrl.titulo}</span>
                          <span className="text-[10px] uppercase tracking-wider text-slate-400 ml-2 bg-slate-200 px-2 py-0.5 rounded-full">
                            {ctrl.categoria}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {todosConPermiso ? (
                          <span className="text-emerald-600 flex items-center gap-1 text-sm font-bold">
                            <Shield className="w-4 h-4" /> Autorizado
                          </span>
                        ) : (
                          <span className="text-amber-600 flex items-center gap-1 text-sm font-bold">
                            <Lock className="w-4 h-4" /> Restringido
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {/* ✅ Botón masivo habilitado/deshabilitado según BD */}
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleControlador(ctrl.id, ctrl.endpoints); }}
                          disabled={cargando || guardando || !puedeEditar}
                          className="text-[10px] uppercase tracking-wider font-bold px-3 py-1.5 rounded-full border border-slate-200 bg-white hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {todosConPermiso ? 'Bloquear Todo' : 'Permitir Todo'}
                        </button>
                      </td>
                    </tr>

                    {/* FILAS DE ENDPOINTS */}
                    {expandido && ctrl.endpoints.map(ep => (
                      <tr key={ep.id} className="border-t border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-3 pl-12">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${metodoColor(ep.metodo)}`}>
                                {ep.metodo}
                              </span>
                              <code className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{ep.ruta}</code>
                            </div>
                            <span className="text-sm font-medium text-slate-700">{ep.nombre}</span>
                          </div>
                        </td>
                        <td className="px-6 py-3" colSpan={2}>
                          {/* ✅ Checkbox habilitado/deshabilitado según BD */}
                          <label className={`inline-flex items-center gap-3 group ${puedeEditar ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                            <input
                              type="checkbox"
                              checked={permisos[ep.id] === true}
                              onChange={() => toggleEndpoint(ep.id, permisos[ep.id])}
                              disabled={cargando || guardando || !puedeEditar}
                              className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 transition-colors cursor-pointer disabled:cursor-not-allowed"
                            />
                            <span className={`text-sm font-bold ${permisos[ep.id] ? 'text-indigo-700' : 'text-slate-400 group-hover:text-slate-600'}`}>
                              {permisos[ep.id] ? 'Permitido' : 'Denegado'}
                            </span>
                          </label>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* BARRA FLOTANTE DE GUARDADO — solo aparece si puede editar y hay cambios */}
      {puedeEditar && (
        <div className={`fixed bottom-0 left-0 lg:left-[280px] right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 p-4 shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.1)] flex justify-between items-center transition-transform duration-300 z-50 ${cambiosSinGuardar ? 'translate-y-0' : 'translate-y-full'}`}>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 text-amber-600 rounded-full">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold text-slate-800 leading-tight">Cambios sin guardar</p>
              <p className="text-xs text-slate-500">
                Aplica los cambios para el rol <span className="font-bold text-indigo-600 uppercase">{rolSeleccionado}</span>
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={cargarArbolYPermisos}
              className="px-5 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-colors"
            >
              Descartar
            </button>
            <button
              onClick={guardarPermisos}
              disabled={guardando}
              className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-200 disabled:opacity-50"
            >
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Aplicar Permisos
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function metodoColor(metodo: string): string {
  switch (metodo) {
    case 'GET':    return 'bg-blue-100 text-blue-700 border border-blue-200';
    case 'POST':   return 'bg-emerald-100 text-emerald-700 border border-emerald-200';
    case 'PUT':
    case 'PATCH':  return 'bg-amber-100 text-amber-700 border border-amber-200';
    case 'DELETE': return 'bg-rose-100 text-rose-700 border border-rose-200';
    default:       return 'bg-slate-100 text-slate-600 border border-slate-200';
  }
}
