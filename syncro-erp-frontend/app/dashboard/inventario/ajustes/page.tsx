"use client";

import { useState, useEffect } from 'react';
import {
  Scale, Package, Warehouse, Loader2, AlertTriangle,
  CheckCircle2, Info, ArrowUpRight, ArrowDownRight,
  FileText, Search, ChevronDown, TrendingDown, TrendingUp
} from 'lucide-react';
import Swal from 'sweetalert2';
import { ProtectedElement } from "@/app/components/ProtectedElement"; // ← NUEVO

export default function AjustesStockPage() {
  const [productos, setProductos] = useState<any[]>([]);
  const [almacenes, setAlmacenes] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    productoId: '',
    almacenId: '',
    tipoAjuste: 'MERMA' as 'INGRESO' | 'MERMA',
    cantidad: '',
    categoriaMotivo: '',
    observaciones: '',
  });
  const [stockActual, setStockActual] = useState<number | null>(null);
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
    if (formData.productoId && formData.almacenId) {
      setBuscandoStock(true);
      const token = localStorage.getItem('syncro_token');
      fetch(`${apiUrl}/catalogo/inventario/stock?productoId=${formData.productoId}&almacenId=${formData.almacenId}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(d => setStockActual(d.cantidad || 0))
        .catch(() => setStockActual(0)).finally(() => setBuscandoStock(false));
    } else { setStockActual(null); }
  }, [formData.productoId, formData.almacenId, apiUrl]);

  const calcularProyeccion = () => {
    if (stockActual === null) return null;
    const cant = Number(formData.cantidad) || 0;
    return formData.tipoAjuste === 'INGRESO' ? stockActual + cant : stockActual - cant;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cantidadNum = Number(formData.cantidad);
    if (!cantidadNum || cantidadNum <= 0) return Swal.fire('Dato Inválido', 'La cantidad debe ser mayor a cero.', 'error');
    if (formData.tipoAjuste === 'MERMA' && stockActual !== null && cantidadNum > stockActual)
      return Swal.fire('Error', `No puedes descontar ${cantidadNum} unidades. Solo hay ${stockActual}.`, 'error');
    if (!formData.categoriaMotivo) return Swal.fire('Motivo Requerido', 'Selecciona la categoría del ajuste.', 'error');

    const confirmacion = await Swal.fire({
      title: '¿Confirmar Ajuste?',
      html: `Registrarás una <b>${formData.tipoAjuste}</b> por <b>${cantidadNum}</b> unidades.<br/>El inventario final será de <b>${calcularProyeccion()}</b>.`,
      icon: 'warning', showCancelButton: true,
      confirmButtonColor: formData.tipoAjuste === 'INGRESO' ? '#059669' : '#ef4444',
      confirmButtonText: 'Sí, aplicar ajuste', cancelButtonText: 'Cancelar', reverseButtons: true,
      customClass: { popup: 'rounded-[24px]', confirmButton: 'px-6 py-2.5 rounded-xl font-bold', cancelButton: 'px-6 py-2.5 rounded-xl font-bold' }
    });
    if (!confirmacion.isConfirmed) return;

    setGuardando(true);
    const token = localStorage.getItem('syncro_token');
    try {
      const res = await fetch(`${apiUrl}/catalogo/inventario/productos/ajuste`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          productoId: formData.productoId, almacenId: formData.almacenId,
          tipo: formData.tipoAjuste, cantidad: cantidadNum,
          motivo: `${formData.categoriaMotivo} - ${formData.observaciones}`.trim()
        }),
      });
      if (res.ok) {
        Swal.fire({ title: 'Ajuste Contabilizado', text: 'El inventario y el kardex han sido actualizados.', icon: 'success', confirmButtonColor: '#059669', customClass: { popup: 'rounded-[24px]', confirmButton: 'px-6 py-2.5 rounded-xl font-bold' } });
        setStockActual(calcularProyeccion());
        setFormData(prev => ({ ...prev, cantidad: '', observaciones: '', categoriaMotivo: '' }));
      } else {
        const error = await res.json().catch(() => null);
        throw new Error(error?.message || 'Error al procesar el ajuste');
      }
    } catch (err: any) { Swal.fire('Error Operativo', err.message, 'error'); }
    finally { setGuardando(false); }
  };

  const productoSeleccionado = productos.find(p => p.id === formData.productoId);
  const productosFiltrados = productos.filter(p =>
    p.nombre.toLowerCase().includes(textoBusqueda.toLowerCase()) ||
    p.sku.toLowerCase().includes(textoBusqueda.toLowerCase())
  );
  const proyeccion = calcularProyeccion();
  const esMerma = formData.tipoAjuste === 'MERMA';

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto animate-in fade-in duration-500 relative">
      {buscadorAbierto && <div className="fixed inset-0 z-10" onClick={() => setBuscadorAbierto(false)} />}

      {/* Header */}
      <div className="mb-8 flex items-start gap-4">
        <div className="p-4 bg-amber-100 text-amber-600 rounded-2xl shadow-sm">
          <Scale className="w-7 h-7" />
        </div>
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Ajustes de Inventario</h1>
          <p className="text-slate-500 mt-1 font-medium">Corrección de discrepancias físicas con impacto en Kardex contable.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Formulario */}
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit} className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden relative z-20">

            {/* Step 1 — Ubicación y Producto */}
            <div className="p-8 border-b border-slate-100">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-5 flex items-center gap-2">
                <span className="w-5 h-5 bg-amber-500 text-white rounded-full flex items-center justify-center text-[10px] font-black">1</span>
                Selección de Material
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Almacén */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Warehouse className="w-3.5 h-3.5" /> Almacén</label>
                  <select required value={formData.almacenId} onChange={(e) => setFormData({ ...formData, almacenId: e.target.value })} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none font-semibold text-slate-800 transition-all">
                    <option value="">Seleccione almacén...</option>
                    {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                  </select>
                </div>

                {/* Buscador producto */}
                <div className="relative">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Package className="w-3.5 h-3.5" /> Producto</label>
                  <div onClick={() => setBuscadorAbierto(true)} className={`w-full px-4 py-3 bg-slate-50 border rounded-xl flex items-center justify-between cursor-text transition-all ${buscadorAbierto ? 'border-amber-500 ring-2 ring-amber-500/20 bg-white' : 'border-slate-200 hover:border-amber-300'}`}>
                    <div className="flex items-center gap-2 flex-1 overflow-hidden">
                      <Search className={`w-4 h-4 flex-shrink-0 ${buscadorAbierto ? 'text-amber-500' : 'text-slate-400'}`} />
                      {buscadorAbierto ? (
                        <input autoFocus type="text" className="bg-transparent outline-none w-full font-semibold text-slate-800 placeholder-slate-400 text-sm" placeholder="SKU o nombre..." value={textoBusqueda} onChange={(e) => setTextoBusqueda(e.target.value)} />
                      ) : (
                        <span className={`text-sm font-semibold truncate ${productoSeleccionado ? 'text-slate-800' : 'text-slate-400'}`}>
                          {productoSeleccionado ? `${productoSeleccionado.sku} — ${productoSeleccionado.nombre}` : 'Buscar producto...'}
                        </span>
                      )}
                    </div>
                    <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  </div>
                  {buscadorAbierto && (
                    <div className="absolute top-[75px] left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 max-h-64 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                      {productosFiltrados.length === 0 ? (
                        <div className="p-4 text-center text-slate-500 text-sm font-medium">Sin resultados.</div>
                      ) : productosFiltrados.map(p => (
                        <div key={p.id} onClick={() => { setFormData({ ...formData, productoId: p.id }); setTextoBusqueda(''); setBuscadorAbierto(false); }} className="px-4 py-3 hover:bg-amber-50 cursor-pointer border-b border-slate-50 last:border-0 transition-colors">
                          <p className="font-bold text-slate-800 text-sm">{p.nombre}</p>
                          <p className="text-xs font-mono text-slate-400">{p.sku}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Step 2 — Tipo y cantidad */}
            <div className="p-8 border-b border-slate-100">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-5 flex items-center gap-2">
                <span className="w-5 h-5 bg-amber-500 text-white rounded-full flex items-center justify-center text-[10px] font-black">2</span>
                Naturaleza del Ajuste
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                {/* Tipo */}
                <div className="flex flex-col gap-3">
                  <button type="button" onClick={() => setFormData({ ...formData, tipoAjuste: 'MERMA' })}
                    className={`p-4 rounded-2xl font-bold flex items-center justify-between border-2 transition-all ${esMerma ? 'border-rose-500 bg-rose-50 text-rose-700 shadow-sm shadow-rose-100' : 'border-slate-200 bg-white text-slate-500 hover:border-rose-200 hover:bg-rose-50/30'}`}>
                    <span className="flex items-center gap-2"><TrendingDown className="w-5 h-5" /> Salida / Merma</span>
                    {esMerma && <CheckCircle2 className="w-5 h-5" />}
                  </button>
                  <button type="button" onClick={() => setFormData({ ...formData, tipoAjuste: 'INGRESO' })}
                    className={`p-4 rounded-2xl font-bold flex items-center justify-between border-2 transition-all ${!esMerma ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-100' : 'border-slate-200 bg-white text-slate-500 hover:border-emerald-200 hover:bg-emerald-50/30'}`}>
                    <span className="flex items-center gap-2"><TrendingUp className="w-5 h-5" /> Ingreso / Sobrante</span>
                    {!esMerma && <CheckCircle2 className="w-5 h-5" />}
                  </button>
                </div>

                {/* Cantidad */}
                <div className="flex flex-col items-center">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Unidades</label>
                  <input
                    required type="number" min="1" step="1" placeholder="0"
                    value={formData.cantidad}
                    onChange={(e) => setFormData({ ...formData, cantidad: e.target.value })}
                    className={`w-full py-5 border-2 rounded-2xl outline-none font-black text-5xl text-center transition-all ${
                      esMerma
                        ? 'bg-rose-50/50 border-rose-200 text-rose-700 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10'
                        : 'bg-emerald-50/50 border-emerald-200 text-emerald-700 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10'
                    }`}
                  />
                  {stockActual !== null && formData.cantidad && (
                    <p className={`text-xs font-bold mt-2 ${proyeccion !== null && proyeccion < 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                      {proyeccion !== null && proyeccion < 0 ? '⚠ Stock insuficiente' : `Proyección: ${proyeccion} unidades`}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Step 3 — Justificación */}
            <div className="p-8 border-b border-slate-100">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-5 flex items-center gap-2">
                <span className="w-5 h-5 bg-amber-500 text-white rounded-full flex items-center justify-center text-[10px] font-black">3</span>
                Justificación Contable
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Categoría del Ajuste *</label>
                  <select required value={formData.categoriaMotivo} onChange={(e) => setFormData({ ...formData, categoriaMotivo: e.target.value })} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none font-semibold text-slate-700">
                    <option value="">Selecciona la categoría...</option>
                    {esMerma ? (
                      <>
                        <option value="Merma por caducidad">Merma por caducidad</option>
                        <option value="Robo / Extravío">Robo / Extravío</option>
                        <option value="Daño en almacén">Daño en almacén</option>
                        <option value="Error de conteo anterior (Ajuste Negativo)">Error de conteo (Negativo)</option>
                      </>
                    ) : (
                      <>
                        <option value="Devolución no registrada">Devolución no registrada</option>
                        <option value="Mercancía encontrada">Mercancía encontrada</option>
                        <option value="Error de conteo anterior (Ajuste Positivo)">Error de conteo (Positivo)</option>
                      </>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Observaciones *</label>
                  <textarea required placeholder="Detalla las observaciones del ajuste..." value={formData.observaciones} onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none font-medium text-slate-700 resize-none" rows={3} />
                </div>
              </div>
            </div>

            {/* Botón submit */}
            <div className="p-8 bg-slate-50/50">
              {/* ✅ Solo aparece si tiene POST /api/catalogo/inventario/productos/ajuste */}
              <ProtectedElement metodo="POST" ruta="/api/catalogo/inventario/productos/ajuste">
                <button
                  type="submit"
                  disabled={guardando || !formData.productoId || !formData.almacenId || !formData.cantidad || !formData.categoriaMotivo}
                  className={`w-full py-5 text-white rounded-2xl font-black text-lg transition-all active:scale-[0.98] flex justify-center items-center gap-3 shadow-lg disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none ${
                    esMerma
                      ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-200'
                      : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200'
                  }`}
                >
                  {guardando
                    ? <><Loader2 className="animate-spin w-6 h-6" /> Contabilizando...</>
                    : esMerma
                    ? <><TrendingDown className="w-6 h-6" /> Registrar Merma</>
                    : <><TrendingUp className="w-6 h-6" /> Registrar Ingreso</>
                  }
                </button>
              </ProtectedElement>
            </div>
          </form>
        </div>

        {/* Panel lateral de auditoría */}
        <div className="space-y-4">

          {/* Proyección */}
          <div className="bg-slate-900 rounded-3xl p-8 text-white shadow-2xl relative overflow-hidden">
            <div className="absolute -right-8 -top-8 text-white/5"><AlertTriangle className="w-40 h-40" /></div>
            <h3 className="text-xs font-black text-amber-400 uppercase tracking-widest mb-6 flex items-center gap-2 relative z-10">
              <Info className="w-4 h-4" /> Impacto en Kardex
            </h3>

            <div className="space-y-5 relative z-10">
              {formData.productoId && formData.almacenId ? (
                <>
                  <div>
                    <p className="text-xs text-slate-400 font-medium mb-1">Producto seleccionado</p>
                    <p className="font-bold text-base leading-tight truncate">{productoSeleccionado?.nombre}</p>
                    <p className="text-xs font-mono text-slate-500 mt-0.5">{productoSeleccionado?.sku}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 bg-slate-800 rounded-2xl border border-white/10">
                      <p className="text-[10px] text-slate-400 uppercase font-black tracking-wider mb-2">Stock Actual</p>
                      <p className="text-3xl font-black text-white">
                        {buscandoStock ? <Loader2 className="animate-spin w-6 h-6 text-amber-400" /> : (stockActual ?? 0)}
                      </p>
                    </div>
                    <div className="p-4 bg-slate-800 rounded-2xl border border-white/10">
                      <p className="text-[10px] text-slate-400 uppercase font-black tracking-wider mb-2">Ajuste</p>
                      <p className={`text-3xl font-black ${esMerma ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {esMerma ? '-' : '+'}{formData.cantidad || 0}
                      </p>
                    </div>
                  </div>

                  <div className={`p-6 rounded-2xl border transition-all ${proyeccion !== null && proyeccion < 0 ? 'bg-rose-500/20 border-rose-500/40' : 'bg-indigo-500/15 border-indigo-500/30'}`}>
                    <p className="text-[10px] text-white/60 uppercase font-black tracking-widest mb-2">Inventario Proyectado</p>
                    <div className="flex items-end gap-2">
                      <p className={`text-6xl font-black tracking-tighter ${proyeccion !== null && proyeccion < 0 ? 'text-rose-400' : 'text-white'}`}>
                        {proyeccion !== null ? proyeccion : '—'}
                      </p>
                      <p className="text-white/40 font-bold mb-2 text-sm uppercase">{productoSeleccionado?.unidadMedida || 'PZS'}</p>
                    </div>
                    {proyeccion !== null && proyeccion < 0 && (
                      <p className="text-xs text-rose-400 font-bold mt-2 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> Inventario insuficiente para esta merma.
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-center py-10 opacity-40">
                  <Scale className="w-12 h-12 mx-auto mb-3" />
                  <p className="text-sm font-medium">Selecciona almacén y producto para ver la proyección.</p>
                </div>
              )}
            </div>
          </div>

          {/* Info box */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
            <h4 className="font-black text-amber-900 text-sm flex items-center gap-2 mb-2">
              <Info className="w-4 h-4" /> ¿Cuándo usar un ajuste?
            </h4>
            <ul className="text-xs text-amber-800 font-medium space-y-1.5">
              <li>• Diferencias detectadas en conteo físico</li>
              <li>• Productos dañados o vencidos</li>
              <li>• Mercancía recuperada no registrada</li>
              <li>• Corrección de errores históricos</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
