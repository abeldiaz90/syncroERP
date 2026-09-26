"use client";
import { useState, useEffect, useCallback } from 'react';
import { fechaCorta } from '@/lib/fechas';
import Link from 'next/link';
import {
  BookOpen, FileText, Search, X, Plus,
  ChevronLeft, ChevronRight, Filter, RefreshCw,
  Ban, Undo2, AlertTriangle, Loader2
} from 'lucide-react';

interface IPartida {
  id: string;
  cuentaContable: { numeroCuenta: string; nombre: string };
  cargo: number; abono: number; referencia: string | null;
}
interface IPoliza {
  id: string; folio: string; tipo: 'DIARIO' | 'INGRESO' | 'EGRESO';
  concepto: string; fecha: string; fechaCreacion: string;
  partidas: IPartida[];
  // ── Cancelación / reverso ──
  estatus?: 'VIGENTE' | 'CANCELADA' | 'REVERSA';
  polizaOrigenId?: string | null;
  polizaReversaId?: string | null;
  motivoCancelacion?: string | null;
  canceladaPor?: string | null;
  fechaCancelacion?: string | null;
}

const ESTATUS_CFG: Record<string, { cls: string; label: string }> = {
  CANCELADA: { cls: 'bg-rose-100 text-rose-700 border-rose-200',       label: 'Cancelada' },
  REVERSA:   { cls: 'bg-amber-100 text-amber-700 border-amber-200',    label: 'Reversa'   },
};

const TIPO_CFG = {
  DIARIO:  { cls: 'bg-blue-100 text-blue-700',    label: 'Diario'  },
  INGRESO: { cls: 'bg-emerald-100 text-emerald-700', label: 'Ingreso' },
  EGRESO:  { cls: 'bg-rose-100 text-rose-700',    label: 'Egreso'  },
};

const fmt$ = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0);
const fmtFecha = (s: string) =>
  fechaCorta(s);

const HOY   = new Date();
const DESDE = new Date(HOY.getFullYear(), HOY.getMonth(), 1).toISOString().split('T')[0];
const HASTA = new Date(HOY.getFullYear(), HOY.getMonth() + 1, 0).toISOString().split('T')[0];

const POR_PAGINA = 20;

export default function LibroDiarioPage() {
  const [polizas, setPolizas]       = useState<IPoliza[]>([]);
  const [cargando, setCargando]     = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [busqueda, setBusqueda]     = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [desde, setDesde]           = useState(DESDE);
  const [hasta, setHasta]           = useState(HASTA);
  const [pagina, setPagina]         = useState(1);
  const [detalle, setDetalle]       = useState<IPoliza | null>(null);
  // ── cancelación ──
  const [motivo, setMotivo]         = useState('');
  const [cancelando, setCancelando] = useState(false);
  const [errCancel, setErrCancel]   = useState<string | null>(null);
  const [okCancel, setOkCancel]     = useState<string | null>(null);

  const api = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:4000/api');
  const tok = () => localStorage.getItem('syncro_token') ?? '';

  const cargar = useCallback(async () => {
    setCargando(true);
    /*
      «No hay pólizas» y «no pude preguntar por las pólizas» se veían igual: la
      lista vacía. En el libro diario de una empresa que sí opera, lo primero
      alarma y lo segundo hay que decirlo.
    */
    try {
      const r = await fetch(`${api}/finanzas/polizas`, {
        headers: { Authorization: `Bearer ${tok()}` },
      });
      if (r.ok) {
        setPolizas(await r.json());
        setErrorCarga('');
      } else {
        setPolizas([]);
        setErrorCarga(r.status === 403
          ? 'Tu perfil no incluye la consulta de pólizas.'
          : 'No se pudieron consultar las pólizas.');
      }
    } catch {
      setPolizas([]);
      setErrorCarga('No hay conexión con el servidor.');
    }
    setCargando(false);
    setPagina(1);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Cancelar una póliza = emitir su REVERSA. La original nunca se borra.
  const cancelarPoliza = async () => {
    if (!detalle) return;
    setCancelando(true); setErrCancel(null); setOkCancel(null);
    try {
      const r = await fetch(`${api}/finanzas/polizas/${detalle.id}/cancelar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}` },
        body: JSON.stringify({ motivo }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = Array.isArray(data?.message) ? data.message.join('. ') : data?.message;
        throw new Error(msg || 'No se pudo cancelar la póliza');
      }
      setOkCancel(data.mensaje ?? 'Póliza cancelada.');
      setMotivo('');
      await cargar();
      setDetalle(null);
    } catch (e: any) {
      setErrCancel(e.message);
    } finally {
      setCancelando(false);
    }
  };

  const abrirDetalle = (p: IPoliza) => {
    setDetalle(p); setMotivo(''); setErrCancel(null); setOkCancel(null);
  };

  // Filtros en frontend
  const filtradas = polizas.filter(p => {
    const fechaP = p.fecha?.split('T')[0] ?? '';
    if (desde && fechaP < desde) return false;
    if (hasta && fechaP > hasta) return false;
    if (filtroTipo && p.tipo !== filtroTipo) return false;
    if (busqueda) {
      const q = busqueda.toLowerCase();
      return p.concepto.toLowerCase().includes(q) || p.folio.toLowerCase().includes(q);
    }
    return true;
  });

  const totalPaginas = Math.ceil(filtradas.length / POR_PAGINA);
  const paginas      = filtradas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  const totalDebe  = filtradas.reduce((s, p) => s + p.partidas.reduce((ss, pp) => ss + Number(pp.cargo), 0), 0);
  const totalHaber = filtradas.reduce((s, p) => s + p.partidas.reduce((ss, pp) => ss + Number(pp.abono), 0), 0);

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-500 mb-1">Finanzas</p>
          <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-indigo-500"/> Libro Diario
          </h1>
          <p className="text-slate-500 text-sm mt-1">Auditoría de todos los movimientos contables del ERP.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={cargar}
            className="p-2 bg-white border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 shadow-sm">
            <RefreshCw className="w-4 h-4"/>
          </button>
          <Link href="/dashboard/finanzas/polizas/nueva"
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 shadow-md text-sm">
            <Plus className="w-4 h-4"/> Nueva Póliza Manual
          </Link>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-5">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Búsqueda */}
          <div className="flex-1 min-w-48">
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Buscar</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/>
              <input type="text" value={busqueda} onChange={e => { setBusqueda(e.target.value); setPagina(1); }}
                placeholder="Folio o concepto..."
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
            </div>
          </div>
          {/* Desde */}
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Desde</label>
            <input type="date" value={desde} onChange={e => { setDesde(e.target.value); setPagina(1); }}
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
          </div>
          {/* Hasta */}
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Hasta</label>
            <input type="date" value={hasta} onChange={e => { setHasta(e.target.value); setPagina(1); }}
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
          </div>
          {/* Tipo */}
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Tipo</label>
            <select value={filtroTipo} onChange={e => { setFiltroTipo(e.target.value); setPagina(1); }}
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">Todos</option>
              <option value="DIARIO">Diario</option>
              <option value="INGRESO">Ingreso</option>
              <option value="EGRESO">Egreso</option>
            </select>
          </div>
          {/* Reset */}
          {(busqueda || filtroTipo || desde !== DESDE || hasta !== HASTA) && (
            <button onClick={() => { setBusqueda(''); setFiltroTipo(''); setDesde(DESDE); setHasta(HASTA); setPagina(1); }}
              className="px-3 py-2.5 text-slate-500 hover:text-slate-700 text-sm flex items-center gap-1 bg-slate-100 rounded-xl">
              <X className="w-3.5 h-3.5"/> Limpiar
            </button>
          )}
        </div>

        {/* KPIs del filtro */}
        {filtradas.length > 0 && (
          <div className="flex gap-4 mt-3 pt-3 border-t border-slate-100 text-xs">
            <span className="text-slate-500">{filtradas.length} póliza(s)</span>
            <span className="text-blue-600 font-bold">Debe: {fmt$(totalDebe)}</span>
            <span className="text-emerald-600 font-bold">Haber: {fmt$(totalHaber)}</span>
            <span className={`font-bold ${Math.abs(totalDebe - totalHaber) < 0.01 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {Math.abs(totalDebe - totalHaber) < 0.01 ? '✅ Cuadrado' : `❌ Dif: ${fmt$(Math.abs(totalDebe - totalHaber))}`}
            </span>
          </div>
        )}
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-slate-900 text-white px-5 py-3 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Pólizas</p>
          <p className="text-xs text-slate-400">{filtradas.length} registros</p>
        </div>

        {cargando ? (
          <div className="p-16 text-center">
            <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
            <p className="text-slate-400 text-sm">Cargando pólizas...</p>
          </div>
        ) : errorCarga ? (
          <div className="p-16 text-center">
            <FileText className="w-12 h-12 text-rose-200 mx-auto mb-3"/>
            <p className="font-semibold text-rose-700">{errorCarga}</p>
            <p className="text-sm text-slate-500 mt-1">
              El libro diario no está vacío: no se pudo consultar.
            </p>
          </div>
        ) : paginas.length === 0 ? (
          <div className="p-16 text-center">
            <FileText className="w-12 h-12 text-slate-200 mx-auto mb-3"/>
            <p className="font-semibold text-slate-600">Sin pólizas en el período</p>
            <p className="text-sm text-slate-400 mt-1">Ajusta los filtros o crea una póliza manual.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-xs uppercase text-slate-500 font-bold">
                    <th className="px-5 py-3 text-left">Folio</th>
                    <th className="px-5 py-3 text-left">Fecha</th>
                    <th className="px-5 py-3 text-left">Tipo</th>
                    <th className="px-5 py-3 text-left">Concepto</th>
                    <th className="px-5 py-3 text-center">Partidas</th>
                    <th className="px-5 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginas.map(p => {
                    const total = p.partidas.reduce((s, pp) => s + Number(pp.cargo), 0);
                    const cfg   = TIPO_CFG[p.tipo] ?? TIPO_CFG.DIARIO;
                    return (
                      <tr key={p.id} onClick={() => abrirDetalle(p)}
                        className={`hover:bg-indigo-50/40 cursor-pointer transition-colors ${
                          p.estatus === 'CANCELADA' ? 'bg-rose-50/40' : ''}`}>
                        <td className="px-5 py-3 font-mono font-bold text-xs">
                          <span className={p.estatus === 'CANCELADA'
                            ? 'text-slate-400 line-through' : 'text-indigo-600'}>{p.folio}</span>
                          {p.estatus && ESTATUS_CFG[p.estatus] && (
                            <span className={`ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded border ${ESTATUS_CFG[p.estatus].cls}`}>
                              {ESTATUS_CFG[p.estatus].label}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-slate-500 text-xs">{fmtFecha(p.fecha?.split('T')[0])}</td>
                        <td className="px-5 py-3">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span>
                        </td>
                        <td className="px-5 py-3 text-slate-700 max-w-xs truncate" title={p.concepto}>{p.concepto}</td>
                        <td className="px-5 py-3 text-center text-slate-500 text-xs">{p.partidas.length}</td>
                        <td className="px-5 py-3 text-right font-bold font-mono text-slate-800 text-xs">{fmt$(total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            {totalPaginas > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50">
                <p className="text-xs text-slate-400">
                  Página {pagina} de {totalPaginas} · {filtradas.length} registros
                </p>
                <div className="flex gap-1">
                  <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-30">
                    <ChevronLeft className="w-4 h-4"/>
                  </button>
                  <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={pagina === totalPaginas}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-30">
                    <ChevronRight className="w-4 h-4"/>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal detalle */}
      {detalle && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center px-6 py-4 bg-slate-900 text-white">
              <div>
                <p className="font-mono font-black text-indigo-400 text-lg">{detalle.folio}</p>
                <p className="text-slate-300 text-sm mt-0.5">{detalle.concepto}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400">{fmtFecha(detalle.fecha?.split('T')[0])}</span>
                <button onClick={() => setDetalle(null)}
                  className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                  <X className="w-5 h-5"/>
                </button>
              </div>
            </div>
            {/* Aviso de estatus */}
            {detalle.estatus === 'CANCELADA' && (
              <div className="bg-rose-50 border-b border-rose-200 px-6 py-3 text-sm text-rose-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0"/>
                <div>
                  <p className="font-bold">Póliza cancelada</p>
                  <p className="text-xs mt-0.5">
                    Motivo: {detalle.motivoCancelacion || '—'}
                    {detalle.canceladaPor ? ` · por ${detalle.canceladaPor}` : ''}
                  </p>
                  <p className="text-xs mt-0.5 text-rose-600">
                    Sigue en el libro: su reversa la deja en ceros. No se elimina nunca.
                  </p>
                </div>
              </div>
            )}
            {detalle.estatus === 'REVERSA' && (
              <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 text-sm text-amber-800 flex items-start gap-2">
                <Undo2 className="w-4 h-4 mt-0.5 shrink-0"/>
                <p>Esta es una <b>póliza de reversa</b>: cancela a otra póliza con los importes invertidos.</p>
              </div>
            )}

            <div className="overflow-y-auto flex-1">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                  <tr className="text-xs uppercase text-slate-500 font-bold">
                    <th className="px-5 py-3 text-left">Cuenta</th>
                    <th className="px-5 py-3 text-left">Referencia</th>
                    <th className="px-5 py-3 text-right text-blue-600">Debe</th>
                    <th className="px-5 py-3 text-right text-emerald-600">Haber</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detalle.partidas.map(pp => (
                    <tr key={pp.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3">
                        <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded mr-2">
                          {pp.cuentaContable.numeroCuenta}
                        </span>
                        <span className="font-medium text-slate-800">{pp.cuentaContable.nombre}</span>
                      </td>
                      <td className="px-5 py-3 text-slate-400 text-xs">{pp.referencia || '—'}</td>
                      <td className="px-5 py-3 text-right font-mono text-blue-600 font-bold">
                        {Number(pp.cargo) > 0 ? fmt$(Number(pp.cargo)) : ''}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-emerald-600 font-bold">
                        {Number(pp.abono) > 0 ? fmt$(Number(pp.abono)) : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-slate-300 bg-slate-50">
                  <tr>
                    <td colSpan={2} className="px-5 py-3 text-right text-xs font-black uppercase text-slate-500 tracking-widest">
                      Sumas Iguales
                    </td>
                    <td className="px-5 py-3 text-right font-black font-mono text-blue-700">
                      {fmt$(detalle.partidas.reduce((s, p) => s + Number(p.cargo), 0))}
                    </td>
                    <td className="px-5 py-3 text-right font-black font-mono text-emerald-700">
                      {fmt$(detalle.partidas.reduce((s, p) => s + Number(p.abono), 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Pie: cancelar póliza (solo si está vigente) */}
            {(!detalle.estatus || detalle.estatus === 'VIGENTE') && (
              <div className="border-t border-slate-200 bg-slate-50 px-6 py-4">
                {errCancel && (
                  <p className="mb-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">{errCancel}</p>
                )}
                <p className="text-xs text-slate-500 mb-2">
                  Cancelar genera una <b>póliza de reversa</b> con los importes invertidos.
                  La original se conserva en el libro (no se borra ni se edita).
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input value={motivo} onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Motivo de la cancelación (obligatorio)"
                    className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                  <button onClick={cancelarPoliza} disabled={cancelando || motivo.trim().length < 5}
                    className="inline-flex items-center justify-center gap-2 bg-rose-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed">
                    {cancelando ? <Loader2 className="w-4 h-4 animate-spin"/> : <Ban className="w-4 h-4"/>}
                    Cancelar póliza
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirmación de cancelación */}
      {okCancel && (
        <div className="fixed bottom-6 right-6 z-[60] bg-slate-900 text-white text-sm px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3">
          <Undo2 className="w-4 h-4 text-emerald-400"/>
          <span>{okCancel}</span>
          <button onClick={() => setOkCancel(null)} className="text-slate-400 hover:text-white"><X className="w-4 h-4"/></button>
        </div>
      )}
    </div>
  );
}
