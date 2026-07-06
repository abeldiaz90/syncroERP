"use client";
import { useState, useEffect, useCallback } from 'react';
import {
  Lock, Unlock, AlertTriangle, CheckCircle2, RefreshCw,
  Calendar, FileText, ChevronDown, ChevronUp, Info
} from 'lucide-react';

interface IPeriodo {
  mes: number; anio: number; nombreMes: string;
  cerrado: boolean; fechaCierre: string | null;
  totalPolizas: number;
}
interface IResumen {
  totalPolizas: number; totalPartidas: number;
  totalDebe: number; totalHaber: number;
  cuadrada: boolean; advertencia: string | null;
}

const fmt$ = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0);

export default function CierreContablePage() {
  const [periodos, setPeriodos]   = useState<IPeriodo[]>([]);
  const [cargando, setCargando]   = useState(true);
  const [anioFiltro, setAnioFiltro] = useState(new Date().getFullYear());
  const [modal, setModal]         = useState<{ tipo: 'cerrar' | 'reabrir'; periodo: IPeriodo } | null>(null);
  const [resumen, setResumen]     = useState<IResumen | null>(null);
  const [notas, setNotas]         = useState('');
  const [justificacion, setJustificacion] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [toast, setToast]         = useState<{ msg: string; ok: boolean } | null>(null);

  const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
  const tok = () => localStorage.getItem('syncro_token') ?? '';
  const h   = () => ({ Authorization: `Bearer ${tok()}`, 'Content-Type': 'application/json' });
  const toast$ = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 5000); };

  const cargar = useCallback(async () => {
    setCargando(true);
    const r = await fetch(`${api}/finanzas/cierres`, { headers: h() });
    if (r.ok) setPeriodos(await r.json());
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const abrirModal = async (tipo: 'cerrar' | 'reabrir', periodo: IPeriodo) => {
    setNotas(''); setJustificacion(''); setResumen(null);
    setModal({ tipo, periodo });
    if (tipo === 'cerrar') {
      const r = await fetch(`${api}/finanzas/cierres/resumen/${periodo.anio}/${periodo.mes}`, { headers: h() });
      if (r.ok) setResumen(await r.json());
    }
  };

  const ejecutar = async () => {
    if (!modal) return;
    setProcesando(true);
    const url    = modal.tipo === 'cerrar' ? `${api}/finanzas/cierres/cerrar` : `${api}/finanzas/cierres/reabrir`;
    const body   = modal.tipo === 'cerrar'
      ? { mes: modal.periodo.mes, anio: modal.periodo.anio, notas }
      : { mes: modal.periodo.mes, anio: modal.periodo.anio, justificacion };
    const r = await fetch(url, { method: 'POST', headers: h(), body: JSON.stringify(body) });
    setProcesando(false);
    if (r.ok) {
      const data = await r.json();
      toast$(data.mensaje ?? `Período ${modal.tipo === 'cerrar' ? 'cerrado' : 'reabierto'} correctamente`);
      setModal(null);
      cargar();
    } else {
      const e = await r.json().catch(() => ({}));
      toast$(e.message ?? 'Error al procesar', false);
    }
  };

  const filtrados = periodos.filter(p => p.anio === anioFiltro);
  const anios     = [...new Set(periodos.map(p => p.anio))].sort((a, b) => b - a);

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">

      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-4 rounded-xl shadow-2xl font-semibold text-white ${toast.ok ? 'bg-emerald-600' : 'bg-rose-600'}`}>
          {toast.ok ? <CheckCircle2 className="w-5 h-5"/> : <AlertTriangle className="w-5 h-5"/>} {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-500 mb-1">Finanzas</p>
          <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
            <Lock className="w-8 h-8 text-indigo-500"/> Cierre Contable
          </h1>
          <p className="text-slate-500 text-sm mt-1">Bloquea períodos para proteger la integridad de las pólizas.</p>
        </div>
        <div className="flex items-center gap-2">
          {anios.map(a => (
            <button key={a} onClick={() => setAnioFiltro(a)}
              className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors ${anioFiltro === a ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'}`}>
              {a}
            </button>
          ))}
          <button onClick={cargar} className="p-2 bg-white border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 shadow-sm">
            <RefreshCw className="w-4 h-4"/>
          </button>
        </div>
      </div>

      {/* Aviso */}
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800">
        <Info className="w-5 h-5 shrink-0 mt-0.5 text-amber-500"/>
        <p>Al cerrar un período <strong>se bloquean todas sus pólizas</strong> y no se pueden crear nuevas para ese mes. Solo un administrador puede reabrirlo con justificación.</p>
      </div>

      {/* Grid de períodos */}
      {cargando ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
          <p className="text-slate-400 text-sm">Cargando períodos...</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {filtrados.map(p => (
            <div key={`${p.mes}-${p.anio}`}
              className={`bg-white rounded-2xl border-2 p-5 shadow-sm transition-all ${p.cerrado ? 'border-slate-300 bg-slate-50' : 'border-slate-200 hover:border-indigo-300'}`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-black text-slate-900">{p.nombreMes}</p>
                  <p className="text-xs text-slate-400">{p.anio}</p>
                </div>
                {p.cerrado
                  ? <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center"><Lock className="w-4 h-4 text-slate-500"/></div>
                  : <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center"><Unlock className="w-4 h-4 text-emerald-600"/></div>
                }
              </div>
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${p.cerrado ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200'}`}>
                  {p.cerrado ? 'CERRADO' : 'ABIERTO'}
                </span>
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <FileText className="w-3 h-3"/> {p.totalPolizas} pólizas
                </span>
              </div>
              {p.cerrado && p.fechaCierre && (
                <p className="text-[10px] text-slate-400 mb-3">
                  Cerrado: {new Date(p.fechaCierre).toLocaleDateString('es-MX')}
                </p>
              )}
              <button
                onClick={() => abrirModal(p.cerrado ? 'reabrir' : 'cerrar', p)}
                className={`w-full py-2 rounded-xl text-xs font-bold transition-colors ${
                  p.cerrado
                    ? 'bg-slate-100 text-slate-600 hover:bg-amber-100 hover:text-amber-700'
                    : p.totalPolizas === 0
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
                disabled={!p.cerrado && p.totalPolizas === 0}>
                {p.cerrado ? '🔓 Reabrir período' : p.totalPolizas === 0 ? 'Sin pólizas' : '🔒 Cerrar período'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`bg-white rounded-2xl shadow-2xl w-full max-w-lg border-t-4 ${modal.tipo === 'cerrar' ? 'border-indigo-500' : 'border-amber-500'}`}>
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                {modal.tipo === 'cerrar'
                  ? <><Lock className="w-5 h-5 text-indigo-500"/> Cerrar período {modal.periodo.nombreMes} {modal.periodo.anio}</>
                  : <><Unlock className="w-5 h-5 text-amber-500"/> Reabrir período {modal.periodo.nombreMes} {modal.periodo.anio}</>
                }
              </h2>
            </div>
            <div className="p-6 space-y-4">
              {/* Resumen del período */}
              {modal.tipo === 'cerrar' && resumen && (
                <div className={`rounded-xl p-4 border ${resumen.cuadrada ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                  <p className="text-xs font-bold uppercase text-slate-500 mb-2">Resumen del período</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-slate-500">Pólizas:</span> <strong>{resumen.totalPolizas}</strong></div>
                    <div><span className="text-slate-500">Partidas:</span> <strong>{resumen.totalPartidas}</strong></div>
                    <div><span className="text-slate-500">Total Debe:</span> <strong>{fmt$(resumen.totalDebe)}</strong></div>
                    <div><span className="text-slate-500">Total Haber:</span> <strong>{fmt$(resumen.totalHaber)}</strong></div>
                  </div>
                  <div className={`mt-2 text-xs font-bold flex items-center gap-1 ${resumen.cuadrada ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {resumen.cuadrada
                      ? <><CheckCircle2 className="w-3 h-3"/> Contabilidad cuadrada ✓</>
                      : <><AlertTriangle className="w-3 h-3"/> {resumen.advertencia}</>
                    }
                  </div>
                </div>
              )}
              {modal.tipo === 'cerrar' && resumen && !resumen.cuadrada && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-700 font-medium">
                  ⚠️ La contabilidad no está cuadrada. Se recomienda revisar y corregir antes de cerrar.
                </div>
              )}
              {modal.tipo === 'cerrar' && (
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">Notas del cierre (opcional)</label>
                  <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={3}
                    placeholder="Ej: Cierre mensual revisado por contador..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
                </div>
              )}
              {modal.tipo === 'reabrir' && (
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">Justificación <span className="text-rose-500">*</span></label>
                  <textarea value={justificacion} onChange={e => setJustificacion(e.target.value)} rows={3}
                    placeholder="Motivo por el que se reabre el período cerrado..."
                    className="w-full px-3 py-2 bg-slate-50 border border-amber-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500"/>
                  <p className="text-[10px] text-slate-400 mt-1">Esta acción quedará registrada en el log de auditoría.</p>
                </div>
              )}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
              <button onClick={() => setModal(null)} className="flex-1 py-2.5 text-slate-700 font-medium hover:bg-slate-200 rounded-xl transition-colors">
                Cancelar
              </button>
              <button onClick={ejecutar} disabled={procesando || (modal.tipo === 'reabrir' && !justificacion.trim())}
                className={`flex-1 py-2.5 text-white font-semibold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2 ${
                  modal.tipo === 'cerrar' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-amber-500 hover:bg-amber-600'
                }`}>
                {procesando
                  ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                  : modal.tipo === 'cerrar' ? <><Lock className="w-4 h-4"/> Cerrar período</> : <><Unlock className="w-4 h-4"/> Reabrir período</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
