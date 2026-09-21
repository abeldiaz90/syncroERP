"use client";
import { useState, useEffect } from 'react';
import { AlertTriangle, TrendingDown, Clock, Users, DollarSign, RefreshCw, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { ProtectedElement } from '@/app/components/ProtectedElement';

interface IAgingItem {
  cuota: {
    id: string; numeroCuota: number; fechaVencimiento: string;
    montoCuota: number; montoPagado: number;
    credito: {
      id: string; folio: string; tipoCredito: string;
      clienteId: string;
      cliente?: { nombre: string; rfc?: string };
    };
  };
  diasVencida: number;
  montoPendiente: number;
}
interface ICartera {
  corriente: IAgingItem[];
  d30: IAgingItem[];
  d60: IAgingItem[];
  d90: IAgingItem[];
  d90mas: IAgingItem[];
}

const fmt$ = (n: number) => new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(n);
const fmtFecha = (s: string) => new Date(s+'T00:00:00').toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'});

const BUCKETS = [
  { key:'corriente', label:'Al corriente',  color:'emerald', dias:'0 días',     bg:'bg-emerald-50', border:'border-emerald-200', text:'text-emerald-700', header:'bg-emerald-600' },
  { key:'d30',       label:'1 – 30 días',   color:'amber',   dias:'1-30 días',  bg:'bg-amber-50',   border:'border-amber-200',   text:'text-amber-700',   header:'bg-amber-500' },
  { key:'d60',       label:'31 – 60 días',  color:'orange',  dias:'31-60 días', bg:'bg-orange-50',  border:'border-orange-200',  text:'text-orange-700',  header:'bg-orange-500' },
  { key:'d90',       label:'61 – 90 días',  color:'rose',    dias:'61-90 días', bg:'bg-rose-50',    border:'border-rose-200',    text:'text-rose-700',    header:'bg-rose-500' },
  { key:'d90mas',    label:'Más de 90 días',color:'red',     dias:'+90 días',   bg:'bg-red-50',     border:'border-red-200',     text:'text-red-700',     header:'bg-red-700' },
] as const;

export default function CarteraVencidaPage() {
  const [cartera, setCartera]     = useState<ICartera|null>(null);
  const [cargando, setCargando]   = useState(true);
  const [bucketAbierto, setBucketAbierto] = useState<string>('d30');

  const api = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:4000/api');
  const tok = () => localStorage.getItem('syncro_token') ?? '';

  /*
   * ══════════════════════════════════════════════════════════════════════════
   * Abrir una pantalla no debe escribir en la base
   * --------------------------------------------------------------------------
   * Aquí se hacía `POST /credito/cobranza/actualizar-vencidos` en cada carga,
   * antes de leer. Dos problemas:
   *
   *  · Ver un reporte marcaba cuotas como vencidas. Un movimiento con efecto
   *    contable disparado por mirar, sin que nadie lo pidiera y sin quedar
   *    claro en la bitácora quién decidió qué.
   *  · Los roles que consultan crédito en sólo lectura —finanzas, tesorería,
   *    gerencia, dirección— no tienen ese POST: recibían un 403 que el código
   *    ni siquiera miraba (`await fetch` sin comprobar), así que veían el
   *    reporte sin saber que no se había recalculado.
   *
   * El recálculo ya lo hace la tarea programada `cobranza-cron` para todas las
   * empresas. Aquí se lee y punto; quien además pueda recalcular tiene el botón
   * de abajo, que lo hace a propósito y avisa del resultado.
   * ══════════════════════════════════════════════════════════════════════════
   */
  const cargar = async () => {
    setCargando(true);
    try {
      const res = await fetch(`${api}/credito/creditos/cartera-vencida`,{
        headers:{ Authorization:`Bearer ${tok()}` }
      });
      if (res.ok) setCartera(await res.json());
    } finally { setCargando(false); }
  };

  const [recalculando, setRecalculando] = useState(false);
  const recalcular = async () => {
    setRecalculando(true);
    try {
      await fetch(`${api}/credito/cobranza/actualizar-vencidos`, {
        method:'POST', headers:{ Authorization:`Bearer ${tok()}` }
      });
      await cargar();
    } finally { setRecalculando(false); }
  };

  useEffect(() => { cargar(); }, []);

  const totalBucket = (items: IAgingItem[]) => items.reduce((s,i)=>s+i.montoPendiente, 0);
  const totalGeneral = cartera ? (Object.values(cartera) as IAgingItem[][]).reduce((s,b)=>s+totalBucket(b), 0) : 0;
  const totalVencido = cartera ? totalBucket(cartera.d30)+totalBucket(cartera.d60)+totalBucket(cartera.d90)+totalBucket(cartera.d90mas) : 0;
  const clientesUnicos = (items: IAgingItem[]) => new Set(items.map(i=>i.cuota.credito.clienteId)).size;

  if (cargando) return (
    <div className="p-16 text-center">
      <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
      <p className="text-slate-400 text-sm">Cargando cartera...</p>
    </div>
  );

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-500 mb-1">Crédito & Cobranza</p>
          <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
            <TrendingDown className="w-8 h-8 text-rose-500"/> Cartera Vencida
          </h1>
          <p className="text-slate-500 text-sm mt-1">Análisis de antigüedad de saldos (aging report).</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={cargar}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 text-sm font-medium hover:bg-slate-50 shadow-sm">
            <RefreshCw className="w-4 h-4"/> Actualizar
          </button>
          {/* Recalcular SÍ escribe: sólo aparece para quien puede hacerlo. */}
          <ProtectedElement metodo="POST" ruta="/api/credito/cobranza/actualizar-vencidos">
            <button onClick={recalcular} disabled={recalculando}
              title="Vuelve a clasificar las cuotas por días de atraso"
              className="flex items-center gap-2 px-4 py-2 bg-rose-600 text-white rounded-xl text-sm font-semibold hover:bg-rose-700 shadow-sm disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${recalculando ? 'animate-spin' : ''}`}/>
              {recalculando ? 'Recalculando…' : 'Recalcular antigüedad'}
            </button>
          </ProtectedElement>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-bold uppercase text-slate-500 mb-1">Cartera Total</p>
          <p className="text-2xl font-black text-slate-900">{fmt$(totalGeneral)}</p>
          <p className="text-xs text-slate-400 mt-1">{cartera?(Object.values(cartera) as IAgingItem[][]).reduce((s,b)=>s+b.length,0):0} cuotas</p>
        </div>
        <div className="bg-white rounded-2xl border border-rose-200 p-5 shadow-sm">
          <p className="text-xs font-bold uppercase text-rose-500 mb-1">Total Vencido</p>
          <p className="text-2xl font-black text-rose-600">{fmt$(totalVencido)}</p>
          <p className="text-xs text-rose-400 mt-1">{totalGeneral>0?Math.round(totalVencido/totalGeneral*100):0}% de la cartera</p>
        </div>
        <div className="bg-white rounded-2xl border border-amber-200 p-5 shadow-sm">
          <p className="text-xs font-bold uppercase text-amber-500 mb-1">Más de 90 días</p>
          <p className="text-2xl font-black text-amber-600">{fmt$(cartera?totalBucket(cartera.d90mas):0)}</p>
          <p className="text-xs text-amber-400 mt-1">{cartera?.d90mas?.length??0} cuotas críticas</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-bold uppercase text-slate-500 mb-1">Clientes con adeudo</p>
          <p className="text-2xl font-black text-slate-900">
            {cartera?clientesUnicos([...cartera.d30,...cartera.d60,...cartera.d90,...cartera.d90mas]):0}
          </p>
          <p className="text-xs text-slate-400 mt-1">con saldo vencido</p>
        </div>
      </div>

      {/* Aging table visual */}
      {cartera&&(
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="font-bold text-slate-800">Distribución por antigüedad</h2>
          </div>
          <div className="p-6">
            {/* Barra visual */}
            <div className="flex h-8 rounded-xl overflow-hidden mb-4">
              {BUCKETS.map(b=>{
                const items = cartera[b.key as keyof ICartera] as IAgingItem[];
                const pct = totalGeneral>0 ? totalBucket(items)/totalGeneral*100 : 0;
                if (pct<0.5) return null;
                return (
                  <div key={b.key} className={`${b.header} transition-all`} style={{width:`${pct}%`}} title={`${b.label}: ${fmt$(totalBucket(items))}`}/>
                );
              })}
            </div>
            {/* Leyenda */}
            <div className="grid grid-cols-5 gap-3">
              {BUCKETS.map(b=>{
                const items = cartera[b.key as keyof ICartera] as IAgingItem[];
                const monto = totalBucket(items);
                const pct = totalGeneral>0 ? Math.round(monto/totalGeneral*100) : 0;
                return (
                  <div key={b.key} className={`p-3 rounded-xl border ${b.bg} ${b.border} cursor-pointer transition-all ${bucketAbierto===b.key?'ring-2 ring-offset-1 ring-indigo-400':''}`}
                    onClick={()=>setBucketAbierto(bucketAbierto===b.key?'':b.key)}>
                    <p className={`text-xs font-bold ${b.text}`}>{b.label}</p>
                    <p className={`text-lg font-black ${b.text} mt-1`}>{fmt$(monto)}</p>
                    <p className={`text-[10px] ${b.text} opacity-70`}>{items.length} cuotas · {pct}%</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Detalle del bucket seleccionado */}
      {cartera&&bucketAbierto&&(()=>{
        const bucket = BUCKETS.find(b=>b.key===bucketAbierto)!;
        const items = cartera[bucketAbierto as keyof ICartera] as IAgingItem[];
        if (!items||items.length===0) return (
          <div className={`rounded-2xl border ${bucket.bg} ${bucket.border} p-8 text-center`}>
            <p className={`font-semibold ${bucket.text}`}>Sin cuotas en este rango</p>
          </div>
        );
        return (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className={`flex items-center justify-between px-6 py-4 ${bucket.bg} border-b ${bucket.border}`}>
              <h3 className={`font-bold ${bucket.text}`}>{bucket.label} — {items.length} cuota(s)</h3>
              <span className={`font-black text-lg ${bucket.text}`}>{fmt$(totalBucket(items))}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-semibold">
                    <th className="px-5 py-3 text-left">Cliente</th>
                    <th className="px-5 py-3 text-left">Crédito</th>
                    <th className="px-5 py-3 text-center">Cuota</th>
                    <th className="px-5 py-3 text-center">Vencimiento</th>
                    <th className="px-5 py-3 text-center">Días vencida</th>
                    <th className="px-5 py-3 text-right">Pendiente</th>
                    <th className="px-5 py-3 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.sort((a,b)=>b.diasVencida-a.diasVencida).map((item,idx)=>(
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="px-5 py-3">
                        <p className="font-semibold text-slate-800">{item.cuota.credito.cliente?.nombre??'—'}</p>
                        {item.cuota.credito.cliente?.rfc&&<p className="text-xs text-slate-400">{item.cuota.credito.cliente.rfc}</p>}
                      </td>
                      <td className="px-5 py-3">
                        <span className="font-mono text-xs text-indigo-600">{item.cuota.credito.folio}</span>
                      </td>
                      <td className="px-5 py-3 text-center text-slate-600">#{item.cuota.numeroCuota}</td>
                      <td className="px-5 py-3 text-center text-slate-500 text-xs">{fmtFecha(item.cuota.fechaVencimiento)}</td>
                      <td className="px-5 py-3 text-center">
                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${bucket.bg} ${bucket.text}`}>
                          {item.diasVencida>0?`${item.diasVencida} días`:'Al corriente'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right font-mono font-bold text-slate-900">{fmt$(item.montoPendiente)}</td>
                      <td className="px-5 py-3 text-center">
                        <Link href="/dashboard/creditos/cobranza"
                          className="inline-flex items-center gap-1 text-xs text-indigo-600 font-semibold hover:underline">
                          Cobrar <ChevronRight className="w-3 h-3"/>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 border-t-2 border-slate-300">
                    <td colSpan={5} className="px-5 py-3 text-right text-xs font-bold uppercase text-slate-600 tracking-wider">Total {bucket.label}</td>
                    <td className="px-5 py-3 text-right font-mono font-black text-slate-900">{fmt$(totalBucket(items))}</td>
                    <td/>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
