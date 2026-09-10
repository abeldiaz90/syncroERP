'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, MapPin, Loader2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAvisos } from '@/components/ui';

type Form = { almacenId:string; codigo:string; zona:string; pasillo:string; rack:string; nivel:string; posicion:string; estado:string };
const VACIO:Form={almacenId:'',codigo:'',zona:'',pasillo:'',rack:'',nivel:'',posicion:'',estado:'DISPONIBLE'};
export default function Page(){
 const {avisar}=useAvisos();
 const [almacenes,setAlmacenes]=useState<any[]>([]),[items,setItems]=useState<any[]>([]),[f,setF]=useState<Form>(VACIO);
 const [tocados,setTocados]=useState<Record<string,boolean>>({}),[guardando,setGuardando]=useState(false);
 const errores=useMemo(()=>({
  almacenId:!f.almacenId?'Selecciona un almacén':'',
  codigo:!f.codigo.trim()?'El código es obligatorio':f.codigo.trim().length<2?'Captura al menos 2 caracteres':'',
 }),[f]);
 const load=async()=>{const[a,u]=await Promise.all([api.get<any[]>('/catalogo/almacenes'),api.get<any[]>('/catalogo/wms/ubicaciones')]);setAlmacenes(Array.isArray(a)?a:[]);setItems(Array.isArray(u)?u:[])};
 useEffect(()=>{load().catch(()=>{})},[]);
 const setCampo=(k:keyof Form,v:string)=>setF(x=>({...x,[k]:v}));
 const tocar=(k:string)=>setTocados(x=>({...x,[k]:true}));
 const save=async(e:React.FormEvent)=>{e.preventDefault();setTocados({almacenId:true,codigo:true});if(Object.values(errores).some(Boolean))return;setGuardando(true);try{await api.post('/catalogo/wms/ubicaciones',{...f,codigo:f.codigo.trim().toUpperCase(),zona:f.zona.trim(),pasillo:f.pasillo.trim(),rack:f.rack.trim(),nivel:f.nivel.trim(),posicion:f.posicion.trim()});setF(VACIO);setTocados({});await load();avisar('Ubicación física registrada.','exito')}catch(e){avisar(e instanceof ApiError?e.mensajeParaPantalla():'No se guardó la ubicación.','error')}finally{setGuardando(false)}};
 const cls=(k:string)=>`p-3 border rounded-xl outline-none ${tocados[k]&&(errores as any)[k]?'border-rose-400 ring-2 ring-rose-100':'border-slate-300 focus:ring-2 focus:ring-indigo-100'}`;
 return <div className="p-8 max-w-6xl mx-auto space-y-6"><Link href="/dashboard/inventario/transferencias" className="flex gap-2"><ArrowLeft/>Transferencias</Link><h1 className="text-3xl font-black flex gap-3"><MapPin/>Ubicaciones internas</h1>
 <form onSubmit={save} noValidate className="grid md:grid-cols-4 gap-3 bg-white border p-6 rounded-3xl">
  <div><select className={cls('almacenId')} value={f.almacenId} onBlur={()=>tocar('almacenId')} onChange={e=>setCampo('almacenId',e.target.value)} aria-invalid={Boolean(tocados.almacenId&&errores.almacenId)}><option value="">Almacén</option>{almacenes.map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}</select>{tocados.almacenId&&errores.almacenId&&<p className="mt-1 text-xs font-semibold text-rose-600">{errores.almacenId}</p>}</div>
  <div><input className={cls('codigo')} placeholder="CÓDIGO *" value={f.codigo} onBlur={()=>tocar('codigo')} onChange={e=>setCampo('codigo',e.target.value)} aria-invalid={Boolean(tocados.codigo&&errores.codigo)}/>{tocados.codigo&&errores.codigo&&<p className="mt-1 text-xs font-semibold text-rose-600">{errores.codigo}</p>}</div>
  {(['zona','pasillo','rack','nivel','posicion'] as (keyof Form)[]).map(k=><input key={k} className="p-3 border border-slate-300 rounded-xl" placeholder={k.toUpperCase()} value={f[k]} onChange={e=>setCampo(k,e.target.value)}/>)}
  <select className="p-3 border border-slate-300 rounded-xl" value={f.estado} onChange={e=>setCampo('estado',e.target.value)}><option>DISPONIBLE</option><option>BLOQUEADA</option><option>CUARENTENA</option><option>RECEPCION</option><option>EMBARQUE</option></select>
  <button disabled={guardando} className="bg-slate-900 text-white rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">{guardando&&<Loader2 className="animate-spin" size={18}/>}Agregar</button>
 </form>
 <div className="bg-white border rounded-3xl overflow-hidden"><table className="w-full"><thead className="bg-slate-50"><tr><th className="p-4 text-left">Código</th><th>Almacén</th><th>Ruta física</th><th>Estado</th></tr></thead><tbody>{items.map(x=><tr className="border-t" key={x.id}><td className="p-4 font-bold">{x.codigo}</td><td>{x.almacen?.nombre}</td><td>{[x.zona,x.pasillo,x.rack,x.nivel,x.posicion].filter(Boolean).join(' / ')}</td><td>{x.estado}</td></tr>)}</tbody></table></div></div>}
