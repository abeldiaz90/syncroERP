"use client";
import { useState, useEffect, useCallback } from 'react';
import { fechaCorta } from '@/lib/fechas';
import { CreditCard, Search, Filter, RefreshCw, DollarSign,
  User, ChevronRight, CheckCircle2, Clock, AlertCircle, XCircle } from 'lucide-react';
import Link from 'next/link';

interface ICredito {
  id: string;
  folio: string;
  tipoCredito: string;
  montoTotal: number;
  saldoPendiente: number;
  estado: string;
  fechaInicio: string;
  fechaVencimiento: string;
  numeroCuotas: number;
  sinInteres: boolean;
  clienteId: string;
  cliente?: { nombre: string; rfc?: string };
  cuotas?: Array<{ estado: string }>;
}

const fmt$ = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);

const fmtFecha = (s: string) =>
  fechaCorta(s);

const TIPO_LABEL: Record<string, string> = {
  CREDITO_30D: '30 días', CREDITO_60D: '60 días', CREDITO_90D: '90 días',
  MENSUALIDADES: 'Mensualidades', MSI_BANCO: 'MSI Banco',
};

const ESTADO_CONFIG: Record<string, { label: string; icon: any; cls: string }> = {
  ACTIVO:    { label: 'Activo',     icon: Clock,         cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  LIQUIDADO: { label: 'Liquidado',  icon: CheckCircle2,  cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  VENCIDO:   { label: 'Vencido',    icon: AlertCircle,   cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  CANCELADO: { label: 'Cancelado',  icon: XCircle,       cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

export default function CreditosPage() {
  const [creditos, setCreditos]         = useState<ICredito[]>([]);
  const [cargando, setCargando]         = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [busqueda, setBusqueda]         = useState('');
  const [filtroEstado, setFiltroEstado] = useState('ACTIVO');

  const api = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:4000/api');
  const tok = () => (typeof window !== 'undefined' ? localStorage.getItem('syncro_token') ?? '' : '');

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const url = `${api}/credito/creditos${filtroEstado ? `?estado=${filtroEstado}` : ''}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${tok()}` } });
      if (res.ok) { setCreditos(await res.json()); setErrorCarga(''); }
      else {
        /* «Sin créditos» es una afirmación sobre la cartera, no un hueco. */
        setCreditos([]);
        setErrorCarga(res.status === 403
          ? 'Tu perfil no incluye la consulta de créditos.'
          : 'No se pudo consultar la cartera de créditos.');
      }
    } finally {
      setCargando(false);
    }
  }, [filtroEstado, api]);

  useEffect(() => { cargar(); }, [cargar]);

  const filtrados = creditos.filter(c => {
    if (!busqueda) return true;
    const q = busqueda.toLowerCase();
    return c.folio.toLowerCase().includes(q) ||
      (c.cliente?.nombre ?? '').toLowerCase().includes(q) ||
      (c.cliente?.rfc ?? '').toLowerCase().includes(q);
  });

  const cuotasVencidas = (c: ICredito) =>
    (c.cuotas ?? []).filter(cu => cu.estado === 'VENCIDA').length;

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">

      {errorCarga && (
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {errorCarga}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-500 mb-1">
            Crédito & Cobranza
          </p>
          <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
            <CreditCard className="w-8 h-8 text-indigo-500" /> Créditos
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Gestión de créditos otorgados a clientes.
          </p>
        </div>
        <button onClick={cargar}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 text-sm font-medium hover:bg-slate-50 shadow-sm">
          <RefreshCw className="w-4 h-4" /> Actualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="flex-1 min-w-48 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por folio o cliente..."
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm" />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          {[
            { v: 'ACTIVO', l: 'Activos' },
            { v: 'VENCIDO', l: 'Vencidos' },
            { v: 'LIQUIDADO', l: 'Liquidados' },
            { v: '', l: 'Todos' },
          ].map(({ v, l }) => (
            <button key={v} onClick={() => setFiltroEstado(v)}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
                filtroEstado === v
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'
              }`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-slate-900 text-white px-6 py-3 flex justify-between items-center">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
            Registro de Créditos
          </p>
          <p className="text-xs text-slate-400">{filtrados.length} crédito(s)</p>
        </div>

        {cargando ? (
          <div className="p-16 text-center">
            <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-slate-400 text-sm">Cargando créditos...</p>
          </div>
        ) : filtrados.length === 0 ? (
          <div className="p-16 text-center">
            <CreditCard className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="font-semibold text-slate-600">Sin créditos {filtroEstado ? filtroEstado.toLowerCase() + 's' : ''}</p>
            <p className="text-sm text-slate-400 mt-1">
              Los créditos se crean automáticamente desde el POS al vender con método de crédito.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-semibold">
                  <th className="px-5 py-3 text-left">Folio</th>
                  <th className="px-5 py-3 text-left">Cliente</th>
                  <th className="px-5 py-3 text-center">Tipo</th>
                  <th className="px-5 py-3 text-center">Estado</th>
                  <th className="px-5 py-3 text-right">Total</th>
                  <th className="px-5 py-3 text-right">Saldo Pendiente</th>
                  <th className="px-5 py-3 text-center">Vencimiento</th>
                  <th className="px-5 py-3 text-center">Avance</th>
                  <th className="px-5 py-3 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtrados.map(c => {
                  const cfg  = ESTADO_CONFIG[c.estado] ?? ESTADO_CONFIG.ACTIVO;
                  const Icon = cfg.icon;
                  const pct  = c.montoTotal > 0
                    ? Math.round((1 - c.saldoPendiente / c.montoTotal) * 100)
                    : 0;
                  const venc = cuotasVencidas(c);

                  return (
                    <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-4">
                        <span className="font-mono font-bold text-indigo-600">{c.folio}</span>
                      </td>
                      <td className="px-5 py-4">
                        {c.cliente ? (
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-slate-400 shrink-0" />
                            <div>
                              <p className="font-medium text-slate-800">{c.cliente.nombre}</p>
                              {c.cliente.rfc && (
                                <p className="text-xs text-slate-400">{c.cliente.rfc}</p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">Sin cliente</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-xs font-medium text-slate-600">
                            {TIPO_LABEL[c.tipoCredito] ?? c.tipoCredito}
                          </span>
                          {c.sinInteres && (
                            <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                              Sin interés
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border ${cfg.cls}`}>
                          <Icon className="w-3 h-3" /> {cfg.label}
                        </span>
                        {venc > 0 && (
                          <p className="text-[10px] text-rose-600 font-bold mt-0.5">{venc} cuota(s) vencida(s)</p>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right font-mono text-slate-700">{fmt$(c.montoTotal)}</td>
                      <td className="px-5 py-4 text-right">
                        <span className={`font-mono font-bold ${c.saldoPendiente > 0 ? 'text-slate-900' : 'text-emerald-600'}`}>
                          {fmt$(c.saldoPendiente)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center text-xs text-slate-500">
                        {fmtFecha(c.fechaVencimiento)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2 min-w-[80px]">
                          <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                            <div className={`h-1.5 rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                              style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[10px] font-bold text-slate-500 w-8 text-right">{pct}%</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <Link href="/dashboard/creditos/cobranza"
                          className="inline-flex items-center gap-1 text-xs text-indigo-600 font-semibold hover:underline">
                          <DollarSign className="w-3.5 h-3.5" /> Cobrar
                          <ChevronRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
