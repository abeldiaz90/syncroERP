'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { dinero } from '@/lib/format';

type Periodo={id:string;ejercicio:number;numero:number;estado:string};
type Dispersion={id:string;estado:string;total:number;registros:number;banco:string;hashArchivo?:string;referenciaBanco?:string};
type Resumen={aprobaciones:{total:number;aprobadas:number};cfdi:{total:number;timbrados:number;errores:number};dispersion:Dispersion|null;pago:{estado:string;saldo:number;totalAplicado:number}|null;poliza:{lineas:number;cargos:number;abonos:number};obligacionesActivas:number};

export default function CumplimientoNominaPage(){
  const search=useSearchParams();
  const [periodos,setPeriodos]=useState<Periodo[]>([]);
  const [periodoId,setPeriodoId]=useState(search.get('periodoId')??'');
  const [resumen,setResumen]=useState<Resumen|null>(null);
  const [mensaje,setMensaje]=useState<{texto:string;ok:boolean}|null>(null);
  const [procesando,setProcesando]=useState(false);

  useEffect(()=>{api.get<Periodo[]>('/rrhh/nomina/periodos').then((x)=>{setPeriodos(Array.isArray(x)?x:[]);if(!periodoId&&x[0])setPeriodoId(x[0].id)}).catch((e)=>setMensaje({texto:e instanceof Error?e.message:'No se pudieron cargar los periodos.',ok:false}))},[]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{if(periodoId)void cargar(periodoId)},[periodoId]);

  async function cargar(id=periodoId){
    if(!id)return; setProcesando(true); setMensaje(null);
    try{
      setResumen(await api.get<Resumen>(`/rrhh/nomina-avanzada/periodos/${id}/cumplimiento`));
    }catch(e){setMensaje({texto:e instanceof Error?e.message:'No fue posible cargar el cierre.',ok:false})}finally{setProcesando(false)}
  }
  async function ejecutar(fn:()=>Promise<unknown>,ok:string){setProcesando(true);setMensaje(null);try{await fn();setMensaje({texto:ok,ok:true});await cargar()}catch(e){setMensaje({texto:e instanceof ApiError?e.mensajeParaPantalla():e instanceof Error?e.message:'La operación falló.',ok:false})}finally{setProcesando(false)}}

  const cuadra=Math.abs((resumen?.poliza?.cargos??0)-(resumen?.poliza?.abonos??0))<.01 && (resumen?.poliza?.lineas??0)>0;
  const estadoDisp=resumen?.dispersion?.estado??'NO_GENERADA';

  return <div className="mx-auto max-w-7xl space-y-6 p-6">
    <div><h1 className="text-2xl font-bold">Cumplimiento y cierre</h1><p className="text-sm text-slate-500">El tablero de todo el periodo, y las dos acciones de contabilidad: la póliza de devengo y el cierre definitivo. La dispersión la opera Tesorería en «Dispersión y pagos»; los CFDI, Recursos humanos.</p></div>
    {mensaje&&<div className={`rounded-lg border p-3 text-sm ${mensaje.ok?'border-emerald-200 bg-emerald-50 text-emerald-800':'border-red-200 bg-red-50 text-red-800'}`}>{mensaje.texto}</div>}
    <section className="rounded-xl border bg-white p-5"><label className="text-sm font-medium">Periodo<select className="entrada mt-1 w-full" value={periodoId} onChange={(e)=>setPeriodoId(e.target.value)}><option value="">Seleccionar…</option>{periodos.map((p)=><option key={p.id} value={p.id}>#{p.numero}/{p.ejercicio} · {p.estado}</option>)}</select></label></section>
    <div className="grid gap-3 md:grid-cols-5">
      <Kpi t="Aprobaciones" v={`${resumen?.aprobaciones?.aprobadas??0}/${resumen?.aprobaciones?.total??0}`}/><Kpi t="CFDI timbrados" v={`${resumen?.cfdi?.timbrados??0}/${resumen?.cfdi?.total??0}`}/><Kpi t="Dispersión" v={estadoDisp}/><Kpi t="Pago" v={resumen?.pago?.estado??'PENDIENTE'}/><Kpi t="Póliza" v={cuadra?'CUADRADA':'PENDIENTE'}/>
    </div>

    <section className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
      <b className="text-slate-900">Los expedientes fiscales los prepara Recursos humanos</b>
      <p className="mt-1">El botón vivía aquí, en una pantalla que Recursos humanos no tiene en su menú, así que nadie podía pulsarlo: es una acción suya y daba 403 desde aquí. Ahora está en el centro de nómina. Este tablero muestra cuántos van timbrados.</p>
    </section>

    <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Devengo contable y cierre</h2><div className="mt-3 flex flex-wrap gap-2"><button className="btn btn-secundario" disabled={procesando||!periodoId} onClick={()=>void ejecutar(()=>api.post(`/rrhh/nomina-avanzada/periodos/${periodoId}/poliza-detallada`,{}),'Póliza de devengo generada y publicada en el libro mayor.')}>Generar póliza</button><button className="btn btn-primario" disabled={procesando||!periodoId} onClick={()=>void ejecutar(()=>api.post(`/rrhh/nomina-avanzada/periodos/${periodoId}/cierre-financiero`,{}),'Periodo cerrado de forma definitiva.')}>Cerrar nómina</button></div><div className="mt-4 grid gap-3 md:grid-cols-3"><Kpi t="Cargos" v={dinero(resumen?.poliza?.cargos??0)}/><Kpi t="Abonos" v={dinero(resumen?.poliza?.abonos??0)}/><Kpi t="Diferencia" v={dinero((resumen?.poliza?.cargos??0)-(resumen?.poliza?.abonos??0))}/></div></section>
  </div>;
}
function Kpi({t,v}:{t:string;v:string}){return <div className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">{t}</p><p className="mt-1 font-bold text-slate-900">{v}</p></div>}
