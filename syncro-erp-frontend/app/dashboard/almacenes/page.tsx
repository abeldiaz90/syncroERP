"use client";

import { useState, useEffect } from "react";
import { 
  Search, Plus, Edit2, Power, X, Warehouse, MapPin, AlertCircle, CheckCircle2 
} from "lucide-react";
import { PuedeCrear, PuedeEditar } from "@/app/components/ProtectedElement";

export interface IAlmacen {
  id: string;
  nombre: string;
  ubicacion: string | null;
  activo: boolean;
}

export default function AlmacenesPage() {
  const [almacenes, setAlmacenes] = useState<IAlmacen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [busquedaDebounced, setBusquedaDebounced] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ nombre: "", ubicacion: "" });
  const [guardando, setGuardando] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

  const [toast, setToast] = useState<{ mensaje: string; tipo: 'exito' | 'error' | 'info' } | null>(null);
  const mostrarToast = (mensaje: string, tipo: 'exito' | 'error' | 'info' = 'info') => {
    setToast({ mensaje, tipo });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    const timer = setTimeout(() => setBusquedaDebounced(busqueda), 400);
    return () => clearTimeout(timer);
  }, [busqueda]);

  const fetchAlmacenes = async () => {
    setCargando(true);
    const token = localStorage.getItem("syncro_token");
    try {
      const res = await fetch(`${apiUrl}/catalogo/almacenes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setAlmacenes(await res.json());
      else mostrarToast("Error al cargar los almacenes", "error");
    } catch (error) {
      mostrarToast("Error de conexión con el servidor", "error");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { fetchAlmacenes(); }, []);

  const abrirModalCrear = () => {
    setEditandoId(null);
    setFormData({ nombre: "", ubicacion: "" });
    setIsModalOpen(true);
  };

  const abrirModalEditar = (almacen: IAlmacen) => {
    setEditandoId(almacen.id);
    setFormData({ nombre: almacen.nombre, ubicacion: almacen.ubicacion || "" });
    setIsModalOpen(true);
  };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nombre.trim()) {
      mostrarToast("El nombre del almacén es obligatorio.", "info");
      return;
    }
    setGuardando(true);
    const token = localStorage.getItem("syncro_token");
    const url = editandoId
      ? `${apiUrl}/catalogo/almacenes/${editandoId}`
      : `${apiUrl}/catalogo/almacenes`;
    const metodo = editandoId ? "PATCH" : "POST";

    try {
      const res = await fetch(url, {
        method: metodo,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        setIsModalOpen(false);
        fetchAlmacenes();
        mostrarToast(editandoId ? "Almacén actualizado exitosamente" : "Almacén creado exitosamente", "exito");
      } else {
        const data = await res.json().catch(() => null);
        mostrarToast(`Error: ${data?.message || 'No se pudo guardar el almacén'}`, "error");
      }
    } catch {
      mostrarToast("Error de conexión al intentar guardar.", "error");
    } finally {
      setGuardando(false);
    }
  };

  const handleCambiarEstado = async (id: string, activo: boolean) => {
    if (!window.confirm(`¿Estás seguro de que deseas ${activo ? "desactivar" : "activar"} este almacén?`)) return;
    const token = localStorage.getItem("syncro_token");
    try {
      const res = await fetch(`${apiUrl}/catalogo/almacenes/${id}/estado`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) { fetchAlmacenes(); mostrarToast(`Almacén ${activo ? "desactivado" : "activado"} correctamente`, "exito"); }
      else mostrarToast("Error al cambiar el estado del almacén", "error");
    } catch {
      mostrarToast("Error de conexión con el servidor", "error");
    }
  };

  const almacenesFiltrados = almacenes.filter(alm =>
    alm.nombre.toLowerCase().includes(busquedaDebounced.toLowerCase()) ||
    (alm.ubicacion && alm.ubicacion.toLowerCase().includes(busquedaDebounced.toLowerCase()))
  );

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto text-slate-800">

      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-6 py-4 rounded-xl shadow-2xl font-medium text-white transition-all duration-300 ${
          toast.tipo === 'exito' ? 'bg-emerald-600' : toast.tipo === 'error' ? 'bg-rose-600' : 'bg-blue-600'
        }`}>
          {toast.tipo === 'exito' && <CheckCircle2 className="w-5 h-5" />}
          {toast.tipo === 'error' && <AlertCircle className="w-5 h-5" />}
          {toast.mensaje}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <Warehouse className="w-8 h-8 text-orange-500" />
            Control de Almacenes
          </h1>
          <p className="text-slate-500 mt-1">Gestiona las sucursales y espacios de inventario.</p>
        </div>

        {/* ✅ Solo aparece si tiene POST /api/catalogo/almacenes */}
        <PuedeCrear ruta="/api/catalogo/almacenes">
          <button
            onClick={abrirModalCrear}
            className="flex items-center justify-center gap-2 bg-orange-500 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-orange-600 hover:shadow-md transition-all active:scale-95"
          >
            <Plus className="w-5 h-5" /> Nuevo Almacén
          </button>
        </PuedeCrear>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6 flex items-center">
        <div className="relative w-full md:w-1/2 lg:w-1/3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nombre o ubicación..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition-all"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {cargando ? (
          <div className="p-12 text-center flex flex-col items-center justify-center text-slate-400">
            <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4"></div>
            Cargando almacenes...
          </div>
        ) : almacenesFiltrados.length === 0 ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center">
            <Warehouse className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-lg font-medium text-slate-700">No se encontraron almacenes</p>
            <p className="text-sm">Intenta ajustar tu búsqueda o crea uno nuevo.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-sm uppercase tracking-wider">
                  <th className="p-4 font-semibold">Nombre del Almacén</th>
                  <th className="p-4 font-semibold hidden sm:table-cell">Ubicación / Dirección</th>
                  <th className="p-4 font-semibold text-center w-32">Estado</th>
                  <th className="p-4 font-semibold text-center w-32">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {almacenesFiltrados.map((almacen) => (
                  <tr key={almacen.id} className={`hover:bg-slate-50 transition-colors ${!almacen.activo ? 'bg-slate-50/50 grayscale-[20%]' : ''}`}>
                    <td className="p-4 font-bold text-slate-900">{almacen.nombre}</td>
                    <td className="p-4 text-slate-600 hidden sm:table-cell">
                      {almacen.ubicacion ? (
                        <span className="flex items-center gap-1.5">
                          <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />
                          <span className="truncate max-w-xs block">{almacen.ubicacion}</span>
                        </span>
                      ) : (
                        <span className="italic text-slate-400 text-sm">Sin ubicación registrada</span>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${almacen.activo ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${almacen.activo ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                        {almacen.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex justify-center items-center gap-2">

                        {/* ✅ Solo aparece si tiene PATCH /api/catalogo/almacenes/:id */}
                        <PuedeEditar ruta="/api/catalogo/almacenes/:id">
                          <button
                            onClick={() => abrirModalEditar(almacen)}
                            className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                            title="Editar"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        </PuedeEditar>

                        {/* ✅ Solo aparece si tiene PATCH /api/catalogo/almacenes/:id/estado */}
                        <PuedeEditar ruta="/api/catalogo/almacenes/:id/estado">
                          <button
                            onClick={() => handleCambiarEstado(almacen.id, almacen.activo)}
                            className={`p-2 rounded-lg transition-colors ${almacen.activo ? 'text-rose-600 hover:bg-rose-50' : 'text-emerald-600 hover:bg-emerald-50'}`}
                            title={almacen.activo ? "Desactivar" : "Activar"}
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
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border-t-4 border-t-orange-500">
            <div className="flex justify-between items-center p-6 border-b border-slate-100">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Warehouse className="w-5 h-5 text-orange-500" />
                {editandoId ? "Editar Almacén" : "Nuevo Almacén"}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <form id="almacen-form" onSubmit={handleGuardar} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nombre del Almacén *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Almacén Central"
                    value={formData.nombre}
                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Ubicación / Dirección <span className="text-slate-400 font-normal">(Opcional)</span>
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                    <textarea
                      placeholder="Ej. Nave 3, Pasillo B, Av. Principal #123"
                      rows={2}
                      value={formData.ubicacion}
                      onChange={(e) => setFormData({ ...formData, ubicacion: e.target.value })}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none transition-all resize-none"
                    />
                  </div>
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
                form="almacen-form"
                disabled={guardando}
                className="px-5 py-2 bg-orange-500 text-white font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-all shadow-sm flex items-center gap-2"
              >
                {guardando && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {guardando ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
