"use client";

import { useState, useEffect } from 'react';
import {
  ArrowRightLeft, Package, Warehouse, Loader2,
  AlertCircle, CheckCircle2, ArrowRight, Info, Search, ChevronDown
} from 'lucide-react';
import Swal from 'sweetalert2';
import { ProtectedElement } from "@/app/components/ProtectedElement"; // ← NUEVO

export default function TransferenciasPage() {
  const [productos, setProductos] = useState<any[]>([]);
  const [almacenes, setAlmacenes] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    productoId: '', almacenOrigenId: '', almacenDestinoId: '', cantidad: '', motivo: '',
  });
  const [stockDisponible, setStockDisponible] = useState<number | null>(null);
  const [buscandoStock, setBuscandoStock] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [buscadorAbierto, setBuscadorAbierto] = useState(false);
  const [textoBusqueda, setTextoBusqueda] = useState('');

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000/api';

  useEffect(() => {
    const token = localStorage.getItem('syncro_token');
    Promise.all([
      fetch(`${apiUrl}/catalogo/productos?limite=2000`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${apiUrl}/catalogo/almacenes`, { headers: { Authorization: `Bearer ${token}` } }),
    ]).then(async ([resProd, resAlm]) => {
      if (resProd.ok) { const d = await resProd.json(); setProductos(d.productos || d); }
      if (resAlm.ok) { const d = await resAlm.json(); setAlmacenes(d.almacenes || d); }
    }).catch(console.error);
  }, [apiUrl]);

  useEffect(() => {
    if (formData.productoId && formData.almacenOrigenId) {
      setBuscandoStock(true);
      const token = localStorage.getItem('syncro_token');
      fetch(`${apiUrl}/catalogo/inventario/stock?productoId=${formData.productoId}&almacenId=${formData.almacenOrigenId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => setStockDisponible(data.cantidad || 0))
        .catch(() => setStockDisponible(0))
        .finally(() => setBuscandoStock(false));
    } else { setStockDisponible(null); }
  }, [formData.productoId, formData.almacenOrigenId, apiUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.almacenOrigenId === formData.almacenDestinoId)
      return Swal.fire('Error', 'El almacén origen y destino no pueden ser el mismo.', 'error');
    if (Number(formData.cantidad) <= 0)
      return Swal.fire('Error', 'La cantidad debe ser mayor a cero.', 'error');
    if (stockDisponible !== null && Number(formData.cantidad) > stockDisponible)
      return Swal.fire('Stock Insuficiente', `Solo tienes ${stockDisponible} unidades disponibles.`, 'error');

    setGuardando(true);
    const token = localStorage.getItem('syncro_token');
    try {
      const res = await fetch(`${apiUrl}/catalogo/inventario/productos/transferir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          productoId: formData.productoId,
          almacenOrigenId: formData.almacenOrigenId,
          almacenDestinoId: formData.almacenDestinoId,
          cantidad: Number(formData.cantidad),
          motivo: formData.motivo || 'Transferencia logística interna',
        }),
      });
      if (res.ok) {
        Swal.fire({ title: 'Transferencia Exitosa', text: 'La mercancía ha sido movida.', icon: 'success', confirmButtonColor: '#059669', customClass: { popup: 'rounded-[24px]', confirmButton: 'px-6 py-2.5 rounded-xl font-bold' } });
        setFormData(prev => ({ ...prev, productoId: '', cantidad: '', motivo: '' }));
        setTextoBusqueda(''); setStockDisponible(null);
      } else {
        const error = await res.json().catch(() => null);
        throw new Error(error?.message || 'Error del servidor');
      }
    } catch (err: any) { Swal.fire('Error al transferir', err.message, 'error'); }
    finally { setGuardando(false); }
  };

  const productoSeleccionado = productos.find(p => p.id === formData.productoId);
  const productosFiltrados = productos.filter(p =>
    p.nombre.toLowerCase().includes(textoBusqueda.toLowerCase()) ||
    p.sku.toLowerCase().includes(textoBusqueda.toLowerCase())
  );

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto animate-in fade-in duration-500 relative">

      {buscadorAbierto && <div className="fixed inset-0 z-10" onClick={() => setBuscadorAbierto(false)} />}

      <div className="mb-8">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
          <div className="p-3 bg-blue-100 text-blue-600 rounded-2xl"><ArrowRightLeft className="w-6 h-6" /></div>
          Transferencias Operativas
        </h1>
        <p className="text-slate-500 mt-2 font-medium">Logística y reabastecimiento interno de mercancías.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit} className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-200 space-y-8 relative z-20">

            {/* 1. Buscador de Producto */}
            <div className="relative">
              <label className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-400 mb-3">
                <Package className="w-4 h-4" /> 1. Mercancía a Mover
              </label>
              <div
                onClick={() => setBuscadorAbierto(true)}
                className={`w-full p-4 bg-slate-50 border rounded-xl flex items-center justify-between cursor-text transition-all ${buscadorAbierto ? 'border-blue-500 ring-2 ring-blue-500/20 bg-white' : 'border-slate-200 hover:border-blue-300'}`}
              >
                <div className="flex items-center gap-3 flex-1 overflow-hidden">
                  <Search className={`w-5 h-5 ${buscadorAbierto ? 'text-blue-500' : 'text-slate-400'}`} />
                  {buscadorAbierto ? (
                    <input autoFocus type="text" className="bg-transparent border-none outline-none w-full font-bold text-slate-800 placeholder-slate-400" placeholder="Escribe el nombre o SKU..." value={textoBusqueda} onChange={(e) => setTextoBusqueda(e.target.value)} />
                  ) : (
                    <span className={`font-bold truncate ${productoSeleccionado ? 'text-slate-800' : 'text-slate-400'}`}>
                      {productoSeleccionado ? `${productoSeleccionado.sku} - ${productoSeleccionado.nombre}` : 'Haz clic para buscar y seleccionar producto...'}
                    </span>
                  )}
                </div>
                <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />
              </div>
              {buscadorAbierto && (
                <div className="absolute top-[85px] left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200 max-h-72 overflow-y-auto">
                  {productosFiltrados.length === 0 ? (
                    <div className="p-4 text-center text-slate-500 font-medium">No se encontraron productos.</div>
                  ) : productosFiltrados.map(p => (
                    <div key={p.id} onClick={() => { setFormData({ ...formData, productoId: p.id }); setTextoBusqueda(''); setBuscadorAbierto(false); }}
                      className={`p-4 hover:bg-blue-50 cursor-pointer border-b border-slate-50 last:border-0 transition-colors flex flex-col ${formData.productoId === p.id ? 'bg-blue-50/50' : ''}`}>
                      <span className="font-bold text-slate-800">{p.nombre}</span>
                      <span className="text-xs font-mono text-slate-400">{p.sku}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 2. Ruta Logística */}
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
              <label className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-400 mb-6">
                <ArrowRightLeft className="w-4 h-4" /> 2. Ruta Logística
              </label>
              <div className="flex flex-col md:flex-row items-center gap-4">
                <div className="flex-1 w-full">
                  <label className="block text-xs font-bold text-slate-500 mb-2">Almacén Origen</label>
                  <select required value={formData.almacenOrigenId} onChange={(e) => setFormData({ ...formData, almacenOrigenId: e.target.value })} className="w-full p-4 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-700">
                    <option value="">Seleccione origen...</option>
                    {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                  </select>
                </div>
                <ArrowRight className="w-8 h-8 text-slate-300 hidden md:block mt-6" />
                <div className="flex-1 w-full">
                  <label className="block text-xs font-bold text-slate-500 mb-2">Almacén Destino</label>
                  <select required value={formData.almacenDestinoId} onChange={(e) => setFormData({ ...formData, almacenDestinoId: e.target.value })} className="w-full p-4 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-700">
                    <option value="">Seleccione destino...</option>
                    {almacenes.filter(a => a.id !== formData.almacenOrigenId).map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* 3. Cantidad */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-1 flex flex-col">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-400">3. Cantidad</label>
                  {stockDisponible !== null && stockDisponible > 0 && (
                    <div className="flex gap-1">
                      <button type="button" onClick={() => setFormData({ ...formData, cantidad: String(Math.floor(stockDisponible / 2)) })} className="px-2 py-0.5 bg-slate-200 text-slate-600 rounded text-[10px] font-bold hover:bg-slate-300">50%</button>
                      <button type="button" onClick={() => setFormData({ ...formData, cantidad: String(stockDisponible) })} className="px-2 py-0.5 bg-blue-100 text-blue-600 rounded text-[10px] font-bold hover:bg-blue-200">MAX</button>
                    </div>
                  )}
                </div>
                <input required type="number" min="1" placeholder="0" value={formData.cantidad} onChange={(e) => setFormData({ ...formData, cantidad: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none font-black text-2xl text-slate-800 text-center transition-all flex-1" />
              </div>
              <div className="md:col-span-2 flex flex-col">
                <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Folio o Justificación (Opcional)</label>
                <input type="text" placeholder="Ej. Reabastecimiento Sucursal Norte..." value={formData.motivo} onChange={(e) => setFormData({ ...formData, motivo: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-700 transition-all flex-1" />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100">
              {/* ✅ Solo aparece si tiene POST /api/catalogo/inventario/productos/transferir */}
              <ProtectedElement metodo="POST" ruta="/api/catalogo/inventario/productos/transferir">
                <button
                  type="submit"
                  disabled={guardando || !formData.productoId || !formData.almacenOrigenId || !formData.almacenDestinoId || !formData.cantidad}
                  className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black text-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500 transition-all shadow-lg shadow-blue-600/20 active:scale-[0.98] flex justify-center items-center gap-2"
                >
                  {guardando ? <Loader2 className="animate-spin w-6 h-6" /> : <ArrowRightLeft className="w-6 h-6" />}
                  {guardando ? 'Ejecutando Transferencia...' : 'Procesar Movimiento'}
                </button>
              </ProtectedElement>
            </div>
          </form>
        </div>

        {/* Panel lateral de auditoría */}
        <div className="bg-slate-900 rounded-[2rem] p-8 text-white h-fit shadow-2xl relative overflow-hidden z-0">
          <div className="absolute -right-10 -top-10 text-white/5"><Warehouse className="w-48 h-48" /></div>
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-8 flex items-center gap-2 relative z-10">
            <Info className="w-4 h-4 text-blue-400" /> Auditoría de Origen
          </h3>
          <div className="space-y-6 relative z-10">
            {formData.productoId && formData.almacenOrigenId ? (
              <>
                <div>
                  <p className="text-slate-400 text-sm font-medium mb-1">Producto a Mover</p>
                  <p className="font-bold text-lg leading-tight text-white truncate">{productoSeleccionado?.nombre}</p>
                </div>
                <div className="p-5 bg-slate-800/80 rounded-2xl border border-white/10 backdrop-blur-sm">
                  <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-2">Disponible en Origen</p>
                  <div className="flex items-end gap-2">
                    <p className="text-5xl font-black text-white">
                      {buscandoStock ? <Loader2 className="animate-spin w-10 h-10 text-blue-400" /> : (stockDisponible ?? 0)}
                    </p>
                    <p className="text-slate-500 font-bold mb-1 uppercase text-xs">{productoSeleccionado?.unidadMedida || 'PZS'}</p>
                  </div>
                </div>
                {stockDisponible !== null && Number(formData.cantidad) > stockDisponible && (
                  <div className="flex items-center gap-3 text-rose-400 text-sm font-bold bg-rose-500/10 p-4 rounded-xl border border-rose-500/20">
                    <AlertCircle className="w-6 h-6 flex-shrink-0" />
                    <p>No tienes suficiente stock en el origen.</p>
                  </div>
                )}
                {stockDisponible !== null && Number(formData.cantidad) > 0 && Number(formData.cantidad) <= stockDisponible && (
                  <div className="flex items-center gap-3 text-emerald-400 text-sm font-bold bg-emerald-500/10 p-4 rounded-xl border border-emerald-500/20">
                    <CheckCircle2 className="w-6 h-6 flex-shrink-0" />
                    <p>Stock validado. La transferencia es segura.</p>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-10 opacity-50">
                <Warehouse className="w-12 h-12 mx-auto mb-4" />
                <p className="text-sm font-medium">Selecciona producto y almacén de origen para consultar el stock disponible.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
