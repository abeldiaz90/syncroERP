"use client";
import { useState, useEffect, useCallback } from 'react';
import { fechaCorta } from '@/lib/fechas';
import { Search, CheckCircle2, AlertCircle, Calendar, X, Printer } from 'lucide-react';

interface IBalanza {
  id: string; numeroCuenta: string; nombre: string;
  cargos: number; abonos: number; saldoFinal: number;
}

const TIPO_BADGE: Record<string, string> = {
  '1': 'bg-blue-50 text-blue-700',
  '2': 'bg-rose-50 text-rose-700',
  '3': 'bg-purple-50 text-purple-700',
  '4': 'bg-emerald-50 text-emerald-700',
  '5': 'bg-amber-50 text-amber-700',
  '6': 'bg-slate-100 text-slate-600',
};
const TIPO_LABEL: Record<string, string> = {
  '1':'Activo','2':'Pasivo','3':'Capital','4':'Ingreso','5':'Costo','6':'Gasto'
};

const HOY = new Date();
const fmt  = (d: Date) => d.toISOString().split('T')[0];
const fmtLabel = (s: string) => s ? fechaCorta(s) : '';
const primerDiaMes = fmt(new Date(HOY.getFullYear(), HOY.getMonth(), 1));
const ultimoDiaMes = fmt(new Date(HOY.getFullYear(), HOY.getMonth() + 1, 0));
const RANGOS = [
  { label: 'Este mes',     desde: primerDiaMes, hasta: ultimoDiaMes },
  { label: 'Mes anterior', desde: fmt(new Date(HOY.getFullYear(), HOY.getMonth()-1, 1)), hasta: fmt(new Date(HOY.getFullYear(), HOY.getMonth(), 0)) },
  { label: 'Este año',     desde: fmt(new Date(HOY.getFullYear(), 0, 1)), hasta: fmt(new Date(HOY.getFullYear(), 11, 31)) },
  { label: 'Histórico',    desde: '', hasta: '' },
];
const fmt$ = (n: number) => new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(n);

export default function BalanzaComprobacionPage() {
  const [cuentas, setCuentas]         = useState<IBalanza[]>([]);
  const [cargando, setCargando]       = useState(true);
  const [busqueda, setBusqueda]       = useState('');
  const [fechaDesde, setFechaDesde]   = useState(primerDiaMes);
  const [fechaHasta, setFechaHasta]   = useState(ultimoDiaMes);
  const [rangoActivo, setRangoActivo] = useState('Este mes');
  /*
    Una balanza vacía cuadra sola: cero cargos contra cero abonos. Como la
    consulta se hacía con `if (res.ok)` y sin `else`, cualquier fallo —un 403,
    el backend reiniciándose— dejaba la lista vacía y la pantalla anunciaba
    «Cuadrada» en verde. Es la peor forma posible de este defecto: el reporte
    que un contador abre para comprobar que todo está bien le contesta que sí
    justo cuando no ha podido preguntarlo.
  */
  const [error, setError] = useState('');

  const api = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:4000/api');

  const fetchBalanza = useCallback(async (desde = fechaDesde, hasta = fechaHasta) => {
    setCargando(true);
    const token = localStorage.getItem('syncro_token');
    const params = new URLSearchParams();
    if (desde) params.set('fechaDesde', desde);
    if (hasta) params.set('fechaHasta', hasta);
    try {
      const res = await fetch(`${api}/finanzas/polizas/balanza?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setCuentas(await res.json());
        setError('');
      } else {
        setCuentas([]);
        setError(res.status === 403
          ? 'Tu perfil no incluye la consulta de la balanza.'
          : 'No se pudo consultar la balanza. Los importes de esta pantalla no son válidos.');
      }
    } catch {
      setCuentas([]);
      setError('No hay conexión con el servidor. Los importes de esta pantalla no son válidos.');
    } finally { setCargando(false); }
  }, [api]);

  useEffect(() => { fetchBalanza(); }, []);

  const aplicarRango = (r: typeof RANGOS[0]) => {
    setRangoActivo(r.label);
    setFechaDesde(r.desde);
    setFechaHasta(r.hasta);
    fetchBalanza(r.desde, r.hasta);
  };

  const filtradas   = cuentas.filter(c =>
    !busqueda || c.nombre.toLowerCase().includes(busqueda.toLowerCase()) || c.numeroCuenta.includes(busqueda)
  );
  const totalCargos = filtradas.reduce((s,c) => s + c.cargos, 0);
  const totalAbonos = filtradas.reduce((s,c) => s + c.abonos, 0);
  const cuadrada    = Math.abs(totalCargos - totalAbonos) < 0.01;

  /*
   * Agrupar por TIPO y no por el primer dígito: con los dígitos 1 a 6 el
   * resumen se dejaba fuera las cuentas 7xx —resultados financieros del
   * catálogo SAT—, así que la balanza cuadraba arriba y el resumen no sumaba
   * lo mismo, sin decir de qué renglones se había olvidado.
   */
  const grupos = ['ACTIVO','PASIVO','CAPITAL','INGRESO','COSTO','GASTO'].map(t => ({
    digito: t,
    cuentas: filtradas.filter(c => ((c as any).tipo ?? '') === t),
  })).filter(g => g.cuentas.length > 0);

  const periodoLabel = rangoActivo === 'Histórico' ? 'Histórico completo'
    : `${fmtLabel(fechaDesde)} — ${fmtLabel(fechaHasta)}`;

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto text-slate-800">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-500 mb-1">Reporte Financiero</p>
          <h1 className="text-3xl font-black text-slate-900">Balanza de Comprobación</h1>
          <p className="text-slate-500 text-sm mt-1">{periodoLabel}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border font-semibold text-sm ${
            error ? 'bg-slate-100 border-slate-300 text-slate-600'
              : cuadrada ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-rose-50 border-rose-200 text-rose-700'
          }`}>
            {error
              ? <><AlertCircle className="w-4 h-4" /> Sin datos</>
              : cuadrada
              ? <><CheckCircle2 className="w-4 h-4" /> Cuadrada</>
              : <><AlertCircle className="w-4 h-4" /> Descuadrada</>
            }
          </div>
          <button onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 shadow-sm">
            <Printer className="w-4 h-4" /> Imprimir
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4 text-indigo-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Período</span>
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          {RANGOS.map(r => (
            <button key={r.label} onClick={() => aplicarRango(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                rangoActivo === r.label
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-indigo-300'
              }`}>{r.label}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Desde</label>
            <input type="date" value={fechaDesde}
              onChange={e => { setFechaDesde(e.target.value); setRangoActivo('Personalizado'); }}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Hasta</label>
            <input type="date" value={fechaHasta}
              onChange={e => { setFechaHasta(e.target.value); setRangoActivo('Personalizado'); }}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <button onClick={() => { setRangoActivo('Personalizado'); fetchBalanza(fechaDesde, fechaHasta); }}
            className="px-4 py-1.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
            Aplicar
          </button>
          {rangoActivo === 'Personalizado' && (
            <button onClick={() => aplicarRango(RANGOS[0])} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
              <X className="w-3 h-3" /> Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Buscador */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input type="text" placeholder="Buscar por número o nombre de cuenta..." value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm" />
      </div>

      {cargando ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-20 text-center">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Calculando balanza...</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

          {/* Cabecera documento */}
          <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">SyncroERP</p>
              <p className="font-black uppercase tracking-wide">Balanza de Comprobación</p>
            </div>
            <p className="text-sm text-slate-300">{periodoLabel}</p>
          </div>

          {/* Tabla por grupos */}
          {busqueda ? (
            // Vista plana cuando hay búsqueda
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100 text-xs uppercase tracking-wider font-bold text-slate-500">
                  <th className="px-5 py-2.5 text-left">Cuenta</th>
                  <th className="px-5 py-2.5 text-left">Nombre</th>
                  <th className="px-5 py-2.5 text-right">Debe</th>
                  <th className="px-5 py-2.5 text-right">Haber</th>
                  <th className="px-5 py-2.5 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtradas.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-5 py-2.5 font-mono font-bold text-indigo-600">{c.numeroCuenta}</td>
                    <td className="px-5 py-2.5 text-slate-700">{c.nombre}</td>
                    <td className="px-5 py-2.5 text-right font-mono text-slate-600">{c.cargos > 0 ? fmt$(c.cargos) : '—'}</td>
                    <td className="px-5 py-2.5 text-right font-mono text-slate-600">{c.abonos > 0 ? fmt$(c.abonos) : '—'}</td>
                    <td className={`px-5 py-2.5 text-right font-mono font-bold ${c.saldoFinal > 0 ? 'text-indigo-700' : c.saldoFinal < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                      {fmt$(c.saldoFinal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            // Vista agrupada por tipo de cuenta
            <div>
              {grupos.map(g => {
                const totalG_cargos = g.cuentas.reduce((s,c) => s+c.cargos, 0);
                const totalG_abonos = g.cuentas.reduce((s,c) => s+c.abonos, 0);
                const totalG_saldo  = g.cuentas.reduce((s,c) => s+c.saldoFinal, 0);
                return (
                  <div key={g.digito}>
                    {/* Encabezado grupo */}
                    <div className={`flex items-center justify-between px-5 py-2 border-y border-slate-200 ${TIPO_BADGE[g.digito]} bg-opacity-30`}>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${TIPO_BADGE[g.digito]}`}>
                          {g.digito}
                        </span>
                        <span className="text-xs font-black uppercase tracking-widest">{TIPO_LABEL[g.digito]}</span>
                        <span className="text-xs text-slate-500">({g.cuentas.length} cuenta{g.cuentas.length>1?'s':''})</span>
                      </div>
                    </div>
                    {/* Filas de cuentas */}
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-slate-50">
                        {g.cuentas.map(c => (
                          <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                            <td className="pl-8 pr-4 py-2.5 font-mono text-xs text-indigo-500 w-20">{c.numeroCuenta}</td>
                            <td className="px-4 py-2.5 text-slate-700 flex-1">{c.nombre}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-slate-500 w-36">
                              {c.cargos > 0 ? fmt$(c.cargos) : <span className="text-slate-200">—</span>}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-slate-500 w-36">
                              {c.abonos > 0 ? fmt$(c.abonos) : <span className="text-slate-200">—</span>}
                            </td>
                            <td className={`px-5 py-2.5 text-right font-mono font-semibold w-36 ${
                              c.saldoFinal > 0 ? 'text-indigo-700' : c.saldoFinal < 0 ? 'text-rose-600' : 'text-slate-300'
                            }`}>{fmt$(c.saldoFinal)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className={`text-xs font-bold border-t border-slate-200 ${TIPO_BADGE[g.digito]}`}>
                          <td colSpan={2} className="pl-8 pr-4 py-2 uppercase tracking-wider">
                            Subtotal {TIPO_LABEL[g.digito]}
                          </td>
                          <td className="px-4 py-2 text-right font-mono">{fmt$(totalG_cargos)}</td>
                          <td className="px-4 py-2 text-right font-mono">{fmt$(totalG_abonos)}</td>
                          <td className="px-5 py-2 text-right font-mono">{fmt$(totalG_saldo)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                );
              })}
            </div>
          )}

          {/* Totales finales */}
          <div className={`border-t-2 ${cuadrada ? 'border-emerald-500 bg-emerald-50' : 'border-rose-500 bg-rose-50'}`}>
            <div className="flex items-center px-5 py-4">
              <div className="flex-1">
                {cuadrada
                  ? <div className="flex items-center gap-2 text-emerald-700 font-black text-sm uppercase tracking-widest">
                      <CheckCircle2 className="w-4 h-4" /> Sumas Iguales — Contabilidad Cuadrada
                    </div>
                  : <div className="flex items-center gap-2 text-rose-700 font-black text-sm uppercase tracking-widest">
                      <AlertCircle className="w-4 h-4" /> Descuadrado — Diferencia: {fmt$(Math.abs(totalCargos - totalAbonos))}
                    </div>
                }
              </div>
              <div className="flex gap-8 text-right">
                <div>
                  <p className="text-[10px] font-bold uppercase text-slate-500 mb-0.5">Total Debe</p>
                  <p className="font-mono font-black text-slate-900">{fmt$(totalCargos)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase text-slate-500 mb-0.5">Total Haber</p>
                  <p className="font-mono font-black text-slate-900">{fmt$(totalAbonos)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-slate-100 px-6 py-3 bg-slate-50 flex justify-between">
            <p className="text-xs text-slate-400">SyncroERP — Generado automáticamente</p>
            <p className="text-xs text-slate-400">{new Date().toLocaleString('es-MX')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
