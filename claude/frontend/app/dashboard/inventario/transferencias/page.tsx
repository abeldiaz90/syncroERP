'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRightLeft, Check, PackageCheck, Truck, X, MapPin, ClipboardCheck, RefreshCw } from 'lucide-react';
import { api, ApiError, conPermiso } from '@/lib/api';
import { useAcciones } from '@/hooks/use-acciones';
import { Boton, Modal, SinDatos, useAvisos } from '@/components/ui';
import { confirmarElegante } from '@/components/ui/dialogos';
import { BuscadorSeleccion } from '@/components/ui/BuscadorSeleccion';

type Transferencia={id:string;folio:string;estado:string;motivo:string;fechaCreacion:string;usuarioId?:string;enviadoPor?:string|null;almacenOrigen?:{nombre:string};almacenDestino?:{id:string;nombre:string};detalles:any[]};
export default function TransferenciasPage(){
 const {avisar}=useAvisos();
 const [productos,setProductos]=useState<any[]>([]),[almacenes,setAlmacenes]=useState<any[]>([]),[transferencias,setTransferencias]=useState<Transferencia[]>([]); const [cargando,setCargando]=useState(true);
 const puedo=useAcciones();
 const [form,setForm]=useState({productoId:'',almacenOrigenId:'',almacenDestinoId:'',ubicacionOrigenId:'',cantidad:'',motivo:''});
 const [stockFisico,setStockFisico]=useState<any[]>([]),[ubicacionesDestino,setUbicacionesDestino]=useState<any[]>([]);
 const [intento,setIntento]=useState(false),[guardando,setGuardando]=useState(false);
 /*
  * El catálogo de productos es de Inventario y esta pantalla es de Almacén.
  * Antes su 403 se tragaba con `.catch(()=>[])`: la pantalla no se caía, pero
  * el buscador de producto salía vacío y parecía que la empresa no tiene
  * catálogo. Un desplegable vacío sin explicación es peor que un error, porque
  * nadie pregunta por él: se asume y se abandona la pantalla.
  */
 const [catalogoVedado,setCatalogoVedado]=useState(false);
 const [recepcion,setRecepcion]=useState<{transferencia:Transferencia;ubicaciones:any[];observaciones:string;destinos:Record<string,string>}|null>(null);
 /* Quién soy, para no ofrecerme una firma que el servidor me va a negar. */
 const [usuarioId,setUsuarioId]=useState<string>('');
 useEffect(()=>{try{setUsuarioId(JSON.parse(localStorage.getItem('syncro_user')||'{}')?.id??'');}catch{setUsuarioId('');}},[]);
 const errores={productoId:!form.productoId?'Selecciona un producto':'',almacenOrigenId:!form.almacenOrigenId?'Selecciona el almacén origen':'',almacenDestinoId:!form.almacenDestinoId?'Selecciona el almacén destino':form.almacenDestinoId===form.almacenOrigenId?'Origen y destino deben ser distintos':'',ubicacionOrigenId:!form.ubicacionOrigenId?'Selecciona la posición física de origen':'',cantidad:!form.cantidad||Number(form.cantidad)<=0?'La cantidad debe ser mayor a cero':'',motivo:!form.motivo.trim()?'El motivo es obligatorio':form.motivo.trim().length<5?'Captura al menos 5 caracteres':''};
 const cargar=async()=>{setCargando(true);try{/* El catalogo de productos es de Inventario y esta pantalla es de Almacen: su 403 no puede dejar sin transferencias a quien si las tiene. */
const [p,a,t]=await Promise.all([conPermiso(api.get<any>('/catalogo/productos',{query:{limite:2000}})),api.get<any[]>('/catalogo/almacenes'),api.get<any>('/catalogo/wms/transferencias',{query:{limite:100}})]);setProductos(Array.isArray(p.valor)?p.valor:(p.valor as any)?.productos||(p.valor as any)?.data||[]);setCatalogoVedado(p.vedado);setAlmacenes(Array.isArray(a)?a:(a as any).almacenes||[]);setTransferencias(Array.isArray(t)?t:t.data||[]);}catch(e){avisar(e instanceof ApiError?e.mensajeParaPantalla():'No se pudo cargar transferencias.','error');}finally{setCargando(false)}};
 useEffect(()=>{cargar()},[]);
 useEffect(()=>{if(!form.productoId||!form.almacenOrigenId){setStockFisico([]);return;}api.get<any[]>('/catalogo/wms/stock-ubicaciones',{query:{productoId:form.productoId,almacenId:form.almacenOrigenId,estado:'DISPONIBLE'}}).then(x=>setStockFisico(Array.isArray(x)?x:[])).catch(()=>setStockFisico([]));},[form.productoId,form.almacenOrigenId]);
 useEffect(()=>{if(!form.almacenDestinoId){setUbicacionesDestino([]);return;}api.get<any[]>('/catalogo/wms/ubicaciones',{query:{almacenId:form.almacenDestinoId}}).then(x=>setUbicacionesDestino(Array.isArray(x)?x:[])).catch(()=>setUbicacionesDestino([]));},[form.almacenDestinoId]);
 const producto=useMemo(()=>productos.find(x=>x.id===form.productoId),[productos,form.productoId]);
 const crear=async(e:React.FormEvent)=>{e.preventDefault();setIntento(true);if(Object.values(errores).some(Boolean))return;setGuardando(true);try{const r=await api.post<any>('/catalogo/wms/transferencias',{almacenOrigenId:form.almacenOrigenId,almacenDestinoId:form.almacenDestinoId,motivo:form.motivo.trim(),detalles:[{productoId:form.productoId,cantidad:Number(form.cantidad),ubicacionOrigenId:form.ubicacionOrigenId}]});avisar(`Solicitud ${r.folio} creada.`, 'exito');setForm({...form,productoId:'',ubicacionOrigenId:'',cantidad:'',motivo:''});setIntento(false);await cargar();}catch(e){avisar(e instanceof ApiError?e.mensajeParaPantalla():'No se creó la transferencia.','error')}finally{setGuardando(false)}};
 const accion=async(t:Transferencia,a:'autorizar'|'enviar'|'recibir'|'cancelar')=>{try{if(a==='recibir'){const ubicaciones=await api.get<any[]>('/catalogo/wms/ubicaciones',{query:{almacenId:t.almacenDestino?.id}});setRecepcion({transferencia:t,ubicaciones:(ubicaciones??[]).filter((u:any)=>u.activo!==false&&u.estado==='DISPONIBLE'),observaciones:'',destinos:{}});return;}if(a==='cancelar'&&!await confirmarElegante(`¿Cancelar la transferencia ${t.folio}?`,{peligroso:true}))return;await api.patch(`/catalogo/wms/transferencias/${t.id}/${a}`);await cargar();avisar('Estado de la transferencia actualizado.','exito');}catch(e){avisar(e instanceof ApiError?e.mensajeParaPantalla():'No se pudo actualizar.','error')}};
 const confirmarRecepcion=async()=>{if(!recepcion)return;const detalles=(recepcion.transferencia.detalles||[]).map((d:any)=>({detalleId:d.id,cantidadRecibida:Number(d.cantidadEnviada||d.cantidadSolicitada||d.cantidad),cantidadDanada:0,ubicacionDestinoId:recepcion.destinos[d.id]}));if(detalles.some((d:any)=>!d.ubicacionDestinoId))return avisar('Selecciona una ubicación destino para cada partida.','alerta');setGuardando(true);try{await api.patch(`/catalogo/wms/transferencias/${recepcion.transferencia.id}/recibir`,{observaciones:recepcion.observaciones.trim()||undefined,detalles});setRecepcion(null);await cargar();avisar('Transferencia recibida y existencias actualizadas.','exito');}catch(e){avisar(e instanceof ApiError?e.mensajeParaPantalla():'No se pudo recibir.','error')}finally{setGuardando(false)}};
 const badge=(e:string)=>({SOLICITADA:'bg-amber-100 text-amber-700',AUTORIZADA:'bg-blue-100 text-blue-700',EN_TRANSITO:'bg-violet-100 text-violet-700',RECIBIDA:'bg-emerald-100 text-emerald-700',RECIBIDA_CON_DIFERENCIAS:'bg-orange-100 text-orange-700',CANCELADA:'bg-slate-100 text-slate-500'}[e]||'bg-slate-100 text-slate-700');
 return <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
  <div className="flex flex-wrap justify-between gap-4"><div><h1 className="text-3xl font-black flex items-center gap-3"><ArrowRightLeft/>Transferencias WMS</h1><p className="text-slate-500">Solicitud, autorización, tránsito y recepción física.</p></div><div className="flex gap-2"><Link href="/dashboard/inventario/conteos" className="px-4 py-2 rounded-xl border flex gap-2 items-center"><ClipboardCheck size={18}/>Conteos</Link><Link href="/dashboard/inventario/ubicaciones" className="px-4 py-2 rounded-xl border flex gap-2 items-center"><MapPin size={18}/>Ubicaciones</Link><Link href="/dashboard/inventario/reubicaciones" className="px-4 py-2 rounded-xl border flex gap-2 items-center"><ArrowRightLeft size={18}/>Reubicar</Link></div></div>
  <form onSubmit={crear} noValidate className="bg-white border rounded-3xl p-6 grid md:grid-cols-6 gap-4 shadow-sm">
   {/*
     * El aviso NOMBRA lo que falta. Decía «corrige los campos marcados» y no
     * marcaba nada: de los seis campos, sólo el motivo escribía su mensaje y
     * sólo la posición cambiaba de color. Medido el 28-sep-2026 con la sesión
     * del almacenista: con producto, origen, destino, cantidad y motivo
     * puestos y la posición sin elegir, la pantalla pedía corregir «los
     * campos marcados» sin marcar ninguno. Un aviso que no dice qué es un
     * aviso que obliga a adivinar entre seis.
     */}
   {intento&&Object.values(errores).some(Boolean)&&<div className="md:col-span-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"><b className="font-semibold">Falta esto para crear la transferencia:</b><ul className="mt-1 list-disc pl-5 font-medium">{Object.values(errores).filter(Boolean).map((m)=><li key={m}>{m}</li>)}</ul></div>}
   <div><BuscadorSeleccion valor={form.productoId} onChange={(productoId)=>setForm({...form,productoId,ubicacionOrigenId:''})} opciones={productos.map(p=>({valor:p.id,etiqueta:`${p.sku} · ${p.nombre}`,busqueda:p.sku}))} placeholder="Buscar producto…"/>{catalogoVedado&&<p className="mt-1 text-xs text-amber-700">El catálogo de productos no está en tu perfil, así que aquí no hay de dónde elegir. No es que no haya productos.</p>}</div>
   <BuscadorSeleccion valor={form.almacenOrigenId} onChange={(almacenOrigenId)=>setForm({...form,almacenOrigenId,ubicacionOrigenId:'',almacenDestinoId:form.almacenDestinoId===almacenOrigenId?'':form.almacenDestinoId})} opciones={almacenes.map(a=>({valor:a.id,etiqueta:a.nombre}))} placeholder="Almacén origen…"/>
   <BuscadorSeleccion valor={form.almacenDestinoId} onChange={(almacenDestinoId)=>setForm({...form,almacenDestinoId})} opciones={almacenes.filter(a=>a.id!==form.almacenOrigenId).map(a=>({valor:a.id,etiqueta:a.nombre}))} placeholder="Almacén destino…"/>
   <div><select className={`w-full p-3 border rounded-xl ${intento&&errores.ubicacionOrigenId?'border-rose-400':'border-slate-300'}`} value={form.ubicacionOrigenId} onChange={e=>setForm({...form,ubicacionOrigenId:e.target.value})}><option value="">Posición origen</option>{stockFisico.map(x=><option key={x.id} value={x.ubicacionId}>{x.ubicacion?.codigo} · disp. {Number(x.cantidad||0)-Number(x.reservado||0)}</option>)}</select>{/*
     * Un desplegable vacío no explica nada, y aquí se vacía por un motivo muy
     * concreto: ese producto no tiene existencia localizada en ese almacén. Sin
     * esta línea el formulario puede ser imposible de satisfacer y no decirlo.
     */}{form.productoId&&form.almacenOrigenId&&!stockFisico.length&&<p className="mt-1 text-xs font-semibold text-amber-700">Este producto no tiene existencia localizada en el almacén origen.</p>}{intento&&errores.ubicacionOrigenId&&<p className="mt-1 text-xs font-semibold text-rose-600">{errores.ubicacionOrigenId}</p>}</div>
   <div><input required min="0.0001" step="0.0001" type="number" className={`w-full p-3 border rounded-xl ${intento&&errores.cantidad?'border-rose-400':'border-slate-300'}`} placeholder={`Cantidad ${producto?.unidadMedida||''}`} value={form.cantidad} onChange={e=>setForm({...form,cantidad:e.target.value})}/>{intento&&errores.cantidad&&<p className="mt-1 text-xs font-semibold text-rose-600">{errores.cantidad}</p>}</div>
   <button disabled={guardando} className="bg-slate-900 text-white rounded-xl font-bold disabled:opacity-50">{guardando?'Guardando...':'Crear solicitud'}</button>
   <div className="md:col-span-5"><input className={`w-full p-3 border rounded-xl ${intento&&errores.motivo?'border-rose-400':'border-slate-300'}`} placeholder="Motivo, pedido o referencia logística" value={form.motivo} onChange={e=>setForm({...form,motivo:e.target.value})}/>{intento&&errores.motivo&&<p className="mt-1 text-xs font-semibold text-rose-600">{errores.motivo}</p>}</div>
  </form>
  <div className="bg-white border rounded-3xl overflow-hidden"><div className="p-5 border-b flex justify-between"><h2 className="font-black">Documentos de transferencia</h2><button aria-label="Volver a cargar" title="Volver a cargar" onClick={cargar}><RefreshCw className={cargando?'animate-spin':''}/></button></div>
   <div className="overflow-x-auto">{!transferencias.length?<SinDatos titulo="No hay transferencias" descripcion="Crea una solicitud para iniciar el flujo logístico."/>:<table className="w-full text-sm"><thead className="bg-slate-50 text-left"><tr><th className="p-4">Folio</th><th>Ruta</th><th>Detalle</th><th>Estado</th><th>Fecha</th><th>Acciones</th></tr></thead><tbody>{transferencias.map(t=><tr key={t.id} className="border-t"><td className="p-4 font-mono font-bold">{t.folio}</td><td>{t.almacenOrigen?.nombre} → {t.almacenDestino?.nombre}</td><td>{t.detalles?.map(d=>`${d.producto?.nombre||'Producto'}: ${Number(d.cantidadSolicitada||d.cantidad)}`).join(', ')}</td><td><span className={`px-3 py-1 rounded-full text-xs font-bold ${badge(t.estado)}`}>{t.estado.replaceAll('_',' ')}</span></td><td>{new Date(t.fechaCreacion).toLocaleString()}</td><td><div className="flex gap-1 py-2">{/*
              Cuatro ojos, también en la pantalla.
              El servidor ya lo exige —«Quien solicita la transferencia no puede
              autorizarla»— pero el botón se le ofrecía igual a quien acababa de
              crear la solicitud, y el «no» llegaba después, en un aviso de
              cuatro segundos. Se dice antes de pulsar, que es cuando sirve.
            */}
            {t.estado==='SOLICITADA'&&(t.usuarioId&&t.usuarioId===usuarioId
              ? <span title="Quien solicita una transferencia no puede autorizarla: la firma otra persona del almacén." className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500">Espera autorización</span>
              : puedo('PATCH /catalogo/wms/transferencias/:id/autorizar')
                ? <button title="Autorizar" onClick={()=>accion(t,'autorizar')} className="p-2 bg-blue-50 rounded-lg"><Check size={17}/></button>
                : <span title="La autorización de una transferencia es una firma de supervisión." className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500">Espera autorización</span>)}{/*
              Enviar NO es una firma: es el acto físico del almacén de origen, y
              lo hace quien tiene el almacén. Autorizar y recibir son la firma de
              supervisión. Ese reparto es lo que sostiene «quien envía no
              recibe», así que aquí se pregunta en vez de ofrecer un botón que el
              servidor va a negar —medido el 28-sep-2026 con gerencia: dos clics,
              dos 403—.
            */}
            {t.estado==='AUTORIZADA'&&(puedo('PATCH /catalogo/wms/transferencias/:id/enviar')
              ? <button title="Enviar" onClick={()=>accion(t,'enviar')} className="p-2 bg-violet-50 rounded-lg"><Truck size={17}/></button>
              : <span title="Enviar la mercancía lo hace el almacén de origen; tu perfil autoriza y recibe." className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500">Autorizada · la envía el almacén</span>)}{/* Y lo mismo al recibir: quien envía la mercancía no registra su llegada. */}
            {t.estado==='EN_TRANSITO'&&(t.enviadoPor&&t.enviadoPor===usuarioId
              ? <span title="Quien envía la mercancía no puede registrar su recepción: la recibe quien está en el almacén destino." className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500">En tránsito · la recibe el destino</span>
              : puedo('PATCH /catalogo/wms/transferencias/:id/recibir')
                ? <button title="Recibir" onClick={()=>accion(t,'recibir')} className="p-2 bg-emerald-50 rounded-lg"><PackageCheck size={17}/></button>
                : <span title="Registrar la recepción es una firma de supervisión." className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500">En tránsito · la recibe el destino</span>)}{['SOLICITADA','AUTORIZADA'].includes(t.estado)&&<button title="Cancelar" onClick={()=>accion(t,'cancelar')} className="p-2 bg-rose-50 rounded-lg"><X size={17}/></button>}</div></td></tr>)}</tbody></table>}</div>
  </div>
  <Modal abierto={Boolean(recepcion)} onCerrar={()=>setRecepcion(null)} titulo={`Recibir ${recepcion?.transferencia?.folio??''}`} descripcion="Asigna la posición física destino de cada partida antes de confirmar." ancho={760} pie={<><Boton onClick={()=>setRecepcion(null)}>Cancelar</Boton><Boton variante="primario" cargando={guardando} onClick={()=>void confirmarRecepcion()}>Confirmar recepción</Boton></>}>{recepcion&&<div className="space-y-4"><label className="text-sm">Observaciones<textarea className="entrada mt-1 min-h-20 w-full py-2" value={recepcion.observaciones} onChange={(e)=>setRecepcion({...recepcion,observaciones:e.target.value})}/></label>{recepcion.transferencia.detalles.map((d:any)=><div key={d.id} className="grid items-center gap-3 rounded-xl border p-3 md:grid-cols-[1fr_300px]"><div><b>{d.producto?.nombre||'Producto'}</b><p className="text-xs text-slate-500">Cantidad enviada: {Number(d.cantidadEnviada||d.cantidadSolicitada||d.cantidad)}</p></div><BuscadorSeleccion valor={recepcion.destinos[d.id]??''} onChange={(id)=>setRecepcion({...recepcion,destinos:{...recepcion.destinos,[d.id]:id}})} opciones={recepcion.ubicaciones.map((u:any)=>({valor:u.id,etiqueta:u.codigo,detalle:[u.zona,u.pasillo,u.rack,u.nivel,u.posicion].filter(Boolean).join(' / ')}))} placeholder="Ubicación destino…"/></div>)}</div>}</Modal>
 </div>
}
