"use client";
import { useState, useEffect, useCallback } from 'react';
import { fechaLarga } from '@/lib/fechas';
import { Calendar, X, Printer, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface ICuenta { id: string; numeroCuenta: string; nombre: string; tipo?: string; naturaleza?: string; cargos?: number; abonos?: number; saldoFinal: number; }

const HOY = new Date();
const fmt  = (d: Date) => d.toISOString().split('T')[0];
const fmtLabel = (s: string) => s ? fechaLarga(s) : '';

const primerDiaMes = fmt(new Date(HOY.getFullYear(), HOY.getMonth(), 1));
const ultimoDiaMes = fmt(new Date(HOY.getFullYear(), HOY.getMonth() + 1, 0));

const RANGOS = [
  { label: 'Este mes',           desde: primerDiaMes, hasta: ultimoDiaMes },
  { label: 'Mes anterior',       desde: fmt(new Date(HOY.getFullYear(), HOY.getMonth()-1, 1)), hasta: fmt(new Date(HOY.getFullYear(), HOY.getMonth(), 0)) },
  { label: 'Este año',           desde: fmt(new Date(HOY.getFullYear(), 0, 1)), hasta: fmt(new Date(HOY.getFullYear(), 11, 31)) },
  { label: 'Histórico',          desde: '', hasta: '' },
];

const fmt$ = (n: number, abs = false) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(abs ? Math.abs(n) : n);

export default function EstadoResultadosPage() {
  const [cuentas, setCuentas]         = useState<ICuenta[]>([]);
  const [cargando, setCargando]       = useState(true);
  const [fechaDesde, setFechaDesde]   = useState(primerDiaMes);
  const [fechaHasta, setFechaHasta]   = useState(ultimoDiaMes);
  const [rangoActivo, setRangoActivo] = useState('Este mes');
  /*
    Un reporte financiero vacío parece un reporte en orden: todo en cero y la
    identidad contable cuadrando sola. La consulta se hacía con `if (res.ok)` y
    sin `else`, así que cualquier fallo se presentaba como un periodo sin
    movimientos. Ahora se dice que no se pudo preguntar.
  */
  const [error, setError] = useState('');

  const api = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:4000/api');

  const fetchDatos = useCallback(async (desde = fechaDesde, hasta = fechaHasta) => {
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
          ? 'Tu perfil no incluye la consulta de el estado de resultados.'
          : 'No se pudo consultar el estado de resultados. Los importes de esta pantalla no son válidos.');
      }
    } catch {
      setCuentas([]);
      setError('No hay conexión con el servidor. Los importes de esta pantalla no son válidos.');
    } finally { setCargando(false); }
  }, [api]);

  useEffect(() => { fetchDatos(); }, []);

  const aplicarRango = (r: typeof RANGOS[0]) => {
    setRangoActivo(r.label);
    setFechaDesde(r.desde);
    setFechaHasta(r.hasta);
    fetchDatos(r.desde, r.hasta);
  };

  /*
   * ══════════════════════════════════════════════════════════════════════════
   * Por TIPO de cuenta, no por el primer dígito del número
   * --------------------------------------------------------------------------
   * `startsWith('4')`, `('5')` y `('6')` dejaban fuera del estado de resultados
   * las cuatro familias de resultados financieros del catálogo SAT —701 gastos
   * financieros, 702 productos financieros, 703 otros gastos, 704 otros
   * productos—, que empiezan por 7. Un intereses a favor, una pérdida
   * cambiaria o una utilidad en venta de activo fijo no aparecían por ningún
   * lado, y la utilidad neta estaba mal sin avisar.
   *
   * Y dentro de cada grupo, una cuenta con naturaleza contraria a la del grupo
   * —una devolución sobre ventas, que es de ingresos pero deudora— resta en
   * vez de sumar.
   * ══════════════════════════════════════════════════════════════════════════
   */
  const natural: Record<string, string> = {
    INGRESO: 'ACREEDORA', COSTO: 'DEUDORA', GASTO: 'DEUDORA',
    ACTIVO: 'DEUDORA', PASIVO: 'ACREEDORA', CAPITAL: 'ACREEDORA',
  };
  const aporte = (c: any) =>
    (c.naturaleza ?? natural[c.tipo ?? ''] ?? 'DEUDORA') === natural[c.tipo ?? '']
      ? c.saldoFinal
      : -c.saldoFinal;
  const sumar = (lista: any[]) =>
    Math.round(lista.reduce((s, c) => s + aporte(c), 0) * 100) / 100;

  /*
   * Y sólo las cuentas CON MOVIMIENTO. El catálogo SAT tiene más de mil
   * cuentas; el estado de resultados imprimía las ~600 de resultados, una por
   * renglón, casi todas en $0.00. Un reporte donde hay que buscar los cinco
   * renglones que dicen algo entre seiscientos que no dicen nada no se lee: se
   * hojea. El balance general ya filtraba así.
   */
  const conMovimiento = (t: string) =>
    cuentas.filter(c => (c as any).tipo === t && (c.saldoFinal !== 0 || (c.cargos ?? 0) !== 0 || (c.abonos ?? 0) !== 0));
  const ingresos   = conMovimiento('INGRESO');
  const costos     = conMovimiento('COSTO');
  const gastos     = conMovimiento('GASTO');
  const totalIng   = sumar(ingresos);
  const totalCosto = sumar(costos);
  const utilBruta  = Math.round((totalIng - totalCosto) * 100) / 100;
  const totalGasto = sumar(gastos);
  const utilNeta   = utilBruta - totalGasto;
  const margen     = totalIng > 0 ? (utilNeta / totalIng) * 100 : 0;

  const periodoLabel = rangoActivo === 'Histórico'
    ? 'Histórico completo'
    : `Del ${fmtLabel(fechaDesde)} al ${fmtLabel(fechaHasta)}`;

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto text-slate-800">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-500 mb-1">Reporte Financiero</p>
          <h1 className="text-3xl font-black text-slate-900">Estado de Resultados</h1>
          <p className="text-slate-500 text-sm mt-1">{periodoLabel}</p>
        </div>
        <button onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 shadow-sm transition-colors">
          <Printer className="w-4 h-4" /> Imprimir
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-8">
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
              }`}>{r.label}
            </button>
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
          <button onClick={() => { setRangoActivo('Personalizado'); fetchDatos(fechaDesde, fechaHasta); }}
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

      {cargando ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-20 text-center">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Calculando estado de resultados...</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

          {/* Cabecera del documento */}
          <div className="bg-slate-900 text-white px-8 py-6 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">SyncroERP</p>
            <p className="text-xl font-black uppercase tracking-wider">Estado de Resultados</p>
            <p className="text-sm text-slate-300 mt-1">{periodoLabel}</p>
          </div>

          <div className="px-8 py-6 space-y-0">

            {/* ── INGRESOS ── */}
            <div className="border-b-2 border-slate-800 pb-1 mb-3 flex justify-between items-baseline">
              <span className="text-xs font-black uppercase tracking-widest text-slate-500">Ingresos</span>
            </div>
            {ingresos.length === 0
              ? <p className="text-sm text-slate-400 italic mb-4">Sin ingresos en el período</p>
              : <div className="mb-4 space-y-1.5">
                  {ingresos.map(c => (
                    <div key={c.id} className="flex justify-between text-sm">
                      <span className="text-slate-500">
                        <span className="font-mono text-xs text-slate-400 mr-3">{c.numeroCuenta}</span>
                        {c.nombre}
                      </span>
                      <span className="font-mono text-slate-800">{fmt$(aporte(c))}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-bold pt-2 border-t border-slate-200 mt-2">
                    <span className="text-slate-700 flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> Total Ingresos
                    </span>
                    <span className="font-mono text-emerald-700">{fmt$(totalIng)}</span>
                  </div>
                </div>
            }

            {/* ── COSTO DE VENTAS ── */}
            <div className="border-b-2 border-slate-800 pb-1 mb-3 flex justify-between items-baseline mt-6">
              <span className="text-xs font-black uppercase tracking-widest text-slate-500">Costo de Ventas</span>
            </div>
            {costos.length === 0
              ? <p className="text-sm text-slate-400 italic mb-4">Sin costos en el período</p>
              : <div className="mb-4 space-y-1.5">
                  {costos.map(c => (
                    <div key={c.id} className="flex justify-between text-sm">
                      <span className="text-slate-500">
                        <span className="font-mono text-xs text-slate-400 mr-3">{c.numeroCuenta}</span>
                        {c.nombre}
                      </span>
                      <span className="font-mono text-slate-800">({fmt$(aporte(c), true)})</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-bold pt-2 border-t border-slate-200 mt-2">
                    <span className="text-slate-700 flex items-center gap-1.5">
                      <TrendingDown className="w-3.5 h-3.5 text-rose-500" /> Total Costo de Ventas
                    </span>
                    <span className="font-mono text-rose-700">({fmt$(totalCosto, true)})</span>
                  </div>
                </div>
            }

            {/* ── UTILIDAD BRUTA ── */}
            <div className={`flex justify-between items-center px-4 py-3 rounded-lg my-4 border-l-4 ${
              utilBruta >= 0 ? 'bg-emerald-50 border-emerald-500' : 'bg-rose-50 border-rose-500'
            }`}>
              <span className="text-sm font-black text-slate-800 uppercase tracking-wide">Utilidad Bruta</span>
              <span className={`font-mono font-black text-base ${utilBruta >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {fmt$(utilBruta)}
              </span>
            </div>

            {/* ── GASTOS OPERATIVOS ── */}
            <div className="border-b-2 border-slate-800 pb-1 mb-3 flex justify-between items-baseline mt-6">
              <span className="text-xs font-black uppercase tracking-widest text-slate-500">Gastos Operativos</span>
            </div>
            {gastos.length === 0
              ? <p className="text-sm text-slate-400 italic mb-4">Sin gastos en el período</p>
              : <div className="mb-4 space-y-1.5">
                  {gastos.map(c => (
                    <div key={c.id} className="flex justify-between text-sm">
                      <span className="text-slate-500">
                        <span className="font-mono text-xs text-slate-400 mr-3">{c.numeroCuenta}</span>
                        {c.nombre}
                      </span>
                      <span className="font-mono text-slate-800">({fmt$(aporte(c), true)})</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-bold pt-2 border-t border-slate-200 mt-2">
                    <span className="text-slate-700 flex items-center gap-1.5">
                      <Minus className="w-3.5 h-3.5 text-amber-500" /> Total Gastos
                    </span>
                    <span className="font-mono text-amber-700">({fmt$(totalGasto, true)})</span>
                  </div>
                </div>
            }

            {/* ── UTILIDAD NETA ── */}
            <div className={`flex justify-between items-center px-5 py-4 rounded-xl mt-6 ${
              utilNeta >= 0 ? 'bg-indigo-600' : 'bg-rose-600'
            } text-white`}>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest opacity-70 mb-0.5">Resultado del Período</p>
                <p className="font-black text-base uppercase tracking-wide">Utilidad Neta del Ejercicio</p>
              </div>
              <div className="text-right">
                <p className="font-mono font-black text-2xl">{fmt$(utilNeta)}</p>
                <p className="text-xs opacity-70 mt-0.5">Margen {margen.toFixed(1)}%</p>
              </div>
            </div>

          </div>

          {/* Footer del documento */}
          <div className="border-t border-slate-100 px-8 py-4 bg-slate-50 flex justify-between items-center">
            <p className="text-xs text-slate-400">Generado automáticamente por SyncroERP</p>
            <p className="text-xs text-slate-400">{new Date().toLocaleString('es-MX')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
