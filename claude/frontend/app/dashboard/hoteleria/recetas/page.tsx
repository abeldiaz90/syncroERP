// app/dashboard/hoteleria/recetas/page.tsx
"use client";
import { useState, useEffect, useCallback } from 'react';
import {
  ChefHat, Plus, X, Loader2, CheckCircle2, Search, Trash2, Package, Calculator, FlaskConical,
} from 'lucide-react';
import WizardRecetas from './WizardRecetas';

interface IProducto { id: string; nombre: string; unidadMedida?: string; precioCompra?: number; tipo?: string; }
interface IInsumo { insumoId: string; insumoNombre: string; cantidad: number; unidad: string; mermaPorcentaje: number; }
interface IReceta { id: string; productoId: string; productoNombre: string; costoTeorico: number; rendimiento: number; }

export default function RecetasPage() {
  const api = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:4000/api');
  const tok = () => (typeof window !== 'undefined' ? localStorage.getItem('syncro_token') ?? '' : '');
  const h = () => ({ Authorization: `Bearer ${tok()}`, 'Content-Type': 'application/json' });

  const [recetas, setRecetas] = useState<IReceta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editor, setEditor] = useState(false);
  const [wizard, setWizard] = useState(false);
  const [editProductoId, setEditProductoId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const mostrar = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500); };

  const cargar = useCallback(async () => {
    setCargando(true);
    const r = await fetch(`${api}/recetas`, { headers: h() });
    if (r.ok) setRecetas(await r.json());
    setCargando(false);
  }, [api]);

  useEffect(() => { cargar(); }, [cargar]);

  const fmt$ = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0);

  if (cargando) return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="w-7 h-7 animate-spin text-slate-300" /></div>;

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-8">
      {toast && (
        <div className={`fixed top-6 right-6 z-[60] flex items-center gap-2 px-5 py-3 rounded-xl shadow-xl text-sm font-medium text-white ${toast.ok ? 'bg-slate-900' : 'bg-rose-600'}`}>
          {toast.ok ? <CheckCircle2 className="w-4 h-4" /> : <X className="w-4 h-4" />} {toast.msg}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-[0.15em] mb-1">Producción</p>
          <h1 className="text-3xl font-semibold text-slate-900 tracking-tight flex items-center gap-2">
            <ChefHat className="w-7 h-7 text-slate-700" /> Recetas y Escandallos
          </h1>
          <p className="text-slate-500 mt-1">Define de qué insumos se compone cada platillo o bebida. Al venderse, se descuentan del inventario.</p>
        </div>
        <button onClick={() => setWizard(true)} className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-800">
          <Plus className="w-4 h-4" /> Nueva receta
        </button>
      </div>

      {recetas.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center">
          <FlaskConical className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="font-semibold text-slate-700">Aún no hay recetas</p>
          <p className="text-sm text-slate-400 mt-1">Crea la receta de una margarita o hamburguesa para empezar el control de insumos.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {recetas.map(r => (
            <button key={r.id} onClick={() => { setEditProductoId(r.productoId); setEditor(true); }}
              className="bg-white border border-slate-200 rounded-2xl p-5 text-left hover:shadow-sm transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center mb-3">
                <ChefHat className="w-5 h-5 text-white" />
              </div>
              <h3 className="font-semibold text-slate-900">{r.productoNombre}</h3>
              <div className="flex items-center gap-1.5 mt-2 text-sm text-slate-500">
                <Calculator className="w-3.5 h-3.5" /> Costo: <span className="font-semibold text-slate-700 tabular-nums">{fmt$(r.costoTeorico)}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {wizard && <WizardRecetas api={api} h={h}
        onClose={() => setWizard(false)}
        onListo={() => { setWizard(false); setEditProductoId(null); setEditor(true); }} />}

      {editor && <EditorReceta api={api} h={h} onClose={() => { setEditor(false); setEditProductoId(null); }}
        productoIdInicial={editProductoId}
        onOk={() => { setEditor(false); setEditProductoId(null); cargar(); mostrar('Receta guardada'); }} />}
    </div>
  );
}

// ═══════════════ EDITOR DE RECETA ═══════════════
function EditorReceta({ api, h, onClose, onOk, productoIdInicial }: any) {
  const [producto, setProducto] = useState<IProducto | null>(null);
  const [buscaProd, setBuscaProd] = useState('');
  const [resultadosProd, setResultadosProd] = useState<IProducto[]>([]);
  const [rendimiento, setRendimiento] = useState(1);
  const [insumos, setInsumos] = useState<IInsumo[]>([]);
  const [buscaIns, setBuscaIns] = useState('');
  const [resultadosIns, setResultadosIns] = useState<IProducto[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState('');

  // Cargar receta existente si viene productoIdInicial
  useEffect(() => {
    if (!productoIdInicial) return;
    (async () => {
      const r = await fetch(`${api}/recetas/producto/${productoIdInicial}`, { headers: h() });
      if (r.ok) {
        const d = await r.json();
        if (d) {
          setProducto({ id: d.productoId, nombre: d.productoNombre });
          setRendimiento(Number(d.rendimiento) || 1);
          setInsumos((d.insumos ?? []).map((i: any) => ({
            insumoId: i.insumoId, insumoNombre: i.insumoNombre,
            cantidad: Number(i.cantidad), unidad: i.unidad, mermaPorcentaje: Number(i.mermaPorcentaje),
          })));
        }
      }
    })();
  }, [productoIdInicial]);

  // Buscar producto vendible
  useEffect(() => {
    if (!buscaProd.trim()) { setResultadosProd([]); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`${api}/catalogo/productos/buscar?q=${encodeURIComponent(buscaProd)}`, { headers: h() });
      if (r.ok) { const d = await r.json(); setResultadosProd(Array.isArray(d) ? d : (d.data ?? [])); }
    }, 300);
    return () => clearTimeout(t);
  }, [buscaProd]);

  // Buscar insumos
  useEffect(() => {
    if (!buscaIns.trim()) { setResultadosIns([]); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`${api}/catalogo/productos/buscar?q=${encodeURIComponent(buscaIns)}`, { headers: h() });
      if (r.ok) { const d = await r.json(); setResultadosIns(Array.isArray(d) ? d : (d.data ?? [])); }
    }, 300);
    return () => clearTimeout(t);
  }, [buscaIns]);

  const agregarInsumo = (p: IProducto) => {
    if (insumos.some(i => i.insumoId === p.id)) { setErr('Ese insumo ya está en la receta'); return; }
    setErr('');
    setInsumos(prev => [...prev, { insumoId: p.id, insumoNombre: p.nombre, cantidad: 1, unidad: p.unidadMedida ?? 'PIEZA', mermaPorcentaje: 0 }]);
    setBuscaIns(''); setResultadosIns([]);
  };
  const actualizar = (insumoId: string, campo: string, valor: any) => {
    setInsumos(prev => prev.map(i => i.insumoId === insumoId ? { ...i, [campo]: valor } : i));
  };
  const quitar = (insumoId: string) => setInsumos(prev => prev.filter(i => i.insumoId !== insumoId));

  const guardar = async () => {
    setErr('');
    if (!producto) { setErr('Selecciona el producto vendible'); return; }
    if (insumos.length === 0) { setErr('Agrega al menos un insumo'); return; }
    setGuardando(true);
    const r = await fetch(`${api}/recetas/guardar`, {
      method: 'POST', headers: h(),
      body: JSON.stringify({
        productoId: producto.id, productoNombre: producto.nombre, rendimiento,
        insumos: insumos.map(i => ({ insumoId: i.insumoId, insumoNombre: i.insumoNombre, cantidad: i.cantidad, unidad: i.unidad, mermaPorcentaje: i.mermaPorcentaje })),
      }),
    });
    if (r.ok) onOk(); else { const d = await r.json().catch(() => null); setErr(d?.message || 'Error al guardar'); }
    setGuardando(false);
  };

  const inp = "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-200";

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><ChefHat className="w-5 h-5 text-slate-400" /> {producto ? `Receta: ${producto.nombre}` : 'Nueva receta'}</h3>
          <button onClick={onClose} className="p-1.5 text-slate-300 hover:text-slate-600 hover:bg-slate-50 rounded-full"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-5">
          {err && <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-xs text-rose-700">{err}</div>}

          {/* Producto vendible */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Producto vendible (platillo / bebida)</label>
            {producto ? (
              <div className="flex items-center justify-between bg-slate-900 text-white rounded-lg px-3 py-2.5">
                <span className="text-sm font-medium flex items-center gap-2"><ChefHat className="w-4 h-4" /> {producto.nombre}</span>
                {!productoIdInicial && <button onClick={() => setProducto(null)} className="text-white/60 hover:text-white"><X className="w-4 h-4" /></button>}
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input value={buscaProd} onChange={e => setBuscaProd(e.target.value)} placeholder="Buscar el platillo o bebida…" className={`${inp} pl-9`} />
                {resultadosProd.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-52 overflow-auto">
                    {resultadosProd.map(p => (
                      <button key={p.id} onClick={() => { setProducto(p); setBuscaProd(''); setResultadosProd([]); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-slate-50">
                        <Package className="w-4 h-4 text-slate-300" /> {p.nombre}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Rendimiento */}
          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Rendimiento</label>
            <input type="number" min={1} value={rendimiento} onChange={e => setRendimiento(Number(e.target.value))} className="w-20 px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-center" />
            <span className="text-xs text-slate-400">porción(es) que produce esta receta</span>
          </div>

          {/* Insumos */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Insumos (ingredientes)</label>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={buscaIns} onChange={e => setBuscaIns(e.target.value)} placeholder="Buscar insumo (tequila, queso, pan…)" className={`${inp} pl-9`} />
              {resultadosIns.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-52 overflow-auto">
                  {resultadosIns.map(p => (
                    <button key={p.id} onClick={() => agregarInsumo(p)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-slate-50">
                      <Package className="w-4 h-4 text-slate-300" /> {p.nombre}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {insumos.length === 0 ? (
              <div className="border border-dashed border-slate-200 rounded-xl p-6 text-center text-sm text-slate-400">Busca y agrega los ingredientes.</div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold text-slate-400 uppercase px-2">
                  <span className="col-span-5">Insumo</span>
                  <span className="col-span-3 text-center">Cantidad</span>
                  <span className="col-span-2 text-center">Unidad</span>
                  <span className="col-span-1 text-center">Merma%</span>
                  <span className="col-span-1"></span>
                </div>
                {insumos.map(i => (
                  <div key={i.insumoId} className="grid grid-cols-12 gap-2 items-center bg-white border border-slate-200 rounded-lg px-2 py-2">
                    <span className="col-span-5 text-sm text-slate-700 truncate">{i.insumoNombre}</span>
                    <input type="number" min={0} step="0.01" value={i.cantidad} onChange={e => actualizar(i.insumoId, 'cantidad', Number(e.target.value))} className="col-span-3 px-2 py-1 border border-slate-200 rounded text-sm text-center tabular-nums" />
                    <input value={i.unidad} onChange={e => actualizar(i.insumoId, 'unidad', e.target.value)} className="col-span-2 px-2 py-1 border border-slate-200 rounded text-sm text-center" />
                    <input type="number" min={0} value={i.mermaPorcentaje} onChange={e => actualizar(i.insumoId, 'mermaPorcentaje', Number(e.target.value))} className="col-span-1 px-1 py-1 border border-slate-200 rounded text-sm text-center" />
                    <button onClick={() => quitar(i.insumoId)} className="col-span-1 text-slate-300 hover:text-rose-500 flex justify-center"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-slate-100 bg-slate-50 sticky bottom-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 font-medium hover:bg-slate-200 rounded-lg">Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="px-5 py-2 text-sm bg-slate-900 text-white font-medium rounded-lg hover:bg-slate-800 flex items-center gap-2 disabled:opacity-60">
            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Guardar receta
          </button>
        </div>
      </div>
    </div>
  );
}
