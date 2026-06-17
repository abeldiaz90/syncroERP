"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Swal from 'sweetalert2';
import {
  Ban, Search, Loader2, Receipt, History,
  CheckCircle2, AlertCircle, Banknote, CreditCard, Store
} from 'lucide-react';
import { ProtectedElement } from "@/app/components/ProtectedElement"; // ← NUEVO

export interface IClienteVenta { id: string; nombre: string; email: string; }
export interface IVenta {
  id: string; fechaVenta: string; total: number;
  metodoPago: 'EFECTIVO' | 'TARJETA' | string;
  estado: 'COMPLETADA' | 'ANULADA' | string;
  cliente?: IClienteVenta;
}

export default function HistorialVentasPage() {
  const [ventas, setVentas] = useState<IVenta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [anulando, setAnulando] = useState<string | null>(null);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

  const [toast, setToast] = useState<{ mensaje: string; tipo: 'exito' | 'error' | 'info' } | null>(null);
  const mostrarToast = (mensaje: string, tipo: 'exito' | 'error' | 'info' = 'info') => {
    setToast({ mensaje, tipo }); setTimeout(() => setToast(null), 4000);
  };

  const fetchVentas = async () => {
    const token = localStorage.getItem('syncro_token');
    try {
      const res = await fetch(`${apiUrl}/ventas`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setVentas(data.ventas ?? data);
      }
      else mostrarToast('Error al cargar historial de ventas', 'error');
    } catch { mostrarToast('Error de conexión con el servidor', 'error'); }
    finally { setCargando(false); }
  };

  useEffect(() => { fetchVentas(); }, []);

  const handleAnular = async (id: string) => {
    const result = await Swal.fire({
      title: '¿Anular esta Venta?',
      text: 'La venta se cancelará y los productos se reintegrarán al inventario. Esta acción no se puede deshacer.',
      icon: 'warning', showCancelButton: true,
      confirmButtonColor: '#e11d48', cancelButtonColor: '#64748b',
      confirmButtonText: 'Sí, anular venta', cancelButtonText: 'Mantener venta', reverseButtons: true,
      customClass: { popup: 'rounded-[24px] shadow-2xl', confirmButton: 'px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-rose-200', cancelButton: 'px-6 py-2.5 rounded-xl font-bold' }
    });
    if (!result.isConfirmed) return;

    setAnulando(id);
    const token = localStorage.getItem('syncro_token');
    try {
      const res = await fetch(`${apiUrl}/ventas/${id}/anular`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        Swal.fire({ title: 'Venta Anulada', text: 'El inventario ha sido devuelto correctamente.', icon: 'success', confirmButtonColor: '#4f46e5', customClass: { popup: 'rounded-[24px]', confirmButton: 'px-6 py-2.5 rounded-xl font-bold' } });
        fetchVentas();
      } else {
        const data = await res.json().catch(() => null);
        mostrarToast(`Error: ${data?.message || 'No se pudo procesar la anulación'}`, 'error');
      }
    } catch { mostrarToast('Error de conexión', 'error'); }
    finally { setAnulando(null); }
  };

  const ventasFiltradas = ventas.filter(v => {
    const term = busqueda.toLowerCase();
    return v.id.toLowerCase().includes(term) || (v.cliente?.nombre || '').toLowerCase().includes(term) || (v.cliente?.email || '').toLowerCase().includes(term);
  });

  const getBadgeEstado = (estado: string) => estado === 'ANULADA' ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200';

  const renderMetodoPago = (metodo: string) => {
    if (metodo === 'EFECTIVO') return <span className="flex items-center gap-1.5 text-emerald-600 font-bold"><Banknote className="w-4 h-4" /> Efectivo</span>;
    if (metodo === 'TARJETA') return <span className="flex items-center gap-1.5 text-blue-600 font-bold"><CreditCard className="w-4 h-4" /> Tarjeta</span>;
    return <span className="font-bold text-slate-600">{metodo}</span>;
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto text-slate-800">
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-6 py-4 rounded-xl shadow-2xl font-medium text-white animate-in slide-in-from-top-5 ${toast.tipo === 'exito' ? 'bg-emerald-600' : toast.tipo === 'error' ? 'bg-rose-600' : 'bg-blue-600'}`}>
          {toast.tipo === 'exito' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {toast.mensaje}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-3">
            <div className="p-2.5 bg-indigo-100 rounded-xl"><History className="w-7 h-7 text-indigo-600" /></div>
            <span className="bg-gradient-to-r from-slate-900 to-slate-700 text-transparent bg-clip-text">Historial de Ventas</span>
          </h1>
          <p className="text-slate-500 mt-2 font-medium">Audita las transacciones del Punto de Venta y genera tickets.</p>
        </div>
      </div>

      <div className="bg-white p-2 rounded-2xl shadow-sm border border-slate-200 mb-6 flex items-center focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
        <div className="relative w-full md:w-1/2 lg:w-1/3">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input type="text" placeholder="Buscar por ID, nombre o correo del cliente..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="w-full pl-12 pr-4 py-3 bg-transparent text-slate-700 focus:outline-none placeholder:text-slate-400 font-medium" />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {cargando ? (
          <div className="p-16 text-center flex flex-col items-center text-slate-400">
            <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
            <p className="font-medium">Cargando transacciones...</p>
          </div>
        ) : ventasFiltradas.length === 0 ? (
          <div className="p-16 text-center text-slate-500 flex flex-col items-center">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4 border border-slate-100"><Receipt className="w-10 h-10 text-slate-300" /></div>
            <p className="text-lg font-bold text-slate-700">No se encontraron ventas</p>
            <p className="text-sm mt-1">Realiza búsquedas diferentes o procesa una nueva venta en el POS.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-widest font-bold">
                <tr>
                  <th className="px-6 py-4">ID Venta / Fecha</th>
                  <th className="px-6 py-4">Cliente</th>
                  <th className="px-6 py-4">Método de Pago</th>
                  <th className="px-6 py-4 text-center">Estado</th>
                  <th className="px-6 py-4 text-right">Total Cobrado</th>
                  <th className="px-6 py-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ventasFiltradas.map((venta) => {
                  const isAnulada = venta.estado === 'ANULADA';
                  return (
                    <tr key={venta.id} className={`group transition-colors ${isAnulada ? 'bg-slate-50/50' : 'hover:bg-slate-50/80'}`}>
                      <td className="px-6 py-4">
                        <span className={`font-black tracking-tight ${isAnulada ? 'text-slate-400 line-through' : 'text-indigo-600'}`}>#{venta.id.slice(0, 8).toUpperCase()}</span>
                        <span className="block text-xs text-slate-500 font-medium mt-1">{new Date(venta.fechaVenta).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      </td>
                      <td className="px-6 py-4">
                        {venta.cliente ? (
                          <div className={`flex items-center gap-3 ${isAnulada ? 'opacity-60' : ''}`}>
                            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-xs uppercase">{venta.cliente.nombre.charAt(0)}</div>
                            <div><span className="font-semibold text-slate-800 block">{venta.cliente.nombre}</span><span className="text-xs text-slate-500">{venta.cliente.email}</span></div>
                          </div>
                        ) : (
                          <div className={`flex items-center gap-2 text-slate-500 font-medium ${isAnulada ? 'opacity-60' : ''}`}>
                            <Store className="w-4 h-4" /> Público General
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4"><div className={isAnulada ? 'opacity-60 grayscale' : ''}>{renderMetodoPago(venta.metodoPago)}</div></td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${getBadgeEstado(venta.estado)}`}>{venta.estado}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`text-lg font-black tracking-tight ${isAnulada ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                          ${venta.total?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-center items-center gap-2">
                          {/* Ticket — GET, siempre visible */}
                          <Link href={`/dashboard/ventas/${venta.id}/ticket`} target="_blank" className="flex items-center justify-center w-10 h-10 bg-white text-slate-600 border border-slate-200 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 rounded-xl transition-all shadow-sm active:scale-95" title="Imprimir Ticket">
                            <Receipt className="w-4 h-4" />
                          </Link>
                          {/* ✅ Anular — solo aparece si tiene PATCH /api/ventas/:id/anular */}
                          {!isAnulada && (
                            <ProtectedElement metodo="PATCH" ruta="/api/ventas/:id/anular">
                              <button onClick={() => handleAnular(venta.id)} disabled={anulando === venta.id} className="flex items-center justify-center w-10 h-10 bg-white text-rose-600 border border-rose-100 hover:bg-rose-50 hover:border-rose-200 rounded-xl transition-all shadow-sm active:scale-95 disabled:opacity-50" title="Anular Venta">
                                {anulando === venta.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                              </button>
                            </ProtectedElement>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
