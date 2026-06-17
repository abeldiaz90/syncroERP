"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Receipt, X, AlertCircle, CheckCircle2, Building2, 
  FileText, DollarSign, Calculator, Search, Loader2, Eye
} from 'lucide-react';
import { PuedeCrear, ProtectedElement } from "@/app/components/ProtectedElement"; // ← NUEVO

export interface IProveedor { id: string; nombre: string; }
export interface IRequisicion {
  id: string; fechaSolicitud: string; estado: string;
  usuarioSolicitante?: { nombreCompleto?: string; nombre?: string };
  detalles: any[];
}
export interface IDetalleCotizacion {
  productoId: string; nombre: string; cantidad: number;
  precioUnitario: number; subtotal: number;
}
export interface ICotizacionFormData {
  proveedorId: string; subtotal: number; impuestoTotal: number;
  total: number; notas: string; detalles: IDetalleCotizacion[];
}

export default function CotizacionesPage() {
  const [requisiciones, setRequisiciones] = useState<IRequisicion[]>([]);
  const [proveedores, setProveedores] = useState<IProveedor[]>([]);
  const [cargando, setCargando] = useState(true);
  const [selectedReq, setSelectedReq] = useState<IRequisicion | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [formData, setFormData] = useState<ICotizacionFormData>({
    proveedorId: '', subtotal: 0, impuestoTotal: 0, total: 0, notas: '', detalles: [],
  });

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

  const [toast, setToast] = useState<{ mensaje: string; tipo: 'exito' | 'error' | 'info' } | null>(null);
  const mostrarToast = (mensaje: string, tipo: 'exito' | 'error' | 'info' = 'info') => {
    setToast({ mensaje, tipo });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchRequisicionesCotizables = async () => {
    const token = localStorage.getItem('syncro_token');
    try {
      const res = await fetch(`${apiUrl}/compras/requisiciones`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setRequisiciones(data.filter((r: IRequisicion) => r.estado === 'COTIZANDO'));
      }
    } catch { mostrarToast('Error al cargar requisiciones', 'error'); }
  };

  const fetchProveedores = async () => {
    const token = localStorage.getItem('syncro_token');
    try {
      const res = await fetch(`${apiUrl}/proveedores`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setProveedores(await res.json());
    } catch {}
  };

  useEffect(() => {
    const cargarDatos = async () => {
      setCargando(true);
      await Promise.all([fetchRequisicionesCotizables(), fetchProveedores()]);
      setCargando(false);
    };
    cargarDatos();
  }, []);

  const abrirModalCotizacion = (req: IRequisicion) => {
    setSelectedReq(req);
    setFormData({
      proveedorId: '', subtotal: 0, impuestoTotal: 0, total: 0, notas: '',
      detalles: req.detalles.map((det: any) => ({
        productoId: det.productoId,
        nombre: det.producto?.nombre || 'Producto Desconocido',
        cantidad: det.cantidadSolicitada,
        precioUnitario: 0, subtotal: 0,
      })),
    });
    setIsModalOpen(true);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleDetalleChange = (index: number, field: string, value: number) => {
    const nuevos = [...formData.detalles];
    nuevos[index] = { ...nuevos[index], [field]: value };
    if (field === 'precioUnitario' || field === 'cantidad') {
      nuevos[index].subtotal = nuevos[index].cantidad * nuevos[index].precioUnitario;
    }
    const subtotal = nuevos.reduce((sum, det) => sum + det.subtotal, 0);
    const impuestoTotal = subtotal * 0.16;
    setFormData({ ...formData, detalles: nuevos, subtotal, impuestoTotal, total: subtotal + impuestoTotal });
  };

  const handleGuardarCotizacion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.proveedorId) { mostrarToast('Debes seleccionar un proveedor', 'error'); return; }
    setGuardando(true);
    const token = localStorage.getItem('syncro_token');
    try {
      const res = await fetch(`${apiUrl}/compras/cotizaciones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          requisicionId: selectedReq?.id,
          proveedorId: formData.proveedorId,
          subtotal: formData.subtotal,
          impuestoTotal: formData.impuestoTotal,
          total: formData.total,
          notas: formData.notas,
          detalles: formData.detalles.map(det => ({
            productoId: det.productoId, cantidad: det.cantidad,
            precioUnitario: det.precioUnitario, subtotal: det.subtotal,
          })),
        }),
      });
      if (res.ok) {
        mostrarToast('Cotización registrada exitosamente', 'exito');
        setIsModalOpen(false);
        fetchRequisicionesCotizables();
      } else {
        const data = await res.json().catch(() => null);
        mostrarToast(`Error: ${data?.message || 'Error al guardar'}`, 'error');
      }
    } catch { mostrarToast('Error de conexión con el servidor', 'error'); }
    finally { setGuardando(false); }
  };

  const requisicionesFiltradas = requisiciones.filter(r =>
    r.id.toLowerCase().includes(busqueda.toLowerCase()) ||
    (r.usuarioSolicitante?.nombreCompleto || '').toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto text-slate-800">
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-6 py-4 rounded-xl shadow-2xl font-medium text-white transition-all duration-300 ${toast.tipo === 'exito' ? 'bg-emerald-600' : toast.tipo === 'error' ? 'bg-rose-600' : 'bg-blue-600'}`}>
          {toast.tipo === 'exito' && <CheckCircle2 className="w-5 h-5" />}
          {toast.tipo === 'error' && <AlertCircle className="w-5 h-5" />}
          {toast.mensaje}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-3">
            <div className="p-2.5 bg-indigo-100 rounded-xl"><Receipt className="w-7 h-7 text-indigo-600" /></div>
            <span className="bg-gradient-to-r from-slate-900 to-slate-700 text-transparent bg-clip-text">Gestión de Cotizaciones</span>
          </h1>
          <p className="text-slate-500 mt-2 font-medium">Asigna costos y proveedores a las requisiciones en proceso.</p>
        </div>
      </div>

      <div className="bg-white p-2 rounded-2xl shadow-sm border border-slate-200 mb-6 flex items-center focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
        <div className="relative w-full md:w-1/2 lg:w-1/3">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input type="text" placeholder="Buscar por folio o solicitante..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="w-full pl-12 pr-4 py-3 bg-transparent text-slate-700 focus:outline-none placeholder:text-slate-400 font-medium" />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {cargando ? (
          <div className="p-16 text-center flex flex-col items-center text-slate-400">
            <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
            <p className="font-medium">Cargando requisiciones pendientes...</p>
          </div>
        ) : requisicionesFiltradas.length === 0 ? (
          <div className="p-16 text-center text-slate-500 flex flex-col items-center">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4 border border-slate-100">
              <Calculator className="w-10 h-10 text-slate-300" />
            </div>
            <p className="text-lg font-bold text-slate-700">No hay requisiciones pendientes</p>
            <p className="text-sm mt-1">El área de compras está al día.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-widest font-bold">
                <tr>
                  <th className="px-6 py-4">Folio / Fecha</th>
                  <th className="px-6 py-4 hidden sm:table-cell">Solicitante</th>
                  <th className="px-6 py-4 text-center">Partidas</th>
                  <th className="px-6 py-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requisicionesFiltradas.map((req) => (
                  <tr key={req.id} className="group hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-indigo-600 tracking-tight">REQ-{req.id.substring(0, 8).toUpperCase()}</span>
                        <span className="text-xs text-slate-500 font-medium mt-0.5">{new Date(req.fechaSolicitud).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 hidden sm:table-cell">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-xs uppercase">
                          {(req.usuarioSolicitante?.nombreCompleto || req.usuarioSolicitante?.nombre || 'N').charAt(0)}
                        </div>
                        <span className="font-semibold text-slate-700">{req.usuarioSolicitante?.nombreCompleto || req.usuarioSolicitante?.nombre || 'No definido'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center justify-center bg-white text-slate-600 font-bold px-3 py-1 rounded-lg border border-slate-200 shadow-sm">{req.detalles?.length || 0} items</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center items-center gap-3">
                        {/* ✅ Solo aparece si tiene POST /api/compras/cotizaciones */}
                        <PuedeCrear ruta="/api/compras/cotizaciones">
                          <button onClick={() => abrirModalCotizacion(req)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl font-semibold transition-all shadow-sm active:scale-95">
                            <Calculator className="w-4 h-4" /> Capturar
                          </button>
                        </PuedeCrear>
                        {/* Ver siempre visible — es GET */}
                        <Link href={`/dashboard/compras/cotizaciones/requisicion/${req.id}`} className="flex items-center gap-2 px-4 py-2 bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:text-indigo-600 rounded-xl font-semibold transition-all shadow-sm active:scale-95">
                          <Eye className="w-4 h-4" /> Ver
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && selectedReq && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 md:p-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col border border-slate-100">
            <div className="flex justify-between items-center px-8 py-6 border-b border-slate-100 bg-white/80 backdrop-blur-md sticky top-0 z-20">
              <div>
                <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                  <div className="p-2 bg-indigo-50 rounded-lg"><Receipt className="w-6 h-6 text-indigo-600" /></div>
                  Nueva Cotización
                </h2>
                <p className="text-sm text-slate-500 font-medium mt-1 ml-12">
                  Referencia: <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-600">REQ-{selectedReq.id.substring(0,8).toUpperCase()}</span>
                </p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 bg-slate-50 text-slate-400 hover:bg-rose-50 hover:text-rose-600 rounded-full transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="px-8 py-6 overflow-y-auto flex-1 bg-slate-50/30">
              <form id="cotizacion-form" onSubmit={handleGuardarCotizacion} className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <label className="block text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-indigo-500" /> Seleccionar Proveedor *
                    </label>
                    <select required name="proveedorId" value={formData.proveedorId} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all font-medium text-slate-700">
                      <option value="">Buscar en el catálogo...</option>
                      {proveedores.map(prov => <option key={prov.id} value={prov.id}>{prov.nombre}</option>)}
                    </select>
                  </div>
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <label className="block text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                      <FileText className="w-5 h-5 text-indigo-500" /> Condiciones Comerciales
                    </label>
                    <input name="notas" value={formData.notas} onChange={handleChange} placeholder="Tiempos de entrega, métodos de pago..." className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all font-medium text-slate-700" />
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-slate-900 text-white">
                        <tr>
                          <th className="px-6 py-4 text-sm font-semibold tracking-wide">Producto Solicitado</th>
                          <th className="px-6 py-4 text-sm font-semibold text-center w-24 tracking-wide">Cant.</th>
                          <th className="px-6 py-4 text-sm font-semibold text-right w-48 tracking-wide">Costo Unit.</th>
                          <th className="px-6 py-4 text-sm font-semibold text-right w-48 tracking-wide">Importe</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {formData.detalles.map((det, idx) => (
                          <tr key={idx} className="hover:bg-indigo-50/30 transition-colors">
                            <td className="px-6 py-4 font-semibold text-slate-800">{det.nombre}</td>
                            <td className="px-6 py-4 text-center font-bold text-slate-500">{det.cantidad}</td>
                            <td className="px-6 py-4">
                              <div className="relative flex items-center focus-within:ring-2 focus-within:ring-indigo-500 bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                                <span className="pl-3 text-slate-400 font-bold">$</span>
                                <input type="number" min="0" step="0.01" required value={det.precioUnitario === 0 ? '' : det.precioUnitario} onChange={(e) => handleDetalleChange(idx, 'precioUnitario', Number(e.target.value))} className="w-full py-2 pr-3 bg-transparent text-right font-black text-indigo-600 focus:outline-none" placeholder="0.00" />
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right font-black text-slate-800 text-lg">${det.subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex justify-end">
                  <div className="w-full md:w-96 bg-slate-900 rounded-2xl shadow-xl p-6 text-white">
                    <div className="space-y-4">
                      <div className="flex justify-between items-center text-slate-300 font-medium">
                        <span>Subtotal</span><span className="font-mono text-lg">${formData.subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-300 font-medium">
                        <span>I.V.A. (16%)</span><span className="font-mono text-lg">${formData.impuestoTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="pt-4 border-t border-slate-700/50 flex justify-between items-end mt-2">
                        <span className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1">Total a Pagar</span>
                        <span className="text-4xl font-black text-emerald-400 tracking-tight">${formData.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </form>
            </div>

            <div className="px-8 py-5 border-t border-slate-100 bg-white/90 backdrop-blur-md flex justify-end gap-4 sticky bottom-0 z-20">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-colors" disabled={guardando}>Cancelar</button>
              {/* ✅ Botón guardar solo aparece si tiene POST /api/compras/cotizaciones */}
              <PuedeCrear ruta="/api/compras/cotizaciones">
                <button type="submit" form="cotizacion-form" disabled={guardando || formData.total === 0} className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all active:scale-[0.98] shadow-lg shadow-indigo-200 flex items-center gap-2">
                  {guardando ? <Loader2 className="w-5 h-5 animate-spin" /> : <DollarSign className="w-5 h-5" />}
                  {guardando ? 'Guardando...' : 'Guardar Cotización'}
                </button>
              </PuedeCrear>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
