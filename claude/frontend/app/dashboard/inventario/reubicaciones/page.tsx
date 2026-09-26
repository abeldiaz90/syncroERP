'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRightLeft, CheckCircle2, RefreshCw, ShieldAlert } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAvisos } from '@/components/ui';
import { BuscadorSeleccion } from '@/components/ui/BuscadorSeleccion';

type StockUb={id:string;productoId:string;almacenId:string;ubicacionId:string;loteId?:string;estado:string;cantidad:number;producto?:{nombre:string;sku:string};almacen?:{nombre:string};ubicacion?:{codigo:string};lote?:{numeroLote:string}};
type Ubicacion={id:string;almacenId:string;codigo:string;estado:string;activo:boolean};
type Diferencia={productoId:string;almacenId:string;sku?:string;producto?:string;almacen?:string;stockAlmacen:number;stockUbicado:number;sinUbicar?:number};

/*
 * ============================================================================
 * Lo que está en el almacén y todavía no tiene sitio
 * ----------------------------------------------------------------------------
 * Esta pantalla avisaba «3 productos/almacenes requieren revisión» y no daba
 * ninguna manera de revisarlos: el desplegable de origen se alimenta de las
 * existencias YA ubicadas, que son justamente las que no tienen el problema.
 * La mercancía sin posición —la carga inicial de inventario, y cualquier
 * entrada registrada sin indicar ubicación— no aparecía por ningún lado.
 *
 * Un aviso que nadie puede atender se aprende a ignorar, y entonces deja de
 * avisar de lo que sí importa. Ahora lo sin ubicar entra en el mismo
 * desplegable, marcado como tal, y se coloca desde aquí.
 *
 * La tabla de diferencias, además, enseñaba el uuid del producto y el del
 * almacén. A quien tiene que ir al pasillo a buscar la mercancía,
 * «114773c8-18d2-4720…» no le dice nada.
 * ============================================================================
 */
const CLAVE_SIN_UBICAR='sin-ubicar';
const claveSinUbicar=(d:{productoId:string;almacenId:string})=>`${CLAVE_SIN_UBICAR}:${d.productoId}:${d.almacenId}`;

export default function ReubicacionesPage(){
 const {avisar}=useAvisos();
 const [stocks,setStocks]=useState<StockUb[]>([]),[ubicaciones,setUbicaciones]=useState<Ubicacion[]>([]),[cargando,setCargando]=useState(true),[guardando,setGuardando]=useState(false);
 const [form,setForm]=useState({stockUbicacionId:'',ubicacionDestinoId:'',cantidad:'',motivo:''});
 const [intento,setIntento]=useState(false),[integridad,setIntegridad]=useState<any>(null);

 /* Lo que está en el almacén sin posición asignada, por producto y almacén. */
 const sinUbicar=useMemo<Diferencia[]>(()=>((integridad?.diferencias??[]) as Diferencia[]).filter(d=>Number(d.sinUbicar??(Number(d.stockAlmacen)-Number(d.stockUbicado)))>0),[integridad]);

 /*
  * El origen puede ser una existencia ya ubicada o un pendiente de ubicar.
  * Se resuelven a la misma forma para que el resto de la pantalla no tenga
  * que saber de cuál de las dos se trata.
  */
 const origen=useMemo(()=>{
  const ubicada=stocks.find(x=>x.id===form.stockUbicacionId);
  if(ubicada) return {tipo:'ubicada' as const,almacenId:ubicada.almacenId,ubicacionId:ubicada.ubicacionId,cantidad:Number(ubicada.cantidad),productoId:ubicada.productoId};
  const d=sinUbicar.find(x=>claveSinUbicar(x)===form.stockUbicacionId);
  if(d) return {tipo:'sinUbicar' as const,almacenId:d.almacenId,ubicacionId:undefined,cantidad:Number(d.sinUbicar??(Number(d.stockAlmacen)-Number(d.stockUbicado))),productoId:d.productoId};
  return undefined;
 },[stocks,sinUbicar,form.stockUbicacionId]);

 const destinos=useMemo(()=>ubicaciones.filter(u=>u.activo&&u.estado==='DISPONIBLE'&&u.almacenId===origen?.almacenId&&u.id!==origen?.ubicacionId),[ubicaciones,origen]);
 const opcionesOrigen=useMemo(()=>[
  ...sinUbicar.map(d=>({valor:claveSinUbicar(d),etiqueta:`${d.sku?d.sku+' · ':''}${d.producto??d.productoId}`,detalle:`SIN UBICAR · ${d.almacen??d.almacenId} · ${Number(d.sinUbicar??(Number(d.stockAlmacen)-Number(d.stockUbicado)))}`})),
  ...stocks.filter(x=>Number(x.cantidad)>0).map(x=>({valor:x.id,etiqueta:`${x.producto?.sku} · ${x.producto?.nombre}`,detalle:`${x.almacen?.nombre} / ${x.ubicacion?.codigo} · Lote ${x.lote?.numeroLote||'S/L'} · ${Number(x.cantidad)}`})),
 ],[sinUbicar,stocks]);

 const errores={stockUbicacionId:!form.stockUbicacionId?'Selecciona la existencia de origen':'',ubicacionDestinoId:!form.ubicacionDestinoId?'Selecciona la ubicación destino':'',cantidad:!form.cantidad||Number(form.cantidad)<=0?'La cantidad debe ser mayor a cero':origen&&Number(form.cantidad)>origen.cantidad?`Solo hay ${origen.cantidad} disponibles`:'',motivo:form.motivo.trim().length<5?'Captura un motivo de al menos 5 caracteres':''};
 const cargar=async()=>{setCargando(true);try{const [s,u,i]=await Promise.all([api.get<StockUb[]>('/catalogo/wms/stock-ubicaciones'),api.get<Ubicacion[]>('/catalogo/wms/ubicaciones'),api.get<any>('/catalogo/wms/integridad-ubicaciones')]);setStocks(Array.isArray(s)?s:[]);setUbicaciones(Array.isArray(u)?u:[]);setIntegridad(i);}catch(e){avisar(e instanceof ApiError?e.mensajeParaPantalla():'No se pudo cargar inventario físico.','error');}finally{setCargando(false)}};
 useEffect(()=>{cargar()},[]);
 const guardar=async(e:React.FormEvent)=>{e.preventDefault();setIntento(true);if(Object.values(errores).some(Boolean)||!origen)return;setGuardando(true);try{
  /* Dos llamadas con el cuerpo a la vista, y no una con el cuerpo en una
     variable: así la prueba que compara lo que manda la pantalla con lo que
     acepta el DTO puede leerlo. Un cuerpo que sólo existe en tiempo de
     ejecución no lo vigila nadie. */
  if(origen.tipo==='sinUbicar') await api.post('/catalogo/wms/reubicaciones',{productoId:origen.productoId,almacenId:origen.almacenId,ubicacionDestinoId:form.ubicacionDestinoId,cantidad:Number(form.cantidad),motivo:form.motivo.trim()});
  else await api.post('/catalogo/wms/reubicaciones',{stockUbicacionId:form.stockUbicacionId,ubicacionDestinoId:form.ubicacionDestinoId,cantidad:Number(form.cantidad),motivo:form.motivo.trim()});
  avisar(origen.tipo==='sinUbicar'?'Existencia ubicada. El total del almacén no cambió.':'Existencia reubicada sin modificar el total del almacén.','exito');
  setForm({stockUbicacionId:'',ubicacionDestinoId:'',cantidad:'',motivo:''});setIntento(false);await cargar();
 }catch(e){avisar(e instanceof ApiError?e.mensajeParaPantalla():'No se pudo reubicar.','error')}finally{setGuardando(false)}};
 return <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
  <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-black flex items-center gap-3"><ArrowRightLeft/>Reubicaciones internas</h1><p className="text-slate-500">Coloca existencias sin posición y mueve las ya ubicadas dentro del mismo almacén, conservando lote y estado.</p></div><Link href="/dashboard/inventario/ubicaciones" className="px-4 py-2 rounded-xl border font-semibold">Administrar ubicaciones</Link></div>
  <div className={`rounded-2xl border p-4 flex items-center gap-3 ${integridad?.ok?'bg-emerald-50 border-emerald-200 text-emerald-800':'bg-amber-50 border-amber-200 text-amber-800'}`}>{integridad?.ok?<CheckCircle2/>:<ShieldAlert/>}<div><b>{integridad?.ok?'Stock físico consistente':'Hay existencias sin posición'}</b><p className="text-sm">{integridad?.ok?'El total ubicado coincide con el stock consolidado.':`${integridad?.totalDiferencias||0} producto(s) están en el almacén sin sitio asignado. Aparecen arriba en «Existencia origen» para colocarlos.`}</p></div><button onClick={cargar} className="ml-auto p-2"><RefreshCw className={cargando?'animate-spin':''}/></button></div>
  <form onSubmit={guardar} noValidate className="bg-white border rounded-3xl p-6 grid md:grid-cols-2 gap-4 shadow-sm">
   {intento&&Object.values(errores).some(Boolean)&&<div className="md:col-span-2 rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm font-semibold text-rose-700">Corrige los campos marcados antes de continuar.</div>}
   <label className="space-y-1"><span className="text-sm font-bold">Existencia origen *</span><BuscadorSeleccion valor={form.stockUbicacionId} onChange={(stockUbicacionId)=>setForm({...form,stockUbicacionId,ubicacionDestinoId:''})} opciones={opcionesOrigen} placeholder="Buscar producto, ubicación o lote…"/>{origen?.tipo==='sinUbicar'&&<p className="text-xs font-semibold text-amber-700">Está en el almacén sin posición: al colocarla el total no cambia, sólo aparece dónde está.</p>}{intento&&errores.stockUbicacionId&&<p className="text-xs font-semibold text-rose-600">{errores.stockUbicacionId}</p>}</label>
   <label className="space-y-1"><span className="text-sm font-bold">Ubicación destino *</span><select disabled={!origen} className={`w-full p-3 border rounded-xl disabled:bg-slate-100 ${intento&&errores.ubicacionDestinoId?'border-rose-400':''}`} value={form.ubicacionDestinoId} onChange={e=>setForm({...form,ubicacionDestinoId:e.target.value})}><option value="">Selecciona destino</option>{destinos.map(x=><option key={x.id} value={x.id}>{x.codigo}</option>)}</select>{origen&&destinos.length===0&&<p className="text-xs font-semibold text-amber-700">Ese almacén no tiene posiciones disponibles. Da de alta una en «Administrar ubicaciones».</p>}{intento&&errores.ubicacionDestinoId&&<p className="text-xs font-semibold text-rose-600">{errores.ubicacionDestinoId}</p>}</label>
   <label className="space-y-1"><span className="text-sm font-bold">Cantidad *</span><input type="number" min="0.0001" step="0.0001" className={`w-full p-3 border rounded-xl ${intento&&errores.cantidad?'border-rose-400':''}`} value={form.cantidad} onChange={e=>setForm({...form,cantidad:e.target.value})}/>{intento&&errores.cantidad&&<p className="text-xs font-semibold text-rose-600">{errores.cantidad}</p>}</label>
   <label className="space-y-1"><span className="text-sm font-bold">Motivo *</span><input className={`w-full p-3 border rounded-xl ${intento&&errores.motivo?'border-rose-400':''}`} placeholder="Reorganización, picking, consolidación..." value={form.motivo} onChange={e=>setForm({...form,motivo:e.target.value})}/>{intento&&errores.motivo&&<p className="text-xs font-semibold text-rose-600">{errores.motivo}</p>}</label>
   <button disabled={guardando} className="md:col-span-2 bg-slate-900 text-white rounded-xl py-3 font-bold disabled:opacity-50">{guardando?'Moviendo...':'Confirmar reubicación'}</button>
  </form>
  {!integridad?.ok&&integridad?.diferencias?.length>0&&<div className="bg-white border rounded-3xl overflow-hidden"><div className="p-5 border-b font-black">Existencias sin posición</div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50"><tr><th className="p-3 text-left">Producto</th><th className="p-3 text-left">Almacén</th><th>Stock almacén</th><th>Ubicado</th><th>Sin ubicar</th><th></th></tr></thead><tbody>{(integridad.diferencias as Diferencia[]).map((d,i)=><tr key={i} className="border-t"><td className="p-3"><span className="font-semibold">{d.producto??d.productoId}</span>{d.sku&&<span className="ml-2 text-xs font-mono text-slate-500">{d.sku}</span>}</td><td className="p-3">{d.almacen??d.almacenId}</td><td className="text-center">{Number(d.stockAlmacen)}</td><td className="text-center">{Number(d.stockUbicado)}</td><td className="text-center font-bold text-amber-700">{Number(d.sinUbicar??(Number(d.stockAlmacen)-Number(d.stockUbicado)))}</td><td className="p-3 text-right"><button type="button" onClick={()=>{setForm({...form,stockUbicacionId:claveSinUbicar(d),ubicacionDestinoId:'',cantidad:String(Number(d.sinUbicar??(Number(d.stockAlmacen)-Number(d.stockUbicado))))});window.scrollTo({top:0,behavior:'smooth'});}} className="px-3 py-1.5 rounded-lg border font-semibold hover:bg-slate-50">Ubicar</button></td></tr>)}</tbody></table></div></div>}
 </div>
}
