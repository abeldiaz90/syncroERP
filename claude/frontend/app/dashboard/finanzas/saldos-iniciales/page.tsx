"use client";
import { useState, useEffect, useCallback } from 'react';
import {
  Database, Save, CheckCircle2, AlertCircle,
  Info, RefreshCw, ChevronRight
} from 'lucide-react';

interface ICuenta {
  id: string; numeroCuenta: string; nombre: string;
  tipo: string; naturaleza: string;
}
interface ISaldoLinea {
  cuentaId: string; numeroCuenta: string; nombre: string;
  tipo: string; naturaleza: string; saldo: number;
}

const TIPO_COLOR: Record<string, string> = {
  ACTIVO:  'bg-blue-50 text-blue-700 border-blue-200',
  PASIVO:  'bg-pink-50 text-pink-700 border-pink-200',
  CAPITAL: 'bg-purple-50 text-purple-700 border-purple-200',
  INGRESO: 'bg-green-50 text-green-700 border-green-200',
  COSTO:   'bg-amber-50 text-amber-700 border-amber-200',
  GASTO:   'bg-red-50 text-red-700 border-red-200',
};

const fmt$ = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0);

const GRUPOS = ['ACTIVO', 'PASIVO', 'CAPITAL', 'INGRESO', 'COSTO', 'GASTO'];

export default function SaldosInicialesPage() {
  const [cuentas, setCuentas]   = useState<ICuenta[]>([]);
  const [saldos, setSaldos]     = useState<Record<string, number>>({});
  const [fecha, setFecha]       = useState(new Date().toISOString().split('T')[0]);
  const [guardando, setGuardando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [toast, setToast]       = useState<{ msg: string; ok: boolean } | null>(null);

  const api = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:4000/api');
  const tok = () => localStorage.getItem('syncro_token') ?? '';
  const h   = () => ({ Authorization: `Bearer ${tok()}`, 'Content-Type': 'application/json' });
  const toast$ = (msg: string, ok = true) => {
    setToast({ msg, ok }); setTimeout(() => setToast(null), 5000);
  };

  useEffect(() => {
    (async () => {
      setCargando(true);
      const r = await fetch(`${api}/finanzas/cuentas-contables`, { headers: h() });
      if (r.ok) setCuentas(await r.json());
      setCargando(false);
    })();
  }, []);

  const actualizarSaldo = (id: string, valor: string) => {
    setSaldos(prev => ({ ...prev, [id]: parseFloat(valor) || 0 }));
  };

  // Cálculo de totales para verificar que el balance cuadre
  // Activo = Pasivo + Capital + (Ingresos - Costos - Gastos)
  const totalActivo  = cuentas.filter(c => c.tipo === 'ACTIVO').reduce((s, c) => s + (saldos[c.id] || 0), 0);
  const totalPasivo  = cuentas.filter(c => c.tipo === 'PASIVO').reduce((s, c) => s + (saldos[c.id] || 0), 0);
  const totalCapital = cuentas.filter(c => c.tipo === 'CAPITAL').reduce((s, c) => s + (saldos[c.id] || 0), 0);
  const totalIngreso = cuentas.filter(c => c.tipo === 'INGRESO').reduce((s, c) => s + (saldos[c.id] || 0), 0);
  const totalCosto   = cuentas.filter(c => c.tipo === 'COSTO').reduce((s, c) => s + (saldos[c.id] || 0), 0);
  const totalGasto   = cuentas.filter(c => c.tipo === 'GASTO').reduce((s, c) => s + (saldos[c.id] || 0), 0);
  const utilidad     = totalIngreso - totalCosto - totalGasto;
  const pasivosTotal = totalPasivo + totalCapital + utilidad;
  const diferencia   = Math.abs(totalActivo - pasivosTotal);
  const cuadra       = diferencia < 0.01 && totalActivo > 0;
  const tieneSaldos  = (Object.values(saldos) as number[]).some(v => v > 0);

  const guardar = async () => {
    if (!tieneSaldos) { toast$('Ingresa al menos un saldo inicial', false); return; }

    // Construir partidas: cuentas deudoras van en cargo, acreedoras en abono
    const lineasConSaldo = cuentas.filter(c => (saldos[c.id] || 0) > 0);
    const partidas = lineasConSaldo.map(c => {
      const esDeudora = ['ACTIVO', 'COSTO', 'GASTO'].includes(c.tipo);
      return {
        cuentaContableId: c.id,
        cargo:  esDeudora ? saldos[c.id] : 0,
        abono:  esDeudora ? 0 : saldos[c.id],
        referencia: 'SALDO INICIAL',
      };
    });

    const totalCargo = partidas.reduce((s, p) => s + p.cargo, 0);
    const totalAbono = partidas.reduce((s, p) => s + p.abono, 0);

    // Si no cuadra, agregar la diferencia en Capital Social automáticamente
    if (Math.abs(totalCargo - totalAbono) >= 0.01) {
      const cuentaCapital = cuentas.find(c => c.numeroCuenta.startsWith('301'));
      if (cuentaCapital) {
        const diff = totalCargo - totalAbono;
        const idx  = partidas.findIndex(p => p.cuentaContableId === cuentaCapital.id);
        if (idx >= 0) {
          partidas[idx].abono += diff;
        } else {
          partidas.push({ cuentaContableId: cuentaCapital.id, cargo: 0, abono: diff, referencia: 'SALDO INICIAL - Ajuste' });
        }
      }
    }

    setGuardando(true);
    const r = await fetch(`${api}/finanzas/polizas/manual`, {
      method: 'POST', headers: h(),
      body: JSON.stringify({
        tipo:     'DIARIO',
        fecha,
        concepto: 'Saldos iniciales de apertura',
        partidas,
      }),
    });
    setGuardando(false);

    if (r.ok) {
      const data = await r.json();
      toast$(`Saldos iniciales registrados. Póliza: ${data.folio}`);
      setSaldos({});
    } else {
      const e = await r.json().catch(() => ({}));
      toast$(e.message ?? 'Error al guardar', false);
    }
  };

  const cuentasPorGrupo = (tipo: string) => cuentas.filter(c => c.tipo === tipo);

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">

      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-4 rounded-xl shadow-2xl font-semibold text-white ${toast.ok ? 'bg-emerald-600' : 'bg-rose-600'}`}>
          {toast.ok ? <CheckCircle2 className="w-5 h-5"/> : <AlertCircle className="w-5 h-5"/>} {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-500 mb-1">Finanzas</p>
          <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
            <Database className="w-8 h-8 text-indigo-500"/> Saldos Iniciales
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Captura los saldos de apertura al iniciar operaciones en el sistema.
          </p>
        </div>
        <button onClick={() => window.location.reload()}
          className="p-2 bg-white border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 shadow-sm">
          <RefreshCw className="w-4 h-4"/>
        </button>
      </div>

      {/* Aviso */}
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800">
        <Info className="w-5 h-5 shrink-0 mt-0.5 text-amber-500"/>
        <div>
          <p className="font-bold mb-1">¿Cuándo usar esta pantalla?</p>
          <p className="text-xs">Solo al iniciar operaciones en el sistema por primera vez. Si el negocio ya operaba antes, captura aquí los saldos del último balance general. <strong>No usar si ya hay transacciones registradas.</strong></p>
        </div>
      </div>

      {/* Fecha */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-5 flex items-center gap-4">
        <div>
          <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Fecha de apertura</label>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
        </div>
        {tieneSaldos && (
          <div className={`ml-auto flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-bold ${cuadra ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
            {cuadra
              ? <><CheckCircle2 className="w-4 h-4"/> Balance cuadrado</>
              : <><AlertCircle className="w-4 h-4"/> Diferencia: {fmt$(diferencia)}</>
            }
          </div>
        )}
      </div>

      {/* Cuentas por grupo */}
      {cargando ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
          <p className="text-slate-400 text-sm">Cargando catálogo...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {GRUPOS.map(grupo => {
            const cuentasGrupo = cuentasPorGrupo(grupo);
            if (!cuentasGrupo.length) return null;
            const totalGrupo = cuentasGrupo.reduce((s, c) => s + (saldos[c.id] || 0), 0);

            return (
              <div key={grupo} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 bg-slate-900 text-white">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{grupo}</p>
                  {totalGrupo > 0 && (
                    <span className="text-sm font-bold text-white">{fmt$(totalGrupo)}</span>
                  )}
                </div>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {cuentasGrupo.map(c => (
                      <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3 w-24">
                          <span className="font-mono font-bold text-indigo-600 text-xs">{c.numeroCuenta}</span>
                        </td>
                        <td className="px-5 py-3">
                          <p className="font-medium text-slate-800 text-sm">{c.nombre}</p>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${TIPO_COLOR[c.tipo] ?? ''}`}>
                            {c.naturaleza === 'DEUDORA' ? 'Deudora' : 'Acreedora'}
                          </span>
                        </td>
                        <td className="px-5 py-3 w-48">
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">$</span>
                            <input
                              type="number" min="0" step="0.01"
                              value={saldos[c.id] || ''}
                              onChange={e => actualizarSaldo(c.id, e.target.value)}
                              placeholder="0.00"
                              className={`w-full pl-7 pr-3 py-2 border rounded-xl text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors ${(saldos[c.id] || 0) > 0 ? 'border-indigo-300 bg-indigo-50 text-indigo-700 font-bold' : 'border-slate-200 bg-slate-50'}`}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      {/* Resumen y guardar */}
      {tieneSaldos && (
        <div className="mt-6 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-slate-900 text-white">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Resumen del balance</p>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 gap-4 text-sm mb-4">
              <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                <p className="text-xs font-bold text-blue-600 uppercase mb-1">Total Activo</p>
                <p className="text-xl font-black text-blue-700">{fmt$(totalActivo)}</p>
              </div>
              <div className="bg-pink-50 rounded-xl p-3 border border-pink-100">
                <p className="text-xs font-bold text-pink-600 uppercase mb-1">Pasivo + Capital</p>
                <p className="text-xl font-black text-pink-700">{fmt$(pasivosTotal)}</p>
              </div>
            </div>
            {!cuadra && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-700">
                <strong>⚠️ No cuadra:</strong> La diferencia de {fmt$(diferencia)} se ajustará automáticamente en la cuenta 301-01 Capital Social al guardar.
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-5 flex gap-3">
        <button onClick={guardar} disabled={guardando || !tieneSaldos}
          className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 shadow-md">
          {guardando
            ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> Guardando...</>
            : <><Save className="w-4 h-4"/> Registrar Saldos Iniciales</>
          }
        </button>
      </div>

    </div>
  );
}
