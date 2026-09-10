"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { CheckCircle2, AlertTriangle, XCircle, ArrowRight, RefreshCw, ShoppingCart, Truck, Package, Calculator, Settings } from 'lucide-react';

type Req={codigo:string;titulo:string;completo:boolean;bloqueante:boolean;ruta:string;detalle?:string};
type Mod={porcentaje:number;estado:string;requisitos:Req[];bloqueantes:Req[]};
type Diag={porcentajeGeneral:number;puedeVender:boolean;puedeComprar:boolean;puedeControlarInventario:boolean;puedeUsarCredito:boolean;puedeContabilizar:boolean;bloqueantes:Req[];modulos:Record<string,Mod>};
const meta:Record<string,{titulo:string;desc:string;icon:any}>={
 general:{titulo:'Configuración general',desc:'Datos fiscales, impuestos y almacén base',icon:Settings},
 ventas:{titulo:'Ventas',desc:'Productos, precios, clientes y cobro',icon:ShoppingCart},
 compras:{titulo:'Compras',desc:'Proveedores, aprobaciones y ciclo de compra',icon:Truck},
 inventario:{titulo:'Inventario',desc:'Almacenes, ubicaciones y existencias',icon:Package},
 credito:{titulo:'Crédito y cobranza',desc:'Clientes, límites, vencimientos y recuperación',icon:ShoppingCart},
 finanzas:{titulo:'Finanzas',desc:'Plan contable, bancos y contabilización',icon:Calculator},
};
export default function CentroConfiguracion(){
 const router=useRouter(); const [d,setD]=useState<Diag|null>(null); const [error,setError]=useState(''); const [cargando,setCargando]=useState(true);
 const cargar=async()=>{setCargando(true);setError('');try{setD(await api.get<Diag>('/configuracion/diagnostico'));}catch(e){setError(e instanceof ApiError?e.mensajeParaPantalla():'No se pudo evaluar la configuración.');}finally{setCargando(false)}};
 useEffect(()=>{cargar()},[]);
 if(cargando)return <div className="p-8">Evaluando la preparación de la empresa…</div>;
 if(error)return <div className="p-8"><div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</div></div>;
 if(!d)return null;
 return <div className="mx-auto max-w-7xl p-6 space-y-6">
  <div className="rounded-3xl bg-slate-950 text-white p-7">
   <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm text-slate-300">Centro de preparación empresarial</p><h1 className="text-3xl font-bold">Tu empresa está al {d.porcentajeGeneral}%</h1><p className="mt-2 text-slate-300">Completa únicamente lo que necesitas para cada operación.</p></div><button onClick={cargar} className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2"><RefreshCw size={16}/>Validar nuevamente</button></div>
   <div className="mt-5 h-3 rounded-full bg-white/15"><div className="h-3 rounded-full bg-emerald-400" style={{width:`${d.porcentajeGeneral}%`}}/></div>
  </div>
  <div className="grid gap-4 md:grid-cols-5">
   {[['Vender',d.puedeVender],['Comprar',d.puedeComprar],['Controlar inventario',d.puedeControlarInventario],['Usar crédito',d.puedeUsarCredito],['Contabilizar',d.puedeContabilizar]].map(([t,ok])=><div key={String(t)} className={`rounded-2xl border p-4 ${ok?'border-emerald-200 bg-emerald-50':'border-amber-200 bg-amber-50'}`}>{ok?<CheckCircle2 className="text-emerald-600"/>:<AlertTriangle className="text-amber-600"/>}<p className="mt-2 font-semibold">{String(t)}</p><p className="text-sm">{ok?'Listo para operar':'Requiere configuración'}</p></div>)}
  </div>
  <div className="grid gap-5 lg:grid-cols-2">{(Object.entries(d.modulos) as Array<[string, Mod]>).map(([k,m])=>{const x=meta[k]??meta.general;const Icon=x.icon;return <section key={k} className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div className="flex gap-3"><div className="rounded-xl bg-slate-100 p-3"><Icon size={22}/></div><div><h2 className="font-bold text-lg">{x.titulo}</h2><p className="text-sm text-slate-500">{x.desc}</p></div></div><span className="font-bold">{m.porcentaje}%</span></div><div className="my-4 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-indigo-600" style={{width:`${m.porcentaje}%`}}/></div><div className="space-y-2">{m.requisitos.map(r=><button key={r.codigo} onClick={()=>router.push(r.ruta)} className="w-full flex items-center gap-3 rounded-xl border p-3 text-left hover:bg-slate-50">{r.completo?<CheckCircle2 size={18} className="text-emerald-600"/>:r.bloqueante?<XCircle size={18} className="text-red-500"/>:<AlertTriangle size={18} className="text-amber-500"/>}<span className="flex-1 text-sm font-medium">{r.titulo}</span>{!r.completo&&<ArrowRight size={16}/>}</button>)}</div>{['ventas','compras','inventario','credito','finanzas'].includes(k)&&<button onClick={()=>router.push(`/dashboard/configuracion/wizard-${k}`)} className="mt-4 w-full rounded-xl bg-sky-600 px-4 py-3 font-semibold text-white">Abrir wizard de {k}</button>}</section>})}</div>
 </div>
}
