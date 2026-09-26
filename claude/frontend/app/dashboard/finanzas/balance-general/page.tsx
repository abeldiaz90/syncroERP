"use client";
import { useState, useEffect, useCallback } from 'react';
import { fechaLarga } from '@/lib/fechas';
import { Scale, Calendar, X, Printer, CheckCircle2, AlertCircle } from 'lucide-react';

interface ICuenta {
  id: string; numeroCuenta: string; nombre: string;
  tipo?: string; naturaleza?: string;
  cargos: number; abonos: number; saldoFinal: number;
}

const HOY = new Date();
const fmt  = (d: Date) => d.toISOString().split('T')[0];
const fmtLabel = (s: string) =>
  s ? fechaLarga(s) : '';

const RANGOS = [
  { label: 'Este mes',    desde: fmt(new Date(HOY.getFullYear(), HOY.getMonth(), 1)),     hasta: fmt(new Date(HOY.getFullYear(), HOY.getMonth()+1, 0)) },
  { label: 'Este año',    desde: fmt(new Date(HOY.getFullYear(), 0, 1)),                  hasta: fmt(new Date(HOY.getFullYear(), 11, 31)) },
  { label: 'Histórico',   desde: '', hasta: '' },
];

/*
 * Con `Math.abs` una contra-cuenta se imprimía como si sumara: la
 * depreciación acumulada aparecía como «$480,000.00» en el activo, con el
 * mismo aspecto que un edificio. El total sí la restaba, así que la columna no
 * sumaba lo que decía sumar y no había manera de ver por qué. El signo va.
 */
const fmt$ = (n: number) =>
  new Intl.NumberFormat('es-MX', { style:'currency', currency:'MXN' }).format(n ?? 0);
/** Para los totales, que siempre son positivos por construcción. */
const fmtAbs$ = (n: number) =>
  new Intl.NumberFormat('es-MX', { style:'currency', currency:'MXN' }).format(Math.abs(n ?? 0));

export default function BalanceGeneralPage() {
  const [cuentas, setCuentas]         = useState<ICuenta[]>([]);
  const [cargando, setCargando]       = useState(true);
  const [fechaDesde, setFechaDesde]   = useState(RANGOS[2].desde);
  const [fechaHasta, setFechaHasta]   = useState(RANGOS[2].hasta);
  const [rangoActivo, setRangoActivo] = useState('Histórico');
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
          ? 'Tu perfil no incluye la consulta de el balance general.'
          : 'No se pudo consultar el balance general. Los importes de esta pantalla no son válidos.');
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
   * Las cuentas se clasifican por su TIPO, no por su primer dígito
   * --------------------------------------------------------------------------
   * Aquí ponía `numeroCuenta.startsWith('1')` para activo, '2' pasivo, '3'
   * capital, '4' ingresos, '5' costos y '6' gastos. El catálogo SAT no cabe en
   * esa regla: los resultados financieros son 701 gastos financieros, 702
   * productos financieros, 703 otros gastos y 704 otros productos. Ninguno
   * empieza por 4, 5 ni 6, así que NO ENTRABAN EN NINGUNA PARTE del balance.
   *
   * Medido el 26-sep-2026: `703.21` tenía un cargo de $15 y la pantalla llevaba
   * «Descuadrado $15.00» de forma permanente, sin ninguna manera de averiguar
   * de dónde salía. Un balance general que nunca cuadra deja de ser un control.
   *
   * El tipo viene ahora en cada renglón de la balanza, que lo lee del catálogo.
   * ══════════════════════════════════════════════════════════════════════════
   */
  const de = (tipo: string) => cuentas.filter(c => (c.tipo ?? '') === tipo);

  /*
   * Y dentro de cada grupo, una cuenta aporta en contra si su naturaleza es la
   * contraria a la del grupo: es lo que hace que la depreciación acumulada
   * RESTE del activo en vez de sumarle.
   */
  const natural: Record<string, string> = {
    ACTIVO: 'DEUDORA', COSTO: 'DEUDORA', GASTO: 'DEUDORA',
    PASIVO: 'ACREEDORA', CAPITAL: 'ACREEDORA', INGRESO: 'ACREEDORA',
  };
  const aporte = (c: ICuenta) =>
    (c.naturaleza ?? natural[c.tipo ?? ''] ?? 'DEUDORA') === natural[c.tipo ?? '']
      ? c.saldoFinal
      : -c.saldoFinal;
  const sumar = (lista: ICuenta[]) =>
    Math.round(lista.reduce((s, c) => s + aporte(c), 0) * 100) / 100;

  const conSaldo = (lista: ICuenta[]) => lista.filter(c => c.saldoFinal !== 0);
  const activo   = conSaldo(de('ACTIVO'));
  const pasivo   = conSaldo(de('PASIVO'));
  const capital  = conSaldo(de('CAPITAL'));

  // Ingresos - Costos - Gastos = Utilidad del período (va a Capital)
  const ingresos = de('INGRESO');
  const costos   = de('COSTO');
  const gastos   = de('GASTO');
  const utilidadPeriodo = Math.round((sumar(ingresos) - sumar(costos) - sumar(gastos)) * 100) / 100;

  const totalActivo  = sumar(activo);
  const totalPasivo  = sumar(pasivo);
  const totalCapital = Math.round((sumar(capital) + utilidadPeriodo) * 100) / 100;
  /* Sin datos no hay nada que cuadre: un balance vacío cuadra solo. */
  const cuadra       = !error && Math.abs(totalActivo - (totalPasivo + totalCapital)) < 1;

  const periodoLabel = rangoActivo === 'Histórico'
    ? 'Histórico completo'
    : `Al ${fmtLabel(fechaHasta)}`;

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-500 mb-1">Reporte Financiero</p>
          <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
            <Scale className="w-8 h-8 text-indigo-500" /> Balance General
          </h1>
          <p className="text-slate-500 text-sm mt-1">{periodoLabel}</p>
        </div>
        <button onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 shadow-sm">
          <Printer className="w-4 h-4" /> Imprimir
        </button>
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
              }`}>{r.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Hasta</label>
            <input type="date" value={fechaHasta}
              onChange={e => { setFechaHasta(e.target.value); setRangoActivo('Personalizado'); }}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <button onClick={() => { setRangoActivo('Personalizado'); fetchDatos(fechaDesde, fechaHasta); }}
            className="px-4 py-1.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700">
            Aplicar
          </button>
        </div>
      </div>

      {cargando ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-20 text-center">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Calculando balance...</p>
        </div>
      ) : (
        <>
          {/* Ecuación contable */}
          <div className={`rounded-2xl border-2 p-4 mb-6 flex items-center justify-center gap-4 flex-wrap ${
            error ? 'bg-slate-100 border-slate-300' : cuadra ? 'bg-emerald-50 border-emerald-300' : 'bg-rose-50 border-rose-300'
          }`}>
            <div className="text-center">
              <p className="text-xs font-bold uppercase text-slate-500">Activo</p>
              <p className="text-2xl font-black text-blue-700">{fmtAbs$(totalActivo)}</p>
            </div>
            <span className="text-2xl font-black text-slate-400">=</span>
            <div className="text-center">
              <p className="text-xs font-bold uppercase text-slate-500">Pasivo</p>
              <p className="text-2xl font-black text-rose-700">{fmtAbs$(totalPasivo)}</p>
            </div>
            <span className="text-2xl font-black text-slate-400">+</span>
            <div className="text-center">
              <p className="text-xs font-bold uppercase text-slate-500">Capital</p>
              <p className="text-2xl font-black text-emerald-700">{fmtAbs$(totalCapital)}</p>
            </div>
            <div className="flex items-center gap-2 ml-4">
              {error
                ? <><AlertCircle className="w-5 h-5 text-slate-500" /><span className="text-sm font-bold text-slate-600">Sin datos: no se pudo consultar</span></>
                : cuadra
                ? <><CheckCircle2 className="w-5 h-5 text-emerald-600" /><span className="text-sm font-bold text-emerald-700">Balance cuadrado</span></>
                : <><AlertCircle className="w-5 h-5 text-rose-600" /><span className="text-sm font-bold text-rose-700">Descuadrado {fmtAbs$(totalActivo - totalPasivo - totalCapital)}</span></>
              }
            </div>
          </div>

          {/* Documento Balance */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-slate-900 text-white px-8 py-5 text-center">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">SyncroERP</p>
              <p className="text-xl font-black uppercase tracking-wider">Balance General</p>
              <p className="text-sm text-slate-300 mt-1">{periodoLabel}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-slate-200">

              {/* COLUMNA IZQUIERDA — ACTIVO */}
              <div className="p-6 md:p-8">
                <div className="border-b-2 border-blue-600 pb-2 mb-4">
                  <h3 className="text-sm font-black uppercase tracking-widest text-blue-700">ACTIVO</h3>
                </div>

                {/* Activo Circulante (1xx) */}
                {activo.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">Sin cuentas de activo</p>
                ) : (
                  <div className="space-y-1.5 mb-4">
                    {activo.map(c => (
                      <div key={c.id} className="flex justify-between text-sm">
                        <span className="text-slate-600">
                          <span className="font-mono text-xs text-slate-400 mr-2">{c.numeroCuenta}</span>
                          {c.nombre}
                        </span>
                        <span className="font-mono font-semibold text-slate-800">{fmt$(aporte(c))}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex justify-between items-center pt-3 border-t-2 border-blue-600 mt-4">
                  <span className="text-sm font-black uppercase tracking-wide text-blue-800">Total Activo</span>
                  <span className="font-mono font-black text-lg text-blue-800">{fmtAbs$(totalActivo)}</span>
                </div>
              </div>

              {/* COLUMNA DERECHA — PASIVO + CAPITAL */}
              <div className="p-6 md:p-8">

                {/* PASIVO */}
                <div className="border-b-2 border-rose-500 pb-2 mb-4">
                  <h3 className="text-sm font-black uppercase tracking-widest text-rose-700">PASIVO</h3>
                </div>
                {pasivo.length === 0 ? (
                  <p className="text-sm text-slate-400 italic mb-4">Sin cuentas de pasivo</p>
                ) : (
                  <div className="space-y-1.5 mb-4">
                    {pasivo.map(c => (
                      <div key={c.id} className="flex justify-between text-sm">
                        <span className="text-slate-600">
                          <span className="font-mono text-xs text-slate-400 mr-2">{c.numeroCuenta}</span>
                          {c.nombre}
                        </span>
                        <span className="font-mono font-semibold text-slate-800">{fmt$(aporte(c))}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex justify-between items-center pt-2 border-t border-rose-200 mb-6">
                  <span className="text-xs font-bold uppercase text-rose-700">Total Pasivo</span>
                  <span className="font-mono font-bold text-rose-700">{fmtAbs$(totalPasivo)}</span>
                </div>

                {/* CAPITAL */}
                <div className="border-b-2 border-emerald-600 pb-2 mb-4">
                  <h3 className="text-sm font-black uppercase tracking-widest text-emerald-700">CAPITAL CONTABLE</h3>
                </div>
                <div className="space-y-1.5 mb-3">
                  {capital.map(c => (
                    <div key={c.id} className="flex justify-between text-sm">
                      <span className="text-slate-600">
                        <span className="font-mono text-xs text-slate-400 mr-2">{c.numeroCuenta}</span>
                        {c.nombre}
                      </span>
                      <span className="font-mono font-semibold text-slate-800">{fmt$(aporte(c))}</span>
                    </div>
                  ))}
                  {/* Utilidad del período (calculada) */}
                  <div className="flex justify-between text-sm">
                    <span className={`italic ${utilidadPeriodo >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                      Utilidad del período
                    </span>
                    <span className={`font-mono font-semibold ${utilidadPeriodo >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                      {fmt$(utilidadPeriodo)}
                    </span>
                  </div>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-emerald-200 mb-4">
                  <span className="text-xs font-bold uppercase text-emerald-700">Total Capital</span>
                  <span className="font-mono font-bold text-emerald-700">{fmtAbs$(totalCapital)}</span>
                </div>

                {/* Total Pasivo + Capital */}
                <div className="flex justify-between items-center pt-3 border-t-2 border-slate-800 mt-2">
                  <span className="text-sm font-black uppercase tracking-wide text-slate-800">Total Pasivo + Capital</span>
                  <span className="font-mono font-black text-lg text-slate-900">{fmtAbs$(totalPasivo + totalCapital)}</span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-slate-100 px-8 py-4 bg-slate-50 flex justify-between">
              <p className="text-xs text-slate-400">SyncroERP — Generado automáticamente</p>
              <p className="text-xs text-slate-400">{new Date().toLocaleString('es-MX')}</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
