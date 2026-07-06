"use client";
import { useState, useEffect, useCallback } from 'react';
import { Receipt, RefreshCw, DollarSign } from 'lucide-react';
import { ExportBar } from '../../../components/export-bar';

const fmt$ = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0);
const HOY  = new Date().toISOString().split('T')[0];

const COLUMNAS_CAJA = [
  { key: 'folio',          label: 'Folio',   fmt: (v: number) => '#' + String(v).padStart(5,'0') },
  { key: 'fechaVenta',     label: 'Fecha',   fmt: (v: string) => new Date(v).toLocaleDateString('es-MX') },
  { key: 'cliente.nombre', label: 'Cliente'  },
  { key: 'metodoPago',     label: 'Método'   },
  { key: 'total',          label: 'Total',   fmt: (v: number) => '$' + Number(v).toFixed(2) },
];

export default function CorteCajaPage() {
  const [ventas, setVentas]   = useState<any[]>([]);
  const [pagos, setPagos]     = useState<any[]>([]);
  const [fecha, setFecha]     = useState(HOY);
  const [cargando, setCargando] = useState(false);

  const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
  const tok = () => localStorage.getItem('syncro_token') ?? '';
  const h   = () => ({ Authorization: `Bearer ${tok()}` });

  const cargar = useCallback(async () => {
    setCargando(true);
    const [rv, rp] = await Promise.all([
      fetch(`${api}/ventas?fechaDesde=${fecha}&fechaHasta=${fecha}&limite=500`, { headers: h() }),
      fetch(`${api}/credito/cobranza/pagos-del-dia?fecha=${fecha}`, { headers: h() }).catch(() => ({ ok: false })),
    ]);
    if (rv.ok) { const d = await rv.json(); setVentas(d.ventas ?? d); }
    if ((rp as any).ok) setPagos(await (rp as Response).json());
    else setPagos([]);
    setCargando(false);
  }, [fecha]);

  useEffect(() => { cargar(); }, [cargar]);

  // Filtrar solo ventas de contado (efectivo, tarjeta, SPEI)
  const METODOS_CONTADO = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'MSI_BANCO'];
  const ventasContado   = ventas.filter(v => v.estado !== 'ANULADA' && METODOS_CONTADO.includes(v.metodoPago));
  const ventasCredito   = ventas.filter(v => v.estado !== 'ANULADA' && !METODOS_CONTADO.includes(v.metodoPago));

  const totalEfectivo     = ventasContado.filter(v => v.metodoPago === 'EFECTIVO').reduce((s, v) => s + Number(v.total), 0);
  const totalTarjeta      = ventasContado.filter(v => ['TARJETA','MSI_BANCO'].includes(v.metodoPago)).reduce((s, v) => s + Number(v.total), 0);
  const totalTransferencia = ventasContado.filter(v => v.metodoPago === 'TRANSFERENCIA').reduce((s, v) => s + Number(v.total), 0);
  const totalCobranza     = pagos.reduce((s: number, p: any) => s + Number(p.montoPagado ?? 0), 0);
  const totalCredito      = ventasCredito.reduce((s, v) => s + Number(v.total), 0);
  const granTotal         = totalEfectivo + totalTarjeta + totalTransferencia + totalCobranza;

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-500 mb-1">Reportes</p>
          <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
            <Receipt className="w-8 h-8 text-indigo-500"/> Corte de Caja
          </h1>
        </div>
        <div className="flex gap-2">
          <ExportBar
            titulo={`Corte_Caja_${fecha}`}
            subtitulo={`Fecha: ${fecha}`}
            datos={ventas.filter(v => v.estado !== 'ANULADA')}
            columnas={COLUMNAS_CAJA}
          />
          <button onClick={cargar} className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 print:hidden">
            <RefreshCw className="w-4 h-4"/>
          </button>
        </div>
      </div>

      {/* Selector de fecha */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-5 flex gap-3 items-end print:hidden">
        <div>
          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Fecha del corte</label>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
        </div>
        <button onClick={() => setFecha(HOY)}
          className={`px-3 py-2.5 rounded-xl text-xs font-bold border ${fecha === HOY ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600'}`}>
          Hoy
        </button>
      </div>

      {cargando ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"/>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Header del corte */}
          <div className="bg-slate-900 text-white rounded-2xl p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Corte de Caja</p>
            <p className="text-2xl font-black">
              {new Date(fecha + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
            </p>
            <p className="text-sm text-slate-400 mt-1">Generado: {new Date().toLocaleTimeString('es-MX')}</p>
          </div>

          {/* Ingresos por método */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-emerald-900 text-white px-5 py-3">
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">Ingresos del día</p>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {[
                  { label: '💵 Efectivo', val: totalEfectivo, count: ventasContado.filter(v=>v.metodoPago==='EFECTIVO').length },
                  { label: '💳 Tarjeta / MSI', val: totalTarjeta, count: ventasContado.filter(v=>['TARJETA','MSI_BANCO'].includes(v.metodoPago)).length },
                  { label: '🏦 Transferencia SPEI', val: totalTransferencia, count: ventasContado.filter(v=>v.metodoPago==='TRANSFERENCIA').length },
                  { label: '🏦 Cobranza (abonos)', val: totalCobranza, count: pagos.length },
                ].map(r => (
                  <tr key={r.label} className="hover:bg-slate-50">
                    <td className="px-5 py-3.5 font-medium text-slate-800">{r.label}</td>
                    <td className="px-5 py-3.5 text-center text-slate-400 text-xs">{r.count} movimientos</td>
                    <td className="px-5 py-3.5 text-right font-mono font-bold text-emerald-700">{fmt$(r.val)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-emerald-300 bg-emerald-50">
                <tr>
                  <td colSpan={2} className="px-5 py-4 font-black uppercase text-emerald-800">TOTAL COBRADO</td>
                  <td className="px-5 py-4 text-right font-black font-mono text-emerald-800 text-xl">{fmt$(granTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Créditos generados (no cobrado aún) */}
          {totalCredito > 0 && (
            <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
              <div className="bg-amber-900 text-white px-5 py-3">
                <p className="text-xs font-bold uppercase tracking-widest text-amber-300">Ventas a crédito (por cobrar)</p>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  <tr>
                    <td className="px-5 py-3.5 font-medium text-slate-800">💳 Créditos otorgados hoy</td>
                    <td className="px-5 py-3.5 text-center text-slate-400 text-xs">{ventasCredito.length} ventas</td>
                    <td className="px-5 py-3.5 text-right font-mono font-bold text-amber-700">{fmt$(totalCredito)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Resumen total */}
          <div className="bg-slate-900 text-white rounded-2xl p-5 flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Total ventas del día</p>
              <p className="text-xs text-slate-500 mt-1">{ventas.filter(v=>v.estado!=='ANULADA').length} transacciones</p>
            </div>
            <p className="text-3xl font-black text-white">{fmt$(granTotal + totalCredito)}</p>
          </div>

          {/* Detalle de ventas */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-3">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Detalle de ventas</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b">
                  <tr className="text-xs uppercase text-slate-500 font-bold">
                    <th className="px-4 py-3 text-left">Folio</th>
                    <th className="px-4 py-3 text-left">Cliente</th>
                    <th className="px-4 py-3 text-left">Método</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ventas.filter(v=>v.estado!=='ANULADA').map(v => (
                    <tr key={v.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-mono font-bold text-indigo-600">#{String(v.folio).padStart(5,'0')}</td>
                      <td className="px-4 py-2.5 text-slate-700">{v.cliente?.nombre ?? 'Mostrador'}</td>
                      <td className="px-4 py-2.5"><span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-[10px] font-bold">{v.metodoPago}</span></td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold">{fmt$(Number(v.total))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      <style>{`@media print { @page{margin:10mm;size:80mm auto} .print\\:hidden{display:none!important} }`}</style>
    </div>
  );
}
