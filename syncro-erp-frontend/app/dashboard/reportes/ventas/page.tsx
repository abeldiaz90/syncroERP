"use client";
import { useState, useEffect, useCallback } from 'react';
import { BarChart2, RefreshCw, TrendingUp, DollarSign, ShoppingBag, CreditCard } from 'lucide-react';
import { ExportBar } from '../../../components/export-bar';

interface IVenta {
  id: string; folio: number; fechaVenta: string; metodoPago: string;
  estado: string;
  total: number; subtotal: number; impuestoTotal: number;
  cliente?: { nombre: string; rfc?: string };
  detalles?: { cantidad: number; subtotal: number; producto?: { nombre: string; sku: string } }[];
}

const fmt$ = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0);
const fmtF = (s: string) => new Date(s).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });

const METODO_LABEL: Record<string, string> = {
  EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta', TRANSFERENCIA: 'SPEI',
  MSI_BANCO: 'MSI', CREDITO_30D: 'Crédito 30d', CREDITO_60D: 'Crédito 60d',
  CREDITO_90D: 'Crédito 90d', MENSUALIDADES: 'Mensualidades',
};

const HOY   = new Date();
const DESDE = new Date(HOY.getFullYear(), HOY.getMonth(), 1).toISOString().split('T')[0];
const HASTA = HOY.toISOString().split('T')[0];

const COLUMNAS_VENTAS = [
  { key: 'folio',           label: 'Folio',     fmt: (v: number) => '#' + String(v).padStart(5,'0') },
  { key: 'fechaVenta',      label: 'Fecha',     fmt: (v: string) => new Date(v).toLocaleDateString('es-MX') },
  { key: 'cliente.nombre',  label: 'Cliente'    },
  { key: 'metodoPago',      label: 'Método'     },
  { key: 'subtotal',        label: 'Subtotal',  fmt: (v: number) => '$' + Number(v).toFixed(2) },
  { key: 'impuestoTotal',   label: 'IVA',       fmt: (v: number) => '$' + Number(v).toFixed(2) },
  { key: 'total',           label: 'Total',     fmt: (v: number) => '$' + Number(v).toFixed(2) },
];

export default function ReporteVentasPage() {
  const [ventas, setVentas]     = useState<IVenta[]>([]);
  const [cargando, setCargando] = useState(false);
  const [desde, setDesde]       = useState(DESDE);
  const [hasta, setHasta]       = useState(HASTA);
  const [agrupacion, setAgrupacion] = useState<'dia' | 'metodo' | 'cliente'>('dia');

  const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
  const tok = () => localStorage.getItem('syncro_token') ?? '';
  const h   = () => ({ Authorization: `Bearer ${tok()}` });

  const cargar = useCallback(async () => {
    setCargando(true);
    const p = new URLSearchParams({ fechaDesde: desde, fechaHasta: hasta, limite: '500' });
    const r = await fetch(`${api}/ventas?${p}`, { headers: h() });
    if (r.ok) { const d = await r.json(); setVentas(d.ventas ?? d); }
    setCargando(false);
  }, [desde, hasta]);

  useEffect(() => { cargar(); }, [cargar]);

  const ventasFiltradas = ventas.filter(v => v.estado !== 'ANULADA');

  // KPIs
  const totalVentas    = ventasFiltradas.reduce((s, v) => s + Number(v.total), 0);
  const totalIVA       = ventasFiltradas.reduce((s, v) => s + Number(v.impuestoTotal), 0);
  const ticketPromedio = ventasFiltradas.length > 0 ? totalVentas / ventasFiltradas.length : 0;

  // Agrupaciones
  const porMetodo = ventasFiltradas.reduce((acc, v) => {
    const k = v.metodoPago;
    if (!acc[k]) acc[k] = { label: METODO_LABEL[k] ?? k, total: 0, count: 0 };
    acc[k].total += Number(v.total);
    acc[k].count++;
    return acc;
  }, {} as Record<string, { label: string; total: number; count: number }>);

  const porDia = ventasFiltradas.reduce((acc, v) => {
    const k = v.fechaVenta?.split('T')[0] ?? '';
    if (!acc[k]) acc[k] = { total: 0, count: 0 };
    acc[k].total += Number(v.total);
    acc[k].count++;
    return acc;
  }, {} as Record<string, { total: number; count: number }>);

  const porCliente = ventasFiltradas.reduce((acc, v) => {
    const k  = v.cliente?.nombre ?? 'Mostrador';
    if (!acc[k]) acc[k] = { total: 0, count: 0 };
    acc[k].total += Number(v.total);
    acc[k].count++;
    return acc;
  }, {} as Record<string, { total: number; count: number }>);

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-500 mb-1">Reportes</p>
          <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
            <BarChart2 className="w-8 h-8 text-indigo-500"/> Reporte de Ventas
          </h1>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <ExportBar
            titulo="Reporte_Ventas"
            subtitulo={`Del ${desde} al ${hasta}`}
            datos={ventasFiltradas}
            columnas={COLUMNAS_VENTAS}
          />
          <button onClick={cargar} className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50">
            <RefreshCw className="w-4 h-4"/>
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-5 flex flex-wrap gap-3 items-end print:hidden">
        <div>
          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Desde</label>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Hasta</label>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Agrupar por</label>
          <select value={agrupacion} onChange={e => setAgrupacion(e.target.value as any)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="dia">Día</option>
            <option value="metodo">Método de pago</option>
            <option value="cliente">Cliente</option>
          </select>
        </div>
        {/* Accesos rápidos */}
        {[
          { label: 'Hoy', d: HASTA, h: HASTA },
          { label: 'Este mes', d: DESDE, h: HASTA },
          { label: 'Mes anterior', d: new Date(HOY.getFullYear(), HOY.getMonth()-1, 1).toISOString().split('T')[0], h: new Date(HOY.getFullYear(), HOY.getMonth(), 0).toISOString().split('T')[0] },
        ].map(q => (
          <button key={q.label} onClick={() => { setDesde(q.d); setHasta(q.h); }}
            className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${desde === q.d && hasta === q.h ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'}`}>
            {q.label}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        {[
          { label: 'Total ventas', val: totalVentas, icon: DollarSign, color: 'indigo' },
          { label: 'Núm. ventas',  val: ventasFiltradas.length, icon: ShoppingBag, color: 'blue', noFmt: true },
          { label: 'Ticket prom.', val: ticketPromedio, icon: TrendingUp, color: 'emerald' },
          { label: 'IVA generado', val: totalIVA, icon: CreditCard, color: 'amber' },
        ].map(k => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-8 h-8 rounded-lg bg-${k.color}-50 flex items-center justify-center`}>
                  <Icon className={`w-4 h-4 text-${k.color}-500`}/>
                </div>
                <p className="text-xs font-bold uppercase text-slate-400">{k.label}</p>
              </div>
              <p className={`text-xl font-black text-${k.color}-600`}>
                {k.noFmt ? k.val : fmt$(Number(k.val))}
              </p>
            </div>
          );
        })}
      </div>

      {/* Tabla agrupada */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-5">
        <div className="bg-slate-900 text-white px-5 py-3 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
            {agrupacion === 'dia' ? 'Por Día' : agrupacion === 'metodo' ? 'Por Método de Pago' : 'Por Cliente'}
          </p>
          <p className="text-xs text-slate-400">{ventasFiltradas.length} ventas</p>
        </div>
        {cargando ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-xs uppercase text-slate-500 font-bold">
                <th className="px-5 py-3 text-left">{agrupacion === 'dia' ? 'Fecha' : agrupacion === 'metodo' ? 'Método' : 'Cliente'}</th>
                <th className="px-5 py-3 text-center">Ventas</th>
                <th className="px-5 py-3 text-right">Total</th>
                <th className="px-5 py-3 text-right">% del período</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {agrupacion === 'dia' && Object.entries(porDia).sort((a,b) => a[0].localeCompare(b[0])).map(([dia, d]) => (
                <tr key={dia} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-800">{fmtF(dia)}</td>
                  <td className="px-5 py-3 text-center text-slate-500">{d.count}</td>
                  <td className="px-5 py-3 text-right font-bold font-mono">{fmt$(d.total)}</td>
                  <td className="px-5 py-3 text-right text-slate-400">{totalVentas > 0 ? ((d.total / totalVentas) * 100).toFixed(1) : 0}%</td>
                </tr>
              ))}
              {agrupacion === 'metodo' && Object.entries(porMetodo).sort((a,b) => b[1].total - a[1].total).map(([k, d]) => (
                <tr key={k} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-800">{d.label}</td>
                  <td className="px-5 py-3 text-center text-slate-500">{d.count}</td>
                  <td className="px-5 py-3 text-right font-bold font-mono">{fmt$(d.total)}</td>
                  <td className="px-5 py-3 text-right text-slate-400">{totalVentas > 0 ? ((d.total / totalVentas) * 100).toFixed(1) : 0}%</td>
                </tr>
              ))}
              {agrupacion === 'cliente' && Object.entries(porCliente).sort((a,b) => b[1].total - a[1].total).map(([nombre, d]) => (
                <tr key={nombre} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-800">{nombre}</td>
                  <td className="px-5 py-3 text-center text-slate-500">{d.count}</td>
                  <td className="px-5 py-3 text-right font-bold font-mono">{fmt$(d.total)}</td>
                  <td className="px-5 py-3 text-right text-slate-400">{totalVentas > 0 ? ((d.total / totalVentas) * 100).toFixed(1) : 0}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-300 bg-slate-50">
              <tr>
                <td className="px-5 py-3 font-black uppercase text-xs text-slate-500">Total</td>
                <td className="px-5 py-3 text-center font-black">{ventasFiltradas.length}</td>
                <td className="px-5 py-3 text-right font-black font-mono text-indigo-700">{fmt$(totalVentas)}</td>
                <td className="px-5 py-3 text-right font-black">100%</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Detalle de todas las ventas */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-slate-900 text-white px-5 py-3">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Detalle de ventas</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-xs uppercase text-slate-500 font-bold">
                <th className="px-4 py-3 text-left">Folio</th>
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left">Cliente</th>
                <th className="px-4 py-3 text-left">Método</th>
                <th className="px-4 py-3 text-right">Subtotal</th>
                <th className="px-4 py-3 text-right">IVA</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ventasFiltradas.map(v => (
                <tr key={v.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-mono font-bold text-indigo-600">#{String(v.folio).padStart(5,'0')}</td>
                  <td className="px-4 py-2.5 text-slate-500">{fmtF(v.fechaVenta)}</td>
                  <td className="px-4 py-2.5 text-slate-700">{v.cliente?.nombre ?? 'Mostrador'}</td>
                  <td className="px-4 py-2.5"><span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-[10px] font-bold">{METODO_LABEL[v.metodoPago] ?? v.metodoPago}</span></td>
                  <td className="px-4 py-2.5 text-right font-mono">{fmt$(Number(v.subtotal))}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-400">{fmt$(Number(v.impuestoTotal))}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold">{fmt$(Number(v.total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <style>{`@media print { @page{margin:10mm} .print\\:hidden{display:none!important} }`}</style>
    </div>
  );
}
