"use client";
import { useState, useEffect, useCallback } from 'react';
import {
  Receipt, Calendar, RefreshCw, Printer, CheckCircle2,
  AlertCircle, TrendingUp, TrendingDown, Minus, Info,
  ChevronDown, ChevronUp, FileText
} from 'lucide-react';

interface IMovimiento {
  numeroCuenta: string; nombre: string;
  cargo: number; abono: number;
  referencia: string; fecha: string;
  folio: string; concepto: string;
}
interface IDeclaracion {
  periodo: { desde: string | null; hasta: string | null };
  ivaTrasladadoTotal: number;
  ivaAcreditableTotal: number;
  ivaAPagar: number;
  saldoAFavor: number;
  detalleTrasladado: IMovimiento[];
  detalleAcreditable: IMovimiento[];
}

const HOY  = new Date();
const fmt$ = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0);
const fmtFecha = (s: string) =>
  new Date(s + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function primerDia(y: number, m: number) {
  return `${y}-${String(m+1).padStart(2,'0')}-01`;
}
function ultimoDia(y: number, m: number) {
  return new Date(y, m+1, 0).toISOString().split('T')[0];
}

export default function DeclaracionIVAPage() {
  const [datos, setDatos]         = useState<IDeclaracion | null>(null);
  const [cargando, setCargando]   = useState(false);
  const [mes, setMes]             = useState(HOY.getMonth());
  const [anio, setAnio]           = useState(HOY.getFullYear());
  const [modoRango, setModoRango] = useState(false);
  const [desde, setDesde]         = useState(primerDia(HOY.getFullYear(), HOY.getMonth()));
  const [hasta, setHasta]         = useState(ultimoDia(HOY.getFullYear(), HOY.getMonth()));
  const [detalleOpen, setDetalleOpen] = useState<'trasladado'|'acreditable'|null>(null);

  const api = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:4000/api');
  const tok = () => localStorage.getItem('syncro_token') ?? '';

  const cargar = useCallback(async () => {
    setCargando(true);
    const d = modoRango ? desde : primerDia(anio, mes);
    const h = modoRango ? hasta : ultimoDia(anio, mes);
    const params = new URLSearchParams({ fechaDesde: d, fechaHasta: h });
    const res = await fetch(`${api}/finanzas/polizas/iva?${params}`, {
      headers: { Authorization: `Bearer ${tok()}` },
    });
    if (res.ok) setDatos(await res.json());
    setCargando(false);
  }, [mes, anio, modoRango, desde, hasta]);

  useEffect(() => { cargar(); }, [cargar]);

  const periodoLabel = modoRango
    ? `${desde} al ${hasta}`
    : `${MESES[mes]} ${anio}`;

  const anios = Array.from({ length: 5 }, (_, i) => HOY.getFullYear() - i);

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-500 mb-1">Finanzas</p>
          <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
            <Receipt className="w-8 h-8 text-indigo-500"/> Declaración de IVA
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Cálculo mensual del IVA para presentar ante el SAT.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 text-sm font-medium hover:bg-slate-50 shadow-sm print:hidden">
            <Printer className="w-4 h-4"/> Imprimir
          </button>
          <button onClick={cargar}
            className="p-2 bg-white border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 shadow-sm print:hidden">
            <RefreshCw className="w-4 h-4"/>
          </button>
        </div>
      </div>

      {/* Filtros de período */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-6 print:hidden">
        <div className="flex items-center gap-3 mb-4">
          <Calendar className="w-4 h-4 text-indigo-400"/>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Período de declaración</span>
          <button onClick={() => setModoRango(!modoRango)}
            className="ml-auto text-xs text-indigo-600 font-semibold hover:underline">
            {modoRango ? 'Cambiar a mes' : 'Rango personalizado'}
          </button>
        </div>

        {!modoRango ? (
          <div className="flex flex-wrap gap-3">
            <select value={mes} onChange={e => setMes(Number(e.target.value))}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select value={anio} onChange={e => setAnio(Number(e.target.value))}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {anios.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            {/* Accesos rápidos */}
            <div className="flex gap-2 flex-wrap">
              {[-2,-1,0].map(delta => {
                const d = new Date(HOY.getFullYear(), HOY.getMonth() + delta);
                return (
                  <button key={delta}
                    onClick={() => { setMes(d.getMonth()); setAnio(d.getFullYear()); }}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                      mes === d.getMonth() && anio === d.getFullYear()
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'
                    }`}>
                    {MESES[d.getMonth()].slice(0,3)} {d.getFullYear()}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Desde</label>
              <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Hasta</label>
              <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
            </div>
          </div>
        )}
      </div>

      {cargando ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
          <p className="text-slate-400 text-sm">Calculando IVA...</p>
        </div>
      ) : datos && (
        <>
          {/* Resultado principal */}
          <div className={`rounded-2xl border-2 p-6 mb-6 ${
            datos.ivaAPagar > 0
              ? 'bg-rose-50 border-rose-300'
              : datos.saldoAFavor > 0
              ? 'bg-emerald-50 border-emerald-300'
              : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="text-center mb-6">
              <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">
                {periodoLabel}
              </p>
              {datos.ivaAPagar > 0 ? (
                <>
                  <div className="flex items-center justify-center gap-3 mb-2">
                    <AlertCircle className="w-8 h-8 text-rose-500"/>
                    <p className="text-4xl font-black text-rose-700">{fmt$(datos.ivaAPagar)}</p>
                  </div>
                  <p className="text-rose-600 font-semibold">IVA a pagar al SAT</p>
                </>
              ) : datos.saldoAFavor > 0 ? (
                <>
                  <div className="flex items-center justify-center gap-3 mb-2">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500"/>
                    <p className="text-4xl font-black text-emerald-700">{fmt$(datos.saldoAFavor)}</p>
                  </div>
                  <p className="text-emerald-600 font-semibold">Saldo a favor (IVA pagado mayor al cobrado)</p>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-center gap-3 mb-2">
                    <Minus className="w-8 h-8 text-slate-400"/>
                    <p className="text-4xl font-black text-slate-600">$0.00</p>
                  </div>
                  <p className="text-slate-500 font-semibold">Sin movimientos de IVA en el período</p>
                </>
              )}
            </div>

            {/* Ecuación */}
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-white rounded-xl p-4 border border-slate-200">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <TrendingUp className="w-4 h-4 text-rose-500"/>
                  <p className="text-xs font-bold uppercase text-slate-500">IVA Trasladado</p>
                </div>
                <p className="text-xl font-black text-rose-600">{fmt$(datos.ivaTrasladadoTotal)}</p>
                <p className="text-[10px] text-slate-400 mt-1">Cobrado a clientes (208-01)</p>
              </div>
              <div className="flex items-center justify-center">
                <div className="text-center">
                  <span className="text-3xl font-black text-slate-400">−</span>
                </div>
              </div>
              <div className="bg-white rounded-xl p-4 border border-slate-200">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <TrendingDown className="w-4 h-4 text-emerald-500"/>
                  <p className="text-xs font-bold uppercase text-slate-500">IVA Acreditable</p>
                </div>
                <p className="text-xl font-black text-emerald-600">{fmt$(datos.ivaAcreditableTotal)}</p>
                <p className="text-[10px] text-slate-400 mt-1">Pagado a proveedores (116-01)</p>
              </div>
            </div>
          </div>

          {/* Nota informativa SAT */}
          <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-sm text-blue-800">
            <Info className="w-5 h-5 shrink-0 mt-0.5 text-blue-500"/>
            <div>
              <p className="font-bold mb-1">¿Cómo se declara?</p>
              <p className="text-xs leading-relaxed">
                Este cálculo corresponde a la <strong>Declaración Mensual de IVA</strong> en el portal del SAT.
                El monto a pagar se registra en la línea <strong>"IVA cargo del período"</strong>.
                Si hay saldo a favor, puedes aplicarlo al siguiente mes o solicitar devolución.
                Presenta antes del día <strong>17 del mes siguiente</strong> al período declarado.
              </p>
            </div>
          </div>

          {/* Detalles por transacción */}
          {datos.detalleTrasladado.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-4">
              <button
                onClick={() => setDetalleOpen(detalleOpen === 'trasladado' ? null : 'trasladado')}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-rose-500"/>
                  <span className="font-bold text-slate-800">IVA Trasladado — detalle</span>
                  <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                    {datos.detalleTrasladado.length} movimientos
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-black text-rose-600">{fmt$(datos.ivaTrasladadoTotal)}</span>
                  {detalleOpen === 'trasladado' ? <ChevronUp className="w-4 h-4 text-slate-400"/> : <ChevronDown className="w-4 h-4 text-slate-400"/>}
                </div>
              </button>
              {detalleOpen === 'trasladado' && (
                <div className="border-t border-slate-100 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-2.5 text-left font-bold text-slate-500 uppercase">Fecha</th>
                        <th className="px-4 py-2.5 text-left font-bold text-slate-500 uppercase">Póliza</th>
                        <th className="px-4 py-2.5 text-left font-bold text-slate-500 uppercase">Concepto</th>
                        <th className="px-4 py-2.5 text-right font-bold text-slate-500 uppercase">IVA</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {datos.detalleTrasladado.map((m, i) => (
                        <tr key={i} className="hover:bg-rose-50/40 transition-colors">
                          <td className="px-4 py-2.5 text-slate-500 font-mono">{fmtFecha(m.fecha)}</td>
                          <td className="px-4 py-2.5 font-mono text-indigo-600 font-bold">{m.folio}</td>
                          <td className="px-4 py-2.5 text-slate-600 max-w-[200px] truncate">{m.concepto}</td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-rose-600">{fmt$(Number(m.abono))}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-rose-50 border-t-2 border-rose-200">
                      <tr>
                        <td colSpan={3} className="px-4 py-2.5 text-right text-xs font-black text-rose-700 uppercase">Total IVA Trasladado</td>
                        <td className="px-4 py-2.5 text-right font-black text-rose-700">{fmt$(datos.ivaTrasladadoTotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {datos.detalleAcreditable.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-4">
              <button
                onClick={() => setDetalleOpen(detalleOpen === 'acreditable' ? null : 'acreditable')}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-emerald-500"/>
                  <span className="font-bold text-slate-800">IVA Acreditable — detalle</span>
                  <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                    {datos.detalleAcreditable.length} movimientos
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-black text-emerald-600">{fmt$(datos.ivaAcreditableTotal)}</span>
                  {detalleOpen === 'acreditable' ? <ChevronUp className="w-4 h-4 text-slate-400"/> : <ChevronDown className="w-4 h-4 text-slate-400"/>}
                </div>
              </button>
              {detalleOpen === 'acreditable' && (
                <div className="border-t border-slate-100 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-2.5 text-left font-bold text-slate-500 uppercase">Fecha</th>
                        <th className="px-4 py-2.5 text-left font-bold text-slate-500 uppercase">Póliza</th>
                        <th className="px-4 py-2.5 text-left font-bold text-slate-500 uppercase">Concepto</th>
                        <th className="px-4 py-2.5 text-right font-bold text-slate-500 uppercase">IVA Pagado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {datos.detalleAcreditable.map((m, i) => (
                        <tr key={i} className="hover:bg-emerald-50/40 transition-colors">
                          <td className="px-4 py-2.5 text-slate-500 font-mono">{fmtFecha(m.fecha)}</td>
                          <td className="px-4 py-2.5 font-mono text-indigo-600 font-bold">{m.folio}</td>
                          <td className="px-4 py-2.5 text-slate-600 max-w-[200px] truncate">{m.concepto}</td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-600">{fmt$(Number(m.cargo))}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-emerald-50 border-t-2 border-emerald-200">
                      <tr>
                        <td colSpan={3} className="px-4 py-2.5 text-right text-xs font-black text-emerald-700 uppercase">Total IVA Acreditable</td>
                        <td className="px-4 py-2.5 text-right font-black text-emerald-700">{fmt$(datos.ivaAcreditableTotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Footer impresión */}
          <div className="text-center text-xs text-slate-400 mt-6">
            Syncro ERP — Declaración de IVA {periodoLabel} — Generado {new Date().toLocaleString('es-MX')}
          </div>
        </>
      )}
    </div>
  );
}
