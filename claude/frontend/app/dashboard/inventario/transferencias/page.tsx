'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRightLeft, Check, PackageCheck, Truck, X, MapPin, ClipboardCheck, RefreshCw } from 'lucide-react';
import { api, ApiError, conPermiso } from '@/lib/api';
import { useAcciones } from '@/hooks/use-acciones';
import { Boton, Modal, SinDatos, useAvisos } from '@/components/ui';
import { confirmarElegante } from '@/components/ui/dialogos';
import { BuscadorSeleccion } from '@/components/ui/BuscadorSeleccion';

import { useT } from '@/components/I18nProvider';
type Transferencia={id:string;folio:string;estado:string;motivo:string;fechaCreacion:string;usuarioId?:string;enviadoPor?:string|null;almacenOrigen?:{nombre:string};almacenDestino?:{id:string;nombre:string};detalles:any[]};
export default function TransferenciasPage(){
  const t = useT();
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
 const errores={productoId:!form.productoId?t("Selecciona un producto"):'',almacenOrigenId:!form.almacenOrigenId?t("Selecciona el almacén origen"):'',almacenDestinoId:!form.almacenDestinoId?t("Selecciona el almacén destino"):form.almacenDestinoId===form.almacenOrigenId?t("Origen y destino deben ser distintos"):'',ubicacionOrigenId:!form.ubicacionOrigenId?t("Selecciona la posición física de origen"):'',cantidad:!form.cantidad||Number(form.cantidad)<=0?t("La cantidad debe ser mayor a cero"):'',motivo:!form.motivo.trim()?t("El motivo es obligatorio"):form.motivo.trim().length<5?t("Captura al menos 5 caracteres"):''};
 const cargar=async()=>{setCargando(true);try{/* El catalogo de productos es de Inventario y esta pantalla es de Almacen: su 403 no puede dejar sin transferencias a quien si las tiene. */
const [p,a,t]=await Promise.all([conPermiso(api.get<any>('/catalogo/productos',{query:{limite:2000}})),api.get<any[]>('/catalogo/almacenes'),api.get<any>('/catalogo/wms/transferencias',{query:{limite:100}})]);setProductos(Array.isArray(p.valor)?p.valor:(p.valor as any)?.productos||(p.valor as any)?.data||[]);setCatalogoVedado(p.vedado);setAlmacenes(Array.isArray(a)?a:(a as any).almacenes||[]);setTransferencias(Array.isArray(t)?t:t.data||[]);}catch(e){avisar(e instanceof ApiError?e.mensajeParaPantalla():t("No se pudo cargar transferencias."),'error');}finally{setCargando(false)}};
 useEffect(()=>{cargar()},[]);
 useEffect(()=>{if(!form.productoId||!form.almacenOrigenId){setStockFisico([]);return;}api.get<any[]>('/catalogo/wms/stock-ubicaciones',{query:{productoId:form.productoId,almacenId:form.almacenOrigenId,estado:'DISPONIBLE'}}).then(x=>setStockFisico(Array.isArray(x)?x:[])).catch(()=>setStockFisico([]));},[form.productoId,form.almacenOrigenId]);
 useEffect(()=>{if(!form.almacenDestinoId){setUbicacionesDestino([]);return;}api.get<any[]>('/catalogo/wms/ubicaciones',{query:{almacenId:form.almacenDestinoId}}).then(x=>setUbicacionesDestino(Array.isArray(x)?x:[])).catch(()=>setUbicacionesDestino([]));},[form.almacenDestinoId]);
 const producto=useMemo(()=>productos.find(x=>x.id===form.productoId),[productos,form.productoId]);
 const crear=async(e:React.FormEvent)=>{e.preventDefault();setIntento(true);if(Object.values(errores).some(Boolean))return;setGuardando(true);try{const r=await api.post<any>('/catalogo/wms/transferencias',{almacenOrigenId:form.almacenOrigenId,almacenDestinoId:form.almacenDestinoId,motivo:form.motivo.trim(),detalles:[{productoId:form.productoId,cantidad:Number(form.cantidad),ubicacionOrigenId:form.ubicacionOrigenId}]});avisar(`Solicitud ${r.folio} creada.`, 'exito');setForm({...form,productoId:'',ubicacionOrigenId:'',cantidad:'',motivo:''});setIntento(false);await cargar();}catch(e){avisar(e instanceof ApiError?e.mensajeParaPantalla():t("No se creó la transferencia."),'error')}finally{setGuardando(false)}};
 const accion=async(t:Transferencia,a:'autorizar'|'enviar'|'recibir'|'cancelar')=>{try{if(a==='recibir'){const ubicaciones=await api.get<any[]>('/catalogo/wms/ubicaciones',{query:{almacenId:t.almacenDestino?.id}});setRecepcion({transferencia:t,ubicaciones:(ubicaciones??[]).filter((u:any)=>u.activo!==false&&u.estado==='DISPONIBLE'),observaciones:'',destinos:{}});return;}if(a==='cancelar'&&!await confirmarElegante(`¿Cancelar la transferencia ${t.folio}?`,{peligroso:true}))return;await api.patch(`/catalogo/wms/transferencias/${t.id}/${a}`);await cargar();avisar("Estado de la transferencia actualizado.",'exito');}catch(e){avisar(e instanceof ApiError?e.mensajeParaPantalla():"No se pudo actualizar.",'error')}};
 const confirmarRecepcion=async()=>{if(!recepcion)return;const detalles=(recepcion.transferencia.detalles||[]).map((d:any)=>({detalleId:d.id,cantidadRecibida:Number(d.cantidadEnviada||d.cantidadSolicitada||d.cantidad),cantidadDanada:0,ubicacionDestinoId:recepcion.destinos[d.id]}));if(detalles.some((d:any)=>!d.ubicacionDestinoId))return avisar(t("Selecciona una ubicación destino para cada partida."),'alerta');setGuardando(true);try{await api.patch(`/catalogo/wms/transferencias/${recepcion.transferencia.id}/recibir`,{observaciones:recepcion.observaciones.trim()||undefined,detalles});setRecepcion(null);await cargar();avisar(t("Transferencia recibida y existencias actualizadas."),'exito');}catch(e){avisar(e instanceof ApiError?e.mensajeParaPantalla():t("No se pudo recibir."),'error')}finally{setGuardando(false)}};
 /*
 * ── EL NOMBRE DE CADA ESTADO, NO SU CÓDIGO ───────────────────────────────
 *
 * La tabla pintaba `estado.replaceAll('_',' ')`: «EN TRANSITO», en mayúsculas
 * y en español, con el ERP en inglés. No es un descuido aislado: en este
 * archivo la variable del bucle se llamaba `t` y TAPABA la función de
 * traducir, así que nada de esta tabla se podía envolver — y nadie lo vio,
 * porque `idioma:pendientes` cuenta las claves que se piden, y aquí no se
 * pedía ninguna.
 *
 * El código del estado es del servidor y no se toca; lo que se pinta es su
 * nombre, y el nombre sí se traduce.
 */
const NOMBRE_DEL_ESTADO: Record<string, string> = {
  SOLICITADA: 'Solicitada',
  AUTORIZADA: 'Autorizada',
  EN_TRANSITO: 'En tránsito',
  RECIBIDA: 'Recibida',
  RECIBIDA_CON_DIFERENCIAS: 'Recibida con diferencias',
  CANCELADA: 'Cancelada',
};

const badge=(e:string)=>({SOLICITADA:'bg-amber-100 text-amber-700',AUTORIZADA:'bg-blue-100 text-blue-700',EN_TRANSITO:'bg-violet-100 text-violet-700',RECIBIDA:'bg-emerald-100 text-emerald-700',RECIBIDA_CON_DIFERENCIAS:'bg-orange-100 text-orange-700',CANCELADA:'bg-slate-100 text-slate-500'}[e]||'bg-slate-100 text-slate-700');
 return <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
  <div className="flex flex-wrap justify-between gap-4"><div><h1 className="text-3xl font-black flex items-center gap-3"><ArrowRightLeft/>{t("Transferencias WMS")}</h1><p className="text-slate-500">{t("Solicitud, autorización, tránsito y recepción física.")}</p></div><div className="flex gap-2"><Link href="/dashboard/inventario/conteos" className="px-4 py-2 rounded-xl border flex gap-2 items-center"><ClipboardCheck size={18}/>{t("Conteos")}</Link><Link href="/dashboard/inventario/ubicaciones" className="px-4 py-2 rounded-xl border flex gap-2 items-center"><MapPin size={18}/>{t("Ubicaciones")}</Link><Link href="/dashboard/inventario/reubicaciones" className="px-4 py-2 rounded-xl border flex gap-2 items-center"><ArrowRightLeft size={18}/>{t("Reubicar")}</Link></div></div>
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
   {intento&&Object.values(errores).some(Boolean)&&<div className="md:col-span-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"><b className="font-semibold">{t("Falta esto para crear la transferencia:")}</b><ul className="mt-1 list-disc pl-5 font-medium">{Object.values(errores).filter(Boolean).map((m)=><li key={m}>{m}</li>)}</ul></div>}
   <div><BuscadorSeleccion valor={form.productoId} onChange={(productoId)=>setForm({...form,productoId,ubicacionOrigenId:''})} opciones={productos.map(p=>({valor:p.id,etiqueta:`${p.sku} · ${p.nombre}`,busqueda:p.sku}))} placeholder={t("Buscar producto…")}/>{catalogoVedado&&<p className="mt-1 text-xs text-amber-700">{t("El catálogo de productos no está en tu perfil, así que aquí no hay de dónde elegir. No es que no haya productos.")}</p>}</div>
   <BuscadorSeleccion valor={form.almacenOrigenId} onChange={(almacenOrigenId)=>setForm({...form,almacenOrigenId,ubicacionOrigenId:'',almacenDestinoId:form.almacenDestinoId===almacenOrigenId?'':form.almacenDestinoId})} opciones={almacenes.map(a=>({valor:a.id,etiqueta:a.nombre}))} placeholder={t("Almacén origen…")}/>
   <BuscadorSeleccion valor={form.almacenDestinoId} onChange={(almacenDestinoId)=>setForm({...form,almacenDestinoId})} opciones={almacenes.filter(a=>a.id!==form.almacenOrigenId).map(a=>({valor:a.id,etiqueta:a.nombre}))} placeholder={t("Almacén destino…")}/>
   <div><select className={`w-full p-3 border rounded-xl ${intento&&errores.ubicacionOrigenId?'border-rose-400':'border-slate-300'}`} value={form.ubicacionOrigenId} onChange={e=>setForm({...form,ubicacionOrigenId:e.target.value})}><option value="">{t("Posición origen")}</option>{stockFisico.map(x=><option key={x.id} value={x.ubicacionId}>{t("{n0} · disp. {n1}", { n0: x.ubicacion?.codigo, n1: Number(x.cantidad||0)-Number(x.reservado||0) })}</option>)}</select>{/*
     * Un desplegable vacío no explica nada, y aquí se vacía por un motivo muy
     * concreto: ese producto no tiene existencia localizada en ese almacén. Sin
     * esta línea el formulario puede ser imposible de satisfacer y no decirlo.
     */}{form.productoId&&form.almacenOrigenId&&!stockFisico.length&&<p className="mt-1 text-xs font-semibold text-amber-700">{t("Este producto no tiene existencia localizada en el almacén origen.")}</p>}{intento&&errores.ubicacionOrigenId&&<p className="mt-1 text-xs font-semibold text-rose-600">{errores.ubicacionOrigenId}</p>}</div>
   <div><input required min="0.0001" step="0.0001" type="number" className={`w-full p-3 border rounded-xl ${intento&&errores.cantidad?'border-rose-400':'border-slate-300'}`} placeholder={`Cantidad ${producto?.unidadMedida||''}`} value={form.cantidad} onChange={e=>setForm({...form,cantidad:e.target.value})}/>{intento&&errores.cantidad&&<p className="mt-1 text-xs font-semibold text-rose-600">{errores.cantidad}</p>}</div>
   <button disabled={guardando} className="bg-slate-900 text-white rounded-xl font-bold disabled:opacity-50">{guardando?t("Guardando..."):t("Crear solicitud")}</button>
   <div className="md:col-span-5"><input className={`w-full p-3 border rounded-xl ${intento&&errores.motivo?'border-rose-400':'border-slate-300'}`} placeholder={t("Motivo, pedido o referencia logística")} value={form.motivo} onChange={e=>setForm({...form,motivo:e.target.value})}/>{intento&&errores.motivo&&<p className="mt-1 text-xs font-semibold text-rose-600">{t(errores.motivo)}</p>}</div>
  </form>
  <div className="bg-white border rounded-3xl overflow-hidden"><div className="p-5 border-b flex justify-between"><h2 className="font-black">{t("Documentos de transferencia")}</h2><button aria-label={t("Volver a cargar")} title={t("Volver a cargar")} onClick={cargar}><RefreshCw className={cargando?'animate-spin':''}/></button></div>
   <div className="overflow-x-auto">{!transferencias.length?<SinDatos titulo={t("No hay transferencias")} descripcion={t("Crea una solicitud para iniciar el flujo logístico.")}/>:<table className="w-full text-sm"><thead className="bg-slate-50 text-left"><tr><th className="p-4">{t("Folio")}</th><th>{t("Ruta")}</th><th>{t("Detalle")}</th><th>{t("Estado")}</th><th>{t("Fecha")}</th><th>{t("Acciones")}</th></tr></thead><tbody>{transferencias.map(doc=><tr key={doc.id} className="border-t"><td className="p-4 font-mono font-bold">{doc.folio}</td><td>{/* no-se-traduce: los nombres de los almacenes los pone la empresa */}{doc.almacenOrigen?.nombre} → {doc.almacenDestino?.nombre}</td><td>{doc.detalles?.map(d=>`${d.producto?.nombre||t("Producto")}: ${Number(d.cantidadSolicitada||d.cantidad)}`).join(', ')}</td><td><span className={`px-3 py-1 rounded-full text-xs font-bold ${badge(doc.estado)}`}>{t(NOMBRE_DEL_ESTADO[doc.estado] ?? doc.estado)}</span></td><td>{new Date(doc.fechaCreacion).toLocaleString()}</td><td><div className="flex gap-1 py-2">{/*
              Cuatro ojos, también en la pantalla.
              El servidor ya lo exige —«Quien solicita la transferencia no puede
              autorizarla»— pero el botón se le ofrecía igual a quien acababa de
              crear la solicitud, y el «no» llegaba después, en un aviso de
              cuatro segundos. Se dice antes de pulsar, que es cuando sirve.
            */}
            {doc.estado==='SOLICITADA'&&(doc.usuarioId&&doc.usuarioId===usuarioId
              ? <span title={t("Quien solicita una transferencia no puede autorizarla: la firma otra persona del almacén.")} className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500">{t("Espera autorización")}</span>
              : puedo('PATCH /catalogo/wms/transferencias/:id/autorizar')
                ? <button title={t("Autorizar")} onClick={()=>accion(doc,'autorizar')} className="p-2 bg-blue-50 rounded-lg"><Check size={17}/></button>
                : <span title={t("La autorización de una transferencia es una firma de supervisión.")} className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500">{t("Espera autorización")}</span>)}{/*
              Enviar NO es una firma: es el acto físico del almacén de origen, y
              lo hace quien tiene el almacén. Autorizar y recibir son la firma de
              supervisión. Ese reparto es lo que sostiene «quien envía no
              recibe», así que aquí se pregunta en vez de ofrecer un botón que el
              servidor va a negar —medido el 28-sep-2026 con gerencia: dos clics,
              dos 403—.
            */}
            {doc.estado==='AUTORIZADA'&&(puedo('PATCH /catalogo/wms/transferencias/:id/enviar')
              ? <button title={t("Enviar")} onClick={()=>accion(doc,'enviar')} className="p-2 bg-violet-50 rounded-lg"><Truck size={17}/></button>
              : <span title={t("Enviar la mercancía lo hace el almacén de origen; tu perfil autoriza y recibe.")} className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500">{t("Autorizada · la envía el almacén")}</span>)}{/* Y lo mismo al recibir: quien envía la mercancía no registra su llegada. */}
            {doc.estado==='EN_TRANSITO'&&(doc.enviadoPor&&doc.enviadoPor===usuarioId
              ? <span title={t("Quien envía la mercancía no puede registrar su recepción: la recibe quien está en el almacén destino.")} className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500">{t("En tránsito · la recibe el destino")}</span>
              : puedo('PATCH /catalogo/wms/transferencias/:id/recibir')
                ? <button title={t("Recibir")} onClick={()=>accion(doc,'recibir')} className="p-2 bg-emerald-50 rounded-lg"><PackageCheck size={17}/></button>
                : <span title={t("Registrar la recepción es una firma de supervisión.")} className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500">{t("En tránsito · la recibe el destino")}</span>)}{['SOLICITADA','AUTORIZADA'].includes(doc.estado)&&<button title={t("Cancelar")} onClick={()=>accion(doc,'cancelar')} className="p-2 bg-rose-50 rounded-lg"><X size={17}/></button>}</div></td></tr>)}</tbody></table>}</div>
  </div>
  <Modal abierto={Boolean(recepcion)} onCerrar={()=>setRecepcion(null)} titulo={t("Recibir {n0}", { n0: recepcion?.transferencia?.folio ?? '' })} descripcion={t("Asigna la posición física destino de cada partida antes de confirmar.")} ancho={760} pie={<><Boton onClick={()=>setRecepcion(null)}>{t("Cancelar")}</Boton><Boton variante="primario" cargando={guardando} onClick={()=>void confirmarRecepcion()}>{t("Confirmar recepción")}</Boton></>}>{recepcion&&<div className="space-y-4"><label className="text-sm">{t("Observaciones")}<textarea className="entrada mt-1 min-h-20 w-full py-2" value={recepcion.observaciones} onChange={(e)=>setRecepcion({...recepcion,observaciones:e.target.value})}/></label>{recepcion.transferencia.detalles.map((d:any)=><div key={d.id} className="grid items-center gap-3 rounded-xl border p-3 md:grid-cols-[1fr_300px]"><div><b>{d.producto?.nombre||t("Producto")}</b><p className="text-xs text-slate-500">{t("Cantidad enviada: {n0}", { n0: Number(d.cantidadEnviada||d.cantidadSolicitada||d.cantidad) })}</p></div><BuscadorSeleccion valor={recepcion.destinos[d.id]??''} onChange={(id)=>setRecepcion({...recepcion,destinos:{...recepcion.destinos,[d.id]:id}})} opciones={recepcion.ubicaciones.map((u:any)=>({valor:u.id,etiqueta:u.codigo,detalle:[u.zona,u.pasillo,u.rack,u.nivel,u.posicion].filter(Boolean).join(' / ')}))} placeholder={t("Ubicación destino…")}/></div>)}</div>}</Modal>
 </div>
}
