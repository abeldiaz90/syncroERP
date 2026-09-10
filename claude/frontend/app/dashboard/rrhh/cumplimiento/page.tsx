'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { dinero } from '@/lib/format';
import { BuscadorSeleccion } from '@/components/ui/BuscadorSeleccion';

type Periodo={id:string;ejercicio:number;numero:number;estado:string};
type Dispersion={id:string;estado:string;total:number;registros:number;banco:string;hashArchivo?:string;referenciaBanco?:string};
type Detalle={id:string;beneficiario:string;monto:number;estado:string;referencia?:string};
type Resumen={aprobaciones:{total:number;aprobadas:number};cfdi:{total:number;timbrados:number;errores:number};dispersion:Dispersion|null;pago:{estado:string;saldo:number;totalAplicado:number}|null;poliza:{lineas:number;cargos:number;abonos:number};obligacionesActivas:number};
type RespuestaDispersion={dispersion?:Dispersion|null;detalles?:Detalle[]|null};
type Banco={id:string;clave?:string;nombre:string;activo?:boolean};

export default function CumplimientoNominaPage(){
  const search=useSearchParams();
  const [periodos,setPeriodos]=useState<Periodo[]>([]);
  const [periodoId,setPeriodoId]=useState(search.get('periodoId')??'');
  const [resumen,setResumen]=useState<Resumen|null>(null);
  const [dispersion,setDispersion]=useState<RespuestaDispersion|null>(null);
  const [banco,setBanco]=useState('CSV PRELAYOUT');
  const [bancos,setBancos]=useState<Banco[]>([]);
  const [referencia,setReferencia]=useState('');
  const [hashRespuesta,setHashRespuesta]=useState('');
  const [mensaje,setMensaje]=useState<{texto:string;ok:boolean}|null>(null);
  const [procesando,setProcesando]=useState(false);

  useEffect(()=>{Promise.all([api.get<Periodo[]>('/rrhh/nomina/periodos'),api.get<Banco[]>('/catalogos/bancos')]).then(([x,b])=>{setPeriodos(Array.isArray(x)?x:[]);setBancos((Array.isArray(b)?b:[]).filter((item)=>item.activo!==false));if(!periodoId&&x[0])setPeriodoId(x[0].id)}).catch((e)=>setMensaje({texto:e instanceof Error?e.message:'No se pudieron cargar periodos y bancos.',ok:false}))},[]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{if(periodoId)void cargar(periodoId)},[periodoId]);

  async function cargar(id=periodoId){
    if(!id)return; setProcesando(true); setMensaje(null);
    try{
      const [r,d]=await Promise.all([
        api.get<Resumen>(`/rrhh/nomina-avanzada/periodos/${id}/cumplimiento`),
        api.get<RespuestaDispersion>(`/rrhh/nomina-avanzada/periodos/${id}/dispersion`).catch(()=>null),
      ]);
      setResumen(r);setDispersion(d);
    }catch(e){setMensaje({texto:e instanceof Error?e.message:'No fue posible cargar el cierre.',ok:false})}finally{setProcesando(false)}
  }
  async function ejecutar(fn:()=>Promise<unknown>,ok:string){setProcesando(true);setMensaje(null);try{await fn();setMensaje({texto:ok,ok:true});await cargar()}catch(e){setMensaje({texto:e instanceof ApiError?e.mensajeParaPantalla():e instanceof Error?e.message:'La operación falló.',ok:false})}finally{setProcesando(false)}}

  const cuadra=Math.abs((resumen?.poliza?.cargos??0)-(resumen?.poliza?.abonos??0))<.01 && (resumen?.poliza?.lineas??0)>0;
  const dispersionActual=dispersion?.dispersion??null;
  const detallesDispersion=Array.isArray(dispersion?.detalles)?dispersion.detalles:[];
  const estadoDisp=dispersionActual?.estado??resumen?.dispersion?.estado??'NO_GENERADA';
  const todosPendientes=detallesDispersion.length>0&&detallesDispersion.every((d)=>d.estado==='PENDIENTE');

  return <div className="mx-auto max-w-7xl space-y-6 p-6">
    <div><h1 className="text-2xl font-bold">Cumplimiento, dispersión y cierre</h1><p className="text-sm text-slate-500">El flujo es secuencial: aprobar, preparar CFDI, generar y conciliar dispersión, pagar, contabilizar y cerrar.</p></div>
    {mensaje&&<div className={`rounded-lg border p-3 text-sm ${mensaje.ok?'border-emerald-200 bg-emerald-50 text-emerald-800':'border-red-200 bg-red-50 text-red-800'}`}>{mensaje.texto}</div>}
    <section className="rounded-xl border bg-white p-5"><label className="text-sm font-medium">Periodo<select className="entrada mt-1 w-full" value={periodoId} onChange={(e)=>setPeriodoId(e.target.value)}><option value="">Seleccionar…</option>{periodos.map((p)=><option key={p.id} value={p.id}>#{p.numero}/{p.ejercicio} · {p.estado}</option>)}</select></label></section>
    <div className="grid gap-3 md:grid-cols-5">
      <Kpi t="Aprobaciones" v={`${resumen?.aprobaciones?.aprobadas??0}/${resumen?.aprobaciones?.total??0}`}/><Kpi t="CFDI timbrados" v={`${resumen?.cfdi?.timbrados??0}/${resumen?.cfdi?.total??0}`}/><Kpi t="Dispersión" v={estadoDisp}/><Kpi t="Pago" v={resumen?.pago?.estado??'PENDIENTE'}/><Kpi t="Póliza" v={cuadra?'CUADRADA':'PENDIENTE'}/>
    </div>

    <section className="rounded-xl border bg-white p-5">
      <h2 className="font-semibold">1. Expediente fiscal</h2><p className="mb-3 text-sm text-slate-500">Genera expedientes de preparación. No se marca como timbrado sin respuesta autenticada del PAC.</p>
      <button className="btn btn-secundario" disabled={procesando||!periodoId} onClick={()=>void ejecutar(()=>api.post(`/rrhh/nomina-avanzada/periodos/${periodoId}/cfdi/generar`,{enviarPac:false}),'Expedientes fiscales preparados; todavía no están timbrados.')}>Preparar CFDI</button>
    </section>

    <section className="space-y-4 rounded-xl border bg-white p-5">
      <div><h2 className="font-semibold">2. Dispersión bancaria</h2><p className="text-sm text-slate-500">CSV_PRELAYOUT es una previsualización; un layout propietario exige adaptador bancario habilitado.</p></div>
      <div className="grid gap-3 md:grid-cols-3"><label className="text-sm font-medium">Banco<BuscadorSeleccion className="mt-1" valor={bancos.find((b)=>b.nombre===banco)?.id??''} opciones={bancos.map((b)=>({valor:b.id,etiqueta:`${b.clave??'—'} · ${b.nombre}`,busqueda:b.clave}))} onChange={(id)=>setBanco(bancos.find((b)=>b.id===id)?.nombre??'')} placeholder="Buscar banco oficial…"/></label><div className="flex items-end"><button className="btn btn-primario w-full" disabled={procesando||!periodoId||!banco||!['NO_GENERADA','BORRADOR','GENERADA'].includes(estadoDisp)} onClick={()=>void ejecutar(()=>api.post(`/rrhh/nomina-avanzada/periodos/${periodoId}/dispersion`,{banco,formato:'CSV_PRELAYOUT'}),'Prelayout de dispersión generado.')}>Generar prelayout</button></div><div className="flex items-end"><button className="btn btn-secundario w-full" onClick={()=>void cargar()} disabled={procesando}>Actualizar</button></div></div>
      {dispersionActual&&<>
        <div className="grid gap-3 rounded-lg bg-slate-50 p-3 md:grid-cols-4"><div>Estado<br/><b>{dispersionActual.estado}</b></div><div>Registros<br/><b>{dispersionActual.registros}</b></div><div>Total<br/><b>{dinero(dispersionActual.total)}</b></div><div>Hash<br/><code className="text-xs">{dispersionActual.hashArchivo?.slice(0,16)}…</code></div></div>
        {dispersionActual.estado==='GENERADA'&&<div className="grid gap-3 md:grid-cols-2"><label className="text-sm font-medium">Referencia de envío<input className="entrada mt-1 w-full" value={referencia} onChange={(e)=>setReferencia(e.target.value)}/></label><div className="flex items-end"><button className="btn btn-primario w-full" disabled={!referencia.trim()||!dispersionActual.hashArchivo} onClick={()=>void ejecutar(()=>api.patch(`/rrhh/nomina-avanzada/periodos/${periodoId}/dispersion/enviada`,{referenciaEnvio:referencia,hashArchivo:dispersionActual.hashArchivo}),'Dispersión marcada como enviada con evidencia de hash.')}>Confirmar envío al banco</button></div></div>}
        {dispersionActual.estado==='ENVIADA'&&<div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4"><p className="text-sm">Captura el hash de la respuesta bancaria. Esta acción conciliará todos los registros como aceptados; úsala solo cuando el archivo de respuesta confirme el total.</p><div className="grid gap-3 md:grid-cols-3"><input className="entrada" placeholder="Hash respuesta (mínimo 16 caracteres)" value={hashRespuesta} onChange={(e)=>setHashRespuesta(e.target.value)}/><input className="entrada" placeholder="Referencia banco" value={referencia} onChange={(e)=>setReferencia(e.target.value)}/><button className="btn btn-primario" disabled={hashRespuesta.length<16||referencia.length<5||!todosPendientes} onClick={()=>void ejecutar(()=>api.patch(`/rrhh/nomina-avanzada/periodos/${periodoId}/dispersion/conciliar`,{hashRespuestaBanco:hashRespuesta,referenciaBanco:referencia,resultados:detallesDispersion.map((d)=>({detalleId:d.id,estado:'ACEPTADO',montoAceptado:d.monto,referenciaBanco:referencia}))}),'Respuesta bancaria conciliada.')}>Conciliar respuesta</button></div></div>}
      </>}
    </section>

    <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">3. Devengo contable y cierre</h2><div className="mt-3 flex flex-wrap gap-2"><button className="btn btn-secundario" disabled={procesando||!periodoId} onClick={()=>void ejecutar(()=>api.post(`/rrhh/nomina-avanzada/periodos/${periodoId}/poliza-detallada`,{}),'Póliza de devengo generada y publicada en el libro mayor.')}>Generar póliza</button><button className="btn btn-primario" disabled={procesando||!periodoId} onClick={()=>void ejecutar(()=>api.post(`/rrhh/nomina-avanzada/periodos/${periodoId}/cierre-financiero`,{}),'Periodo cerrado de forma definitiva.')}>Cerrar nómina</button></div><div className="mt-4 grid gap-3 md:grid-cols-3"><Kpi t="Cargos" v={dinero(resumen?.poliza?.cargos??0)}/><Kpi t="Abonos" v={dinero(resumen?.poliza?.abonos??0)}/><Kpi t="Diferencia" v={dinero((resumen?.poliza?.cargos??0)-(resumen?.poliza?.abonos??0))}/></div></section>
  </div>;
}
function Kpi({t,v}:{t:string;v:string}){return <div className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">{t}</p><p className="mt-1 font-bold text-slate-900">{v}</p></div>}
