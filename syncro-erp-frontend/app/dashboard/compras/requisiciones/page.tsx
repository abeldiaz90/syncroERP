"use client";

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { 
  Plus, Edit2, X, AlertCircle, CheckCircle2, ClipboardList, 
  Search, Trash2, Send, Eye, FileText, ShoppingCart, Info
} from 'lucide-react';
import { PuedeCrear, ProtectedElement } from "@/app/components/ProtectedElement"; // ← NUEVO

export interface IProductoSugerencia {
  id: string;
  nombre: string;
  sku: string;
}

export interface IRequisicionDetalle {
  productoId: string;
  nombre: string;
  cantidadSolicitada: number;
}

export interface IRequisicion {
  id: string;
  fechaSolicitud: string;
  estado: 'PENDIENTE' | 'COTIZANDO' | 'APROBADA' | 'RECHAZADA';
  usuarioSolicitante?: { nombre?: string; nombreCompleto?: string };
  detalles?: any[];
}

export default function RequisicionesPage() {
  const [requisiciones, setRequisiciones] = useState<IRequisicion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const [busqueda, setBusqueda] = useState('');
  const [sugerencias, setSugerencias] = useState<IProductoSugerencia[]>([]);
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);
  const [productoSeleccionado, setProductoSeleccionado] = useState<IProductoSugerencia | null>(null);
  const [cantidad, setCantidad] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);

  const [detalles, setDetalles] = useState<IRequisicionDetalle[]>([]);
  const [notas, setNotas] = useState('');

  const [editandoIdx, setEditandoIdx] = useState<number | null>(null);
  const [editandoCantidad, setEditandoCantidad] = useState(1);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

  const usuario = (() => {
    try { return JSON.parse(localStorage.getItem('syncro_user') || '{}'); }
    catch { return {}; }
  })();

  const [toast, setToast] = useState<{ mensaje: string; tipo: 'exito' | 'error' | 'info' } | null>(null);
  const mostrarToast = (mensaje: string, tipo: 'exito' | 'error' | 'info' = 'info') => {
    setToast({ mensaje, tipo });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchRequisiciones = async () => {
    setCargando(true);
    const token = localStorage.getItem('syncro_token');
    try {
      const res = await fetch(`${apiUrl}/compras/requisiciones`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setRequisiciones(await res.json());
      else mostrarToast('Error al cargar requisiciones', 'error');
    } catch (error) {
      mostrarToast('Error de conexión con el servidor', 'error');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { fetchRequisiciones(); }, []);

  useEffect(() => {
    if (!busqueda || busqueda.length < 2) {
      setSugerencias([]);
      setMostrarSugerencias(false);
      return;
    }
    const timer = setTimeout(async () => {
      const token = localStorage.getItem('syncro_token');
      try {
        const res = await fetch(`${apiUrl}/catalogo/productos/buscar?q=${encodeURIComponent(busqueda)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setSugerencias(data);
          setMostrarSugerencias(true);
        }
      } catch (err) { console.error(err); }
    }, 300);
    return () => clearTimeout(timer);
  }, [busqueda]);

  const seleccionarProducto = (producto: IProductoSugerencia) => {
    setProductoSeleccionado(producto);
    setBusqueda(producto.nombre);
    setMostrarSugerencias(false);
  };

  const agregarOActualizarDetalle = () => {
    if (!productoSeleccionado || cantidad <= 0) return;
    const existente = detalles.findIndex((d) => d.productoId === productoSeleccionado.id);
    if (existente >= 0) {
      const nuevos = [...detalles];
      nuevos[existente].cantidadSolicitada = cantidad;
      setDetalles(nuevos);
      mostrarToast(`Cantidad actualizada para ${productoSeleccionado.nombre}`, 'info');
    } else {
      setDetalles([...detalles, { productoId: productoSeleccionado.id, nombre: productoSeleccionado.nombre, cantidadSolicitada: cantidad }]);
      mostrarToast(`Producto agregado a la lista`, 'exito');
    }
    setProductoSeleccionado(null);
    setBusqueda('');
    setCantidad(1);
    inputRef.current?.focus();
  };

  const eliminarDetalle = (index: number) => {
    const nuevos = [...detalles];
    nuevos.splice(index, 1);
    setDetalles(nuevos);
    if (editandoIdx === index) setEditandoIdx(null);
  };

  const iniciarEdicionCantidad = (index: number, cantidadActual: number) => {
    setEditandoIdx(index);
    setEditandoCantidad(cantidadActual);
  };

  const guardarEdicionCantidad = (index: number) => {
    if (editandoCantidad <= 0) { mostrarToast('La cantidad debe ser mayor a 0', 'error'); return; }
    const nuevos = [...detalles];
    nuevos[index].cantidadSolicitada = editandoCantidad;
    setDetalles(nuevos);
    setEditandoIdx(null);
  };

  const cancelarEdicion = () => setEditandoIdx(null);

  const handleGuardarRequisicion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (detalles.length === 0) { mostrarToast('Debes agregar al menos un producto a la requisición', 'error'); return; }
    setGuardando(true);
    const token = localStorage.getItem('syncro_token');
    try {
      const body: any = {
        notas,
        detalles: detalles.map((d) => ({ productoId: d.productoId, cantidadSolicitada: d.cantidadSolicitada })),
      };
      if (usuario?.id) body.usuarioSolicitanteId = usuario.id;

      const res = await fetch(`${apiUrl}/compras/requisiciones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setIsModalOpen(false);
        setNotas('');
        setDetalles([]);
        fetchRequisiciones();
        mostrarToast('Requisición de compra creada exitosamente', 'exito');
      } else {
        const data = await res.json().catch(() => null);
        const mensaje = Array.isArray(data?.message) ? data.message.join(', ') : data?.message || 'Error al guardar la requisición';
        mostrarToast(`Error: ${mensaje}`, 'error');
      }
    } catch (error) {
      mostrarToast('Error de conexión con el servidor', 'error');
    } finally {
      setGuardando(false);
    }
  };

  const handleCambiarEstado = async (id: string, nuevoEstado: string) => {
    if (!window.confirm(`¿Confirmas el envío a cotizar de esta requisición?`)) return;
    const token = localStorage.getItem('syncro_token');
    try {
      const res = await fetch(`${apiUrl}/compras/requisiciones/${id}/estado`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      if (res.ok) { fetchRequisiciones(); mostrarToast(`Requisición actualizada a estado: ${nuevoEstado}`, 'exito'); }
    } catch (error) {
      mostrarToast('Error al cambiar el estado', 'error');
    }
  };

  const getBadgeEstado = (estado: string) => {
    switch (estado) {
      case 'PENDIENTE': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'COTIZANDO': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'APROBADA':  return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'RECHAZADA': return 'bg-rose-100 text-rose-700 border-rose-200';
      default:          return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

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
            <ClipboardList className="w-8 h-8 text-indigo-500" />
            Requisiciones de Compra
          </h1>
          <p className="text-slate-500 mt-1">Solicita materiales y supervisa el estado de tus peticiones.</p>
        </div>

        {/* ✅ Solo aparece si tiene POST /api/compras/requisiciones */}
        <PuedeCrear ruta="/api/compras/requisiciones">
          <button
            onClick={() => { setBusqueda(''); setDetalles([]); setNotas(''); setIsModalOpen(true); }}
            className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-indigo-700 hover:shadow-md transition-all active:scale-95"
          >
            <Plus className="w-5 h-5" /> Nueva Requisición
          </button>
        </PuedeCrear>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {cargando ? (
          <div className="p-12 text-center flex flex-col items-center justify-center text-slate-400">
            <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
            Cargando requisiciones...
          </div>
        ) : requisiciones.length === 0 ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center">
            <ShoppingCart className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-lg font-medium text-slate-700">No hay requisiciones registradas</p>
            <p className="text-sm">Crea una nueva solicitud de compra para comenzar.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-sm uppercase tracking-wider">
                  <th className="p-4 font-semibold">Folio / Fecha</th>
                  <th className="p-4 font-semibold hidden sm:table-cell">Solicitante</th>
                  <th className="p-4 font-semibold text-center">Productos</th>
                  <th className="p-4 font-semibold text-center">Estado</th>
                  <th className="p-4 font-semibold text-center w-40">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requisiciones.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4">
                      <p className="font-bold text-slate-900 tracking-tight">REQ-{req.id.substring(0,6).toUpperCase()}</p>
                      <p className="text-xs text-slate-500">{new Date(req.fechaSolicitud).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })}</p>
                    </td>
                    <td className="p-4 hidden sm:table-cell text-slate-600 font-medium">
                      {req.usuarioSolicitante?.nombreCompleto || req.usuarioSolicitante?.nombre || 'N/A'}
                    </td>
                    <td className="p-4 text-center">
                      <span className="inline-flex items-center justify-center bg-slate-100 text-slate-700 font-bold px-3 py-1 rounded-lg border border-slate-200">
                        {req.detalles?.length || 0} items
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${getBadgeEstado(req.estado)}`}>
                        {req.estado}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex justify-center items-center gap-2">

                        {/* ✅ Solo aparece si está PENDIENTE Y tiene permiso de cambiar estado */}
                        {req.estado === 'PENDIENTE' && (
                          <ProtectedElement metodo="PATCH" ruta="/api/compras/requisiciones/:id/estado">
                            <button
                              onClick={() => handleCambiarEstado(req.id, 'COTIZANDO')}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Enviar a Cotizar"
                            >
                              <Send className="w-4 h-4" />
                            </button>
                          </ProtectedElement>
                        )}

                        {/* Ver detalles — visible para todos los que tienen GET */}
                        <ProtectedElement metodo="GET" ruta="/api/compras/requisiciones/:id">
                          <Link
                            href={`/dashboard/compras/requisiciones/${req.id}`}
                            className="p-2 text-slate-600 hover:bg-slate-100 hover:text-indigo-600 rounded-lg transition-colors"
                            title="Ver Detalles"
                          >
                            <Eye className="w-4 h-4" />
                          </Link>
                        </ProtectedElement>

                        {/* PDF — mismo permiso que ver */}
                        <ProtectedElement metodo="GET" ruta="/api/compras/requisiciones/:id">
                          <Link
                            href={`/dashboard/compras/requisiciones/${req.id}/pdf`}
                            target="_blank"
                            className="p-2 text-slate-600 hover:bg-slate-100 hover:text-rose-600 rounded-lg transition-colors"
                            title="Imprimir PDF"
                          >
                            <FileText className="w-4 h-4" />
                          </Link>
                        </ProtectedElement>

                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 md:p-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-full overflow-hidden flex flex-col border-t-4 border-t-indigo-500">

            <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-white sticky top-0 z-20">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-indigo-500" />
                Nueva Requisición
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-slate-50/50">
              <form id="req-form" onSubmit={handleGuardarRequisicion} className="space-y-6">

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative z-10">
                  <label className="block text-sm font-bold text-slate-700 mb-2">Buscar Producto al Catálogo</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      ref={inputRef}
                      type="text"
                      value={busqueda}
                      onChange={(e) => { setBusqueda(e.target.value); setProductoSeleccionado(null); }}
                      onFocus={() => sugerencias.length > 0 && setMostrarSugerencias(true)}
                      onBlur={() => setTimeout(() => setMostrarSugerencias(false), 200)}
                      className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                      placeholder="Escribe el nombre o SKU (mín. 2 caracteres)..."
                    />
                    {mostrarSugerencias && sugerencias.length > 0 && (
                      <ul className="absolute z-50 w-full bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-auto mt-2 py-1">
                        {sugerencias.map((prod) => (
                          <li
                            key={prod.id}
                            onClick={() => seleccionarProducto(prod)}
                            className="px-4 py-2.5 hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer flex justify-between items-center transition-colors border-b border-slate-50 last:border-0"
                          >
                            <span className="font-medium text-slate-800">{prod.nombre}</span>
                            <span className="text-xs font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{prod.sku}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {productoSeleccionado && (
                    <div className="mt-4 p-4 bg-indigo-50 border border-indigo-100 rounded-lg flex flex-col sm:flex-row gap-4 items-end animate-in slide-in-from-top-2">
                      <div className="flex-1 w-full">
                        <label className="block text-xs font-semibold text-indigo-700 mb-1 uppercase tracking-wider">Producto Seleccionado</label>
                        <input readOnly value={productoSeleccionado.nombre} className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-md text-slate-700 font-medium" />
                      </div>
                      <div className="w-full sm:w-32">
                        <label className="block text-xs font-semibold text-indigo-700 mb-1 uppercase tracking-wider">Cantidad</label>
                        <input
                          type="number" min="1" value={cantidad}
                          onChange={(e) => setCantidad(Number(e.target.value))}
                          className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-md text-slate-800 font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                      <button
                        type="button" onClick={agregarOActualizarDetalle}
                        className="w-full sm:w-auto px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium transition-colors shadow-sm"
                      >
                        {detalles.some((d) => d.productoId === productoSeleccionado.id) ? 'Actualizar' : 'Añadir a Lista'}
                      </button>
                    </div>
                  )}
                </div>

                {detalles.length > 0 && (
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                      <h3 className="font-bold text-slate-700 flex items-center gap-2">
                        <ShoppingCart className="w-4 h-4 text-slate-400" /> Partidas de la Requisición
                      </h3>
                      <span className="bg-slate-200 text-slate-700 text-xs font-bold px-2.5 py-1 rounded-full">{detalles.length}</span>
                    </div>
                    <ul className="divide-y divide-slate-100">
                      {detalles.map((d, idx) => (
                        <li key={idx} className="px-4 py-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 hover:bg-slate-50/50 transition-colors">
                          {editandoIdx === idx ? (
                            <div className="flex items-center gap-3 w-full">
                              <span className="flex-1 font-medium text-slate-800">{d.nombre}</span>
                              <input
                                type="number" min="1" value={editandoCantidad}
                                onChange={(e) => setEditandoCantidad(Number(e.target.value))}
                                className="w-20 px-2 py-1.5 border border-indigo-300 rounded text-slate-900 font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                              />
                              <button type="button" onClick={() => guardarEdicionCantidad(idx)} className="text-emerald-600 hover:text-emerald-700 p-1.5 rounded hover:bg-emerald-50" title="Guardar">
                                <CheckCircle2 className="w-5 h-5" />
                              </button>
                              <button type="button" onClick={cancelarEdicion} className="text-slate-400 hover:text-slate-600 p-1.5 rounded hover:bg-slate-100" title="Cancelar">
                                <X className="w-5 h-5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex justify-between items-center w-full">
                              <div>
                                <p className="font-medium text-slate-800">{d.nombre}</p>
                                <p className="text-sm text-slate-500">Cantidad: <span className="font-bold text-slate-700">{d.cantidadSolicitada}</span></p>
                              </div>
                              <div className="flex gap-1">
                                <button type="button" onClick={() => iniciarEdicionCantidad(idx, d.cantidadSolicitada)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Editar">
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button type="button" onClick={() => eliminarDetalle(idx)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors" title="Eliminar">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <label className="block text-sm font-bold text-slate-700 mb-2">Notas / Justificación de la Compra</label>
                  <textarea
                    value={notas} onChange={(e) => setNotas(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none"
                    rows={3} placeholder="Escribe aquí el motivo de la requisición o notas para el área de compras..."
                  />
                </div>

                <div className="flex items-start gap-3 p-3 bg-blue-50 text-blue-800 rounded-lg border border-blue-100">
                  <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <p className="text-sm font-medium leading-snug">
                    Los aprobadores de esta requisición serán asignados automáticamente según el departamento registrado en tu perfil de usuario.
                  </p>
                </div>

              </form>
            </div>

            <div className="p-5 border-t border-slate-100 bg-white flex justify-end gap-3 sticky bottom-0 z-20 rounded-b-2xl">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-slate-700 font-medium hover:bg-slate-100 rounded-lg transition-colors" disabled={guardando}>
                Cancelar
              </button>
              <button
                type="submit" form="req-form" disabled={guardando || detalles.length === 0}
                className="px-6 py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-sm flex items-center gap-2"
              >
                {guardando && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {guardando ? 'Guardando...' : 'Generar Requisición'}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
