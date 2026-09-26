"use client";
import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, RefreshCw } from 'lucide-react';
import { ExportBar } from '../../../components/export-bar';

const fmt$ = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0);

const COLUMNAS_TOP = [
  { key: 'nombre',   label: 'Producto'  },
  { key: 'sku',      label: 'SKU'       },
  { key: 'cantidad', label: 'Unidades', fmt: (v: number) => String(Number(v).toFixed(0)) },
  { key: 'importe',  label: 'Importe',  fmt: (v: number) => '$' + Number(v).toFixed(2) },
];

export default function TopProductosPage() {
  const [productos, setProductos] = useState<any[]>([]);
  const [cargando, setCargando]   = useState(false);
  /*
    Un reporte que no se pudo consultar no es un reporte en cero. `if (r.ok)`
    sin `else` presentaba cualquier fallo —un 403, el backend reiniciándose—
    como un periodo sin movimiento, que es la conclusión contraria.
  */
  const [error, setError] = useState('');
  const [orden, setOrden]         = useState<'cantidad' | 'importe'>('importe');

  const api = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:4000/api');
  const tok = () => localStorage.getItem('syncro_token') ?? '';
  const h   = () => ({ Authorization: `Bearer ${tok()}` });

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetch(`${api}/ventas/dashboard/top-productos?dias=30`, { headers: h() });
      if (r.ok) { setProductos(await r.json()); setError(''); }
      else {
        setProductos([]);
        setError(r.status === 403
          ? 'Tu perfil no incluye este reporte.'
          : 'No se pudo consultar el reporte de productos más vendidos.');
      }
    } catch {
      setProductos([]);
      setError('No hay conexión con el servidor.');
    }
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const ordenados = [...productos].sort((a, b) =>
    orden === 'cantidad' ? Number(b.cantidad) - Number(a.cantidad) : Number(b.importe) - Number(a.importe)
  );

  const maxVal = ordenados.length > 0 ? Number(ordenados[0][orden]) : 1;

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">

      {error && (
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-500 mb-1">Reportes</p>
          <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-indigo-500"/> Top Productos
          </h1>
          <p className="text-slate-500 text-sm mt-1">Productos más vendidos por cantidad e importe.</p>
        </div>
        <div className="flex gap-2">
          <ExportBar
            titulo="Top_Productos"
            subtitulo="Últimos 30 días"
            datos={ordenados}
            columnas={COLUMNAS_TOP}
          />
          <button onClick={cargar} className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 print:hidden">
            <RefreshCw className="w-4 h-4"/>
          </button>
        </div>
      </div>

      {/* Controles */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-5 flex gap-3 items-center print:hidden">
        <div className="flex gap-2">
          <button onClick={() => setOrden('importe')}
            className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors ${orden === 'importe' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600'}`}>
            Por importe
          </button>
          <button onClick={() => setOrden('cantidad')}
            className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors ${orden === 'cantidad' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600'}`}>
            Por cantidad
          </button>
        </div>
      </div>

      {/* Lista de productos */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-slate-900 text-white px-5 py-3">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Top 10 productos — últimos 30 días</p>
        </div>
        {cargando ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"/>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            {ordenados.map((p, i) => {
              const val = Number(p[orden]);
              const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
              return (
                <div key={p.productoId ?? i}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-3">
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0 ${i === 0 ? 'bg-amber-400' : i === 1 ? 'bg-slate-400' : i === 2 ? 'bg-amber-700' : 'bg-slate-200'}`}
                        style={i > 2 ? { color: '#64748b' } : {}}>
                        {i + 1}
                      </span>
                      <div>
                        <p className="font-bold text-slate-800 text-sm">{p.nombre}</p>
                        <p className="text-xs font-mono text-slate-400">{p.sku}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-indigo-700">{orden === 'cantidad' ? `${Number(p.cantidad).toFixed(0)} uds` : fmt$(Number(p.importe))}</p>
                      <p className="text-xs text-slate-400">{orden === 'cantidad' ? fmt$(Number(p.importe)) : `${Number(p.cantidad).toFixed(0)} uds`}</p>
                    </div>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${pct}%` }}/>
                  </div>
                </div>
              );
            })}
            {ordenados.length === 0 && (
              <p className="text-center text-slate-400 py-8">Sin datos en el período</p>
            )}
          </div>
        )}
      </div>
      <style>{`@media print { @page{margin:10mm} .print\\:hidden{display:none!important} }`}</style>
    </div>
  );
}
