// app/dashboard/hoteleria/configuracion/DotacionInsumos.tsx
"use client";
import { useState, useEffect, useCallback } from 'react';
import { Package, Plus, X, Loader2, CheckCircle2, Search, Trash2, Layers } from 'lucide-react';

interface ITipo { id: string; nombre: string; }
interface IProducto { id: string; nombre: string; unidadMedida?: string; }
interface IDotacionItem { id?: string; productoId: string; productoNombre: string; cantidad: number; tipoArticulo: string; }

export default function DotacionInsumos({ api, h, hotelId, tipos }: {
  api: string; h: () => any; hotelId: string; tipos: ITipo[];
}) {
  const [tipoId, setTipoId] = useState('');
  const [items, setItems] = useState<IDotacionItem[]>([]);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // buscador de productos
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<IProducto[]>([]);
  const [buscando, setBuscando] = useState(false);

  const mostrar = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); };

  useEffect(() => { if (tipos.length && !tipoId) setTipoId(tipos[0].id); }, [tipos, tipoId]);

  const cargarDotacion = useCallback(async () => {
    if (!tipoId) return;
    setCargando(true);
    const r = await fetch(`${api}/hoteleria/config/dotacion?tipoHabitacionId=${tipoId}`, { headers: h() });
    if (r.ok) {
      const d = await r.json();
      setItems(d.map((x: any) => ({ id: x.id, productoId: x.productoId, productoNombre: x.productoNombre ?? 'Producto', cantidad: Number(x.cantidad), tipoArticulo: x.tipoArticulo ?? 'CONSUMIBLE' })));
    }
    setCargando(false);
  }, [api, tipoId]);

  useEffect(() => { if (tipoId) cargarDotacion(); }, [tipoId, cargarDotacion]);

  // Buscar productos con debounce
  useEffect(() => {
    if (!busca.trim()) { setResultados([]); return; }
    setBuscando(true);
    const t = setTimeout(async () => {
      const r = await fetch(`${api}/catalogo/productos/buscar?q=${encodeURIComponent(busca)}`, { headers: h() });
      if (r.ok) {
        const d = await r.json();
        const arr = Array.isArray(d) ? d : (d.data ?? []);
        setResultados(arr);
      }
      setBuscando(false);
    }, 300);
    return () => clearTimeout(t);
  }, [busca]);

  const agregarProducto = (p: IProducto) => {
    if (items.some(it => it.productoId === p.id)) { mostrar('Ese producto ya está en la lista', false); return; }
    setItems(prev => [...prev, { productoId: p.id, productoNombre: p.nombre, cantidad: 1, tipoArticulo: 'CONSUMIBLE' }]);
    setBusca(''); setResultados([]);
  };

  const cambiarCantidad = (productoId: string, cantidad: number) => {
    setItems(prev => prev.map(it => it.productoId === productoId ? { ...it, cantidad } : it));
  };
  const quitar = (productoId: string) => setItems(prev => prev.filter(it => it.productoId !== productoId));
  const cambiarTipo = (productoId: string, tipoArticulo: string) => {
    setItems(prev => prev.map(it => it.productoId === productoId ? { ...it, tipoArticulo } : it));
  };

  const guardar = async () => {
    if (!tipoId) return;
    setGuardando(true);
    const r = await fetch(`${api}/hoteleria/config/dotacion`, {
      method: 'POST', headers: h(),
      body: JSON.stringify({
        tipoHabitacionId: tipoId,
        items: items.map(it => ({ productoId: it.productoId, productoNombre: it.productoNombre, cantidad: it.cantidad, tipoArticulo: it.tipoArticulo })),
      }),
    });
    if (r.ok) mostrar('Dotación guardada'); else mostrar('Error al guardar', false);
    setGuardando(false);
  };

  return (
    <div>
      {toast && (
        <div className={`fixed top-6 right-6 z-[60] flex items-center gap-2 px-5 py-3 rounded-xl shadow-xl text-sm font-medium text-white ${toast.ok ? 'bg-slate-900' : 'bg-rose-600'}`}>
          {toast.ok ? <CheckCircle2 className="w-4 h-4" /> : <X className="w-4 h-4" />} {toast.msg}
        </div>
      )}

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6">
        <p className="text-sm text-slate-600 mb-2">
          Define qué insumos lleva cada tipo de habitación por estancia.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 text-emerald-700">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> <b>Consumible</b>: se descuenta del inventario al check-in (shampoo, agua, amenidades).
          </span>
          <span className="inline-flex items-center gap-1.5 text-blue-700">
            <span className="w-2 h-2 rounded-full bg-blue-500" /> <b>Blanco</b>: no se descuenta, se lava y regresa (sábanas, toallas).
          </span>
        </div>
      </div>

      {/* Selector de tipo */}
      <div className="flex items-center gap-2 mb-5">
        <Layers className="w-4 h-4 text-slate-400" />
        <span className="text-sm text-slate-500">Tipo de habitación:</span>
        <select value={tipoId} onChange={e => setTipoId(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
          {tipos.length === 0 && <option value="">Crea un tipo primero</option>}
          {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </select>
      </div>

      {!tipoId ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400">
          <Layers className="w-10 h-10 mx-auto mb-3 text-slate-200" />
          <p className="font-semibold text-slate-600">Primero crea tipos de habitación</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Columna izquierda: buscar y agregar */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Agregar insumo</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar producto (sábana, toalla, agua…)"
                className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
              {buscando && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-slate-300" />}
              {resultados.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-auto">
                  {resultados.map(p => (
                    <button key={p.id} onClick={() => agregarProducto(p)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-slate-50">
                      <Package className="w-4 h-4 text-slate-300" />
                      <span className="text-slate-700">{p.nombre}</span>
                    </button>
                  ))}
                </div>
              )}
              {busca.trim() && !buscando && resultados.length === 0 && (
                <p className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs text-slate-400">
                  Sin productos. Créalos en Inventario → Productos.
                </p>
              )}
            </div>
          </div>

          {/* Columna derecha: lista actual */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Insumos de este tipo</label>
              <span className="text-xs text-slate-400">{items.length} producto(s)</span>
            </div>
            {cargando ? (
              <div className="py-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-slate-300 mx-auto" /></div>
            ) : items.length === 0 ? (
              <div className="border border-dashed border-slate-200 rounded-xl p-6 text-center text-sm text-slate-400">
                Aún no hay insumos. Búscalos a la izquierda.
              </div>
            ) : (
              <div className="space-y-2">
                {items.map(it => (
                  <div key={it.productoId} className="bg-white border border-slate-200 rounded-lg px-3 py-2.5">
                    <div className="flex items-center gap-2 mb-2">
                      <Package className="w-4 h-4 text-slate-300 shrink-0" />
                      <span className="flex-1 text-sm text-slate-700 truncate">{it.productoNombre}</span>
                      <input type="number" min={0} step="0.5" value={it.cantidad}
                        onChange={e => cambiarCantidad(it.productoId, Number(e.target.value))}
                        className="w-16 px-2 py-1 border border-slate-200 rounded text-sm text-center tabular-nums" />
                      <button onClick={() => quitar(it.productoId)} className="text-slate-300 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    <div className="flex gap-1.5 pl-6">
                      <button onClick={() => cambiarTipo(it.productoId, 'CONSUMIBLE')}
                        className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${it.tipoArticulo === 'CONSUMIBLE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>
                        Consumible
                      </button>
                      <button onClick={() => cambiarTipo(it.productoId, 'BLANCO')}
                        className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${it.tipoArticulo === 'BLANCO' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>
                        Blanco (no descuenta)
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button onClick={guardar} disabled={guardando}
              className="w-full mt-4 flex items-center justify-center gap-2 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 disabled:opacity-60">
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Guardar dotación
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
