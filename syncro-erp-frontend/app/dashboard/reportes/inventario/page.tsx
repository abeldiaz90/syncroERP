"use client";
import { useState, useEffect } from 'react';
import { Package, RefreshCw, Search, AlertTriangle } from 'lucide-react';
import { ExportBar } from '../../../components/export-bar';

interface IProductoStock {
  id: string; nombre: string; sku: string;
  stockActual: number; costoUnitario: number; valorTotal: number;
  stockMinimo?: number; categoria?: string;
  enBajoStock: boolean;
}

const fmt$ = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0);

const COLUMNAS_INV = [
  { key: 'sku',           label: 'SKU'          },
  { key: 'nombre',        label: 'Producto'     },
  { key: 'categoria',     label: 'Categoría'    },
  { key: 'stockActual',   label: 'Stock',        fmt: (v: number) => String(v) },
  { key: 'stockMinimo',   label: 'Mínimo',       fmt: (v: any) => v ?? '-' },
  { key: 'costoUnitario', label: 'Costo Unit.',  fmt: (v: number) => '$' + Number(v).toFixed(2) },
  { key: 'valorTotal',    label: 'Valor Total',  fmt: (v: number) => '$' + Number(v).toFixed(2) },
];

export default function ReporteInventarioPage() {
  const [productos, setProductos] = useState<IProductoStock[]>([]);
  const [cargando, setCargando]   = useState(true);
  const [busqueda, setBusqueda]   = useState('');
  const [soloStockBajo, setSoloStockBajo] = useState(false);

  const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
  const tok = () => localStorage.getItem('syncro_token') ?? '';
  const h   = () => ({ Authorization: `Bearer ${tok()}` });

  const cargar = async () => {
    setCargando(true);
    const r = await fetch(`${api}/catalogo/inventario/valorizado`, { headers: h() });
    if (r.ok) setProductos(await r.json());
    else {
      // Fallback: cargar productos y calcular valor
      const r2 = await fetch(`${api}/catalogo/productos?limite=500`, { headers: h() });
      if (r2.ok) {
        const d = await r2.json();
        const prods = Array.isArray(d) ? d : d.productos ?? [];
        setProductos(prods.map((p: any) => ({
          id: p.id, nombre: p.nombre, sku: p.sku,
          stockActual:  Number(p.stock ?? p.stockActual ?? 0),
          costoUnitario: Number(p.precioCompra ?? 0),
          valorTotal:   Number(p.stock ?? 0) * Number(p.precioCompra ?? 0),
          stockMinimo:  p.stockMinimo,
          categoria:    p.categoria?.nombre,
          enBajoStock:  Number(p.stock ?? 0) <= Number(p.stockMinimo ?? 0),
        })));
      }
    }
    setCargando(false);
  };

  useEffect(() => { cargar(); }, []);

  const filtrados = productos.filter(p => {
    if (soloStockBajo && !p.enBajoStock) return false;
    if (busqueda) return p.nombre.toLowerCase().includes(busqueda.toLowerCase()) || p.sku.toLowerCase().includes(busqueda.toLowerCase());
    return true;
  });

  const valorTotal    = filtrados.reduce((s, p) => s + p.valorTotal, 0);
  const totalUnidades = filtrados.reduce((s, p) => s + p.stockActual, 0);
  const stockBajo     = productos.filter(p => p.enBajoStock).length;

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-500 mb-1">Reportes</p>
          <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
            <Package className="w-8 h-8 text-indigo-500"/> Inventario Valorizado
          </h1>
          <p className="text-slate-500 text-sm mt-1">Stock actual × costo unitario = valor en almacén.</p>
        </div>
        <div className="flex gap-2">
          <ExportBar
            titulo="Inventario_Valorizado"
            subtitulo={`Actualizado: ${new Date().toLocaleDateString('es-MX')}`}
            datos={filtrados}
            columnas={COLUMNAS_INV}
          />
          <button onClick={cargar} className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 print:hidden">
            <RefreshCw className="w-4 h-4"/>
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs font-bold uppercase text-slate-400 mb-1">Valor total inventario</p>
          <p className="text-2xl font-black text-emerald-600">{fmt$(valorTotal)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs font-bold uppercase text-slate-400 mb-1">Total unidades</p>
          <p className="text-2xl font-black text-indigo-600">{totalUnidades.toLocaleString()}</p>
        </div>
        <div className={`rounded-2xl border-2 p-4 shadow-sm ${stockBajo > 0 ? 'bg-rose-50 border-rose-300' : 'bg-white border-slate-200'}`}>
          <p className={`text-xs font-bold uppercase mb-1 ${stockBajo > 0 ? 'text-rose-500' : 'text-slate-400'}`}>Stock bajo mínimo</p>
          <p className={`text-2xl font-black ${stockBajo > 0 ? 'text-rose-600' : 'text-slate-600'}`}>{stockBajo} productos</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-5 flex gap-3 items-center print:hidden">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/>
          <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar producto o SKU..."
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
        </div>
        <button onClick={() => setSoloStockBajo(!soloStockBajo)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition-colors ${soloStockBajo ? 'bg-rose-600 text-white border-rose-600' : 'bg-white border-slate-200 text-slate-600 hover:border-rose-300'}`}>
          <AlertTriangle className="w-4 h-4"/> Stock bajo
        </button>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-slate-900 text-white px-5 py-3 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Productos</p>
          <p className="text-xs text-slate-400">{filtrados.length} productos</p>
        </div>
        {cargando ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-xs uppercase text-slate-500 font-bold">
                  <th className="px-5 py-3 text-left">SKU</th>
                  <th className="px-5 py-3 text-left">Producto</th>
                  <th className="px-5 py-3 text-left">Categoría</th>
                  <th className="px-5 py-3 text-center">Stock</th>
                  <th className="px-5 py-3 text-center">Mínimo</th>
                  <th className="px-5 py-3 text-right">Costo Unit.</th>
                  <th className="px-5 py-3 text-right">Valor Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtrados.sort((a, b) => b.valorTotal - a.valorTotal).map(p => (
                  <tr key={p.id} className={`hover:bg-slate-50 transition-colors ${p.enBajoStock ? 'bg-rose-50/50' : ''}`}>
                    <td className="px-5 py-3 font-mono text-xs text-slate-500">{p.sku}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        {p.enBajoStock && <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0"/>}
                        <span className="font-medium text-slate-800">{p.nombre}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-400 text-xs">{p.categoria ?? '—'}</td>
                    <td className={`px-5 py-3 text-center font-bold ${p.enBajoStock ? 'text-rose-600' : 'text-slate-700'}`}>{p.stockActual}</td>
                    <td className="px-5 py-3 text-center text-slate-400 text-xs">{p.stockMinimo ?? '—'}</td>
                    <td className="px-5 py-3 text-right font-mono text-slate-600">{fmt$(p.costoUnitario)}</td>
                    <td className="px-5 py-3 text-right font-mono font-bold text-emerald-700">{fmt$(p.valorTotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-300 bg-slate-50">
                <tr>
                  <td colSpan={5} className="px-5 py-3 text-right font-black uppercase text-xs text-slate-500">Total inventario</td>
                  <td className="px-5 py-3"></td>
                  <td className="px-5 py-3 text-right font-black font-mono text-emerald-700 text-base">{fmt$(valorTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
      <style>{`@media print { @page{margin:10mm} .print\\:hidden{display:none!important} }`}</style>
    </div>
  );
}
